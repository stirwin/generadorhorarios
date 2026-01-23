// lib/timetabler.ts
export type LessonItem = {
  id: string;
  cargaId: string;
  claseId: string;
  claseNombre?: string;
  asignaturaId: string;
  docenteId?: string | null;
  duracion: number; // duracion en slots (>=1)
  kind?: "class" | "meeting";
  meetingTeachers?: string[];
  meetingGroupId?: string;
  meetingLabel?: string;
  domain?: number[];
};

export type TimetableCell = {
  cargaId: string;
  lessonId?: string;
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
 *  - La misma carga (misma clase/asignatura/docente) no supera el maximo diario de slots.
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
    forcedStartOptions?: Record<string, number[]>;
    forcedLabels?: Record<string, string>;
    meetingMaxPerDay?: number;
    repairIterations?: number;
    repairSampleSize?: number;
    repairMaxConflicts?: number;
    repairCandidateStarts?: number;
    targetedReoptSize?: number;
    targetedReoptMaxAttempts?: number;
    candidateSampleLimit?: number;
    priorityLessonIds?: string[];
    priorityTeacherIds?: string[];
    subjectMaxDailySlots?: number;
  }
): TimetableResult {
  const maxBacktracks = options?.maxBacktracks ?? 600000;
  const timeLimitMs = options?.timeLimitMs ?? 120000;
  const maxRestarts = options?.maxRestarts ?? 12;
  const teacherBlockedSlots = options?.teacherBlockedSlots ?? {};
  const forcedStarts = options?.forcedStarts ?? {};
  const forcedLabels = options?.forcedLabels ?? {};
  const meetingMaxPerDay = options?.meetingMaxPerDay ?? Number.POSITIVE_INFINITY;
  const repairIterations = options?.repairIterations ?? 0;
  const repairSampleSize = options?.repairSampleSize ?? 6;
  const repairMaxConflicts = options?.repairMaxConflicts ?? 2;
  const repairCandidateStarts = options?.repairCandidateStarts ?? 20;
  const targetedReoptSize = options?.targetedReoptSize ?? 0;
  const targetedReoptMaxAttempts = options?.targetedReoptMaxAttempts ?? 1;
  const candidateSampleLimit = options?.candidateSampleLimit ?? 40;
  const priorityTeacherIds = new Set(options?.priorityTeacherIds ?? []);
  const subjectMaxDailySlots = options?.subjectMaxDailySlots ?? 2;
  const forcedStartOptions = options?.forcedStartOptions ?? {};

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
  for (const L of lessons) {
    if (L.kind === "meeting") continue;
    if (L.claseId) claseIdsFromLessons.add(L.claseId);
  }
  for (const cid of claseIdsFromLessons) {
    if (!timetableByClase[cid]) timetableByClase[cid] = Array(totalSlots).fill(null);
  }

  function inBounds(i: number) {
    return Number.isInteger(i) && i >= 0 && i < totalSlots;
  }

  function dayOfSlot(idx: number) {
    return Math.floor(idx / slotsPerDay);
  }
  function rangesOverlap(startA: number, durA: number, startB: number, durB: number) {
    const endA = startA + durA;
    const endB = startB + durB;
    return startA < endB && startB < endA;
  }

  // -------------------------
  // dominios base por leccion
  // -------------------------
  const baseDomains = new Map<string, number[]>();
  for (const L of lessons) {
    if (Array.isArray(L.domain) && L.domain.length > 0) {
      baseDomains.set(L.id, L.domain.slice());
      continue;
    }
    const domain: number[] = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < slotsPerDay; p++) {
        if (p + L.duracion <= slotsPerDay) domain.push(slotIndex(d, p, slotsPerDay));
      }
    }
    baseDomains.set(L.id, domain);
  }
  for (const [lessonId, starts] of Object.entries(forcedStartOptions)) {
    if (!Array.isArray(starts) || starts.length === 0) continue;
    baseDomains.set(lessonId, starts.slice());
  }

  // -------------------------
  // prechecks de factibilidad
  // -------------------------
  const subjectCounts: Record<string, number> = {};
  const subjectSlotCounts: Record<string, number> = {};
  const subjectDurations: Record<string, number> = {};
  function subjectKeyForLesson(L: LessonItem) {
    if (L.kind === "meeting") return null;
    return `${L.claseId}::${L.asignaturaId}::${L.docenteId ?? "no-docente"}`;
  }
  for (const L of lessons) {
    const key = subjectKeyForLesson(L);
    if (!key) continue;
    subjectCounts[key] = (subjectCounts[key] ?? 0) + 1;
    subjectSlotCounts[key] = (subjectSlotCounts[key] ?? 0) + L.duracion;
    subjectDurations[key] = Math.max(subjectDurations[key] ?? 0, L.duracion);
  }
  let priorityLessonIds = new Set(options?.priorityLessonIds ?? []);
  const subjectsExceedDays = Object.entries(subjectSlotCounts)
    .filter(([, slotsNeeded]) => slotsNeeded > days * subjectMaxDailySlots)
    .map(([subjectKey, slotsNeeded]) => ({
      subjectKey,
      slotsNeeded,
      maxSlots: days * subjectMaxDailySlots,
      days,
      maxDailySlots: subjectMaxDailySlots,
    }));

  const availableDaysCache = new Map<string, number>();
  function availableDaysForTeacher(teacherId: string, duracion: number) {
    const cacheKey = `${teacherId}::${duracion}`;
    const cached = availableDaysCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const blockedArr = teacherBlockedSlots[teacherId];
    if (!blockedArr) {
      availableDaysCache.set(cacheKey, days);
      return days;
    }
    let availableDays = 0;
    for (let d = 0; d < days; d++) {
      let dayOk = false;
      for (let p = 0; p + duracion <= slotsPerDay; p++) {
        let blocked = false;
        for (let k = 0; k < duracion; k++) {
          const idx = slotIndex(d, p + k, slotsPerDay);
          if (blockedArr[idx]) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          dayOk = true;
          break;
        }
      }
      if (dayOk) availableDays += 1;
    }
    availableDaysCache.set(cacheKey, availableDays);
    return availableDays;
  }

  const subjectsExceedAvailableDays = Object.entries(subjectSlotCounts)
    .map(([subjectKey, slotsNeeded]) => {
      const [, , docenteId] = subjectKey.split("::");
      if (!docenteId || docenteId === "no-docente") return null;
      const duracion = subjectDurations[subjectKey] ?? 1;
      const availableDays = availableDaysForTeacher(docenteId, duracion);
      const maxSlots = availableDays * subjectMaxDailySlots;
      if (slotsNeeded <= maxSlots) return null;
      return {
        subjectKey,
        slotsNeeded,
        maxSlots,
        availableDays,
        docenteId,
        duracion,
      };
    })
    .filter(Boolean) as Array<{
      subjectKey: string;
      slotsNeeded: number;
      maxSlots: number;
      availableDays: number;
      docenteId: string;
      duracion: number;
    }>;

  const classCapacity: Record<string, { requiredSlots: number; capacity: number }> = {};
  for (const c of classes) classCapacity[c.id] = { requiredSlots: 0, capacity: totalSlots };
  for (const L of lessons) {
    if (L.kind === "meeting") continue;
    const entry = classCapacity[L.claseId] ?? { requiredSlots: 0, capacity: totalSlots };
    entry.requiredSlots += L.duracion;
    classCapacity[L.claseId] = entry;
  }
  const classOverCapacity = Object.entries(classCapacity)
    .filter(([, v]) => v.requiredSlots > v.capacity)
    .map(([claseId, v]) => ({ claseId, ...v }));

  if (subjectsExceedDays.length > 0 || classOverCapacity.length > 0 || subjectsExceedAvailableDays.length > 0) {
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
        subjectsExceedAvailableDays,
      },
    };
  }

  // -------------------------
  // estado CSP
  // -------------------------
  const classOcc: Record<string, boolean[]> = {};
  const teacherOcc: Record<string, boolean[]> = {};
  const subjectDayCount: Record<string, number[]> = {};
  const meetingDayCount: number[] = Array(days).fill(0);
  const teacherIds = new Set<string>();
  const subjectKeys = new Set<string>();
  for (const L of lessons) {
    if (L.docenteId) teacherIds.add(L.docenteId);
    if (Array.isArray(L.meetingTeachers)) {
      for (const tid of L.meetingTeachers) teacherIds.add(tid);
    }
    const key = subjectKeyForLesson(L);
    if (key) subjectKeys.add(key);
  }

  const lessonById = new Map<string, LessonItem>(lessons.map((l) => [l.id, l]));
  const teacherRequired: Record<string, number> = {};
  const teacherMeetingCount: Record<string, number> = {};
  for (const L of lessons) {
    if (L.kind === "meeting") {
      for (const tid of L.meetingTeachers ?? []) {
        teacherMeetingCount[tid] = (teacherMeetingCount[tid] ?? 0) + 1;
      }
      continue;
    }
    if (!L.docenteId) continue;
    teacherRequired[L.docenteId] = (teacherRequired[L.docenteId] ?? 0) + L.duracion;
  }

  const teacherBlockedCount: Record<string, number> = {};
  for (const tid of teacherIds) {
    const arr = teacherBlockedSlots[tid] ?? Array(totalSlots).fill(false);
    teacherBlockedCount[tid] = arr.reduce((acc, blocked) => acc + (blocked ? 1 : 0), 0);
  }

  const teacherForcedCount: Record<string, number> = {};
  for (const [lessonId] of Object.entries(forcedStarts)) {
    const L = lessonById.get(lessonId);
    if (!L?.docenteId) continue;
    teacherForcedCount[L.docenteId] = (teacherForcedCount[L.docenteId] ?? 0) + 1;
  }

  const teacherAvailabilityScore: Record<string, number> = {};
  for (const tid of teacherIds) {
    const blocked = teacherBlockedCount[tid] ?? 0;
    const meetings = teacherMeetingCount[tid] ?? 0;
    const forced = teacherForcedCount[tid] ?? 0;
    const available = Math.max(0, totalSlots - blocked - meetings - forced);
    const required = Math.max(1, teacherRequired[tid] ?? 0);
    teacherAvailabilityScore[tid] = available / required;
  }

  function lessonPriority(L: LessonItem) {
    const isForced = typeof forcedStarts[L.id] === "number";
    if (isForced) return -1000;
    if (L.kind === "meeting") {
      const scores = (L.meetingTeachers ?? []).map((t) => teacherAvailabilityScore[t] ?? 1);
      let score = Math.min(...scores, 1);
      if ((L.meetingTeachers ?? []).some((t) => priorityTeacherIds.has(t))) score -= 0.15;
      if (priorityLessonIds.has(L.id)) score -= 0.25;
      return score;
    }
    const tid = L.docenteId ?? "";
    let score = teacherAvailabilityScore[tid] ?? 1;
    const subjectKey = subjectKeyForLesson(L);
    if (subjectKey) {
      const count = subjectCounts[subjectKey] ?? 1;
      const boost = Math.min(0.4, (count - 1) * 0.05);
      score -= boost;
    }
    if (priorityTeacherIds.has(tid)) score -= 0.15;
    if (priorityLessonIds.has(L.id)) score -= 0.25;
    return score;
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
    for (let d = 0; d < days; d++) meetingDayCount[d] = 0;
  }

  function canPlaceLesson(L: LessonItem, start: number) {
    if (!inBounds(start)) return false;
    const day = dayOfSlot(start);
    const period = start % slotsPerDay;
    if (period + L.duracion > slotsPerDay) return false;
    const isMeeting = L.kind === "meeting";
    const subjectKey = subjectKeyForLesson(L);
    if (!isMeeting && subjectKey) {
      const used = subjectDayCount[subjectKey]?.[day] ?? 0;
      if (used + L.duracion > subjectMaxDailySlots) return false;
    }
    if (isMeeting && meetingDayCount[day] >= meetingMaxPerDay) return false;
    const classArr = isMeeting ? null : classOcc[L.claseId];
    if (!isMeeting && !classArr) return false;
    const meetingTeachers = Array.isArray(L.meetingTeachers) ? L.meetingTeachers : [];
    const teacherIdsForLesson = isMeeting ? meetingTeachers : (L.docenteId ? [L.docenteId] : []);
    for (let p = 0; p < L.duracion; p++) {
      const idx = start + p;
      if (!inBounds(idx)) return false;
      if (classArr && classArr[idx]) return false;
      for (const tid of teacherIdsForLesson) {
        const blockedArr = teacherBlockedSlots[tid];
        if (blockedArr && blockedArr[idx]) return false;
        const tArr = teacherOcc[tid];
        if (tArr && tArr[idx]) return false;
      }
    }
    return true;
  }

  function placeLesson(L: LessonItem, start: number) {
    const day = dayOfSlot(start);
    const isMeeting = L.kind === "meeting";
    const isForced = typeof forcedStarts[L.id] === "number";
    const fixedLabel = forcedLabels[L.id];
    const meetingTeachers = Array.isArray(L.meetingTeachers) ? L.meetingTeachers : [];
    const teacherIdsForLesson = isMeeting ? meetingTeachers : (L.docenteId ? [L.docenteId] : []);
    for (let p = 0; p < L.duracion; p++) {
      const idx = start + p;
      if (!isMeeting) {
        classOcc[L.claseId][idx] = true;
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
      for (const tid of teacherIdsForLesson) {
        teacherOcc[tid][idx] = true;
      }
    }
    if (isMeeting) {
      meetingDayCount[day] += 1;
    } else {
      const subjectKey = subjectKeyForLesson(L);
      if (subjectKey) subjectDayCount[subjectKey][day] += L.duracion;
    }
  }

  function unplaceLesson(L: LessonItem, start: number) {
    const day = dayOfSlot(start);
    const isMeeting = L.kind === "meeting";
    const meetingTeachers = Array.isArray(L.meetingTeachers) ? L.meetingTeachers : [];
    const teacherIdsForLesson = isMeeting ? meetingTeachers : (L.docenteId ? [L.docenteId] : []);
    for (let p = 0; p < L.duracion; p++) {
      const idx = start + p;
      if (!isMeeting) {
        classOcc[L.claseId][idx] = false;
        timetableByClase[L.claseId][idx] = null;
      }
      for (const tid of teacherIdsForLesson) {
        teacherOcc[tid][idx] = false;
      }
    }
    if (isMeeting) {
      meetingDayCount[day] = Math.max(0, meetingDayCount[day] - 1);
    } else {
      const subjectKey = subjectKeyForLesson(L);
      if (subjectKey) {
        subjectDayCount[subjectKey][day] = Math.max(0, subjectDayCount[subjectKey][day] - L.duracion);
      }
    }
  }

  function getValidStarts(L: LessonItem) {
    const domain = baseDomains.get(L.id) ?? [];
    const valid: number[] = [];
    const forcedStart = forcedStarts[L.id];
    if (typeof forcedStart === "number") {
      return canPlaceLesson(L, forcedStart) ? [forcedStart] : [];
    }
    const forcedOptions = forcedStartOptions[L.id];
    if (Array.isArray(forcedOptions) && forcedOptions.length > 0) {
      for (const start of forcedOptions) {
        if (canPlaceLesson(L, start)) valid.push(start);
      }
      return valid;
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
        if (current && lessonPriority(L) < lessonPriority(current)) {
          bestIdx = i;
          bestValid = valid;
        } else if (current && L.duracion > current.duracion) {
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
    unassigned.sort((a, b) => {
      const pa = lessonPriority(a);
      const pb = lessonPriority(b);
      if (pa !== pb) return pa - pb;
      return b.duracion - a.duracion;
    });

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
    const attemptUnplaced = lessons.filter((L) => !attempt.assignment.has(L.id)).map((L) => L.id);
    if (attemptUnplaced.length > 0) {
      priorityLessonIds = new Set(attemptUnplaced);
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
      if (!canPlaceLesson(L, start)) {
        bestAssignment.delete(L.id);
        continue;
      }
      placeLesson(L, start);
    }
  }
  if (bestAssignment && repairIterations > 0) {
    const assignment = bestAssignment;
    const unplacedSet = new Set(lessons.filter((L) => !assignment.has(L.id)).map((L) => L.id));
    const placedIds = () => Array.from(assignment.keys());

    function tryPlaceLesson(L: LessonItem) {
      const valid = getValidStarts(L);
      if (valid.length === 0) return false;
      const start = valid[Math.floor(Math.random() * valid.length)];
      placeLesson(L, start);
      assignment.set(L.id, start);
      unplacedSet.delete(L.id);
      return true;
    }

    function restoreLesson(L: LessonItem, start: number) {
      if (!canPlaceLesson(L, start)) return false;
      placeLesson(L, start);
      assignment.set(L.id, start);
      return true;
    }

    for (let iter = 0; iter < repairIterations; iter++) {
      if (unplacedSet.size === 0) break;
      const unplacedIds = Array.from(unplacedSet);
      const lid = unplacedIds[iter % unplacedIds.length];
      const L = lessonById.get(lid);
      if (!L) {
        unplacedSet.delete(lid);
        continue;
      }
      if (tryPlaceLesson(L)) continue;

      const candidates = placedIds();
      shuffleInPlace(candidates);
      const sampled = candidates.slice(0, Math.max(1, repairSampleSize));
      let placed = false;

      for (const pid of sampled) {
        const P = lessonById.get(pid);
        if (!P) continue;
        const pStart = assignment.get(pid);
        if (pStart === undefined) continue;

        unplaceLesson(P, pStart);

        if (canPlaceLesson(L, pStart)) {
          placeLesson(L, pStart);
          const altStarts = getValidStarts(P).filter((s) => s !== pStart);
          if (altStarts.length > 0) {
            const newStart = altStarts[Math.floor(Math.random() * altStarts.length)];
            placeLesson(P, newStart);
            assignment.set(P.id, newStart);
            assignment.set(L.id, pStart);
            unplacedSet.delete(L.id);
            placed = true;
          }
          if (!placed) {
            unplaceLesson(L, pStart);
          }
        }

        if (!placed) {
          const altStarts = getValidStarts(P).filter((s) => s !== pStart);
          if (altStarts.length > 0) {
            const newStart = altStarts[Math.floor(Math.random() * altStarts.length)];
            placeLesson(P, newStart);
            assignment.set(P.id, newStart);
            if (tryPlaceLesson(L)) {
              placed = true;
            } else {
              unplaceLesson(P, newStart);
              assignment.set(P.id, pStart);
              restoreLesson(P, pStart);
            }
          }
        }

        if (!placed) {
          restoreLesson(P, pStart);
        } else {
          break;
        }
      }
    }
    const conflictSwapPass = (maxConflicts: number, candidateStarts: number) => {
      if (unplacedSet.size === 0 || maxConflicts <= 0) return;
      const unplacedIds = Array.from(unplacedSet);
      shuffleInPlace(unplacedIds);
      for (const lid of unplacedIds) {
        const L = lessonById.get(lid);
        if (!L) {
          unplacedSet.delete(lid);
          continue;
        }
        const domain = baseDomains.get(L.id) ?? [];
        const candidates = shuffleInPlace([...domain]).slice(0, candidateStarts);
        let placed = false;
        for (const start of candidates) {
          if (canPlaceLesson(L, start)) {
            placeLesson(L, start);
            assignment.set(L.id, start);
            unplacedSet.delete(L.id);
            placed = true;
            break;
          }

          const conflicts = new Set<string>();
          for (const [pid, pStart] of assignment.entries()) {
            const P = lessonById.get(pid);
            if (!P) continue;
            if (!rangesOverlap(start, L.duracion, pStart, P.duracion)) continue;
            if (forcedStarts[pid] !== undefined) continue;
            const sameClass = L.kind !== "meeting" && P.claseId === L.claseId;
            const teacherOverlap = (() => {
              const lTeachers = L.kind === "meeting" ? (L.meetingTeachers ?? []) : (L.docenteId ? [L.docenteId] : []);
              const pTeachers = P.kind === "meeting" ? (P.meetingTeachers ?? []) : (P.docenteId ? [P.docenteId] : []);
              return lTeachers.some((t) => pTeachers.includes(t));
            })();
            if (sameClass || teacherOverlap) {
              conflicts.add(pid);
            }
            if (conflicts.size > maxConflicts) break;
          }
          if (conflicts.size === 0 || conflicts.size > maxConflicts) continue;

          const removed: Array<{ lesson: LessonItem; start: number }> = [];
          for (const pid of conflicts) {
            const P = lessonById.get(pid);
            const pStart = assignment.get(pid);
            if (!P || pStart === undefined) continue;
            unplaceLesson(P, pStart);
            assignment.delete(pid);
            removed.push({ lesson: P, start: pStart });
          }

          if (!canPlaceLesson(L, start)) {
            for (const r of removed) {
              if (restoreLesson(r.lesson, r.start)) assignment.set(r.lesson.id, r.start);
            }
            continue;
          }
          placeLesson(L, start);
          assignment.set(L.id, start);

          function tryReinsert(idx: number): boolean {
            if (idx >= removed.length) return true;
            const r = removed[idx];
            const domain = baseDomains.get(r.lesson.id) ?? [];
            const candidates = shuffleInPlace([...domain]).slice(0, candidateStarts);
            for (const startOpt of candidates) {
              if (!canPlaceLesson(r.lesson, startOpt)) continue;
              placeLesson(r.lesson, startOpt);
              assignment.set(r.lesson.id, startOpt);
              if (tryReinsert(idx + 1)) return true;
              assignment.delete(r.lesson.id);
              unplaceLesson(r.lesson, startOpt);
            }
            return false;
          }

          if (tryReinsert(0)) {
            unplacedSet.delete(L.id);
            placed = true;
            break;
          }

          assignment.delete(L.id);
          unplaceLesson(L, start);
          for (const r of removed) {
            if (assignment.has(r.lesson.id)) continue;
            restoreLesson(r.lesson, r.start);
            assignment.set(r.lesson.id, r.start);
          }
        }
        if (placed) continue;
      }
    };

    conflictSwapPass(repairMaxConflicts, repairCandidateStarts);
    if (unplacedSet.size > 0 && unplacedSet.size <= 10) {
      const aggressiveConflicts = Math.max(repairMaxConflicts, 6);
      const aggressiveStarts = Math.max(repairCandidateStarts, 60);
      conflictSwapPass(aggressiveConflicts, aggressiveStarts);
    }

    if (unplacedSet.size > 0 && targetedReoptSize > 0) {
      const forcedSet = new Set(Object.keys(forcedStarts));
      const unplacedIds = Array.from(unplacedSet);
      shuffleInPlace(unplacedIds);

      const attemptTargetedReopt = (L: LessonItem, sizeOverride?: number) => {
        if (L.kind === "meeting") return false;
        const related: LessonItem[] = [];
        for (const [pid] of assignment.entries()) {
          const P = lessonById.get(pid);
          if (!P || P.kind === "meeting") continue;
          if (forcedSet.has(P.id)) continue;
          const sameClass = P.claseId === L.claseId;
          const sameTeacher = P.docenteId && L.docenteId && P.docenteId === L.docenteId;
          if (sameClass || sameTeacher) related.push(P);
        }
        related.sort((a, b) => lessonPriority(a) - lessonPriority(b));
        const reoptSize = Math.max(1, sizeOverride ?? targetedReoptSize);
        const toReopt = [L, ...related.slice(0, Math.max(0, reoptSize - 1))];
        const backup: Array<{ lesson: LessonItem; start: number }> = [];

        for (const R of toReopt) {
          const start = assignment.get(R.id);
          if (start === undefined) continue;
          unplaceLesson(R, start);
          assignment.delete(R.id);
          backup.push({ lesson: R, start });
          unplacedSet.add(R.id);
        }

        let localBacktracks = 0;
        const remaining = toReopt.filter((R) => R.kind !== "meeting");

        function localSelectMRV(list: LessonItem[]) {
          let bestIdx = -1;
          let bestCount = Number.POSITIVE_INFINITY;
          let bestValid: number[] = [];
          for (let i = 0; i < list.length; i++) {
            const Lc = list[i];
            const valid = getValidStarts(Lc);
            if (valid.length === 0) return { idx: i, valid, deadEnd: true };
            if (valid.length < bestCount) {
              bestCount = valid.length;
              bestIdx = i;
              bestValid = valid;
            }
          }
          return { idx: bestIdx, valid: bestValid, deadEnd: false };
        }

        function localDfs(list: LessonItem[]): boolean {
          if (Date.now() - startTime > timeLimitMs) return false;
          if (list.length === 0) return true;
          if (localBacktracks > 4000) return false;

          const { idx, valid, deadEnd } = localSelectMRV(list);
          if (deadEnd || idx < 0) return false;
          const current = list[idx];
          const ordered = orderByLCV(current, valid, list);
          list.splice(idx, 1);

          for (const start of ordered) {
            if (!canPlaceLesson(current, start)) continue;
            placeLesson(current, start);
            assignment.set(current.id, start);
            if (localDfs(list)) return true;
            assignment.delete(current.id);
            unplaceLesson(current, start);
            localBacktracks++;
            if (localBacktracks > 4000) break;
          }
          list.splice(idx, 0, current);
          return false;
        }

        const solvedLocal = localDfs([...remaining]);
        if (solvedLocal) {
          for (const R of remaining) unplacedSet.delete(R.id);
          return true;
        }

        for (const r of backup) {
          if (assignment.has(r.lesson.id)) continue;
          if (!canPlaceLesson(r.lesson, r.start)) continue;
          placeLesson(r.lesson, r.start);
          assignment.set(r.lesson.id, r.start);
          unplacedSet.delete(r.lesson.id);
        }
        return false;
      };

      for (let attempt = 0; attempt < targetedReoptMaxAttempts; attempt++) {
        if (unplacedSet.size === 0) break;
        for (const lid of unplacedIds) {
          if (attemptTargetedReopt(lessonById.get(lid)!)) break;
        }
      }
      if (unplacedSet.size > 0 && unplacedSet.size <= 10) {
        const finalReoptSize = Math.max(targetedReoptSize, 12);
        for (const lid of Array.from(unplacedSet)) {
          if (attemptTargetedReopt(lessonById.get(lid)!, finalReoptSize)) break;
        }
      }
    }
    bestAssignment = assignment;
  }

  const splitReport: Array<{
    lessonId: string;
    cargaId: string;
    claseId: string;
    asignaturaId: string;
    docenteId: string | null;
    originalDuracion: number;
    splitSlots: Array<{ slot: number; day: number; period: number }>;
  }> = [];
  const splitPlaced = new Set<string>();

  if (bestAssignment) {
    for (const L of lessons) {
      if (L.kind === "meeting") continue;
      if (bestAssignment.has(L.id)) continue;
      if (L.duracion !== 2) continue;
      const validStarts = getValidStarts(L);
      if (validStarts.length > 0) continue;

      const subjectKey = subjectKeyForLesson(L);
      const availableSlots: number[] = [];
      for (let idx = 0; idx < totalSlots; idx++) {
        if (!inBounds(idx)) continue;
        const period = idx % slotsPerDay;
        if (period >= slotsPerDay) continue;
        const day = dayOfSlot(idx);
        if (subjectKey) {
          const used = subjectDayCount[subjectKey]?.[day] ?? 0;
          if (used + 1 > subjectMaxDailySlots) continue;
        }
        const classArr = classOcc[L.claseId];
        if (classArr && classArr[idx]) continue;
        const teacherIdsForLesson = L.docenteId ? [L.docenteId] : [];
        let blocked = false;
        for (const tid of teacherIdsForLesson) {
          const blockedArr = teacherBlockedSlots[tid];
          if (blockedArr && blockedArr[idx]) {
            blocked = true;
            break;
          }
          const tArr = teacherOcc[tid];
          if (tArr && tArr[idx]) {
            blocked = true;
            break;
          }
        }
        if (!blocked) availableSlots.push(idx);
      }

      const slotsByDay = new Map<number, number[]>();
      for (const idx of availableSlots) {
        const day = dayOfSlot(idx);
        if (!slotsByDay.has(day)) slotsByDay.set(day, []);
        slotsByDay.get(day)!.push(idx);
      }
      const slotCandidates = Array.from(slotsByDay.entries())
        .flatMap(([day, slots]) => slots.map((slot) => ({ day, slot })))
        .sort((a, b) => a.slot - b.slot);
      if (slotCandidates.length < 2) continue;
      const chosen: number[] = [];
      const dayUsage = new Map<number, number>();
      for (const candidate of slotCandidates) {
        const used = dayUsage.get(candidate.day) ?? 0;
        const baseUsed = subjectKey ? (subjectDayCount[subjectKey]?.[candidate.day] ?? 0) : 0;
        if (baseUsed + used + 1 > subjectMaxDailySlots) continue;
        chosen.push(candidate.slot);
        dayUsage.set(candidate.day, used + 1);
        if (chosen.length >= 2) break;
      }
      if (chosen.length < 2) continue;

      const splitSlots: Array<{ slot: number; day: number; period: number }> = [];
      for (const idx of chosen.slice(0, 2)) {
        const day = dayOfSlot(idx);
        const period = idx % slotsPerDay;
        classOcc[L.claseId][idx] = true;
        timetableByClase[L.claseId][idx] = {
          cargaId: L.cargaId,
          asignaturaId: L.asignaturaId,
          docenteId: L.docenteId ?? null,
          claseId: L.claseId,
          duracion: 1,
        };
        if (L.docenteId) {
          teacherOcc[L.docenteId][idx] = true;
        }
        if (subjectKey) {
          subjectDayCount[subjectKey][day] = (subjectDayCount[subjectKey]?.[day] ?? 0) + 1;
        }
        splitSlots.push({ slot: idx, day, period });
      }
      splitPlaced.add(L.id);
      splitReport.push({
        lessonId: L.id,
        cargaId: L.cargaId,
        claseId: L.claseId,
        asignaturaId: L.asignaturaId,
        docenteId: L.docenteId ?? null,
        originalDuracion: L.duracion,
        splitSlots,
      });
    }
  }

  const assignedSlotsTotal = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);
  const assignedLessonsCount = bestAssignment ? bestAssignment.size + splitPlaced.size : splitPlaced.size;
  const unplaced = lessons.filter(L => !bestAssignment?.has(L.id) && !splitPlaced.has(L.id)).map(L => L.id);
  const unplacedByClass = new Map<string, number>();
  for (const lid of unplaced) {
    const L = lessonById.get(lid);
    if (!L) continue;
    unplacedByClass.set(L.claseId, (unplacedByClass.get(L.claseId) ?? 0) + 1);
  }
  const saturatedClasses = Object.entries(timetableByClase)
    .map(([claseId, slots]) => {
      const assignedSlots = slots.filter(Boolean).length;
      const pendingCount = unplacedByClass.get(claseId) ?? 0;
      return {
        claseId,
        assignedSlots,
        capacity: totalSlots,
        pendingCount,
      };
    })
    .filter((entry) => entry.pendingCount > 0 && entry.assignedSlots >= entry.capacity);
  const unplacedCandidates = unplaced
    .map((lid) => {
      const L = lessonById.get(lid);
      if (!L || L.kind === "meeting") return null;
      const domain = baseDomains.get(L.id) ?? [];
      const candidates: number[] = [];
      let count = 0;
      for (const start of domain) {
        if (canPlaceLesson(L, start)) {
          count++;
          if (candidates.length < candidateSampleLimit) candidates.push(start);
        }
      }
      return {
        lessonId: L.id,
        cargaId: L.cargaId,
        claseId: L.claseId,
        asignaturaId: L.asignaturaId,
        docenteId: L.docenteId ?? null,
        duracion: L.duracion,
        candidateCount: count,
        candidateSlots: candidates,
      };
    })
    .filter(Boolean);
  const unplacedBreakdown = unplaced
    .map((lid) => {
      const L = lessonById.get(lid);
      if (!L || L.kind === "meeting") return null;
      const domain = baseDomains.get(L.id) ?? [];
      const summary = {
        lessonId: L.id,
        cargaId: L.cargaId,
        claseId: L.claseId,
        asignaturaId: L.asignaturaId,
        docenteId: L.docenteId ?? null,
        duracion: L.duracion,
        totalStarts: domain.length,
        freeStarts: 0,
        outOfBounds: 0,
        subjectDayConflict: 0,
        meetingDayConflict: 0,
        classConflict: 0,
        teacherBlocked: 0,
        teacherConflict: 0,
      };
      for (const start of domain) {
        if (!inBounds(start)) {
          summary.outOfBounds += 1;
          continue;
        }
        const day = dayOfSlot(start);
        const period = start % slotsPerDay;
        if (period + L.duracion > slotsPerDay) {
          summary.outOfBounds += 1;
          continue;
        }
        const isMeeting = (L as LessonItem).kind === "meeting";
        const subjectKey = subjectKeyForLesson(L);
        if (!isMeeting && subjectKey) {
          const used = subjectDayCount[subjectKey]?.[day] ?? 0;
          if (used + L.duracion > subjectMaxDailySlots) {
          summary.subjectDayConflict += 1;
          continue;
          }
        }
        if (isMeeting && meetingDayCount[day] >= meetingMaxPerDay) {
          summary.meetingDayConflict += 1;
          continue;
        }
        let blocked = false;
        for (let p = 0; p < L.duracion; p++) {
          const idx = start + p;
          if (!inBounds(idx)) {
            summary.outOfBounds += 1;
            blocked = true;
            break;
          }
          if (!isMeeting) {
            const classArr = classOcc[L.claseId];
            if (classArr && classArr[idx]) {
              summary.classConflict += 1;
              blocked = true;
              break;
            }
          }
          const teacherIdsForLesson = isMeeting
            ? (L.meetingTeachers ?? [])
            : (L.docenteId ? [L.docenteId] : []);
          for (const tid of teacherIdsForLesson) {
            const blockedArr = teacherBlockedSlots[tid];
            if (blockedArr && blockedArr[idx]) {
              summary.teacherBlocked += 1;
              blocked = true;
              break;
            }
            const tArr = teacherOcc[tid];
            if (tArr && tArr[idx]) {
              summary.teacherConflict += 1;
              blocked = true;
              break;
            }
          }
          if (blocked) break;
        }
        if (!blocked) summary.freeStarts += 1;
      }
      return summary;
    })
    .filter(Boolean);
  const meetingAssignments = lessons
    .filter((L) => L.kind === "meeting")
    .map((L) => {
      const start = bestAssignment?.get(L.id);
      if (start === undefined) return null;
      return { lessonId: L.id, slot: start };
    })
    .filter(Boolean);

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
      meetingAssignments,
      unplacedCandidates,
      unplacedBreakdown,
      splitReport,
      saturatedClasses,
      subjectsExceedAvailableDays,
    },
  };
}
