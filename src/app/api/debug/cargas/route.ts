import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown) => typeof id === "string" && id.trim().length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ rows: [] }, { status: 200 });
    }

    const rows = await prisma.cargaAcademica.findMany({
      where: { id: { in: ids } },
      include: { clase: true, asignatura: true, docente: true },
    });

    const payload = rows.map((row) => ({
      cargaId: row.id,
      clase: row.clase?.abreviatura ?? row.clase?.nombre ?? row.claseId ?? null,
      asignatura: row.asignatura?.nombre ?? row.asignatura?.abreviatura ?? row.asignaturaId ?? null,
      docente: row.docente?.nombre ?? row.docenteId ?? null,
    }));

    return NextResponse.json({ rows: payload }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Error en debug de cargas." }, { status: 500 });
  }
}
