// app/api/timetable/move/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import type { TimetableCell } from "@/lib/timetabler";

type MoveRequest = {
  institucionId: string;
  timetableByClase: Record<string, Array<TimetableCell | null>>;
  action: "move" | "remove";
  source: {
    sourceType: "grid" | "pool";
    claseId?: string;
    index?: number;
    cargaId: string;
  };
  target?: {
    claseId: string;
    index: number;
  };
  swap?: boolean;
};

function ensureArrayLen<T>(arr: T[] | undefined, len: number, filler: T): T[] {
  const out = Array.isArray(arr) ? [...arr] : [];
  if (out.length >= len) return out.slice(0, len);
  while (out.length < len) out.push(filler);
  return out;
}

function getBlockStart(arr: Array<TimetableCell | null>, idx: number, cargaId: string) {
  let i = idx;
  while (i > 0 && arr[i - 1]?.cargaId === cargaId) i -= 1;
  return i;
}

function blockIndices(start: number, dur: number) {
  return Array.from({ length: dur }, (_, i) => start + i);
}

function blockLength(arr: Array<TimetableCell | null>, start: number, cargaId: string) {
  let len = 0;
  for (let i = start; i < arr.length; i++) {
    if (arr[i]?.cargaId !== cargaId) break;
    len += 1;
  }
  return Math.max(1, len);
}

function canPlaceInClass(
  arr: Array<TimetableCell | null>,
  start: number,
  dur: number,
  slotsPerDay: number,
  ignore?: Set<number>
) {
  if (start + dur > arr.length) return false;
  const dayStart = Math.floor(start / slotsPerDay);
  const dayEnd = Math.floor((start + dur - 1) / slotsPerDay);
  if (dayStart !== dayEnd) return false;
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (arr[idx] && !ignore?.has(idx)) return false;
  }
  return true;
}

function buildTeacherSlots(timetable: Record<string, Array<TimetableCell | null>>) {
  const map: Record<string, Set<number>> = {};
  for (const arr of Object.values(timetable)) {
    arr.forEach((cell, idx) => {
      if (!cell?.docenteId) return;
      if (!map[cell.docenteId]) map[cell.docenteId] = new Set();
      map[cell.docenteId].add(idx);
    });
  }
  return map;
}

