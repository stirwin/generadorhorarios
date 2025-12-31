// app/api/timetable/generate/route.ts
import { NextResponse } from "next/server";
import { generateTimetable, LessonItem } from "@/lib/timetabler";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const institucionId = body?.institucionId;
    if (!institucionId) return NextResponse.json({ error: "institucionId requerido" }, { status: 400 });

    // cargar institucion (dias/lecciones)
    const institucion = await prisma.institucion.findUnique({
      where: { id: institucionId },
      include: { periodos: true },
    });
    if (!institucion) return NextResponse.json({ error: "Institución no encontrada" }, { status: 404 });

    const days = institucion.dias_por_semana ?? 5;
    const slotsPerDay = institucion.lecciones_por_dia ?? 7;

    // cargar cargas académicas con relaciones
    const cargas = await prisma.cargaAcademica.findMany({
      where: { institucionId },
      include: { asignatura: true, clase: true, docente: true },
    });

    // --- Build mapping de cargas para poder añadir nombres a las celdas después ---
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
        duracion: (c as any).duracion_slots ?? (c as any).duracion ?? 1,
      });
    }

    // Convertir a LessonItem (expandir sesiones_sem a X lecciones individuales)
    const lessons: LessonItem[] = [];
    for (const c of cargas) {
      const sesiones = (c as any).sesiones_sem ?? (c as any).cantidad ?? 1;
      const dur = (c as any).duracion_slots ?? (c as any).duracion ?? 1;
      for (let i = 0; i < (sesiones ?? 1); i++) {
        lessons.push({
          id: `${c.id}__${i}`,
          cargaId: c.id,
          claseId: c.claseId,
          // campos "UI/debug" que no afectan al algoritmo
          claseNombre: c.clase?.nombre ?? String(c.claseId),
          asignaturaId: c.asignatura?.nombre ?? c.asignaturaId,
          docenteId: c.docente?.nombre ?? c.docenteId ?? null,
          duracion: Math.max(1, Number(dur) || 1),
        });
      }
    }

    // Cargar listado de clases del instituto (orden)
    const clases = await prisma.clase.findMany({ where: { institucionId } });
    const cls = clases.map((c) => ({ id: c.id, nombre: c.nombre }));

    // Generar timetable (usa tu algoritmo)
    const result = generateTimetable(institucionId, cls, lessons, days, slotsPerDay, {
      maxBacktracks: 200000,
      timeLimitMs: 30000, // subimos un poco el limite para casos grandes
    });

    // --- Normalizar el timetable a la forma que espera la UI ---
    // result.timetableByClase: claseId -> array slots (cada slot: { cargaId, asignaturaId, docenteId, claseId } | null)
    const normalized: Record<string, Array<any | null>> = {};
    const assignedSet = new Set<string>();

    for (const [claseId, arr] of Object.entries(result.timetableByClase)) {
      normalized[claseId] = arr.map((cell: any) => {
        if (!cell) return null;
        const cm = cargaMap.get(cell.cargaId) ?? null;
        // marcar como asignada
        assignedSet.add(cell.cargaId);
        return {
          cargaId: cell.cargaId,
          asignaturaId: cm?.asignaturaId ?? cell.asignaturaId ?? null,
          asignaturaNombre: cm?.asignaturaNombre ?? cell.asignaturaId ?? null,
          docenteId: cm?.docenteId ?? cell.docenteId ?? null,
          docenteNombre: cm?.docenteNombre ?? cell.docenteId ?? null,
          claseId: claseId,
          duracion: cm?.duracion ?? cell.duracion ?? 1,
        };
      });
    }

    // --- Calcular unplaced: lecciones/lesson ids que no fueron asignadas ---
    const unplaced: string[] = [];
    for (const L of lessons) {
      if (!assignedSet.has(L.cargaId)) {
        // Si la carga entera no fue asignada en ningún slot, marca las lecciones expandidas
        unplaced.push(L.id);
      }
    }

    // --- Debugging: summary por clase (primeras 3 muestras) ---
    const assignedSummary: Record<string, { assignedSlots: number; sample: string | number }> = {};
    for (const c of cls) {
      const arr = normalized[c.id] ?? [];
      const assignedSlots = arr.filter(Boolean).length;
      // sample: primer cargaId encontrado o '—'
      const first = arr.find((x: any) => x) ?? null;
      const sample = first ? `${first.asignaturaNombre ?? first.asignaturaId} / ${first.docenteNombre ?? first.docenteId}` : "—";
      assignedSummary[c.id] = { assignedSlots, sample };
    }

    // Log servidor (útil)
    console.log("generateTimetable: result.stats", result.stats);
    console.log("generateTimetable: timetable keys", Object.keys(normalized).length ? Object.keys(normalized).slice(0,20) : "[]");
    // mostrar resumen primeras clases
    console.log("generateTimetable: assignedSummary (first 10):", Object.entries(assignedSummary).slice(0,10));

    // Revisa específicamente si la carga RELIGION está presente / asignada (opcional)
    // buscamos cargas que parezcan "RELIGION" en cargaMap
    const religionCargas = Array.from(cargaMap.values()).filter(v => (v.asignaturaNombre || "").toLowerCase().includes("relig"));
    if (religionCargas.length > 0) {
      console.log("generateTimetable: religion cargas encontradas:", religionCargas.map(r => ({ id: r.id, claseId: r.claseId, docente: r.docenteNombre })));
      // comprobar si esas cargas están asignadas
      for (const r of religionCargas) {
        const arr = normalized[r.claseId] ?? [];
        const found = arr.findIndex((cell) => cell && cell.cargaId === r.id);
        console.log(`religion carga ${r.id} placed in clase ${r.claseId}: index=${found}`);
      }
    }

    // Responder con timetable normalizado + debug
    return NextResponse.json({
      timetable: normalized,
      stats: result.stats,
      debug: {
        keys: Object.keys(normalized),
        assignedSummary,
        unplaced,
        lessonsTotal: lessons.length,
        cargasTotal: cargas.length,
      }
    }, { status: 200 });
  } catch (err: any) {
    console.error("generate timetable error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
