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
        const abre = (d.abreviatura || d.abreviatura === "") ? String(d.abreviatura).trim() : "";
        if (!abre) continue;
        await tx.docente.upsert({
          where: { abreviatura: abre },
          update: { nombre: d.nombre || "", institucionId },
          create: { nombre: d.nombre || "", abreviatura: abre, institucionId },
        });
      }

      // upsert clases
      for (const c of clases) {
        const abre = (c.abreviatura || c.abreviatura === "") ? String(c.abreviatura).trim() : "";
        if (!abre) continue;
        await tx.clase.upsert({
          where: { abreviatura: abre },
          update: { nombre: c.nombre || "", institucionId },
          create: { nombre: c.nombre || "", abreviatura: abre, institucionId },
        });
      }

      // upsert asignaturas
      for (const a of asignaturas) {
        const abre = (a.abreviatura || a.abreviatura === "") ? String(a.abreviatura).trim() : "";
        if (!abre) continue;
        await tx.asignatura.upsert({
          where: { abreviatura: abre },
          update: { nombre: a.nombre || "", institucionId },
          create: { nombre: a.nombre || "", abreviatura: abre, institucionId },
        });
      }

      // precargar índices
      const docentesDB = await tx.docente.findMany({ where: { institucionId } });
      const clasesDB = await tx.clase.findMany({ where: { institucionId } });
      const asignsDB = await tx.asignatura.findMany({ where: { institucionId } });

      const docentesMap = new Map(docentesDB.map((d) => [d.abreviatura.trim().toLowerCase(), d.id]));
      const docentesNameMap = new Map(docentesDB.map((d) => [d.nombre.trim().toLowerCase(), d.id]));
      const clasesMap = new Map(clasesDB.map((c) => [c.abreviatura.trim().toLowerCase(), c.id]));
      const asignMap = new Map(asignsDB.map((a) => [a.abreviatura.trim().toLowerCase(), a.id]));
      const asignNameMap = new Map(asignsDB.map((a) => [a.nombre.trim().toLowerCase(), a.id]));

      for (const carga of cargas) {
        const asignKey = (carga.asignatura || "").trim().toLowerCase();
        const claseKey = (carga.clase || "").trim().toLowerCase();
        const docenteKey = (carga.docenteAbrev || "").trim().toLowerCase();

        // resolver asignatura: por abreviatura o por nombre
        const asignaturaId = asignMap.get(asignKey) || asignNameMap.get(asignKey) || null;
        const claseId = clasesMap.get(claseKey) || null;

        // resolver docente: por abreviatura o por nombre
        let docenteId = docentesMap.get(docenteKey) || null;
        if (!docenteId) {
          docenteId = docentesNameMap.get(docenteKey) || null;
        }

        if (!asignaturaId || !claseId) {
          // saltar filas inválidas (podríamos acumular errores)
          continue;
        }

        // resolver duracion seguro: puede venir como duracion (number), duracionRaw (string), o duracion_slots
        let dur = null;
        if (carga.duracion != null && Number.isFinite(Number(carga.duracion))) {
          dur = Math.max(1, Math.floor(Number(carga.duracion)));
        } else if (carga.duracion_slots != null && Number.isFinite(Number(carga.duracion_slots))) {
          dur = Math.max(1, Math.floor(Number(carga.duracion_slots)));
        } else if (carga.duracionRaw != null && String(carga.duracionRaw).trim() !== "") {
          const n = Number(carga.duracionRaw);
          if (Number.isFinite(n)) dur = Math.max(1, Math.floor(n));
        }

        if (!dur) dur = 1;

        // creamos la carga académica
        await tx.cargaAcademica.create({
          data: {
            asignaturaId,
            claseId,
            docenteId,
            sesiones_sem: Number(carga.cantidad || 0),
            duracion_slots: Number(dur),
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
