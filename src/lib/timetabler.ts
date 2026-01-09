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
  claseNombre?: string;
  duracion?: number;
  fixed?: boolean;
  fixedLabel?: string;
};

export type TimetableResult = {
  timetableByClase: Record<string, Array<TimetableCell | null>>;
  success: boolean;
  unplaced?: string[];
  stats: {
    lessonsTotal: number;
    assigned: number; // lessons placed (no slots)
    assignedSlots?: number; // slots occupied (diagnóstico)
    greedyAssigned: number;
    backtracks: number; // intentos de backtracking usados
    timeMs: number;
  };
  meta?: any;
};

function slotIndex(day: number, period: number, slotsPerDay: number) {
  return day * slotsPerDay + period;
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * generateTimetable
 *
 * Solver CSP con backtracking + MRV + LCV + forward checking.
 * Restricciones duras:
 *  - Un docente no puede estar en dos clases en el mismo slot.
 *  - Una clase no puede tener dos asignaturas en el mismo slot.
 *  - Duracion continua.
 *  - La misma carga (misma clase/asignatura/docente) no se repite en el mismo dia.
 */
export function generateTimetable(
  institucionId: string | null,
  classes: { id: string; nombre?: string }[],
  lessons: LessonItem[],
  days: number,
  slotsPerDay: number,
  options?: {
    maxBacktracks?: number;
    timeLimitMs?: number;
    maxRestarts?: number;
    teacherBlockedSlots?: Record<string, boolean[]>;
    forcedStarts?: Record<string, number>;
    forcedLabels?: Record<string, string>;
  }
): TimetableResult {
  const maxBacktracks = options?.maxBacktracks ?? 600000;
  const timeLimitMs = options?.timeLimitMs ?? 120000;
  const maxRestarts = options?.maxRestarts ?? 12;
  const teacherBlockedSlots = options?.teacherBlockedSlots ?? {};
  const forcedStarts = options?.forcedStarts ?? {};
  const forcedLabels = options?.forcedLabels ?? {};

  const startTime = Date.now();
  const totalSlots = days * slotsPerDay;

  // -------------------------
  // init timetable per clase
  // -------------------------
  const timetableByClase: Record<string, Array<TimetableCell | null>> = {};
  for (const c of classes) {
    timetableByClase[c.id] = Array(totalSlots).fill(null);
  }

  // Ensure placeholder arrays for claseIds referenced by lessons
  const claseIdsFromLessons = new Set<string>();
  for (const L of lessons) if (L.claseId) claseIdsFromLessons.add(L.claseId);
  for (const cid of claseIdsFromLessons) {
    if (!timetableByClase[cid]) timetableByClase[cid] = Array(totalSlots).fill(null);
  }

  function inBounds(i: number) {
    return Number.isInteger(i) && i >= 0 && i < totalSlots;
  }

  function dayOfSlot(idx: number) {
    return Math.floor(idx / slotsPerDay);
  }

  // -------------------------
  // dominios base por leccion
  // -------------------------
  const baseDomains = new Map<string, number[]>();
  for (const L of lessons) {
    const domain: number[] = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < slotsPerDay; p++) {
        if (p + L.duracion <= slotsPerDay) domain.push(slotIndex(d, p, slotsPerDay));
      }
    }
    baseDomains.set(L.id, domain);
  }

  // -------------------------
  // prechecks de factibilidad
  // -------------------------
  const subjectCounts: Record<string, number> = {};
  function subjectKeyForLesson(L: LessonItem) {
    return `${L.claseId}::${L.asignaturaId}::${L.docenteId ?? "no-docente"}`;
  }
  for (const L of lessons) {
    const key = subjectKeyForLesson(L);
    subjectCounts[key] = (subjectCounts[key] ?? 0) + 1;
  }
  const subjectsExceedDays = Object.entries(subjectCounts)
    .filter(([, count]) => count > days)
    .map(([subjectKey, count]) => ({ subjectKey, sesiones: count, days }));

  const classCapacity: Record<string, { requiredSlots: number; capacity: number }> = {};
  for (const c of classes) classCapacity[c.id] = { requiredSlots: 0, capacity: totalSlots };
  for (const L of lessons) {
    const entry = classCapacity[L.claseId] ?? { requiredSlots: 0, capacity: totalSlots };
    entry.requiredSlots += L.duracion;
    classCapacity[L.claseId] = entry;
  }
  const classOverCapacity = Object.entries(classCapacity)
    .filter(([, v]) => v.requiredSlots > v.capacity)
    .map(([claseId, v]) => ({ claseId, ...v }));

  if (subjectsExceedDays.length > 0 || classOverCapacity.length > 0) {
    return {
      timetableByClase,
      success: false,
      unplaced: lessons.map(l => l.id),
      stats: {
        lessonsTotal: lessons.length,
        assigned: 0,
        assignedSlots: 0,
        greedyAssigned: 0,
        backtracks: 0,
        timeMs: Date.now() - startTime,
      },
      meta: {
        infeasible: true,
        subjectsExceedDays,
        classOverCapacity,
      },
    };
  }

  // -------------------------
  // estado CSP
  // -------------------------
  const classOcc: Record<string, boolean[]> = {};
  const teacherOcc: Record<string, boolean[]> = {};
  const subjectDayCount: Record<string, number[]> = {};
  const teacherIds = new Set<string>();
  const subjectKeys = new Set<string>();
  for (const L of lessons) {
    if (L.docenteId) teacherIds.add(L.docenteId);
    subjectKeys.add(subjectKeyForLesson(L));
  }

  function resetState() {
    for (const cid of Object.keys(timetableByClase)) {
      timetableByClase[cid].fill(null);
      classOcc[cid] = Array(totalSlots).fill(false);
    }
    for (const tid of teacherIds) {
      teacherOcc[tid] = Array(totalSlots).fill(false);
    }
    for (const key of subjectKeys) {
      subjectDayCount[key] = Array(days).fill(0);
    }
  }

  function canPlaceLesson(L: LessonItem, start: number) {
    if (!inBounds(start)) return false;
    const day = dayOfSlot(start);
    const period = start % slotsPerDay;
    if (period + L.duracion > slotsPerDay) return false;
    const subjectKey = subjectKeyForLesson(L);
    if ((subjectDayCount[subjectKey]?.[day] ?? 0) > 0) return false;
    const classArr = classOcc[L.claseId];
    if (!classArr) return false;
    const blockedArr = L.docenteId ? teacherBlockedSlots[L.docenteId] : null;
    for (let p = 0; p < L.duracion; p++) {
      const idx = start + p;
      if (!inBounds(idx)) return false;
      if (classArr[idx]) return false;
      if (blockedArr && blockedArr[idx]) return false;
      if (L.docenteId) {
        const tArr = teacherOcc[L.docenteId];
        if (tArr && tArr[idx]) return false;
      }
    }
    return true;
  }

  function placeLesson(L: LessonItem, start: number) {
    const day = dayOfSlot(start);
    const isForced = typeof forcedStarts[L.id] === "number";
    const fixedLabel = forcedLabels[L.id];
    for (let p = 0; p < L.duracion; p++) {
      const idx = start + p;
      classOcc[L.claseId][idx] = true;
      if (L.docenteId) teacherOcc[L.docenteId][idx] = true;
      timetableByClase[L.claseId][idx] = {
        cargaId: L.cargaId,
        asignaturaId: L.asignaturaId,
        docenteId: L.docenteId ?? null,
        claseId: L.claseId,
        duracion: L.duracion,
        fixed: isForced,
        fixedLabel,
      };
    }
    const subjectKey = subjectKeyForLesson(L);
    subjectDayCount[subjectKey][day] += 1;
  }

  function unplaceLesson(L: LessonItem, start: number) {
    const day = dayOfSlot(start);
    for (let p = 0; p < L.duracion; p++) {
      const idx = start + p;
      classOcc[L.claseId][idx] = false;
      if (L.docenteId) teacherOcc[L.docenteId][idx] = false;
      timetableByClase[L.claseId][idx] = null;
    }
    const subjectKey = subjectKeyForLesson(L);
    subjectDayCount[subjectKey][day] = Math.max(0, subjectDayCount[subjectKey][day] - 1);
  }

  function getValidStarts(L: LessonItem) {
    const domain = baseDomains.get(L.id) ?? [];
    const valid: number[] = [];
    const forcedStart = forcedStarts[L.id];
    if (typeof forcedStart === "number") {
      return canPlaceLesson(L, forcedStart) ? [forcedStart] : [];
    }
    for (const start of domain) {
      if (canPlaceLesson(L, start)) valid.push(start);
    }
    return valid;
  }

  // MRV: elegir leccion con menos opciones
  function selectMRV(unassigned: LessonItem[]) {
    let bestIdx = -1;
    let bestCount = Number.POSITIVE_INFINITY;
    let bestValid: number[] = [];

    for (let i = 0; i < unassigned.length; i++) {
      const L = unassigned[i];
      const valid = getValidStarts(L);
      if (valid.length === 0) return { idx: i, valid, deadEnd: true };
      if (valid.length < bestCount) {
        bestCount = valid.length;
        bestIdx = i;
        bestValid = valid;
      } else if (valid.length === bestCount) {
        const current = unassigned[bestIdx];
        if (current && L.duracion > current.duracion) {
          bestIdx = i;
          bestValid = valid;
        }
      }
    }

    return { idx: bestIdx, valid: bestValid, deadEnd: false };
  }

  // LCV: ordenar starts por menos impacto sobre las otras lecciones
  function orderByLCV(L: LessonItem, starts: number[], unassigned: LessonItem[]) {
    const ordered = [...starts];
    shuffleInPlace(ordered);

    const scores = new Map<number, number>();
    for (const s of ordered) {
      placeLesson(L, s);
      let totalOptions = 0;
      let valid = true;
      for (const other of unassigned) {
        if (other.id === L.id) continue;
        const opts = getValidStarts(other);
        if (opts.length === 0) {
          valid = false;
          break;
        }
        totalOptions += opts.length;
      }
      unplaceLesson(L, s);
      scores.set(s, valid ? totalOptions : -1);
    }

    ordered.sort((a, b) => {
      const sa = scores.get(a) ?? -1;
      const sb = scores.get(b) ?? -1;
      return sb - sa;
    });

    return ordered;
  }

  let bestAssignment: Map<string, number> | null = null;
  let bestAssignedCount = -1;
  let totalBacktracks = 0;

  function solveWithRestart(): { solved: boolean; assignment: Map<string, number>; bestCount: number } {
    resetState();
    const assignment = new Map<string, number>();
    let backtracks = 0;
    let bestLocalAssignment = new Map<string, number>();
    let bestLocalCount = 0;

    const unassigned = [...lessons];
    shuffleInPlace(unassigned);

    function dfs(): boolean {
      if (Date.now() - startTime > timeLimitMs) return false;
      if (backtracks > maxBacktracks) return false;
      if (unassigned.length === 0) return true;

      if (assignment.size > bestLocalCount) {
        bestLocalCount = assignment.size;
        bestLocalAssignment = new Map(assignment);
      }

      const { idx, valid, deadEnd } = selectMRV(unassigned);
      if (deadEnd || idx < 0) return false;

      const L = unassigned[idx];
      const orderedStarts = orderByLCV(L, valid, unassigned);

      // Remove chosen lesson from unassigned list
      unassigned.splice(idx, 1);

      for (const start of orderedStarts) {
        if (!canPlaceLesson(L, start)) continue;
        placeLesson(L, start);
        assignment.set(L.id, start);

        const solved = dfs();
        if (solved) return true;

        assignment.delete(L.id);
        unplaceLesson(L, start);
        backtracks++;
        if (backtracks > maxBacktracks) break;
        if (Date.now() - startTime > timeLimitMs) break;
      }

      unassigned.splice(idx, 0, L);
      return false;
    }

    const solved = dfs();
    totalBacktracks += backtracks;

    return { solved, assignment: solved ? assignment : bestLocalAssignment, bestCount: solved ? lessons.length : bestLocalCount };
  }

  let solved = false;
  let usedRestarts = 0;

  for (let r = 0; r < maxRestarts; r++) {
    if (Date.now() - startTime > timeLimitMs) break;
    const attempt = solveWithRestart();
    usedRestarts++;
    if (attempt.solved) {
      bestAssignment = attempt.assignment;
      solved = true;
      break;
    }
    if (attempt.bestCount > bestAssignedCount) {
      bestAssignedCount = attempt.bestCount;
      bestAssignment = attempt.assignment;
    }
  }

  // Si no se resolvio, reintenta colocar el mejor intento guardado (si existe)
  if (!solved && bestAssignment) {
    resetState();
    for (const L of lessons) {
      const start = bestAssignment.get(L.id);
      if (start === undefined) continue;
      if (!canPlaceLesson(L, start)) continue;
      placeLesson(L, start);
    }
  }

  const assignedSlotsTotal = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);
  const assignedLessonsCount = bestAssignment ? bestAssignment.size : 0;
  const unplaced = lessons.filter(L => !bestAssignment?.has(L.id)).map(L => L.id);

  return {
    timetableByClase,
    success: solved && unplaced.length === 0,
    unplaced,
    stats: {
      lessonsTotal: lessons.length,
      assigned: assignedLessonsCount,
      assignedSlots: assignedSlotsTotal,
      greedyAssigned: 0,
      backtracks: totalBacktracks,
      timeMs: Date.now() - startTime,
    },
    meta: {
      usedRestarts,
      maxRestarts,
      timeLimitMs,
      maxBacktracks,
      subjectCounts,
      classCapacity,
      forcedStarts,
    },
  };
}
