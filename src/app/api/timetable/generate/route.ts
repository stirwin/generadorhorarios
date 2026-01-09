// app/api/timetable/generate/route.ts
import { NextResponse } from "next/server";
import { generateTimetable, LessonItem } from "@/lib/timetabler";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const institucionId = body?.institucionId;
    if (!institucionId) return NextResponse.json({ error: "institucionId requerido" }, { status: 400 });

    const institucion = await prisma.institucion.findUnique({
      where: { id: institucionId },
      include: { periodos: true },
    });
    if (!institucion) return NextResponse.json({ error: "Institución no encontrada" }, { status: 404 });

    const days = institucion.dias_por_semana ?? 5;
    const slotsPerDay = institucion.lecciones_por_dia ?? 7;
    const totalSlots = days * slotsPerDay;

    const docentes = await prisma.docente.findMany({
      where: { institucionId },
      include: { restricciones: true },
    });
    const teacherBlockedSlots: Record<string, boolean[]> = {};
    for (const d of docentes) {
      if (!d.restricciones || d.restricciones.length === 0) continue;
      const arr = Array(totalSlots).fill(false);
      for (const r of d.restricciones) {
        if (r.tipo !== "bloqueo") continue;
        if (r.dia < 0 || r.dia >= days) continue;
        const start = Math.max(0, r.periodoInicio);
        const end = Math.min(slotsPerDay - 1, r.periodoFin);
        for (let p = start; p <= end; p++) {
          const idx = r.dia * slotsPerDay + p;
          if (idx >= 0 && idx < totalSlots) arr[idx] = true;
        }
      }
      teacherBlockedSlots[d.id] = arr;
    }

    // Cargar cargas con relaciones
    const cargas = await prisma.cargaAcademica.findMany({
      where: { institucionId },
      include: { asignatura: true, clase: true, docente: true },
    });

    // Map de info por carga (para normalizar resultado)
    const cargaMap = new Map<string, {
      id: string;
      claseId: string;
      asignaturaId: string;
      asignaturaNombre?: string | null;
      docenteId?: string | null;
      docenteNombre?: string | null;
      duracion: number;
    }>();

    for (const c of cargas) {
      cargaMap.set(c.id, {
        id: c.id,
        claseId: c.claseId,
        asignaturaId: c.asignaturaId,
        asignaturaNombre: c.asignatura?.nombre ?? null,
        docenteId: c.docenteId ?? null,
        docenteNombre: c.docente?.nombre ?? null,
        duracion: (c as any).duracion_slots ?? 1,
      });
    }

    // Construir lessons: **USAR docenteId (ID)** para constraints; incluir nombre solo para UI/debug
    const lessons: LessonItem[] = [];
    for (const c of cargas) {
      const sesiones = (c as any).sesiones_sem ?? 1;
      const dur = (c as any).duracion_slots ?? 1;
      for (let i = 0; i < sesiones; i++) {
        lessons.push({
          id: `${c.id}__${i}`,
          cargaId: c.id,
          claseId: c.claseId,
          docenteId: c.docenteId ?? null,
          claseNombre: c.clase?.nombre ?? String(c.claseId),
          asignaturaId: c.asignaturaId,
          duracion: Math.max(1, Number(dur) || 1),
        });
      }
    }

    // Restriccion: director de grupo siempre lunes primera hora con su clase (si está activada)
    const forcedStarts: Record<string, number> = {};
    const forcedLabels: Record<string, string> = {};
    const forcedConflicts: Array<{ docenteId: string; claseId: string; reason: string }> = [];
    const mondayStart = 0;
    const applyDirectorRule = institucion.director_lunes_primera !== false;

    const directorMap = new Map<string, string>();
    for (const d of docentes) {
      if (d.direccionGrupoId) directorMap.set(d.id, d.direccionGrupoId);
    }

    if (applyDirectorRule) {
      for (const [docenteId, claseId] of directorMap.entries()) {
        const candidates = lessons.filter((l) => l.docenteId === docenteId && l.claseId === claseId);
        if (candidates.length === 0) {
          forcedConflicts.push({ docenteId, claseId, reason: "sin lecciones del docente en su grupo" });
          continue;
        }
        const sorted = candidates.slice().sort((a, b) => a.duracion - b.duracion);
        const chosen = sorted[0];
        const blocked = teacherBlockedSlots[docenteId];
        const requiredSlots = chosen.duracion;
        let blockedConflict = false;
        for (let p = 0; p < requiredSlots; p++) {
          const idx = mondayStart + p;
          if (blocked && blocked[idx]) {
            blockedConflict = true;
            break;
          }
        }
        if (blockedConflict) {
          forcedConflicts.push({ docenteId, claseId, reason: "slot lunes 1 bloqueado por restricciones" });
          continue;
        }
        forcedStarts[chosen.id] = mondayStart;
        forcedLabels[chosen.id] = "Dir. grupo (Lun 1ra)";
      }
    }

    // cargar lista ordenada de clases
    const clases = await prisma.clase.findMany({ where: { institucionId } });
    const cls = clases.map((c) => ({ id: c.id, nombre: c.nombre }));

    // Diagnóstico: carga total de slots por clase vs capacidad
    const classLoad: Record<string, { requiredSlots: number; capacity: number; deficit: number }> = {};
    for (const c of clases) {
      classLoad[c.id] = { requiredSlots: 0, capacity: days * slotsPerDay, deficit: 0 };
    }
    for (const c of cargas) {
      const slots = (c as any).sesiones_sem * (c as any).duracion_slots;
      const entry = classLoad[c.claseId] || { requiredSlots: 0, capacity: days * slotsPerDay, deficit: 0 };
      entry.requiredSlots += slots;
      entry.deficit = Math.max(0, entry.requiredSlots - entry.capacity);
      classLoad[c.claseId] = entry;
    }
    const overCapacityClasses = Object.entries(classLoad).filter(([, v]) => v.deficit > 0).map(([k, v]) => ({ claseId: k, ...v }));

    // Ejecutar generador: habilita relaxTeacherConstraints si lo pasas en body (opcional)
    const result = generateTimetable(institucionId, cls, lessons, days, slotsPerDay, {
      maxBacktracks: Number(body?.maxBacktracks) || 1600000,
      timeLimitMs: Number(body?.timeLimitMs) || 180000,
      maxRestarts: Number(body?.maxRestarts) || 40,
      teacherBlockedSlots,
      forcedStarts,
      forcedLabels,
    });

    // Map de clases para nombres/abreviaturas
    const claseNameMap = new Map<string, { nombre?: string | null }>();
    for (const c of cls) claseNameMap.set(c.id, { nombre: c.nombre });

    // Normalizar timetable (añadir nombres para UI)
    const normalized: Record<string, Array<any | null>> = {};

    for (const [claseId, arr] of Object.entries(result.timetableByClase)) {
      normalized[claseId] = arr.map((cell: any) => {
        if (!cell) return null;
        const cm = cargaMap.get(cell.cargaId) ?? null;
        return {
          cargaId: cell.cargaId,
          asignaturaId: cm?.asignaturaId ?? cell.asignaturaId ?? null,
          asignaturaNombre: cm?.asignaturaNombre ?? cell.asignaturaId ?? null,
          docenteId: cm?.docenteId ?? cell.docenteId ?? null,
          docenteNombre: cm?.docenteNombre ?? cell.docenteId ?? null,
          claseId: claseId,
          claseNombre: claseNameMap.get(claseId)?.nombre ?? (cell as any)?.claseNombre ?? claseId,
          duracion: cm?.duracion ?? cell.duracion ?? 1,
        };
      });
    }

    // Unplaced: lesson ids directamente desde el generador
    const unplaced: string[] = Array.isArray(result.unplaced) ? result.unplaced : [];
    const assignedLessonIds = new Set<string>(lessons.map(l => l.id).filter(id => !unplaced.includes(id)));

    // Summary por clase
    const assignedSummary: Record<string, { assignedSlots: number; sample: string | number }> = {};
    for (const c of cls) {
      const arr = normalized[c.id] ?? [];
      const assignedSlots = arr.filter(Boolean).length;
      const first = arr.find((x: any) => x) ?? null;
      const sample = first ? `${first.asignaturaNombre ?? first.asignaturaId} / ${first.docenteNombre ?? first.docenteId}` : "—";
      assignedSummary[c.id] = { assignedSlots, sample };
    }

    // Logs útiles
    console.log("generateTimetable: result.stats", result.stats);
    console.log("generateTimetable: timetable keys", Object.keys(normalized).slice(0,50));
    console.log("generateTimetable: assignedSummary (first 10):", Object.entries(assignedSummary).slice(0,10));

    // Log específico: cargas RELIGION
    const religionCargas = Array.from(cargaMap.values()).filter(v => (v.asignaturaNombre || "").toLowerCase().includes("relig"));
    if (religionCargas.length > 0) {
      console.log("generateTimetable: religion cargas encontradas:", religionCargas.map(r => ({ id: r.id, claseId: r.claseId, docente: r.docenteNombre })));
      for (const r of religionCargas) {
        const arr = normalized[r.claseId] ?? [];
        const foundIndex = arr.findIndex((cell: any) => cell && cell.cargaId === r.id);
        console.log(`religion carga ${r.id} placed in clase ${r.claseId}: index=${foundIndex}`);
      }
    }

    // Prepare debug payload: include timetabler meta debug if present
    const unplacedDetails: Record<string, any> = {};
    if (Array.isArray(unplaced) && result.meta?.lessonDebug) {
      for (const lid of unplaced) {
        unplacedDetails[lid] = result.meta.lessonDebug?.[lid] ?? null;
      }
    }

    const unplacedInfo = unplaced.map((lid) => {
      const cargaId = String(lid).split("__")[0];
      const cm = cargaMap.get(cargaId);
      return {
        lessonId: lid,
        cargaId,
        asignatura: cm?.asignaturaNombre ?? cm?.asignaturaId ?? "Asignatura",
        docente: cm?.docenteNombre ?? cm?.docenteId ?? "Sin docente",
        clase: (cm?.claseId && claseNameMap.get(cm.claseId)?.nombre) ?? cm?.claseId ?? "Clase",
        duracion: cm?.duracion ?? 1,
      };
    });

    const debugPayload = {
      keys: Object.keys(normalized),
      assignedSummary,
      unplaced,
      unplacedDetails,
      unplacedInfo,
      lessonsTotal: lessons.length,
      assignedLessonsCount: assignedLessonIds.size,
      cargasTotal: cargas.length,
      timetablerMeta: result.meta ?? null,
      classLoad,
      overCapacityClasses,
      forcedDirector: {
        forcedCount: Object.keys(forcedStarts).length,
        conflicts: forcedConflicts,
      },
    };

    // Also console.log debugging summary small
    console.log("generateTimetable: debug summary:", {
      unplacedCount: (result.unplaced ?? []).length,
      placedByGlobalGreedy: result.meta?.placedByGlobalGreedy ?? 0,
      forcedTeacherConflicts: result.meta?.forcedTeacherConflicts?.length ?? 0,
    });

    return NextResponse.json({
      timetable: normalized,
      stats: result.stats,
      unplaced,
      debug: debugPayload,
    }, { status: 200 });

  } catch (err: any) {
    console.error("generate timetable error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
