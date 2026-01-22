// components/horarios/views/VistaGeneralHorario.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { TimetableCell } from "@/lib/timetabler";

export type Periodo = { indice: number; abreviatura?: string; hora_inicio?: string; hora_fin?: string; duracion_min?: number };
export type Clase = { id: string; nombre: string; abreviatura?: string };

function safeLower(s?: string | null) {
  return (s || "").toString().trim().toLowerCase();
}

export default function VistaGeneralHorario({
  institucion,
  timetableByClase,
  classes,
  onGenerate,
  // Nuevo prop opcional: contiene result.meta (timetablerMeta) del servidor
  timetablerMeta,
  onExportAll,
}: {
  institucion: {
    id: string;
    nombre?: string;
    dias_por_semana?: number;
    lecciones_por_dia?: number;
    periodos?: Periodo[];
    clases?: Clase[];
    docentes?: { id: string; nombre: string }[];
    asignaturas?: { id: string; nombre: string; abreviatura?: string }[];
    cargas?: { id: string; asignaturaId: string; claseId: string; docenteId?: string | null }[];
  };
  timetableByClase: Record<string, Array<TimetableCell | null>> | undefined;
  classes: Clase[];
  onGenerate?: () => Promise<void> | void;
  timetablerMeta?: any;
  onExportAll?: () => void;
}) {
  const dias = institucion.dias_por_semana ?? (institucion as any).diasPorSemana ?? 5;
  const lecciones = institucion.lecciones_por_dia ?? (institucion as any).leccionesPorDia ?? 7;
  const totalSlots = dias * lecciones;
  const diasNombres = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].slice(0, dias);

  // map id -> clase (para mostrar nombre)
  const classesMap = useMemo(() => {
    const m: Record<string, Clase> = {};
    for (const c of classes) m[c.id] = c;
    return m;
  }, [classes]);

  // ensure array length = totalSlots
  function padToTotal(arr?: Array<TimetableCell | null> | null) {
    const out = Array.isArray(arr) ? [...arr] : [];
    if (out.length >= totalSlots) return out.slice(0, totalSlots);
    while (out.length < totalSlots) out.push(null);
    return out;
  }

  // Fallback resolution: intenta encontrar la key correcta en timetableByClase
  function findArrayForClassId(classId: string) {
    const table = timetableByClase || {};
    // 1) exact key
    if (table[classId]) return padToTotal(table[classId]);

    // prepare lowercase names for matching
    const targetClase = classes.find((c) => c.id === classId);
    const targetName = safeLower(targetClase?.nombre);
    const targetAbrev = safeLower((targetClase as any)?.abreviatura);

    // 2) try keys that equal either nombre or abreviatura
    for (const k of Object.keys(table)) {
      if (safeLower(k) === targetName || safeLower(k) === targetAbrev) {
        return padToTotal(table[k]);
      }
    }

    // 3) scan cell contents for a match (claseId, claseNombre, asignaturaId, cargaId)
    for (const k of Object.keys(table)) {
      const arr = table[k] ?? [];
      if (!Array.isArray(arr)) continue;
      for (const cell of arr) {
        if (!cell) continue;
        // match por campo claseId exacto
        if (cell.claseId && String(cell.claseId) === classId) return padToTotal(arr);
        // match por claseNombre si viene
        if ((cell as any).claseNombre && safeLower(String((cell as any).claseNombre)) === targetName) return padToTotal(arr);
        // match por coincidencia con asignatura/clase/nombre
        if (targetName && (
          safeLower(String(cell.asignaturaId ?? "")) === targetName ||
          safeLower(String(cell.docenteId ?? "")) === targetName
        )) {
          return padToTotal(arr);
        }
        // match por cargaId que contenga parte del classId (poco probable, pero útil)
        if ((cell as any).cargaId && String((cell as any).cargaId).includes(String(classId).slice(0,6))) {
          return padToTotal(arr);
        }
      }
    }

    // 4) last resort: if there is exactly one key with the same length totalSlots and some assignments, prefer it (only if classes length === 1, avoid false positives)
    const nonEmptyKeys = Object.entries(table).filter(([, arr]) => Array.isArray(arr) && arr.some(Boolean));
    if (nonEmptyKeys.length === 1 && classes.length === 1) {
      return padToTotal(nonEmptyKeys[0][1] as any);
    }

    // nada -> devolver array vacío rellenado
    return Array(totalSlots).fill(null);
  }

  // Normalizar a memoria: map classId -> array length totalSlots
  const normalizedTimetable = useMemo(() => {
    const normalized: Record<string, Array<TimetableCell | null>> = {};
    for (const c of classes) {
      normalized[c.id] = findArrayForClassId(c.id);
    }
    return normalized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableByClase, classes, dias, lecciones]);

  const [localTimetable, setLocalTimetable] = useState<Record<string, Array<TimetableCell | null>>>({});

  useEffect(() => {
    setLocalTimetable(normalizedTimetable);
  }, [normalizedTimetable]);

  // Debug: resumen de asignaciones
  const debugStats = useMemo(() => {
    const keysFromServer = Object.keys(timetableByClase || {});
    let assignedTotal = 0;
    const perClass: Record<string, { assigned: number; sample: TimetableCell[] }> = {};
    for (const c of classes) {
      const arr = localTimetable[c.id] ?? Array(totalSlots).fill(null);
      const assigned = arr.filter(Boolean).length;
      assignedTotal += assigned;
      const sample = arr.filter(Boolean).slice(0, 3) as TimetableCell[];
      perClass[c.id] = { assigned, sample };
    }
    return { keysFromServer, assignedTotal, perClass };
  }, [localTimetable, classes, timetableByClase, totalSlots]);

  const anyAssigned = debugStats.assignedTotal > 0;
  const hasServerKeys = Object.keys(timetableByClase || {}).length > 0;
  const showNoAssignedWarning = hasServerKeys && !anyAssigned;

  // color generator
  function colorClassFor(seed: string | undefined) {
    const colors = [
      "bg-blue-600","bg-green-600","bg-purple-600","bg-orange-500","bg-rose-600","bg-sky-600","bg-amber-600",
      "bg-indigo-600","bg-emerald-600"
    ];
    if (!seed) return "bg-slate-600";
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
    return colors[Math.abs(h) % colors.length];
  }

  // Usamos el prop timetablerMeta (si existe) para mostrar logs detallados en la vista
  const meta = timetablerMeta ?? null;

  const unplacedDetails = useMemo(() => {
    const fromApi = Array.isArray(meta?.unplacedInfo) ? meta.unplacedInfo : [];
    if (fromApi.length > 0) return fromApi;

    const unplacedIds: string[] = Array.isArray(meta?.unplaced) ? meta.unplaced : [];
    if (unplacedIds.length === 0) return [];

    const cargaById = new Map((institucion.cargas ?? []).map((c) => [c.id, c]));
    const claseById = new Map((institucion.clases ?? []).map((c) => [c.id, c]));
    const docenteById = new Map((institucion.docentes ?? []).map((d) => [d.id, d]));
    const asignaturaById = new Map((institucion.asignaturas ?? []).map((a) => [a.id, a]));

    return unplacedIds.map((lessonId) => {
      const cargaId = String(lessonId).split("__")[0];
      const carga = cargaById.get(cargaId);
      const clase = carga ? claseById.get(carga.claseId) : undefined;
      const docente = carga?.docenteId ? docenteById.get(carga.docenteId) : undefined;
      const asignatura = carga ? asignaturaById.get(carga.asignaturaId) : undefined;

      return {
        lessonId,
        cargaId,
        asignatura: asignatura?.nombre ?? asignatura?.abreviatura ?? carga?.asignaturaId ?? "Asignatura",
        docente: docente?.nombre ?? carga?.docenteId ?? "Sin docente",
        clase: clase?.nombre ?? clase?.abreviatura ?? carga?.claseId ?? "Clase",
        duracion: 1,
      };
    });
  }, [meta, institucion.cargas, institucion.clases, institucion.docentes, institucion.asignaturas]);


  type DragItem = {
    id: string;
    cargaId: string;
    asignatura: string;
    docente: string;
    duracion: number;
    claseId?: string;
    sourceIndex?: number;
    sourceType: "grid" | "unplaced" | "bank";
    cell?: TimetableCell | null;
  };

  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [unplacedPool, setUnplacedPool] = useState<any[]>([]);
  const [bankPool, setBankPool] = useState<any[]>([]);

  useEffect(() => {
    setUnplacedPool(unplacedDetails);
    setBankPool([]);
  }, [unplacedDetails]);

  function buildItemFromCell(cell: TimetableCell, claseId: string, sourceIndex: number): DragItem {
    return {
      id: `grid-${cell.cargaId}-${claseId}-${sourceIndex}`,
      cargaId: cell.cargaId,
      asignatura: (cell as any).asignaturaNombre ?? cell.asignaturaId ?? "Asignatura",
      docente: (cell as any).docenteNombre ?? cell.docenteId ?? "Sin docente",
      duracion: (cell as any).duracion ?? 1,
      claseId,
      sourceIndex,
      sourceType: "grid",
      cell,
    };
  }

  function getBlockStart(arr: Array<TimetableCell | null>, idx: number) {
    let i = idx;
    while (i > 0 && arr[i - 1]?.cargaId === arr[idx]?.cargaId) i -= 1;
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

  function canPlaceBlock(
    arr: Array<TimetableCell | null>,
    start: number,
    dur: number,
    ignore?: Set<number>
  ) {
    if (start + dur > arr.length) return false;
    const dayStart = Math.floor(start / lecciones);
    const dayEnd = Math.floor((start + dur - 1) / lecciones);
    if (dayStart !== dayEnd) return false;
    for (let i = 0; i < dur; i++) {
      const idx = start + i;
      if (arr[idx] && !ignore?.has(idx)) return false;
    }
    return true;
  }

  async function applyMoveOnServer(payload: any) {
    const res = await fetch("/api/timetable/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "No se pudo aplicar el movimiento");
    return data;
  }

  async function handleDropOnPool(target: "bank" | "unplaced") {
    if (!dragItem) return;
    if (dragItem.sourceType === target) return;

    if (dragItem.sourceType !== "grid") {
      const exists = Object.values(localTimetable).some((arr) =>
        arr.some((cell) => cell?.cargaId === dragItem.cargaId)
      );
      if (exists) {
        toast.error("Esa asignatura ya está colocada en la tabla.");
        setDragItem(null);
        return;
      }
    }

    if (dragItem.sourceType === "grid" && dragItem.claseId != null && dragItem.sourceIndex != null) {
      try {
        const data = await applyMoveOnServer({
          institucionId: institucion.id,
          timetableByClase: localTimetable,
          action: "remove",
          source: {
            sourceType: "grid",
            claseId: dragItem.claseId,
            index: dragItem.sourceIndex,
            cargaId: dragItem.cargaId,
          },
        });
        setLocalTimetable(data.timetable);
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo quitar el bloque.");
        setDragItem(null);
        return;
      }
    }

    const item = {
      lessonId: dragItem.id,
      cargaId: dragItem.cargaId,
      asignatura: dragItem.asignatura,
      docente: dragItem.docente,
      clase: dragItem.claseId ?? "Clase",
      duracion: dragItem.duracion,
    };

    if (target === "bank") {
      setBankPool((prev) => [...prev, item]);
      if (dragItem.sourceType === "unplaced") {
        setUnplacedPool((prev) => prev.filter((u: any) => u.lessonId !== dragItem.id));
      } else if (dragItem.sourceType === "bank") {
        setBankPool((prev) => prev.filter((u: any) => u.lessonId !== dragItem.id));
      }
    } else {
      setUnplacedPool((prev) => [...prev, item]);
      if (dragItem.sourceType === "bank") {
        setBankPool((prev) => prev.filter((u: any) => u.lessonId !== dragItem.id));
      } else if (dragItem.sourceType === "unplaced") {
        setUnplacedPool((prev) => prev.filter((u: any) => u.lessonId !== dragItem.id));
      }
    }

    setDragItem(null);
  }

  async function handleDropOnCell(claseId: string, targetIndex: number, targetOccupied = false) {
    if (!dragItem) return;

    if (targetOccupied && dragItem.sourceType !== "grid") {
      toast.error("Solo se puede intercambiar con otra celda si el origen está en la tabla.");
      setDragItem(null);
      return;
    }

    if (dragItem.sourceType !== "grid") {
      const exists = Object.values(localTimetable).some((arr) =>
        arr.some((cell) => cell?.cargaId === dragItem.cargaId)
      );
      if (exists) {
        toast.error("Esa asignatura ya está colocada en la tabla.");
        setDragItem(null);
        return;
      }
    }

    try {
      const data = await applyMoveOnServer({
        institucionId: institucion.id,
        timetableByClase: localTimetable,
        action: "move",
        source: {
          sourceType: dragItem.sourceType === "grid" ? "grid" : "pool",
          claseId: dragItem.claseId,
          index: dragItem.sourceIndex,
          cargaId: dragItem.cargaId,
        },
        target: { claseId, index: targetIndex },
        swap: Boolean(targetOccupied),
      });
      const updated = data.timetable as Record<string, Array<TimetableCell | null>>;
      if (!targetOccupied && dragItem.sourceType === "grid" && dragItem.claseId && dragItem.sourceIndex != null) {
        const arr = [...(updated[dragItem.claseId] ?? [])];
        const start = getBlockStart(arr, dragItem.sourceIndex);
        if (arr[start]?.cargaId === dragItem.cargaId) {
          const len = blockLength(arr, start, dragItem.cargaId);
          const indices = blockIndices(start, len);
          for (const idx of indices) arr[idx] = null;
          updated[dragItem.claseId] = arr;
        }
      }
      setLocalTimetable(updated);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo mover el bloque.");
      setDragItem(null);
      return;
    }

    if (dragItem.sourceType === "unplaced") {
      setUnplacedPool((prev) => prev.filter((u: any) => u.lessonId !== dragItem.id));
    } else if (dragItem.sourceType === "bank") {
      setBankPool((prev) => prev.filter((u: any) => u.lessonId !== dragItem.id));
    }

    setDragItem(null);
  }

  const horaLabels: string[] = useMemo(() => {
    return Array.from({ length: lecciones }, (_, i) => String(i + 1));
  }, [lecciones]);
  const splitReport = useMemo(() => {
    const raw = Array.isArray(meta?.splitReport) ? meta.splitReport : [];
    if (raw.length === 0) return [];
    const claseById = new Map((institucion.clases ?? []).map((c) => [c.id, c]));
    const docenteById = new Map((institucion.docentes ?? []).map((d) => [d.id, d]));
    const asignaturaById = new Map((institucion.asignaturas ?? []).map((a) => [a.id, a]));
    return raw.map((r: any) => {
      const clase = claseById.get(r.claseId);
      const docente = r.docenteId ? docenteById.get(r.docenteId) : undefined;
      const asignatura = asignaturaById.get(r.asignaturaId);
      const slots = Array.isArray(r.splitSlots) ? r.splitSlots : [];
      const slotsLabel = slots.map((s: any) => {
        const dayName = diasNombres[s.day] ?? `Dia ${Number(s.day) + 1}`;
        const hora = horaLabels[s.period] ?? String(Number(s.period) + 1);
        return `${dayName} ${hora}`;
      }).join(" · ");
      return {
        lessonId: r.lessonId,
        clase: clase?.nombre ?? clase?.abreviatura ?? r.claseId,
        asignatura: asignatura?.nombre ?? asignatura?.abreviatura ?? r.asignaturaId,
        docente: docente?.nombre ?? r.docenteId ?? "Sin docente",
        originalDuracion: r.originalDuracion ?? 2,
        slotsLabel,
      };
    });
  }, [meta, institucion.clases, institucion.docentes, institucion.asignaturas, diasNombres, horaLabels]);
  const directorsApplied = useMemo(() => {
    const raw = Array.isArray((meta as any)?.forcedDirector?.applied)
      ? (meta as any).forcedDirector.applied
      : [];
    if (raw.length === 0) return [];
    const claseById = new Map((institucion.clases ?? []).map((c) => [c.id, c]));
    const docenteById = new Map((institucion.docentes ?? []).map((d) => [d.id, d]));
    return raw.map((row: any) => {
      const clase = claseById.get(row.claseId);
      const docente = docenteById.get(row.docenteId);
      const slot = typeof row.slot === "number" ? row.slot : null;
      const day = slot != null ? Math.floor(slot / lecciones) : null;
      const period = slot != null ? slot % lecciones : null;
      const slotLabel = slot == null
        ? "Lunes (variable)"
        : `${diasNombres[day ?? 0] ?? `Dia ${Number(day ?? 0) + 1}`} ${horaLabels[period ?? 0] ?? String(Number(period ?? 0) + 1)}`;
      return {
        lessonId: row.lessonId ?? `${row.docenteId}-${row.claseId}`,
        docenteNombre: docente?.nombre ?? row.docenteId,
        claseNombre: clase?.nombre ?? clase?.abreviatura ?? row.claseId,
        label: row.label ?? "Dirección de grupo",
        slotLabel,
      };
    });
  }, [meta, institucion.clases, institucion.docentes, diasNombres, horaLabels, lecciones]);
  const saturatedClasses = useMemo(() => {
    const raw = Array.isArray((meta as any)?.saturatedClasses) ? (meta as any).saturatedClasses : [];
    if (raw.length === 0) return [];
    const claseById = new Map((institucion.clases ?? []).map((c) => [c.id, c]));
    return raw.map((entry: any) => {
      const clase = claseById.get(entry.claseId);
      return {
        claseId: entry.claseId,
        claseNombre: clase?.nombre ?? clase?.abreviatura ?? entry.claseId,
        assignedSlots: entry.assignedSlots ?? 0,
        capacity: entry.capacity ?? 0,
        pendingCount: entry.pendingCount ?? 0,
      };
    });
  }, [meta, institucion.clases]);
  const teacherConflicts = useMemo(() => {
    const raw = Array.isArray(meta?.teacherConflicts) ? meta.teacherConflicts : [];
    if (raw.length === 0) return [];
    const docenteById = new Map((institucion.docentes ?? []).map((d) => [d.id, d]));
    const asignaturaById = new Map((institucion.asignaturas ?? []).map((a) => [a.id, a]));
    return raw.map((entry: any) => {
      const docente = docenteById.get(entry.docenteId);
      const subjects = Array.isArray(entry.subjects) ? entry.subjects : [];
      const subjectLabels = subjects.map((s: any) => {
        const asignatura = asignaturaById.get(s.asignaturaId);
        const nombre = asignatura?.nombre ?? asignatura?.abreviatura ?? s.asignaturaId ?? "Asignatura";
        return `${nombre} (${s.slots})`;
      });
      return {
        docenteId: entry.docenteId,
        docenteNombre: docente?.nombre ?? entry.docenteId,
        requiredSlots: entry.requiredSlots ?? 0,
        availableSlots: entry.availableSlots ?? 0,
        blockedSlots: entry.blockedSlots ?? 0,
        meetingSlots: entry.meetingSlots ?? 0,
        availableDays: Array.isArray(entry.availableDays) ? entry.availableDays : [],
        subjectLabels,
      };
    });
  }, [meta, institucion.docentes, institucion.asignaturas]);
  const subjectDayConflicts = useMemo(() => {
    const raw = Array.isArray(meta?.subjectDayConflicts) ? meta.subjectDayConflicts : [];
    if (raw.length === 0) return [];
    const docenteById = new Map((institucion.docentes ?? []).map((d) => [d.id, d]));
    const claseById = new Map((institucion.clases ?? []).map((c) => [c.id, c]));
    const asignaturaById = new Map((institucion.asignaturas ?? []).map((a) => [a.id, a]));
    return raw.map((entry: any) => {
      const docente = docenteById.get(entry.docenteId);
      const clase = claseById.get(entry.claseId);
      const asignatura = asignaturaById.get(entry.asignaturaId);
      return {
        docenteId: entry.docenteId,
        docenteNombre: docente?.nombre ?? entry.docenteId,
        claseNombre: clase?.nombre ?? clase?.abreviatura ?? entry.claseId,
        asignaturaNombre: asignatura?.nombre ?? asignatura?.abreviatura ?? entry.asignaturaId,
        requiredSlots: entry.requiredSlots ?? 0,
        maxSlots: entry.maxSlots ?? 0,
        availableDays: Array.isArray(entry.availableDays) ? entry.availableDays : [],
      };
    });
  }, [meta, institucion.docentes, institucion.clases, institucion.asignaturas]);
  const tightLessons = useMemo(() => {
    const raw = Array.isArray((meta as any)?.tightLessons) ? (meta as any).tightLessons : [];
    if (raw.length === 0) return [];
    const docenteById = new Map((institucion.docentes ?? []).map((d) => [d.id, d]));
    const claseById = new Map((institucion.clases ?? []).map((c) => [c.id, c]));
    const asignaturaById = new Map((institucion.asignaturas ?? []).map((a) => [a.id, a]));
    return raw.map((entry: any) => {
      const docente = docenteById.get(entry.docenteId);
      const clase = claseById.get(entry.claseId);
      const asignatura = asignaturaById.get(entry.asignaturaId);
      const domainSize = typeof entry.domainSize === "number" ? entry.domainSize : (typeof entry.candidateCount === "number" ? entry.candidateCount : 0);
      const availableDays = Array.isArray(entry.availableDays) ? entry.availableDays : [];
      return {
        lessonId: entry.lessonId,
        docenteNombre: docente?.nombre ?? entry.docenteId,
        claseNombre: clase?.nombre ?? clase?.abreviatura ?? entry.claseId,
        asignaturaNombre: asignatura?.nombre ?? asignatura?.abreviatura ?? entry.asignaturaId,
        duracion: entry.duracion ?? 1,
        domainSize,
        availableDays,
      };
    });
  }, [meta, institucion.docentes, institucion.clases, institucion.asignaturas]);
  const tightLessonsBreakdown = useMemo(() => {
    const raw = Array.isArray((meta as any)?.tightLessonsBreakdown) ? (meta as any).tightLessonsBreakdown : [];
    if (raw.length === 0) return [];
    const docenteById = new Map((institucion.docentes ?? []).map((d) => [d.id, d]));
    const claseById = new Map((institucion.clases ?? []).map((c) => [c.id, c]));
    const asignaturaById = new Map((institucion.asignaturas ?? []).map((a) => [a.id, a]));
    return raw.map((entry: any) => {
      const docente = docenteById.get(entry.docenteId);
      const clase = claseById.get(entry.claseId);
      const asignatura = asignaturaById.get(entry.asignaturaId);
      const availableDays = Array.isArray(entry.availableDays) ? entry.availableDays : [];
      return {
        lessonId: entry.lessonId,
        docenteNombre: docente?.nombre ?? entry.docenteId,
        claseNombre: clase?.nombre ?? clase?.abreviatura ?? entry.claseId,
        asignaturaNombre: asignatura?.nombre ?? asignatura?.abreviatura ?? entry.asignaturaId,
        duracion: entry.duracion ?? 1,
        domainSize: entry.domainSize ?? 0,
        availableDays,
        totalStarts: entry.totalStarts ?? 0,
        freeStarts: entry.freeStarts ?? 0,
        outOfBounds: entry.outOfBounds ?? 0,
        teacherBlocked: entry.teacherBlocked ?? 0,
        classConflict: entry.classConflict ?? 0,
        teacherConflict: entry.teacherConflict ?? 0,
        subjectDayConflict: entry.subjectDayConflict ?? 0,
        meetingDayConflict: entry.meetingDayConflict ?? 0,
        forcedStartConflict: entry.forcedStartConflict ?? 0,
      };
    });
  }, [meta, institucion.docentes, institucion.clases, institucion.asignaturas]);
  const breakAfterIndex = 2;
  const breakPercent = useMemo(() => {
    if (lecciones <= 0) return 50;
    return ((breakAfterIndex + 1) / lecciones) * 100;
  }, [breakAfterIndex, lecciones]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Vista general — {institucion.nombre}</h3>
        <div className="flex gap-2 items-center">
          <Badge className="text-sm">Slots: {totalSlots}</Badge>
          <Badge className="text-sm">Asignados: {debugStats.assignedTotal}</Badge>
          {onExportAll && (
            <button
              onClick={onExportAll}
              className="px-3 py-1 rounded bg-muted hover:bg-muted/70 text-sm border"
            >
              Exportar PDF
            </button>
          )}
        </div>
      </div>

      {unplacedPool.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4 items-start">
          <div
            className="border rounded-md p-3 bg-muted/20 max-w-xl flex-1 min-w-[280px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDropOnPool("unplaced")}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Asignaturas sin asignar</h4>
              <Badge variant="outline" className="text-xs">
                {unplacedPool.length}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {unplacedPool.map((u: any) => (
                <div
                  key={u.lessonId}
                  className="px-2 py-1 rounded-md border bg-background text-xs flex items-center gap-2 cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => {
                    const item: DragItem = {
                      id: u.lessonId,
                      cargaId: u.cargaId,
                      asignatura: u.asignatura,
                      docente: u.docente,
                      duracion: Number(u.duracion ?? 1),
                      sourceType: "unplaced",
                    };
                    setDragItem(item);
                    e.dataTransfer.setData("text/plain", JSON.stringify(item));
                  }}
                  onDragEnd={() => setDragItem(null)}
                >
                  <span className="font-medium">{u.asignatura}</span>
                  <span className="text-muted-foreground">• {u.clase}</span>
                  <span className="text-muted-foreground">• {u.docente}</span>
                </div>
              ))}
            </div>
          </div>
          <div
            className="border rounded-md p-3 bg-muted/10 max-w-4xl flex-[1.75] min-w-[360px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDropOnPool("bank")}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Banco temporal</h4>
              <Badge variant="outline" className="text-xs">
                {bankPool.length}
              </Badge>
            </div>
            {bankPool.length === 0 ? (
              <div className="text-xs text-muted-foreground">Vacío</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bankPool.map((u: any) => (
                  <div
                    key={u.lessonId}
                    className="px-2 py-1 rounded-md border bg-background text-xs flex items-center gap-2 cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      const item: DragItem = {
                        id: u.lessonId,
                        cargaId: u.cargaId,
                        asignatura: u.asignatura,
                        docente: u.docente,
                        duracion: Number(u.duracion ?? 1),
                        sourceType: "bank",
                      };
                      setDragItem(item);
                      e.dataTransfer.setData("text/plain", JSON.stringify(item));
                    }}
                    onDragEnd={() => setDragItem(null)}
                  >
                    <span className="font-medium">{u.asignatura}</span>
                    <span className="text-muted-foreground">• {u.clase}</span>
                    <span className="text-muted-foreground">• {u.docente}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-auto border rounded">
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background z-10 p-2 border">Clase</th>
              {diasNombres.map(d => <th key={d} className="p-2 text-center border">{d}</th>)}
            </tr>

            <tr>
              <th />
              {diasNombres.map((d, i) => (
                <th key={`sub-${i}`} className="p-0 border">
                  <div className="relative">
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(96px,1fr))`, gap: "6px" }}>
                      {Array.from({ length: lecciones }).map((_, j) => (
                        <div key={j} className="text-xs p-2 border text-center bg-muted/10">
                          {horaLabels[j] ?? j + 1}
                        </div>
                      ))}
                    </div>
                    <div
                      className="pointer-events-none absolute inset-y-0"
                      style={{ left: `${breakPercent}%` }}
                    >
                      <div className="h-full w-px bg-amber-500/70" />
                      <div
                        className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wide text-amber-800 bg-background/80 px-1 rounded"
                        style={{ transform: "translate(-50%, -50%) rotate(-90deg)" }}
                      >
                        Descanso
                      </div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {classes.map(({ id: claseId }) => {
              const arr = localTimetable[claseId] ?? Array(totalSlots).fill(null);

              return (
                <tr key={claseId} className="border-t">
                  <td className="sticky left-0 bg-background z-10 p-2 font-medium border-r align-top">
                    {(() => {
                      const firstCell = (arr.find((c) => c) as any) || null;
                      const fromMap = classesMap[claseId]?.nombre;
                      const fromCell = firstCell?.claseNombre;
                      // si la key del timetable es el nombre (no id), úsalo
                      const keyLooksLikeName = !classesMap[claseId] && (claseId || "").length > 0 && !(claseId || "").startsWith("cmj");
                      const displayName = fromMap ?? fromCell ?? (keyLooksLikeName ? claseId : claseId);
                      return displayName;
                    })()}
                  </td>

                  {Array.from({ length: dias }).map((_, day) => {
                    const dayStart = day * lecciones;
                    const items: React.ReactNode[] = [];
                    let i = 0;

                    while (i < lecciones) {
                      const slotIdx = dayStart + i;
                      const cell = arr[slotIdx];

                      if (!cell) {
                        items.push(
                          <div
                            key={`empty-${day}-${i}`}
                            className="h-14 border rounded-sm flex items-center justify-center text-muted-foreground text-sm"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDropOnCell(claseId, slotIdx, false)}
                          >
                            &nbsp;
                          </div>
                        );
                        i += 1;
                        continue;
                      }

                      // si hay contenido, asegurarnos que duracion es number >=1
                      const dur = Math.max(1, Number((cell as any).duracion ?? 1));
                      const seed = String((cell as any).cargaId ?? cell.asignaturaId ?? slotIdx);
                      const bg = colorClassFor(seed);

                      items.push(
                        <div
                          key={`cell-${day}-${i}-${seed}`}
                          style={{ gridColumn: `span ${Math.min(dur, lecciones - i)}` }}
                          className={`${bg} text-white p-2 rounded-lg shadow-sm flex flex-col justify-center cursor-grab active:cursor-grabbing`}
                          draggable
                          onDragStart={(e) => {
                            const item = buildItemFromCell(cell, claseId, slotIdx);
                            setDragItem(item);
                            e.dataTransfer.setData("text/plain", JSON.stringify(item));
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDropOnCell(claseId, slotIdx, true)}
                          onDragEnd={() => setDragItem(null)}
                        >
                          <div className="font-semibold text-sm leading-tight truncate">{(cell as any).asignaturaNombre ?? cell.asignaturaId}</div>
                          <div className="text-[11px] opacity-90 mt-1 truncate">{(cell as any).docenteNombre ?? cell.docenteId ?? "-"}</div>
                          {(cell as any).fixed && (
                            <div className="mt-1">
                              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                                {(cell as any).fixedLabel ?? "Dirección de grupo"}
                              </Badge>
                            </div>
                          )}
                          {dur > 1 && <div className="text-[11px] opacity-80 mt-1">{dur} slot{dur > 1 ? "s" : ""}</div>}
                        </div>
                      );

                      i += Math.min(dur, lecciones - i);
                    }

                    return (
                      <td key={`${claseId}-d${day}`} className="p-2 align-top">
                        <div className="relative">
                          <div className="grid items-start" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(96px,1fr))`, gap: "6px", alignItems: "start" }}>
                            {items}
                          </div>
                          <div
                            className="pointer-events-none absolute inset-y-0"
                            style={{ left: `${breakPercent}%` }}
                          >
                            <div className="h-full w-px bg-amber-500/60" />
                          </div>
                        </div>
                      </td>
                    );
                  })}

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {splitReport.length > 0 && (
        <div className="mt-6 border rounded-lg bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-sm font-semibold">Reporte de ajustes de duración</div>
              <div className="text-xs text-muted-foreground">
                Estas asignaturas se dividieron en bloques de 1 slot por falta de bloques dobles disponibles.
              </div>
            </div>
            <Badge variant="secondary">{splitReport.length}</Badge>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b">Clase</th>
                  <th className="p-2 border-b">Asignatura</th>
                  <th className="p-2 border-b">Docente</th>
                  <th className="p-2 border-b">Duración original</th>
                  <th className="p-2 border-b">Slots asignados</th>
                </tr>
              </thead>
              <tbody>
                {splitReport.map((row: any) => (
                  <tr key={row.lessonId} className="border-b last:border-b-0">
                    <td className="p-2">{row.clase}</td>
                    <td className="p-2">{row.asignatura}</td>
                    <td className="p-2">{row.docente}</td>
                    <td className="p-2">{row.originalDuracion} slots</td>
                    <td className="p-2">{row.slotsLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {directorsApplied.length > 0 && (
        <div className="mt-4 border rounded-lg bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-sm font-semibold">Directores con regla aplicada</div>
              <div className="text-xs text-muted-foreground">
                Estos directores iniciaron con su grupo segun la regla configurada.
              </div>
            </div>
            <Badge variant="secondary">{directorsApplied.length}</Badge>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b">Docente</th>
                  <th className="p-2 border-b">Grupo</th>
                  <th className="p-2 border-b">Regla</th>
                  <th className="p-2 border-b">Slot</th>
                </tr>
              </thead>
              <tbody>
                {directorsApplied.map((row: any) => (
                  <tr key={row.lessonId} className="border-b last:border-b-0">
                    <td className="p-2">{row.docenteNombre}</td>
                    <td className="p-2">{row.claseNombre}</td>
                    <td className="p-2">{row.label}</td>
                    <td className="p-2">{row.slotLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {teacherConflicts.length > 0 && (
        <div className="mt-4 border rounded-lg bg-amber-50/70 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                Disponibilidad insuficiente por docente
              </div>
              <div className="text-xs text-amber-900/80">
                Estos docentes requieren mas slots de los disponibles segun sus restricciones.
              </div>
            </div>
            <Badge variant="secondary">{teacherConflicts.length}</Badge>
          </div>
          <div className="space-y-3 text-sm">
            {teacherConflicts.map((row) => (
              <div key={row.docenteId} className="rounded-md border bg-background p-3">
                <div className="font-medium">{row.docenteNombre}</div>
                <div className="text-muted-foreground">
                  Requiere {row.requiredSlots} slots · Disponibles {row.availableSlots} · Bloqueados {row.blockedSlots} · Reuniones {row.meetingSlots}
                </div>
                {row.availableDays.length > 0 && (
                  <div className="text-muted-foreground">
                    Dias disponibles: {row.availableDays.map((d: number) => diasNombres[d] ?? `Dia ${d + 1}`).join(", ")}
                  </div>
                )}
                {row.subjectLabels.length > 0 && (
                  <div className="text-muted-foreground">
                    Asignaturas: {row.subjectLabels.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {subjectDayConflicts.length > 0 && (
        <div className="mt-4 border rounded-lg bg-amber-50/70 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                Limite diario por asignatura excedido
              </div>
              <div className="text-xs text-amber-900/80">
                Estos docentes no alcanzan a repartir sus slots con el limite diario actual.
              </div>
            </div>
            <Badge variant="secondary">{subjectDayConflicts.length}</Badge>
          </div>
          <div className="space-y-3 text-sm">
            {subjectDayConflicts.map((row) => (
              <div key={`${row.docenteId}-${row.claseNombre}-${row.asignaturaNombre}`} className="rounded-md border bg-background p-3">
                <div className="font-medium">{row.docenteNombre}</div>
                <div className="text-muted-foreground">
                  {row.asignaturaNombre} · {row.claseNombre}
                </div>
                <div className="text-muted-foreground">
                  Requiere {row.requiredSlots} slots · Maximo {row.maxSlots}
                </div>
                {row.availableDays.length > 0 && (
                  <div className="text-muted-foreground">
                    Dias disponibles: {row.availableDays.map((d: number) => diasNombres[d] ?? `Dia ${d + 1}`).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {(tightLessons.length > 0 || tightLessonsBreakdown.length > 0) && (
        <div className="mt-4 border rounded-lg bg-amber-50/70 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                Lecciones con dominio reducido
              </div>
              <div className="text-xs text-amber-900/80">
                Estas lecciones casi no tienen slots posibles segun las restricciones actuales.
              </div>
            </div>
            <Badge variant="secondary">{tightLessonsBreakdown.length || tightLessons.length}</Badge>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b">Clase</th>
                  <th className="p-2 border-b">Asignatura</th>
                  <th className="p-2 border-b">Docente</th>
                  <th className="p-2 border-b">Duracion</th>
                  <th className="p-2 border-b">Dominio</th>
                  <th className="p-2 border-b">Dias disponibles</th>
                  {tightLessonsBreakdown.length > 0 && (
                    <>
                      <th className="p-2 border-b">Libres</th>
                      <th className="p-2 border-b">Clase</th>
                      <th className="p-2 border-b">Docente</th>
                      <th className="p-2 border-b">Asignatura/dia</th>
                      <th className="p-2 border-b">Bloqueado</th>
                      <th className="p-2 border-b">Reunion</th>
                      <th className="p-2 border-b">Forzado</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(tightLessonsBreakdown.length > 0 ? tightLessonsBreakdown : tightLessons).map((row: any) => (
                  <tr key={row.lessonId} className="border-b last:border-b-0">
                    <td className="p-2">{row.claseNombre}</td>
                    <td className="p-2">{row.asignaturaNombre}</td>
                    <td className="p-2">{row.docenteNombre}</td>
                    <td className="p-2">{row.duracion}</td>
                    <td className="p-2 font-semibold text-amber-900">{row.domainSize}</td>
                    <td className="p-2">
                      {row.availableDays.length > 0
                        ? row.availableDays.map((d: number) => diasNombres[d] ?? `Dia ${d + 1}`).join(", ")
                        : "—"}
                    </td>
                    {tightLessonsBreakdown.length > 0 && (
                      <>
                        <td className="p-2 font-semibold text-amber-900">{row.freeStarts}</td>
                        <td className="p-2">{row.classConflict}</td>
                        <td className="p-2">{row.teacherConflict}</td>
                        <td className="p-2">{row.subjectDayConflict}</td>
                        <td className="p-2">{row.teacherBlocked}</td>
                        <td className="p-2">{row.meetingDayConflict}</td>
                        <td className="p-2">{row.forcedStartConflict}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {saturatedClasses.length > 0 && (
        <div className="mt-4 border rounded-lg bg-amber-50/70 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                Clases saturadas detectadas
              </div>
              <div className="text-xs text-amber-900/80">
                Estas clases ya están al 100% de capacidad, pero aún tienen cargas pendientes.
              </div>
            </div>
            <Badge variant="secondary">{saturatedClasses.length}</Badge>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b">Clase</th>
                  <th className="p-2 border-b">Asignados</th>
                  <th className="p-2 border-b">Capacidad</th>
                  <th className="p-2 border-b">Pendientes</th>
                </tr>
              </thead>
              <tbody>
                {saturatedClasses.map((row: any) => (
                  <tr key={row.claseId} className="border-b last:border-b-0">
                    <td className="p-2">{row.claseNombre}</td>
                    <td className="p-2">{row.assignedSlots}</td>
                    <td className="p-2">{row.capacity}</td>
                    <td className="p-2 font-semibold text-amber-900">{row.pendingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
