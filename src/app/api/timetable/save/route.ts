// app/api/timetable/save/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type TimetableCellPayload = {
  cargaId: string;
  asignaturaId: string;
  docenteId?: string | null;
  duracion?: number | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const institucionId = body?.institucionId;
    const timetable = body?.timetable;

    if (!institucionId) {
      return NextResponse.json({ error: "institucionId requerido" }, { status: 400 });
    }
    if (!timetable || typeof timetable !== "object") {
      return NextResponse.json({ error: "timetable requerido" }, { status: 400 });
    }

    const institucion = await prisma.institucion.findUnique({
      where: { id: institucionId },
    });
    if (!institucion) {
      return NextResponse.json({ error: "Institución no encontrada" }, { status: 404 });
    }

    const days = institucion.dias_por_semana ?? 5;
    const slotsPerDay = institucion.lecciones_por_dia ?? 7;
    const totalSlots = days * slotsPerDay;

    const slotsToCreate: Array<{
      horarioId: string;
      claseId: string;
      cargaId: string;
      docenteId?: string | null;
      asignaturaId: string;
      dia: number;
      periodo: number;
      duracion: number;
    }> = [];

    for (const [claseId, arr] of Object.entries(timetable as Record<string, Array<TimetableCellPayload | null>>)) {
      if (!Array.isArray(arr) || arr.length !== totalSlots) {
        return NextResponse.json({ error: `timetable inválido para clase ${claseId}` }, { status: 400 });
      }
      for (let idx = 0; idx < arr.length; idx++) {
        const cell = arr[idx];
        if (!cell) continue;
        const dia = Math.floor(idx / slotsPerDay);
        const periodo = idx % slotsPerDay;
        slotsToCreate.push({
          horarioId: "",
          claseId,
          cargaId: String(cell.cargaId),
          docenteId: cell.docenteId ?? null,
          asignaturaId: String(cell.asignaturaId),
          dia,
          periodo,
          duracion: Math.max(1, Number(cell.duracion ?? 1)),
        });
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      const horario = await tx.horario.create({
        data: {
          institucionId,
          nombre: institucion.nombre ?? null,
        },
      });
      if (slotsToCreate.length > 0) {
        const rows = slotsToCreate.map(s => ({ ...s, horarioId: horario.id }));
        await tx.horarioSlot.createMany({ data: rows });
      }
      return horario;
    });

    return NextResponse.json({ horarioId: saved.id }, { status: 200 });
  } catch (err: any) {
    console.error("save timetable error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
