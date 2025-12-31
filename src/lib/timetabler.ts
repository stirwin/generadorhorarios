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
  asignaturaNombre?: string; // opcional si quieres nombres en vez de ids
  docenteId?: string | null;
  docenteNombre?: string | null; // opcional
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

  const timetableByClase: Record<string, Array<TimetableCell | null>> = {};
  for (const c of classes) timetableByClase[c.id] = Array(totalSlots).fill(null);

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

  const lessonsForGreedy = [...lessons].sort((a, b) => {
    const da = lessonDomains.get(a.id)?.length ?? 0;
    const db = lessonDomains.get(b.id)?.length ?? 0;
    if (a.duracion !== b.duracion) return b.duracion - a.duracion;
    return da - db;
  });

  let greedyAssigned = 0;
  const assignedMap = new Map<string, number>();

  for (const L of lessonsForGreedy) {
    const domain = lessonDomains.get(L.id) ?? [];
    let placed = false;
    for (const start of domain) {
      if (!L.claseId) break;
      if (!canPlace(L.claseId, start, L.duracion)) continue;
      if (!teacherFree(L.docenteId, start, L.duracion)) continue;
      const day = Math.floor(start / slotsPerDay);
      const periodInDay = start % slotsPerDay;

      // IMPORTANT: write SAME object into each slot and include duracion
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
      placed = true;
      break;
    }
  }

  const remainingLessons = lessons.filter(L => !assignedMap.has(L.id));

  if (remainingLessons.length === 0) {
    const assigned = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);
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
    };
  }

  let backtracks = 0;
  const lessonsSorted = [...remainingLessons].sort((a, b) => {
    const da = lessonDomains.get(a.id)!.length;
    const db = lessonDomains.get(b.id)!.length;
    if (da !== db) return da - db;
    return b.duracion - a.duracion;
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
  const unplaced: string[] = [];

  const assignedSet = new Set<string>([...assignedMap.keys(), ...assignments.keys()]);
  for (const L of lessons) {
    if (!assignedSet.has(L.id)) unplaced.push(L.id);
  }

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
  };
}
