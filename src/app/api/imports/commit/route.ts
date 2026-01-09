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

    const docentes = Array.isArray(preview?.docentes) ? preview.docentes : [];
    const clases = Array.isArray(preview?.clases) ? preview.clases : [];
    const asignaturas = Array.isArray(preview?.asignaturas) ? preview.asignaturas : [];
    const cargas = Array.isArray(preview?.cargas) ? preview.cargas : [];

    // Inserciones secuenciales (evita transacciones interactivas en Prisma Postgres)
    for (const d of docentes) {
      const abre = (d.abreviatura || d.abreviatura === "") ? String(d.abreviatura).trim() : "";
      if (!abre) continue;
      await prisma.docente.upsert({
        where: { abreviatura: abre },
        update: { nombre: d.nombre || "", institucionId },
        create: { nombre: d.nombre || "", abreviatura: abre, institucionId },
      });
    }

    for (const c of clases) {
      const abre = (c.abreviatura || c.abreviatura === "") ? String(c.abreviatura).trim() : "";
      if (!abre) continue;
      await prisma.clase.upsert({
        where: { abreviatura: abre },
        update: { nombre: c.nombre || "", institucionId },
        create: { nombre: c.nombre || "", abreviatura: abre, institucionId },
      });
    }

    for (const a of asignaturas) {
      const abre = (a.abreviatura || a.abreviatura === "") ? String(a.abreviatura).trim() : "";
      if (!abre) continue;
      await prisma.asignatura.upsert({
        where: { abreviatura: abre },
        update: { nombre: a.nombre || "", institucionId },
        create: { nombre: a.nombre || "", abreviatura: abre, institucionId },
      });
    }

    const docentesDB = await prisma.docente.findMany({ where: { institucionId } });
    const clasesDB = await prisma.clase.findMany({ where: { institucionId } });
    const asignsDB = await prisma.asignatura.findMany({ where: { institucionId } });

    const docentesMap = new Map(docentesDB.map((d) => [d.abreviatura.trim().toLowerCase(), d.id]));
    const docentesNameMap = new Map(docentesDB.map((d) => [d.nombre.trim().toLowerCase(), d.id]));
    const clasesMap = new Map(clasesDB.map((c) => [c.abreviatura.trim().toLowerCase(), c.id]));
    const asignMap = new Map(asignsDB.map((a) => [a.abreviatura.trim().toLowerCase(), a.id]));
    const asignNameMap = new Map(asignsDB.map((a) => [a.nombre.trim().toLowerCase(), a.id]));

    for (const d of docentes) {
      const claseKey = (d.claseAbrev || "").trim().toLowerCase();
      if (!claseKey) continue;
      const docenteKey = (d.abreviatura || d.nombre || "").trim().toLowerCase();
      const docenteId = docentesMap.get(docenteKey) || docentesNameMap.get(docenteKey) || null;
      const claseId = clasesMap.get(claseKey) || null;
      if (!docenteId || !claseId) continue;
      await prisma.docente.update({
        where: { id: docenteId },
        data: { direccionGrupoId: claseId },
      });
    }

    for (const carga of cargas) {
      const asignKey = (carga.asignatura || "").trim().toLowerCase();
      const claseKey = (carga.clase || "").trim().toLowerCase();
      const docenteKey = (carga.docenteAbrev || "").trim().toLowerCase();

      const asignaturaId = asignMap.get(asignKey) || asignNameMap.get(asignKey) || null;
      const claseId = clasesMap.get(claseKey) || null;

      let docenteId = docentesMap.get(docenteKey) || null;
      if (!docenteId) {
        docenteId = docentesNameMap.get(docenteKey) || null;
      }

      if (!asignaturaId || !claseId) continue;

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

      await prisma.cargaAcademica.create({
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

    const importJob = await prisma.importJob.create({
      data: {
        institucionId,
        usuario: usuario || "desconocido",
        status: "completado",
        raw_json: JSON.stringify(preview),
        errores: null,
      },
    });

    const result = { importJobId: importJob.id };

    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error: any) {
    console.error("commit import error:", error);
    return NextResponse.json({ error: error.message || "Error al persistir import" }, { status: 500 });
  }
}
