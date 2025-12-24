// src/lib/timetabler.ts
// Heurística MRV + backtracking para generar un timetable sencillo.
// Notas:
// - Este generador es intencionalmente explícito y comentado para que lo puedas ajustar.
// - Devuelve un "timetable" por clase: array de length days*slotsPerDay con null o una asignación.
// - Maneja duraciones en slots (bloques) y sesiones por semana.
// - No aplica disponibilidad/periodos avanzados; puedes extenderlo.

export type LessonItem = {
  id: string; // unique
  cargaId: string;
  claseId: string;
   // 👁️ SOLO PARA UI / DEBUG
  claseNombre: string;
  asignaturaId: string;
  docenteId?: string | null;
  duracion: number; // duracion en slots (>=1)
};

export type TimetableCell = {
  cargaId: string;
  asignaturaId: string;
  docenteId?: string | null;
  claseId: string;
};

export type TimetableResult = {
  timetableByClase: Record<string, Array<TimetableCell | null>>; // claseId -> array slots
  success: boolean;
  stats: {
    lessonsTotal: number;
    assigned: number;
    backtracks: number;
    timeMs: number;
  };
};

function slotIndex(day: number, period: number, slotsPerDay: number) {
  return day * slotsPerDay + period;
}

export function generateTimetable(
  institucionId: string | null, // solo para logging
  classes: { id: string; nombre?: string }[],
  lessons: LessonItem[], // already expanded: each lesson is 1 session to schedule with given duracion
  days: number,
  slotsPerDay: number,
  options?: { maxBacktracks?: number; timeLimitMs?: number }
): TimetableResult {
  const maxBacktracks = options?.maxBacktracks ?? 200000;
  const timeLimitMs = options?.timeLimitMs ?? 10000;

  const startTime = Date.now();

  const totalSlots = days * slotsPerDay;

  // Initialize timetable arrays per class
  const timetableByClase: Record<string, Array<TimetableCell | null>> = {};
  for (const c of classes) timetableByClase[c.id] = Array(totalSlots).fill(null);

  // Helper: check if a lesson (duration d) can be placed for claseId starting at (day, period)
  function canPlace(claseId: string, startPeriod: number, dur: number) {
    // must fit within the same day
    const day = Math.floor(startPeriod / slotsPerDay);
    const periodInDay = startPeriod % slotsPerDay;
    if (periodInDay + dur > slotsPerDay) return false;
    const arr = timetableByClase[claseId];
    for (let p = 0; p < dur; p++) {
      if (arr[slotIndex(day, periodInDay + p, slotsPerDay)]) return false;
    }
    return true;
  }

  // Helper: check teacher availability for slot range
  function teacherFree(docenteId: string | undefined | null, startPeriod: number, dur: number) {
    if (!docenteId) return true;
    for (const claseId of Object.keys(timetableByClase)) {
      const arr = timetableByClase[claseId];
      const day = Math.floor(startPeriod / slotsPerDay);
      const periodInDay = startPeriod % slotsPerDay;
      for (let p = 0; p < dur; p++) {
        const cell = arr[slotIndex(day, periodInDay + p, slotsPerDay)];
        if (cell && cell.docenteId === docenteId) return false;
      }
    }
    return true;
  }

  // Precompute all possible start slots for each lesson (domain)
  const lessonDomains: Map<string, number[]> = new Map();
  for (const L of lessons) {
    const domain: number[] = [];
    for (let day = 0; day < days; day++) {
      for (let p = 0; p < slotsPerDay; p++) {
        const startIdx = slotIndex(day, p, slotsPerDay);
        if (p + L.duracion <= slotsPerDay) domain.push(startIdx);
      }
    }
    lessonDomains.set(L.id, domain);
  }

  // Order lessons by heuristic: smallest domain first (MRV), then larger dur first
  const lessonsSorted = [...lessons].sort((a, b) => {
    const da = lessonDomains.get(a.id)!.length;
    const db = lessonDomains.get(b.id)!.length;
    if (da !== db) return da - db;
    return b.duracion - a.duracion;
  });

  let backtracks = 0;
  const assignments: Map<string, number> = new Map(); // lessonId -> startSlot

  // Backtracking recursive
  function backtrack(idx: number): boolean {
    if (Date.now() - startTime > timeLimitMs) return false;
    if (backtracks > maxBacktracks) return false;
    if (idx >= lessonsSorted.length) return true;

    const L = lessonsSorted[idx];
    // recompute domain ordering with simple preference: earlier days first, prefer mornings (lower period)
    const domain = (lessonDomains.get(L.id) || []).slice();

    // Shuffle/order domain if needed. Keep deterministic: already ordered by day/period.

    for (const start of domain) {
      // conflict checks
      if (!canPlace(L.claseId, start, L.duracion)) continue;
      if (!teacherFree(L.docenteId, start, L.duracion)) continue;

      // place: mark cells
      const day = Math.floor(start / slotsPerDay);
      const periodInDay = start % slotsPerDay;
      for (let p = 0; p < L.duracion; p++) {
        timetableByClase[L.claseId][slotIndex(day, periodInDay + p, slotsPerDay)] = {
          cargaId: L.cargaId,
          asignaturaId: L.asignaturaId,
          docenteId: L.docenteId ?? null,
          claseId: L.claseId,
        };
      }
      assignments.set(L.id, start);

      // forward-check: quick prune — ensure remaining lessons still have at least one possible placement
      let ok = true;
      for (let j = idx + 1; j < lessonsSorted.length; j++) {
        const LJ = lessonsSorted[j];
        const dom = lessonDomains.get(LJ.id)!;
        let found = false;
        for (const s of dom) {
          if (canPlace(LJ.claseId, s, LJ.duracion) && teacherFree(LJ.docenteId, s, LJ.duracion)) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          break;
        }
      }

      if (ok) {
        if (backtrack(idx + 1)) return true;
      }

      // undo placement
      for (let p = 0; p < L.duracion; p++) {
        timetableByClase[L.claseId][slotIndex(day, periodInDay + p, slotsPerDay)] = null;
      }
      assignments.delete(L.id);
      backtracks++;
      if (Date.now() - startTime > timeLimitMs) return false;
      if (backtracks > maxBacktracks) return false;
    }

    return false;
  }

  const success = backtrack(0);

  const assigned = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);

  return {
    timetableByClase,
    success,
    stats: {
      lessonsTotal: lessons.length,
      assigned,
      backtracks,
      timeMs: Date.now() - startTime,
    },
  };
}
