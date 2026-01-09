// app/api/docentes/[id]/route.ts
import { NextResponse, NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { prisma } from "@/lib/prisma";

type Bloqueo = { dia: number; periodo: number };

function buildRanges(bloqueos: Bloqueo[]) {
  const byDay = new Map<number, number[]>();
  for (const b of bloqueos) {
    const arr = byDay.get(b.dia) ?? [];
    arr.push(b.periodo);
    byDay.set(b.dia, arr);
  }

  const ranges: Array<{ dia: number; periodoInicio: number; periodoFin: number }> = [];
  for (const [dia, periods] of byDay.entries()) {
    const sorted = Array.from(new Set(periods)).sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const p = sorted[i];
      if (p === prev + 1) {
        prev = p;
        continue;
      }
      ranges.push({ dia, periodoInicio: start, periodoFin: prev });
      start = p;
      prev = p;
    }
    if (start !== undefined) {
      ranges.push({ dia, periodoInicio: start, periodoFin: prev });
    }
  }
  return ranges;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: docenteId } = await ctx.params;
    const body = await req.json();
    const nombre = typeof body?.nombre === "string" ? body.nombre : null;
    const abreviatura = typeof body?.abreviatura === "string" ? body.abreviatura : null;
    const direccionGrupoId = typeof body?.direccionGrupoId === "string" ? body.direccionGrupoId : null;
    const bloqueos = Array.isArray(body?.bloqueos) ? (body.bloqueos as Bloqueo[]) : [];

    const docente = await prisma.docente.findUnique({ where: { id: docenteId } });
    if (!docente) return NextResponse.json({ error: "Docente no encontrado" }, { status: 404 });

    const ranges = buildRanges(bloqueos);

    await prisma.$transaction(async (tx) => {
      await tx.docente.update({
        where: { id: docenteId },
        data: {
          nombre: nombre ?? undefined,
          abreviatura: abreviatura ?? undefined,
          direccionGrupoId,
        },
      });
      await tx.docenteRestriccion.deleteMany({ where: { docenteId } });
      if (ranges.length > 0) {
        await tx.docenteRestriccion.createMany({
          data: ranges.map((r) => ({
            docenteId,
            dia: r.dia,
            periodoInicio: r.periodoInicio,
            periodoFin: r.periodoFin,
            tipo: "bloqueo",
          })),
        });
      }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("update docente error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
