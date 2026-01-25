import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// DELETE /api/horarios/:id - eliminar horario y sus slots
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const { id } = await Promise.resolve(ctx.params);
    await prisma.$transaction(async (tx) => {
      await tx.horarioSlot.deleteMany({ where: { horarioId: id } });
      await tx.horario.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("delete horario error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
