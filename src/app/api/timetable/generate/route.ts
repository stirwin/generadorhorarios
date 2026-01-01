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
        docenteId: c.docenteId ?? null,            // <-- usar siempre ID aquí
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
          // **IMPORTANTE**: usar el ID real del docente para evitar mezclas
          docenteId: c.docenteId ?? null,
          // los campos siguientes son solo para UI / debugging dentro de lesson
          claseNombre: c.clase?.nombre ?? String(c.claseId),
          asignaturaId: c.asignaturaId,
          duracion: Math.max(1, Number(dur) || 1),
        });
      }
    }

    // cargar lista ordenada de clases
    const clases = await prisma.clase.findMany({ where: { institucionId } });
    const cls = clases.map((c) => ({ id: c.id, nombre: c.nombre }));

    // Ejecutar generador
    const result = generateTimetable(institucionId, cls, lessons, days, slotsPerDay, {
      maxBacktracks: 200000,
      timeLimitMs: 30000,
    });

    // Normalizar timetable (añadir nombres para UI)
    const normalized: Record<string, Array<any | null>> = {};
    const assignedCargaIds = new Set<string>();

    for (const [claseId, arr] of Object.entries(result.timetableByClase)) {
      normalized[claseId] = arr.map((cell: any) => {
        if (!cell) return null;
        const cm = cargaMap.get(cell.cargaId) ?? null;
        if (cell.cargaId) assignedCargaIds.add(cell.cargaId);
        return {
          cargaId: cell.cargaId,
          asignaturaId: cm?.asignaturaId ?? cell.asignaturaId ?? null,
          asignaturaNombre: cm?.asignaturaNombre ?? cell.asignaturaId ?? null,
          docenteId: cm?.docenteId ?? cell.docenteId ?? null,   // ID real
          docenteNombre: cm?.docenteNombre ?? cell.docenteId ?? null,
          claseId: claseId,
          duracion: cm?.duracion ?? cell.duracion ?? 1,
        };
      });
    }

    // Unplaced: lecciones (lesson ids) que no fueron asignadas (comparamos por cargaId)
    const unplaced: string[] = [];
    for (const L of lessons) {
      if (!assignedCargaIds.has(L.cargaId)) {
        unplaced.push(L.id);
      }
    }

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