function teacherFreeRange(
  teacherSlots: Record<string, Set<number>>,
  docenteId: string | null | undefined,
  start: number,
  dur: number,
  ignore?: Set<number>
) {
  if (!docenteId) return true;
  const set = teacherSlots[docenteId];
  if (!set) return true;
  for (let i = 0; i < dur; i++) {
    const idx = start + i;
    if (set.has(idx) && !ignore?.has(idx)) return false;
  }
  return true;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MoveRequest;
    const institucionId = body?.institucionId;
    if (!institucionId) {
      return NextResponse.json({ error: "institucionId requerido" }, { status: 400 });
    }
    if (!body?.timetableByClase || !body?.action || !body?.source?.cargaId) {
      return NextResponse.json({ error: "payload incompleto" }, { status: 400 });
    }

    const institucion = await prisma.institucion.findUnique({
      where: { id: institucionId },
      include: { clases: true },
    });
    if (!institucion) return NextResponse.json({ error: "Institución no encontrada" }, { status: 404 });

    const days = institucion.dias_por_semana ?? 5;
    const slotsPerDay = institucion.lecciones_por_dia ?? 7;
    const totalSlots = days * slotsPerDay;

    const cargas = await prisma.cargaAcademica.findMany({
      where: { institucionId },
      include: { asignatura: true, docente: true, clase: true },
    });

    const cargaMap = new Map<string, {
      id: string;
      claseId: string;
      asignaturaId: string;
      asignaturaNombre?: string | null;
      docenteId?: string | null;
      docenteNombre?: string | null;
      duracion: number;
    }>();

    for (const c of cargas) {
      cargaMap.set(c.id, {
        id: c.id,
        claseId: c.claseId,
        asignaturaId: c.asignaturaId,
        asignaturaNombre: c.asignatura?.nombre ?? null,
        docenteId: c.docenteId ?? null,
        docenteNombre: c.docente?.nombre ?? null,
        duracion: (c as any).duracion_slots ?? 1,
      });
    }

    const clases = institucion.clases.map((c) => ({ id: c.id, nombre: c.nombre }));
    const claseNameMap = new Map<string, { nombre?: string | null }>();
    for (const c of clases) claseNameMap.set(c.id, { nombre: c.nombre });

    const timetable: Record<string, Array<TimetableCell | null>> = {};
    for (const c of clases) {
      timetable[c.id] = ensureArrayLen(body.timetableByClase?.[c.id], totalSlots, null);
    }

    const carga = cargaMap.get(body.source.cargaId);
    if (!carga) {
      return NextResponse.json({ error: "cargaId no pertenece a la institución" }, { status: 400 });
    }

    const teacherSlots = buildTeacherSlots(timetable);

    if (body.action === "remove") {
      if (body.source.sourceType !== "grid" || !body.source.claseId || body.source.index == null) {
        return NextResponse.json({ error: "remove requiere source grid con claseId e index" }, { status: 400 });
      }
      const arr = timetable[body.source.claseId] ?? [];
      const cell = arr[body.source.index];
      if (!cell || cell.cargaId !== body.source.cargaId) {
        return NextResponse.json({ error: "origen no coincide con la carga" }, { status: 400 });
      }
      const start = getBlockStart(arr, body.source.index, body.source.cargaId);
      const indices = blockIndices(start, carga.duracion);
      for (const i of indices) arr[i] = null;
      timetable[body.source.claseId] = arr;
      return NextResponse.json({ timetable }, { status: 200 });
    }

    if (!body.target?.claseId || body.target.index == null) {
      return NextResponse.json({ error: "target requerido para move" }, { status: 400 });
    }

    if (body.source.sourceType === "pool") {
      const alreadyInGrid = Object.values(timetable).some((arr) =>
        arr.some((cell) => cell?.cargaId === body.source.cargaId)
      );
      if (alreadyInGrid) {
        return NextResponse.json({ error: "la carga ya está colocada en la tabla" }, { status: 400 });
      }
    }

    const targetArr = [...(timetable[body.target.claseId] ?? [])];
    const targetCell = targetArr[body.target.index];
    if (targetCell && !body.swap) {
      return NextResponse.json({ error: "el target está ocupado" }, { status: 400 });
    }

    let sourceClass = body.source.claseId;
    let sourceIndex = body.source.index;
    let sourceArr = sourceClass ? [...(timetable[sourceClass] ?? [])] : null;
    let sourceStart: number | null = null;
    let sourceIndices: Set<number> | undefined;
    let moveDur = carga.duracion;

    if (body.source.sourceType === "grid") {
      if (!sourceClass || sourceIndex == null) {
        return NextResponse.json({ error: "source grid inválido" }, { status: 400 });
      }
      const cell = sourceArr?.[sourceIndex];
      if (!cell || cell.cargaId !== body.source.cargaId) {
        return NextResponse.json({ error: "origen no coincide con la carga" }, { status: 400 });
      }
      sourceStart = getBlockStart(sourceArr!, sourceIndex, body.source.cargaId);
      moveDur = blockLength(sourceArr!, sourceStart, body.source.cargaId);
      sourceIndices = new Set(blockIndices(sourceStart, moveDur));
    }

    let targetCargaInfo: ReturnType<typeof cargaMap.get> | null = null;
    let targetStart: number | null = null;
    let targetIndices: Set<number> | undefined;
    let targetDur = 1;

    if (targetCell && body.swap) {
      targetCargaInfo = cargaMap.get(targetCell.cargaId) ?? null;
      if (!targetCargaInfo) {
        return NextResponse.json({ error: "carga del target no encontrada" }, { status: 400 });
      }
      targetStart = getBlockStart(targetArr, body.target.index, targetCell.cargaId);
      targetDur = blockLength(targetArr, targetStart, targetCell.cargaId);
      targetIndices = new Set(blockIndices(targetStart, targetDur));
    }

    const ignoreSource = sourceClass === body.target.claseId ? sourceIndices : undefined;
    if (!canPlaceInClass(targetArr, body.target.index, moveDur, slotsPerDay, ignoreSource)) {
      return NextResponse.json({ error: "no cabe en el target (clase ocupada o cruza día)" }, { status: 400 });
    }

    if (targetCell && body.swap && sourceClass && sourceStart != null && targetCargaInfo) {
      const ignoreTarget = sourceClass === body.target.claseId ? targetIndices : undefined;
      if (!canPlaceInClass(sourceArr!, sourceStart, targetDur, slotsPerDay, ignoreTarget)) {
        return NextResponse.json({ error: "swap inválido: el bloque destino no cabe en el origen" }, { status: 400 });
      }
    }

    const ignoreTeacher: Record<string, Set<number>> = {};
    if (body.source.sourceType === "grid" && sourceIndices) {
      const docenteId = carga.docenteId ?? null;
      if (docenteId) ignoreTeacher[docenteId] = new Set(sourceIndices);
    }
    if (targetCell && body.swap && targetIndices && targetCargaInfo?.docenteId) {
      const docenteId = targetCargaInfo.docenteId;
      if (!ignoreTeacher[docenteId]) ignoreTeacher[docenteId] = new Set();
      for (const idx of targetIndices) ignoreTeacher[docenteId].add(idx);
    }

    if (!teacherFreeRange(teacherSlots, carga.docenteId ?? null, body.target.index, moveDur, ignoreTeacher[carga.docenteId ?? ""])) {
      return NextResponse.json({ error: "docente ocupado en el target" }, { status: 400 });
    }

    if (targetCell && body.swap && sourceClass && sourceStart != null && targetCargaInfo) {
      if (!teacherFreeRange(teacherSlots, targetCargaInfo.docenteId ?? null, sourceStart, targetDur, ignoreTeacher[targetCargaInfo.docenteId ?? ""])) {
        return NextResponse.json({ error: "docente ocupado en el origen (swap)" }, { status: 400 });
      }
    }

    if (sourceArr && sourceClass && sourceIndices) {
      for (const i of sourceIndices) sourceArr[i] = null;
      timetable[sourceClass] = sourceArr;
    }
    if (targetCell && body.swap && targetIndices) {
      for (const i of targetIndices) targetArr[i] = null;
    }

    for (let i = 0; i < moveDur; i++) {
      targetArr[body.target.index + i] = {
        cargaId: carga.id,
        asignaturaId: carga.asignaturaId,
        asignaturaNombre: carga.asignaturaNombre ?? undefined,
        docenteId: carga.docenteId ?? null,
        docenteNombre: carga.docenteNombre ?? null,
        claseId: body.target.claseId,
        claseNombre: claseNameMap.get(body.target.claseId)?.nombre ?? body.target.claseId,
        duracion: moveDur,
      };
    }
    timetable[body.target.claseId] = targetArr;

    if (targetCell && body.swap && sourceClass && sourceStart != null && targetCargaInfo) {
      const arr = timetable[sourceClass] ?? [];
      for (let i = 0; i < targetDur; i++) {
        arr[sourceStart + i] = {
          cargaId: targetCargaInfo.id,
          asignaturaId: targetCargaInfo.asignaturaId,
          asignaturaNombre: targetCargaInfo.asignaturaNombre ?? undefined,
          docenteId: targetCargaInfo.docenteId ?? null,
          docenteNombre: targetCargaInfo.docenteNombre ?? null,
          claseId: sourceClass,
          claseNombre: claseNameMap.get(sourceClass)?.nombre ?? sourceClass,
          duracion: targetDur,
        };
      }
      timetable[sourceClass] = arr;
    }

    return NextResponse.json({ timetable }, { status: 200 });
  } catch (err: any) {
    console.error("timetable move error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
