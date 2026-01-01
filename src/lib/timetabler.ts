// lib/timetabler.ts
export type LessonItem = {
  id: string;
  cargaId: string;
  claseId: string;
  claseNombre?: string;
  asignaturaId: string;
  docenteId?: string | null;
  duracion: number; // duracion en slots (>=1)
};

export type TimetableCell = {
  cargaId: string;
  asignaturaId: string;
  asignaturaNombre?: string;
  docenteId?: string | null;
  docenteNombre?: string | null;
  claseId: string;
  duracion?: number;
};

export type TimetableResult = {
  timetableByClase: Record<string, Array<TimetableCell | null>>;
  success: boolean;
  unplaced?: string[];
  stats: {
    lessonsTotal: number;
    assigned: number;
    backtracks: number;
    timeMs: number;
    greedyAssigned: number;
  };
  meta?: any; // info diagnóstica adicional (assignedSummary, unplacedDetails)
};

function slotIndex(day: number, period: number, slotsPerDay: number) {
  return day * slotsPerDay + period;
}

export function generateTimetable(
  institucionId: string | null,
  classes: { id: string; nombre?: string }[],
  lessons: LessonItem[],
  days: number,
  slotsPerDay: number,
  options?: { maxBacktracks?: number; timeLimitMs?: number }
): TimetableResult {
  const maxBacktracks = options?.maxBacktracks ?? 300000;
  const timeLimitMs = options?.timeLimitMs ?? 30000;

  const startTime = Date.now();
  const totalSlots = days * slotsPerDay;

  // timetable inicial por clase
  const timetableByClase: Record<string, Array<TimetableCell | null>> = {};
  for (const c of classes) timetableByClase[c.id] = Array(totalSlots).fill(null);

  // Helpers básicos (igual que antes)
  function canPlace(claseId: string, startSlot: number, dur: number) {
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    if (periodInDay + dur > slotsPerDay) return false;
    const arr = timetableByClase[claseId];
    for (let p = 0; p < dur; p++) {
      if (arr[slotIndex(day, periodInDay + p, slotsPerDay)]) return false;
    }
    return true;
  }

  function teacherFree(docenteId: string | undefined | null, startSlot: number, dur: number) {
    if (!docenteId) return true;
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    for (const claseId of Object.keys(timetableByClase)) {
      const arr = timetableByClase[claseId];
      for (let p = 0; p < dur; p++) {
        const cell = arr[slotIndex(day, periodInDay + p, slotsPerDay)];
        if (cell && cell.docenteId === docenteId) return false;
      }
    }
    return true;
  }

  // Precompute domains: todos los start indices válidos (sin chequear conflictos)
  const lessonDomains: Map<string, number[]> = new Map();
  for (const L of lessons) {
    const domain: number[] = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < slotsPerDay; p++) {
        if (p + L.duracion <= slotsPerDay) {
          domain.push(slotIndex(d, p, slotsPerDay));
        }
      }
    }
    lessonDomains.set(L.id, domain);
  }

  // Helper adicional: medir "run contiguo" disponible en un start dado para una clase
  function contiguousRunAt(claseId: string, startSlot: number) {
    // retorna número de slots contiguos libres desde startSlot hasta fin del día
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    const arr = timetableByClase[claseId];
    let run = 0;
    for (let p = periodInDay; p < slotsPerDay; p++) {
      const idx = slotIndex(day, p, slotsPerDay);
      if (arr[idx]) break;
      run++;
    }
    return run;
  }

  // -----------------------------------
  // GREEDY: ahora en PASOS para mejorar multi-slot placement
  // -----------------------------------

  // 1) Dividir lecciones: single-slot y multi-slot
  const singles = lessons.filter((L) => L.duracion <= 1);
  const multis = lessons.filter((L) => L.duracion > 1);

  // 2) Definimos una función para obtener starts válidos filtrados por canPlace + teacherFree
  function validStartsFor(L: LessonItem) {
    const domain = lessonDomains.get(L.id) ?? [];
    const valid: number[] = [];
    for (const start of domain) {
      if (!L.claseId) continue;
      if (!canPlace(L.claseId, start, L.duracion)) continue;
      if (!teacherFree(L.docenteId, start, L.duracion)) continue;
      valid.push(start);
    }
    return valid;
  }

  // 3) GREEDY PASS A: asignar singles muy constriñidos (pocas opciones)
  const singlesConstrainedThreshold = 6; // si un single tiene <=6 opciones lo asignamos primero
  const singlesConstrained = singles
    .map((s) => ({ s, domainLen: (lessonDomains.get(s.id) ?? []).length }))
    .sort((a, b) => a.domainLen - b.domainLen) // primero más constriñidos por dominio original
    .map((x) => x.s)
    .filter((s) => (lessonDomains.get(s.id)?.length ?? 0) <= singlesConstrainedThreshold);

  const singlesRemaining = singles.filter((s) => !singlesConstrained.find((c) => c.id === s.id));

  // 4) GREEDY PASS B: multis — priorizar duraciones largas, y elegir start con mayor contiguousRun
  const multisOrdered = [...multis].sort((a, b) => {
    if (a.duracion !== b.duracion) return b.duracion - a.duracion; // dur más grande primero
    const da = lessonDomains.get(a.id)?.length ?? 0;
    const db = lessonDomains.get(b.id)?.length ?? 0;
    return da - db;
  });

  // 5) Ejecutar las pasadas greedy en orden: singlesConstrained -> multisOrdered -> singlesRemaining
  let greedyAssigned = 0;
  const assignedMap = new Map<string, number>();

  // helper para colocar una lección (escribe el mismo objeto en los slots)
  function placeLesson(L: LessonItem, start: number) {
    const day = Math.floor(start / slotsPerDay);
    const periodInDay = start % slotsPerDay;
    const cellObj: TimetableCell = {
      cargaId: L.cargaId,
      asignaturaId: L.asignaturaId,
      docenteId: L.docenteId ?? null,
      claseId: L.claseId,
      duracion: L.duracion,
    };
    for (let p = 0; p < L.duracion; p++) {
      timetableByClase[L.claseId][slotIndex(day, periodInDay + p, slotsPerDay)] = cellObj;
    }
    assignedMap.set(L.id, start);
    greedyAssigned++;
  }

  // PASS A: singles constriñidos
  for (const L of singlesConstrained) {
    if (!L.claseId) continue;
    const valids = validStartsFor(L);
    if (valids.length === 0) continue;
    // prefer earliest valid
    placeLesson(L, valids[0]);
  }

  // PASS B: multis (priorizar lugares con mayor contiguous run)
  for (const L of multisOrdered) {
    if (!L.claseId) continue;
    const domain = lessonDomains.get(L.id) ?? [];
    // crear lista de starts que cumplen canPlace+teacherFree, ordenadas por contiguousRun desc then earlier
    const candidates: { start: number; run: number }[] = [];
    for (const start of domain) {
      if (!canPlace(L.claseId, start, L.duracion)) continue;
      if (!teacherFree(L.docenteId, start, L.duracion)) continue;
      const run = contiguousRunAt(L.claseId, start);
      candidates.push({ start, run });
    }
    if (candidates.length === 0) continue;
    // sort: prefer starts with larger contiguous run; tie-breaker earlier start
    candidates.sort((a, b) => {
      if (b.run !== a.run) return b.run - a.run;
      return a.start - b.start;
    });
    // elegir el primero que tenga run >= duracion si es posible, si no, igual el mejor candidato
    const exact = candidates.find((c) => c.run >= L.duracion);
    const chosen = exact ? exact.start : candidates[0].start;
    placeLesson(L, chosen);
  }

  // PASS C: remaining singles (menos constriñidos)
  // order these by domain length asc so we fill constrained ones first
  const singlesRemainingOrdered = [...singlesRemaining].sort((a, b) => {
    const da = (lessonDomains.get(a.id) ?? []).length;
    const db = (lessonDomains.get(b.id) ?? []).length;
    return da - db;
  });

  for (const L of singlesRemainingOrdered) {
    if (!L.claseId) continue;
    const valids = validStartsFor(L);
    if (valids.length === 0) continue;
    placeLesson(L, valids[0]);
  }

  // ----------------------------------------------------
  // Construir remainingLessons para backtracking
  // ----------------------------------------------------
  const remainingLessons = lessons.filter((L) => !assignedMap.has(L.id));

  // Si no quedan, retornamos early
  if (remainingLessons.length === 0) {
    const assigned = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);
    const assignedSummary = Object.keys(timetableByClase).map((cid) => {
      const arr = timetableByClase[cid];
      const assignedSlots = arr.filter(Boolean).length;
      const sampleCell = arr.find(Boolean) as TimetableCell | undefined;
      const sample = sampleCell ? `${sampleCell.asignaturaId ?? "?"} / ${String(sampleCell.docenteId ?? "-")}` : "—";
      return [cid, { assignedSlots, sample }];
    });
    return {
      timetableByClase,
      success: true,
      unplaced: [],
      stats: {
        lessonsTotal: lessons.length,
        assigned,
        backtracks: 0,
        timeMs: Date.now() - startTime,
        greedyAssigned,
      },
      meta: { assignedSummary },
    };
  }

  // ----------------------------------------------------
  // BACKTRACKING (igual que antes, pero sobre remainingLessons)
  // ----------------------------------------------------
  let backtracks = 0;
  const lessonsSorted = [...remainingLessons].sort((a, b) => {
    // priorizar duraciones menores (igual que hicimos), luego menor dominio
    if (a.duracion !== b.duracion) return a.duracion - b.duracion;
    const da = lessonDomains.get(a.id)!.length;
    const db = lessonDomains.get(b.id)!.length;
    return da - db;
  });

  function computeDomainFiltered(lesson: LessonItem) {
    const domain = lessonDomains.get(lesson.id) ?? [];
    const filtered: number[] = [];
    for (const start of domain) {
      if (!lesson.claseId) continue;
      if (!canPlace(lesson.claseId, start, lesson.duracion)) continue;
      if (!teacherFree(lesson.docenteId, start, lesson.duracion)) continue;
      filtered.push(start);
    }
    return filtered;
  }

  const assignments = new Map<string, number>();

  function backtrack(idx: number, timeLimitMsLocal: number): boolean {
    if (Date.now() - startTime > timeLimitMsLocal) return false;
    if (backtracks > maxBacktracks) return false;
    if (idx >= lessonsSorted.length) return true;

    const L = lessonsSorted[idx];
    const domain = computeDomainFiltered(L);
    if (domain.length === 0) return false;

    // ordenar domain preferentemente por contiguousRun desc (por si es multi-slot)
    domain.sort((a, b) => {
      const ra = contiguousRunAt(L.claseId, a);
      const rb = contiguousRunAt(L.claseId, b);
      if (rb !== ra) return rb - ra;
      return a - b;
    });

    for (const start of domain) {
      const day = Math.floor(start / slotsPerDay);
      const periodInDay = start % slotsPerDay;

      const cellObj: TimetableCell = {
        cargaId: L.cargaId,
        asignaturaId: L.asignaturaId,
        docenteId: L.docenteId ?? null,
        claseId: L.claseId,
        duracion: L.duracion,
      };

      for (let p = 0; p < L.duracion; p++) {
        timetableByClase[L.claseId][slotIndex(day, periodInDay + p, slotsPerDay)] = cellObj;
      }
      assignments.set(L.id, start);

      // forward-check
      let forwardOk = true;
      for (let j = idx + 1; j < lessonsSorted.length; j++) {
        const LJ = lessonsSorted[j];
        const domJ = computeDomainFiltered(LJ);
        if (domJ.length === 0) {
          forwardOk = false;
          break;
        }
      }

      if (forwardOk) {
        if (backtrack(idx + 1, timeLimitMsLocal)) return true;
      }

      // undo
      for (let p = 0; p < L.duracion; p++) {
        timetableByClase[L.claseId][slotIndex(day, periodInDay + p, slotsPerDay)] = null;
      }
      assignments.delete(L.id);
      backtracks++;
      if (Date.now() - startTime > timeLimitMsLocal) return false;
      if (backtracks > maxBacktracks) return false;
    }
    return false;
  }

  const allowedTime = timeLimitMs;
  const successBacktrack = backtrack(0, allowedTime);

  const assignedTotal = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);

  const assignedSet = new Set<string>([...assignedMap.keys(), ...assignments.keys()]);
  const unplaced: string[] = [];
  for (const L of lessons) {
    if (!assignedSet.has(L.id)) unplaced.push(L.id);
  }

  // DIAGNOSTIC: detalles para cada unplaced
  const unplacedDetails: Record<string, any> = {};
  for (const id of unplaced) {
    const L = lessons.find((x) => x.id === id)!;
    const domain = lessonDomains.get(id) ?? [];
    let possiblePlacements = 0;
    let teacherConflictCount = 0;
    let classConflictCount = 0;
    const examples: { start: number; day: number; period: number; canPlace: boolean; teacherFree: boolean }[] = [];

    for (const start of domain) {
      const day = Math.floor(start / slotsPerDay);
      const periodInDay = start % slotsPerDay;
      const cp = (() => {
        if (!L.claseId) return false;
        return canPlace(L.claseId, start, L.duracion);
      })();
      const tf = teacherFree(L.docenteId, start, L.duracion);
      if (cp && tf) possiblePlacements++;
      if (!cp) classConflictCount++;
      if (!tf) teacherConflictCount++;
      if (examples.length < 6) examples.push({ start, day, period: periodInDay, canPlace: cp, teacherFree: tf });
    }

    unplacedDetails[id] = {
      cargaId: L.cargaId,
      claseId: L.claseId,
      asignaturaId: L.asignaturaId,
      docenteId: L.docenteId ?? null,
      duracion: L.duracion,
      totalDomain: domain.length,
      possiblePlacements,
      teacherConflictCount,
      classConflictCount,
      examples,
    };
  }

  // assigned summary por clase (diagnóstico)
  const assignedSummary = Object.keys(timetableByClase).map((cid) => {
    const arr = timetableByClase[cid];
    const assignedSlots = arr.filter(Boolean).length;
    const sampleCell = arr.find(Boolean) as TimetableCell | undefined;
    const sample = sampleCell ? `${sampleCell.asignaturaId ?? "?"} / ${String(sampleCell.docenteId ?? "-")}` : "—";
    return [cid, { assignedSlots, sample }];
  });

  const success = successBacktrack && unplaced.length === 0;

  return {
    timetableByClase,
    success,
    unplaced,
    stats: {
      lessonsTotal: lessons.length,
      assigned: assignedTotal,
      backtracks,
      timeMs: Date.now() - startTime,
      greedyAssigned,
    },
    meta: {
      assignedSummary,
      unplacedDetails,
    },
  };
}
