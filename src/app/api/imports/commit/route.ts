// app/api/imports/commit/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { preview, institucionId, usuario } = body;

    if (!preview || !institucionId) {
      return NextResponse.json({ error: "preview e institucionId son requeridos" }, { status: 422 });
    }

    const { docentes, clases, asignaturas, cargas } = preview;

    // transacción para crear/actualizar datos
    const result = await prisma.$transaction(async (tx) => {
      // upsert docentes
      for (const d of docentes) {
        const abre = (d.abreviatura || d.abreviatura === "") ? d.abreviatura.trim() : d.abreviatura;
        if (!abre) continue;
        await tx.docente.upsert({
          where: { abreviatura: abre },
          update: { nombre: d.nombre || "" , institucionId },
          create: { nombre: d.nombre || "", abreviatura: abre, institucionId },
        });
      }
      // upsert clases
      for (const c of clases) {
        const abre = (c.abreviatura || c.abreviatura === "") ? c.abreviatura.trim() : c.abreviatura;
        if (!abre) continue;
        await tx.clase.upsert({
          where: { abreviatura: abre },
          update: { nombre: c.nombre || "", institucionId },
          create: { nombre: c.nombre || "", abreviatura: abre, institucionId },
        });
      }
      // upsert asignaturas
      for (const a of asignaturas) {
        const abre = (a.abreviatura || a.abreviatura === "") ? a.abreviatura.trim() : a.abreviatura;
        if (!abre) continue;
        await tx.asignatura.upsert({
          where: { abreviatura: abre },
          update: { nombre: a.nombre || "", institucionId },
          create: { nombre: a.nombre || "", abreviatura: abre, institucionId },
        });
      }

      // ahora crear cargas: necesitamos resolver ids por abreviatura
      // precargar índices
      const docentesDB = await tx.docente.findMany({ where: { institucionId } });
      const clasesDB = await tx.clase.findMany({ where: { institucionId } });
      const asignsDB = await tx.asignatura.findMany({ where: { institucionId } });

      const docentesMap = new Map(docentesDB.map((d) => [d.abreviatura.trim().toLowerCase(), d.id]));
      const clasesMap = new Map(clasesDB.map((c) => [c.abreviatura.trim().toLowerCase(), c.id]));
      const asignMap = new Map(asignsDB.map((a) => [a.abreviatura.trim().toLowerCase(), a.id]));

      for (const carga of cargas) {
        const asignKey = (carga.asignatura || "").trim().toLowerCase();
        const claseKey = (carga.clase || "").trim().toLowerCase();
        const docenteKey = (carga.docenteAbrev || "").trim().toLowerCase();

        const asignaturaId = asignMap.get(asignKey) || null;
        const claseId = clasesMap.get(claseKey) || null;
        const docenteId = docentesMap.get(docenteKey) || null;

        if (!asignaturaId || !claseId) {
          // saltar filas inválidas (podríamos acumular errores)
          continue;
        }

        // creamos la carga académica
        await tx.cargaAcademica.create({
          data: {
            asignaturaId,
            claseId,
            docenteId,
            sesiones_sem: Number(carga.cantidad || 0),
            duracion_slots: Number(carga.duracion || 1),
            institucionId,
          },
        });
      }

      // crear registro de import job
      const importJob = await tx.importJob.create({
        data: {
          institucionId,
          usuario: usuario || "desconocido",
          status: "completado",
          raw_json: JSON.stringify(preview),
          errores: null,
        },
      });

      return { importJobId: importJob.id };
    });

    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error: any) {
    console.error("commit import error:", error);
    return NextResponse.json({ error: error.message || "Error al persistir import" }, { status: 500 });
  }
}
