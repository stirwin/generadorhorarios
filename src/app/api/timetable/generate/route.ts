// app/api/timetable/generate/route.ts
import { NextResponse } from "next/server";
import { generateTimetable, LessonItem } from "@/lib/timetabler";
import { prisma } from "@/lib/prisma"; // ajusta si en tu proyecto es default export

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const institucionId = body?.institucionId;
    if (!institucionId) return NextResponse.json({ error: "institucionId requerido" }, { status: 400 });

    // Cargar institución para obtener dias/lecciones/periodos
    const institucion = await prisma.institucion.findUnique({
      where: { id: institucionId },
      include: { periodos: true },
    });
    if (!institucion) return NextResponse.json({ error: "Institución no encontrada" }, { status: 404 });

    const days = institucion.dias_por_semana ?? 5;
    const slotsPerDay = institucion.lecciones_por_dia ?? 7;

    // Cargar cargas académicas con relaciones (asignatura, curso/clase y docente)
    const cargas = await prisma.cargaAcademica.findMany({
      where: { institucionId },
      include: { asignatura: true, clase: true, docente: true },
    });

    // Convertir a LessonItem: expandir sesiones_sem en varias sesiones
    const lessons: LessonItem[] = [];
    for (const c of cargas) {
      const sesiones = (c as any).sesiones_sem ?? (c as any).cantidad ?? 1;
      const dur = (c as any).duracion_slots ?? (c as any).duracion ?? 1;
      for (let i = 0; i < sesiones; i++) {
        lessons.push({
          id: `${c.id}__${i}`,
          cargaId: c.id,
          claseId: (c as any).claseId ?? (c as any).claseId, // adapta si tu FK cambió de nombre
           // 👁️ SOLO PARA UI / DEBUG
  claseNombre: c.clase?.nombre ?? "SIN CLASE",

          asignaturaId: c.asignatura?.nombre ?? c.asignaturaId,
          docenteId: c.docente?.nombre ?? c.docenteId ?? null,
          duracion: Math.max(1, Number(dur) || 1),
        });
      }
    }

    // List of classes (clase/curso) for table rows
    // Cargar clases del instituto para asegurar el listado ordenado
    const clases = await prisma.clase.findMany({ where: { institucionId } }); // si tu modelo se llama 'Curso' o 'Clase' ajusta
    const cls = clases.map((c) => ({ id: c.id, nombre: (c as any).nombre }));

    // Generar timetable (ajusta options si quieres timeout/backtracks)
    const result = generateTimetable(institucionId, cls, lessons, days, slotsPerDay, { maxBacktracks: 200000, timeLimitMs: 12000 });

    // Guardar estado en Institucion (opcional): marcar en-progreso/creado
    //await prisma.institucion.update({ where: { id: institucionId }, data: { estadoHorario: result.success ? "creado" : "en-progreso" } });

    return NextResponse.json({ timetable: result.timetableByClase, stats: result.stats }, { status: 200 });
  } catch (err: any) {
    console.error("generate timetable error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
