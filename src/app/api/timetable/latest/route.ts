// app/api/timetable/latest/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const institucionId = searchParams.get("institucionId");
    if (!institucionId) {
      return NextResponse.json({ error: "institucionId requerido" }, { status: 400 });
    }

    const institucion = await prisma.institucion.findUnique({
      where: { id: institucionId },
      include: { clases: true },
    });
    if (!institucion) {
      return NextResponse.json({ error: "Institución no encontrada" }, { status: 404 });
    }

    const days = institucion.dias_por_semana ?? 5;
    const slotsPerDay = institucion.lecciones_por_dia ?? 7;
    const totalSlots = days * slotsPerDay;

    const horario = await prisma.horario.findFirst({
      where: { institucionId },
      orderBy: { createdAt: "desc" },
      include: {
        slots: true,
      },
    });

    if (!horario) {
      return NextResponse.json({ timetable: {}, horarioId: null }, { status: 200 });
    }

    const timetableByClase: Record<string, Array<any | null>> = {};
    const claseNameMap = new Map<string, { nombre?: string | null }>();
    for (const c of institucion.clases) {
      timetableByClase[c.id] = Array(totalSlots).fill(null);
      claseNameMap.set(c.id, { nombre: c.nombre });
    }

    const cargaIds = Array.from(new Set(horario.slots.map((s) => s.cargaId)));
    const cargas = cargaIds.length > 0
      ? await prisma.cargaAcademica.findMany({
          where: { id: { in: cargaIds } },
          include: { asignatura: true, docente: true },
        })
      : [];
    const cargaMap = new Map<string, {
      asignaturaId: string;
      asignaturaNombre?: string | null;
      docenteId?: string | null;
      docenteNombre?: string | null;
      duracion?: number | null;
    }>();
    for (const c of cargas) {
      cargaMap.set(c.id, {
        asignaturaId: c.asignaturaId,
        asignaturaNombre: c.asignatura?.nombre ?? null,
        docenteId: c.docenteId ?? null,
        docenteNombre: c.docente?.nombre ?? null,
        duracion: (c as any).duracion_slots ?? null,
      });
    }

    for (const slot of horario.slots) {
      const idx = slot.dia * slotsPerDay + slot.periodo;
      if (!timetableByClase[slot.claseId]) {
        timetableByClase[slot.claseId] = Array(totalSlots).fill(null);
      }
      if (idx >= 0 && idx < totalSlots) {
        const cm = cargaMap.get(slot.cargaId) ?? null;
        timetableByClase[slot.claseId][idx] = {
          cargaId: slot.cargaId,
          asignaturaId: cm?.asignaturaId ?? slot.asignaturaId,
          asignaturaNombre: cm?.asignaturaNombre ?? null,
          docenteId: cm?.docenteId ?? slot.docenteId ?? null,
          docenteNombre: cm?.docenteNombre ?? null,
          claseId: slot.claseId,
          claseNombre: claseNameMap.get(slot.claseId)?.nombre ?? null,
          duracion: slot.duracion ?? cm?.duracion ?? 1,
        };
      }
    }

    const assignedSlots = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);

    return NextResponse.json({
      timetable: timetableByClase,
      horarioId: horario.id,
      stats: {
        assignedSlots,
      },
    }, { status: 200 });
  } catch (err: any) {
    console.error("get latest timetable error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
