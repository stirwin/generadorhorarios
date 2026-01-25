import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/instituciones/:id/horarios - historial de horarios
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const { id: institucionId } = await Promise.resolve(ctx.params);
    const horarios = await prisma.horario.findMany({
      where: { institucionId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nombre: true,
        createdAt: true,
        statsJson: true,
      },
    });
    return NextResponse.json({ horarios }, { status: 200 });
  } catch (err: any) {
    console.error("list horarios error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
