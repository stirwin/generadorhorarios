// app/api/instituciones/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      nombre,
      ciclo_escolar,
      dias_por_semana = 5,
      lecciones_por_dia = 7,
      periodos = [], // [{ indice, abreviatura, hora_inicio, hora_fin, duracion_min }]
      creador,
    } = body;

    if (!nombre) return NextResponse.json({ error: "Nombre requerido" }, { status: 422 });

    const institucion = await prisma.institucion.create({
      data: {
        nombre,
        ciclo_escolar,
        dias_por_semana,
        lecciones_por_dia,
        creador,
        periodos: {
          create: periodos.map((p: any) => ({
            indice: p.indice,
            abreviatura: p.abreviatura,
            hora_inicio: p.hora_inicio,
            hora_fin: p.hora_fin,
            duracion_min: p.duracion_min,
          })),
        },
      },
      include: { periodos: true },
    });

    return NextResponse.json({ institucion }, { status: 201 });
  } catch (error: any) {
    console.error("Error crear institucion:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
