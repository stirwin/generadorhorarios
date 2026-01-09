// app/api/instituciones/[id]/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const { id: institucionId } = await Promise.resolve(ctx.params);
    const body = await req.json();
    const director_lunes_primera = typeof body?.director_lunes_primera === "boolean"
      ? body.director_lunes_primera
      : null;

    if (director_lunes_primera === null) {
      return NextResponse.json({ error: "director_lunes_primera requerido" }, { status: 400 });
    }

    const updated = await prisma.institucion.update({
      where: { id: institucionId },
      data: { director_lunes_primera },
    });

    return NextResponse.json({ ok: true, institucion: updated }, { status: 200 });
  } catch (err: any) {
    console.error("update institucion error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
