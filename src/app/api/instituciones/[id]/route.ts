// app/api/instituciones/[id]/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const { id: institucionId } = await Promise.resolve(ctx.params);
    const body = await req.json();
    const data: Record<string, any> = {};
    if (typeof body?.nombre === "string" && body.nombre.trim()) {
      data.nombre = body.nombre.trim();
    }
    if (typeof body?.director_lunes_primera === "boolean") {
      data.director_lunes_primera = body.director_lunes_primera;
    }
    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const updated = await prisma.institucion.update({
      where: { id: institucionId },
      data,
    });

    return NextResponse.json({ ok: true, institucion: updated }, { status: 200 });
  } catch (err: any) {
    console.error("update institucion error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const { id: institucionId } = await Promise.resolve(ctx.params);
    await prisma.$transaction(async (tx) => {
      await tx.horarioSlot.deleteMany({
        where: { horario: { institucionId } },
      });
      await tx.horario.deleteMany({ where: { institucionId } });
      await tx.docenteRestriccion.deleteMany({
        where: { docente: { institucionId } },
      });
      await tx.cargaAcademica.deleteMany({ where: { institucionId } });
      await tx.asignatura.deleteMany({ where: { institucionId } });
      await tx.clase.deleteMany({ where: { institucionId } });
      await tx.docente.deleteMany({ where: { institucionId } });
      await tx.definicionPeriodo.deleteMany({ where: { institucionId } });
      await tx.importJob.deleteMany({ where: { institucionId } });
      await tx.institucion.delete({ where: { id: institucionId } });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("delete institucion error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
