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

/**
 * generateTimetable
 *
 * options:
 *  - maxBacktracks?: number
 *  - timeLimitMs?: number
 *  - preferSmallFirst?: boolean (legacy)
 *  - relaxTeacherConstraints?: boolean  (si true, como último recurso ignora conflicto docente para agrupar singles)
 */
export function generateTimetable(
  institucionId: string | null,
  classes: { id: string; nombre?: string }[],
  lessons: LessonItem[],
  days: number,
  slotsPerDay: number,
  options?: { maxBacktracks?: number; timeLimitMs?: number; preferSmallFirst?: boolean; relaxTeacherConstraints?: boolean; forcePlaceRemaining?: boolean }
): TimetableResult {
  const maxBacktracks = options?.maxBacktracks ?? 300000;
  const timeLimitMs = options?.timeLimitMs ?? 30000;
  const preferSmallFirst = Boolean(options?.preferSmallFirst);
  const relaxTeacher = Boolean(options?.relaxTeacherConstraints);
  // Por defecto NO forzar colocación (solo si se solicita explícitamente)
  const forcePlaceRemaining = Boolean(options?.forcePlaceRemaining);

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

  // Map cargaId -> lesson.id for swaps
  const cargaToLessonId = new Map<string, string>();
  for (const L of lessons) {
    if (L.cargaId) cargaToLessonId.set(L.cargaId, L.id);
  }

  function teacherFreeAtSlot(docenteId: string | undefined | null, idx: number) {
    if (!docenteId) return true;
    if (!inBounds(idx)) return false;
    for (const arr of Object.values(timetableByClase)) {
      const cell = arr[idx];
      if (cell && cell.docenteId === docenteId) return false;
    }
    return true;
  }

  function teacherFreeRange(docenteId: string | undefined | null, startIdx: number, dur: number) {
    if (!docenteId) return true;
    for (let p = 0; p < dur; p++) {
      if (!teacherFreeAtSlot(docenteId, startIdx + p)) return false;
    }
    return true;
  }

  // Helper that checks canPlace given an extra set of blocked indices (simulate placing)
  function canPlaceWithBlocked(claseId: string, startSlot: number, dur: number, blocked: Set<number>) {
    const arr = timetableByClase[claseId];
    if (!arr) return false;
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    if (periodInDay + dur > slotsPerDay) return false;
    for (let p = 0; p < dur; p++) {
      const idx = slotIndex(day, periodInDay + p, slotsPerDay);
      if (!inBounds(idx)) return false;
      if (arr[idx]) return false;
      if (blocked.has(idx)) return false;
    }
    return true;
  }

  function teacherFreeRangeWithBlocked(docenteId: string | undefined | null, startIdx: number, dur: number, blocked: Set<number>) {
    if (!docenteId) return true;
    for (let p = 0; p < dur; p++) {
      const idx = startIdx + p;
      if (blocked.has(idx)) return false;
      if (!teacherFreeAtSlot(docenteId, idx)) return false;
    }
    return true;
  }

  function canPlace(claseId: string, startSlot: number, dur: number) {
    return canPlaceWithBlocked(claseId, startSlot, dur, new Set<number>());
  }

  function placeCell(claseId: string, startSlot: number, dur: number, cellObj: TimetableCell) {
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    for (let p = 0; p < dur; p++) {
      const idx = slotIndex(day, periodInDay + p, slotsPerDay);
      if (inBounds(idx)) timetableByClase[claseId][idx] = cellObj;
    }
  }

  // carga actual por día (para balancear patrones 2-2-1-1 vs 1-2-1-2, etc.)
  function dayLoadForClass(claseId: string, day: number) {
    const arr = timetableByClase[claseId];
    if (!arr) return 0;
    let cnt = 0;
    const start = day * slotsPerDay;
    for (let p = 0; p < slotsPerDay; p++) {
      if (arr[start + p]) cnt++;
    }
    return cnt;
  }

  function removeCell(claseId: string, startSlot: number, dur: number) {
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    for (let p = 0; p < dur; p++) {
      const idx = slotIndex(day, periodInDay + p, slotsPerDay);
      if (inBounds(idx)) timetableByClase[claseId][idx] = null;
    }
  }

  // -------------------------
  // domains
  // -------------------------
  const lessonDomains = new Map<string, number[]>();
  for (const L of lessons) {
    const domain: number[] = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < slotsPerDay; p++) {
        const start = slotIndex(d, p, slotsPerDay);
        if (p + L.duracion <= slotsPerDay) domain.push(start);
      }
    }
    lessonDomains.set(L.id, domain);
  }

  // ---------- diagnostic builders ----------
  function fragmentationCost(claseId: string, startSlot: number, dur: number) {
    const arr = timetableByClase[claseId];
    if (!arr) return Number.MAX_SAFE_INTEGER;
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    // clone only day's slice
    const dayArr: (TimetableCell | null)[] = [];
    for (let p = 0; p < slotsPerDay; p++) {
      dayArr[p] = arr[slotIndex(day, p, slotsPerDay)] ?? null;
    }
    for (let p = 0; p < dur; p++) {
      const idxInDay = periodInDay + p;
      if (idxInDay >= 0 && idxInDay < slotsPerDay) dayArr[idxInDay] = {} as TimetableCell;
    }
    let isolated = 0;
    for (let p = 0; p < slotsPerDay; p++) {
      if (dayArr[p]) continue;
      const leftOcc = p === 0 ? true : Boolean(dayArr[p - 1]);
      const rightOcc = p === slotsPerDay - 1 ? true : Boolean(dayArr[p + 1]);
      if (leftOcc && rightOcc) isolated++;
    }
    return isolated;
  }

  function continuousFreeRun(claseId: string, startSlot: number) {
    const arr = timetableByClase[claseId];
    if (!arr) return 0;
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    let run = 0;
    for (let p = periodInDay; p < slotsPerDay; p++) {
      const idx = slotIndex(day, p, slotsPerDay);
      if (!inBounds(idx)) break;
      if (arr[idx]) break;
      run++;
    }
    return run;
  }

  function adjacentEmptyCount(claseId: string, startSlot: number) {
    const arr = timetableByClase[claseId];
    if (!arr) return 0;
    const day = Math.floor(startSlot / slotsPerDay);
    const periodInDay = startSlot % slotsPerDay;
    let count = 0;
    if (periodInDay - 1 >= 0) {
      const idxL = slotIndex(day, periodInDay - 1, slotsPerDay);
      if (inBounds(idxL) && !arr[idxL]) count++;
    }
    if (periodInDay + 1 < slotsPerDay) {
      const idxR = slotIndex(day, periodInDay + 1, slotsPerDay);
      if (inBounds(idxR) && !arr[idxR]) count++;
    }
    return count;
  }

  // -------------------------
  // assign multi-slot lessons first (greedy) - mantiene tu heurística
  // -------------------------
  const multiLessons = lessons.filter(l => l.duracion > 1);
  multiLessons.sort((a, b) => {
    if (a.duracion !== b.duracion) return b.duracion - a.duracion;
    const da = lessonDomains.get(a.id)?.length ?? 0;
    const db = lessonDomains.get(b.id)?.length ?? 0;
    return da - db;
  });

  const assignedMap = new Map<string, number>(); // lessonId -> startSlot
  let greedyAssigned = 0;

  for (const L of multiLessons) {
    const domain = lessonDomains.get(L.id) ?? [];
    const domainOrdered = [...domain].sort((s1, s2) => {
      const dA = Math.floor(s1 / slotsPerDay);
      const dB = Math.floor(s2 / slotsPerDay);
      const loadA = dayLoadForClass(L.claseId, dA);
      const loadB = dayLoadForClass(L.claseId, dB);
      if (loadA !== loadB) return loadA - loadB;

      const p1 = s1 % slotsPerDay;
      const run1 = (() => {
        const arr = timetableByClase[L.claseId];
        let run = 0; for (let k = p1; k < slotsPerDay && !arr[slotIndex(dA, k, slotsPerDay)]; k++) run++; return run;
      })();
      const p2 = s2 % slotsPerDay;
      const run2 = (() => {
        const arr = timetableByClase[L.claseId];
        let run = 0; for (let k = p2; k < slotsPerDay && !arr[slotIndex(dB, k, slotsPerDay)]; k++) run++; return run;
      })();
      if (run2 !== run1) return run2 - run1;
      return s1 - s2;
    });

    for (const start of domainOrdered) {
      if (!canPlace(L.claseId, start, L.duracion)) continue;
      if (!teacherFreeRange(L.docenteId, start, L.duracion)) continue;
      const cellObj: TimetableCell = {
        cargaId: L.cargaId,
        asignaturaId: L.asignaturaId,
        docenteId: L.docenteId ?? null,
        claseId: L.claseId,
        duracion: L.duracion,
      };
      placeCell(L.claseId, start, L.duracion, cellObj);
      assignedMap.set(L.id, start);
      greedyAssigned++;
      break;
    }
  }

  // -------------------------
  // GLOBAL BEST-FIRST GREEDY for remaining lessons
  // -------------------------
  // Remaining lessons (not yet placed)
  const remaining = new Map<string, LessonItem>();
  for (const L of lessons) {
    if (!assignedMap.has(L.id)) remaining.set(L.id, L);
  }

  // scoring parameters (tune if needed)
  const WEIGHTS = {
    frag: 10,
    run: 1,
    adj: -2, // negative because adj bonus reduces score
    teacherPenalty: 5000, // large penalty if teacher busy and relaxTeacher true
    unlock: 12,
    endOfDayBonus: -3,
  };

  // per-lesson debug
  const lessonDebug = new Map<string, any>();

  // helpers to compute valid starts for MRV and debug reasons
  function computeValidStartsForLesson(L: LessonItem) {
    const domain = lessonDomains.get(L.id) ?? [];
    const validStrict: number[] = []; // class free AND teacher free
    const validSoft: number[] = [];   // class free but teacher busy (possible if relaxTeacher)
    const blockedByClass: number[] = [];
    for (const s of domain) {
      if (!inBounds(s)) continue;
      // class free check
      if (!canPlaceWithBlocked(L.claseId, s, L.duracion, new Set<number>())) {
        blockedByClass.push(s);
        continue;
      }
      // teacher free?
      if (teacherFreeRange(L.docenteId ?? null, s, L.duracion)) validStrict.push(s);
      else validSoft.push(s);
    }
    return { domain, validStrict, validSoft, blockedByClass };
  }

  // estimate domain loss if we place this lesson at start (simple heuristic)
  function estimateDomainLossIfPlaced(L: LessonItem, start: number, blocked: Set<number>) {
    // For each other remaining lesson J, count if it would lose at least one currently-valid option
    let lossCount = 0;
    for (const J of remaining.values()) {
      if (J.id === L.id) continue;
      const dom = lessonDomains.get(J.id) ?? [];
      // count whether there exists a valid start after blocking
      let hadValidBefore = false;
      let hadValidAfter = false;
      for (const s of dom) {
        if (!hadValidBefore && canPlaceWithBlocked(J.claseId, s, J.duracion, new Set<number>())) hadValidBefore = true;
        if (!hadValidAfter && canPlaceWithBlocked(J.claseId, s, J.duracion, blocked)) hadValidAfter = true;
        if (hadValidBefore && !hadValidAfter) {
          lossCount++;
          break;
        }
      }
    }
    return lossCount;
  }

  function scorePlacement(L: LessonItem, start: number) {
    if (!inBounds(start)) return Number.POSITIVE_INFINITY;
    const day = Math.floor(start / slotsPerDay);
    const periodInDay = start % slotsPerDay;
    if (periodInDay + L.duracion > slotsPerDay) return Number.POSITIVE_INFINITY;

    const blocked = new Set<number>();
    for (let p = 0; p < L.duracion; p++) blocked.add(start + p);

    if (!canPlaceWithBlocked(L.claseId, start, L.duracion, new Set<number>())) return Number.POSITIVE_INFINITY;

    let teacherFree = teacherFreeRange(L.docenteId ?? null, start, L.duracion);
    if (!teacherFree && !relaxTeacher) return Number.POSITIVE_INFINITY;

    const frag = fragmentationCost(L.claseId, start, L.duracion);
    const run = continuousFreeRun(L.claseId, start);
    const adj = adjacentEmptyCount(L.claseId, start);
    const endOfDay = (periodInDay >= slotsPerDay - 2) ? 1 : 0;
    const unlockPenalty = estimateDomainLossIfPlaced(L, start, blocked);
    const teacherPenalty = teacherFree ? 0 : WEIGHTS.teacherPenalty;

    const score =
      frag * WEIGHTS.frag +
      (-run) * WEIGHTS.run +
      adj * WEIGHTS.adj +
      endOfDay * WEIGHTS.endOfDayBonus +
      teacherPenalty +
      unlockPenalty * WEIGHTS.unlock;

    return score + (start / 10000);
  }

  // Main loop: repeated pick best (lesson, start) globally, with MRV ordering
  let globalPlacements = 0;

  while (remaining.size > 0) {
    if (Date.now() - startTime > timeLimitMs) break;

    // Recompute MRV valid-start counts for current state
    const remainingArray = Array.from(remaining.values()).map(L => {
      const vs = computeValidStartsForLesson(L);
      return { L, vs, strictCount: vs.validStrict.length, softCount: vs.validSoft.length };
    });

    // sort MRV: lessons with fewest strict options first, tie-breaker by dur desc
    remainingArray.sort((a, b) => {
      if (a.strictCount !== b.strictCount) return a.strictCount - b.strictCount;
      if (a.softCount !== b.softCount) return a.softCount - b.softCount;
      if (a.L.duracion !== b.L.duracion) return b.L.duracion - a.L.duracion;
      return a.L.id.localeCompare(b.L.id);
    });

    // Build candidate best across (MRV-ordered scan)
    let bestCandidate: { lessonId: string; start: number; score: number; reason?: string } | null = null;

    for (const item of remainingArray) {
      const L = item.L;
      const domain = lessonDomains.get(L.id) ?? [];
      let bestForL: { start: number; score: number } | null = null;
      const attempts: any[] = [];

      // iterate domain (but you may iterate strict first for speed)
      const domainOrdered = [...domain];
      // prefer strict starts first in domainOrdered
      domainOrdered.sort((a, b) => {
        const aStrict = teacherFreeRange(L.docenteId ?? null, a, L.duracion) && canPlaceWithBlocked(L.claseId, a, L.duracion, new Set<number>());
        const bStrict = teacherFreeRange(L.docenteId ?? null, b, L.duracion) && canPlaceWithBlocked(L.claseId, b, L.duracion, new Set<number>());
        const dayA = Math.floor(a / slotsPerDay);
        const dayB = Math.floor(b / slotsPerDay);
        const loadA = dayLoadForClass(L.claseId, dayA);
        const loadB = dayLoadForClass(L.claseId, dayB);
        if (loadA !== loadB) return loadA - loadB;
        if (aStrict !== bStrict) return aStrict ? -1 : 1;
        return a - b;
      });

      for (const s of domainOrdered) {
        const sc = scorePlacement(L, s);
        const valid = isFinite(sc);
        attempts.push({ start: s, valid, score: sc });
        if (!valid) continue;
        if (!bestForL || sc < bestForL.score) bestForL = { start: s, score: sc };
      }

      // store per-lesson debug snapshot (latest)
      lessonDebug.set(L.id, {
        domain,
        validStrict: item.vs.validStrict,
        validSoft: item.vs.validSoft,
        blockedByClass: item.vs.blockedByClass,
        attempts,
        bestForL,
        strictCount: item.strictCount,
        softCount: item.softCount,
      });

      if (!bestForL) continue;
      if (!bestCandidate || bestForL.score < bestCandidate.score) {
        bestCandidate = { lessonId: L.id, start: bestForL.start, score: bestForL.score };
      }
    } // end scanning remainingArray

    if (!bestCandidate) break; // no feasible placement for any remaining lesson

    // commit bestCandidate
    const Lbest = remaining.get(bestCandidate.lessonId)!;
    placeCell(Lbest.claseId, bestCandidate.start, Lbest.duracion, {
      cargaId: Lbest.cargaId,
      asignaturaId: Lbest.asignaturaId,
      docenteId: Lbest.docenteId ?? null,
      claseId: Lbest.claseId,
      duracion: Lbest.duracion,
    });
    assignedMap.set(Lbest.id, bestCandidate.start);
    remaining.delete(Lbest.id);
    greedyAssigned++;
    globalPlacements++;
  }

  // -------------------------
  // After global greedy: attempt intra-class swaps & 1-level swap for unplaced singles (existing logic)
  // -------------------------
  const placedSinglesSet = new Set<string>(); // will be updated by trySwap/tryOneLevelSwapForSingle as needed

  // Recompute helper sets
  const assignedSet = new Set<string>([...assignedMap.keys(), ...Array.from(placedSinglesSet)]);
  let unplacedList = lessons.filter(L => !assignedSet.has(L.id)).map(L => L.id);

  // Helper: swap within same class (kept as before)
  function trySwapWithinSameClassSingle(lesson: LessonItem, freeIdx: number): boolean {
    const claseArr = timetableByClase[lesson.claseId];
    if (!Array.isArray(claseArr)) return false;

    for (let pos = 0; pos < claseArr.length; pos++) {
      const cell = claseArr[pos];
      if (!cell) continue;
      if ((cell.duracion ?? 1) !== 1) continue;
      const otherLesson = lessons.find(l => l.cargaId === cell.cargaId);
      if (!otherLesson) continue;

      const okL = teacherFreeAtSlot(lesson.docenteId ?? null, pos);
      const okOther = teacherFreeAtSlot(otherLesson.docenteId ?? null, freeIdx);

      if (okL && okOther) {
        claseArr[freeIdx] = { cargaId: cell.cargaId, asignaturaId: cell.asignaturaId, docenteId: cell.docenteId ?? null, claseId: lesson.claseId, duracion: 1 };
        claseArr[pos] = { cargaId: lesson.cargaId, asignaturaId: lesson.asignaturaId, docenteId: lesson.docenteId ?? null, claseId: lesson.claseId, duracion: 1 };
        placedSinglesSet.add(lesson.id);
        placedSinglesSet.add(otherLesson.id);
        return true;
      }
    }
    return false;
  }

  // tryOneLevelSwapForSingle (keeps your relocation logic)
  function tryOneLevelSwapForSingle(lesson: LessonItem): boolean {
    const arr = timetableByClase[lesson.claseId];
    if (!arr) return false;

    // candidate slots week-wide prefer end-of-day
    const candidates: number[] = [];
    for (let d = 0; d < days; d++) {
      for (let p = slotsPerDay - 1; p >= 0; p--) candidates.push(slotIndex(d, p, slotsPerDay));
    }

    for (const idx of candidates) {
      if (arr[idx]) continue;
      if (teacherFreeAtSlot(lesson.docenteId ?? null, idx)) {
        arr[idx] = { cargaId: lesson.cargaId, asignaturaId: lesson.asignaturaId, docenteId: lesson.docenteId ?? null, claseId: lesson.claseId, duracion: 1 };
        placedSinglesSet.add(lesson.id);
        return true;
      }

      // try intra-class swap first
      const swapped = trySwapWithinSameClassSingle(lesson, idx);
      if (swapped) return true;

      // find blockers (teacher occupies idx in other classes)
      const blockerInfo: { claseId: string; startIdx: number; dur: number; cell: TimetableCell }[] = [];
      for (const [cId, a] of Object.entries(timetableByClase)) {
        const cell = a[idx];
        if (cell && cell.docenteId && cell.docenteId === lesson.docenteId) {
          const dur = cell.duracion ?? 1;
          for (let pos = 0; pos < a.length; pos++) {
            if (a[pos] && a[pos].cargaId === cell.cargaId) {
              blockerInfo.push({ claseId: cId, startIdx: pos, dur, cell });
              break;
            }
          }
        }
      }
      if (blockerInfo.length === 0) continue;

      for (const blk of blockerInfo) {
        const blockerLessonId = cargaToLessonId.get(blk.cell.cargaId);
        if (!blockerLessonId) continue;
        const blockerClassArr = timetableByClase[blk.claseId];
        const origPositions: number[] = [];
        for (let k = 0; k < blk.dur; k++) {
          const pos = blk.startIdx + k;
          if (inBounds(pos) && blockerClassArr[pos] && blockerClassArr[pos].cargaId === blk.cell.cargaId) {
            origPositions.push(pos);
            blockerClassArr[pos] = null;
          }
        }

        // find alternative start for blocker in its class
        let relocated = false;
        outer:
        for (let d = 0; d < days; d++) {
          for (let start = 0; start <= slotsPerDay - blk.dur; start++) {
            const candidateStart = slotIndex(d, start, slotsPerDay);
            let ok = true;
            for (let p = 0; p < blk.dur; p++) {
              const idx2 = candidateStart + p;
              if (!inBounds(idx2) || blockerClassArr[idx2]) { ok = false; break; }
            }
            if (!ok) continue;
            if (!teacherFreeRange(blk.cell.docenteId ?? null, candidateStart, blk.dur)) continue;
            for (let p = 0; p < blk.dur; p++) {
              blockerClassArr[candidateStart + p] = { ...blk.cell };
            }
            relocated = true;
            break outer;
          }
        }

        if (!relocated) {
          for (const pos of origPositions) blockerClassArr[pos] = blk.cell;
          continue;
        }

        // try to place lesson at idx now
        const targetArr = timetableByClase[lesson.claseId];
        if (!targetArr[idx] && (teacherFreeAtSlot(lesson.docenteId ?? null, idx) || relaxTeacher)) {
          targetArr[idx] = { cargaId: lesson.cargaId, asignaturaId: lesson.asignaturaId, docenteId: lesson.docenteId ?? null, claseId: lesson.claseId, duracion: 1 };
          placedSinglesSet.add(lesson.id);
          if (blockerLessonId) placedSinglesSet.add(blockerLessonId);
          return true;
        } else {
          // restore
          for (const pos of origPositions) blockerClassArr[pos] = blk.cell;
        }
      }
    }
    return false;
  }

  // Attempt swaps for remaining unplaced singles
  const unplacedSingleLessons = lessons.filter(L => L.duracion === 1 && !assignedMap.has(L.id) && !placedSinglesSet.has(L.id));
  for (const L of unplacedSingleLessons) {
    tryOneLevelSwapForSingle(L);
  }

  // -------------------------
  // Reubicación limitada para cualquier duración (mover bloqueador del mismo docente en otra clase)
  // -------------------------
  function findBlockStartForCarga(arr: Array<TimetableCell | null>, cargaId: string) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]?.cargaId === cargaId) return i;
    }
    return -1;
  }

  function relocateBlocker(claseId: string, blockerCell: TimetableCell) {
    const arr = timetableByClase[claseId];
    if (!arr) return null;
    const dur = Math.max(1, blockerCell.duracion ?? 1);
    const startIdx = findBlockStartForCarga(arr, blockerCell.cargaId);
    if (startIdx < 0) return null;

    const origPositions: number[] = [];
    for (let k = 0; k < dur; k++) {
      const idx = startIdx + k;
      if (inBounds(idx) && arr[idx]?.cargaId === blockerCell.cargaId) {
        origPositions.push(idx);
        arr[idx] = null;
      }
    }

    let placed = false;
    let newPositions: number[] = [];

    outerRelocate:
    for (let d = 0; d < days; d++) {
      for (let p = 0; p <= slotsPerDay - dur; p++) {
        const candidateStart = slotIndex(d, p, slotsPerDay);
        if (!canPlace(blockerCell.claseId, candidateStart, dur)) continue;
        if (!teacherFreeRange(blockerCell.docenteId ?? null, candidateStart, dur)) continue;
        // place
        for (let k = 0; k < dur; k++) {
          const idx = candidateStart + k;
          arr[idx] = { ...blockerCell };
          newPositions.push(idx);
        }
        placed = true;
        break outerRelocate;
      }
    }

    if (!placed) {
      // restore
      for (const pos of origPositions) arr[pos] = blockerCell;
      return null;
    }

    return {
      claseId,
      origPositions,
      newPositions,
      cell: blockerCell,
    };
  }

  function tryPlaceWithTeacherRelocation(lesson: LessonItem): boolean {
    const dur = lesson.duracion;
    const candidates: number[] = [];
    for (let d = 0; d < days; d++) {
      for (let p = slotsPerDay - 1; p >= 0; p--) candidates.push(slotIndex(d, p, slotsPerDay));
    }

    const maxRelocateDepth = 4; // permite mover cadenas de conflictos del mismo docente (profundidad extra para casos como Religión)

    function findBlockPositions(claseId: string, cargaId: string, durGuess: number) {
      const arr = timetableByClase[claseId];
      if (!arr) return { start: -1, dur: durGuess };
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]?.cargaId === cargaId) {
          let len = 1;
          for (let k = i + 1; k < arr.length && arr[k]?.cargaId === cargaId; k++) len++;
          return { start: i, dur: len };
        }
      }
      return { start: -1, dur: durGuess };
    }

    type MoveRecord = { claseId: string; origPositions: number[]; newPositions: number[]; cell: TimetableCell };

    function attemptRelocateClassBlock(claseId: string, cell: TimetableCell, depth: number, visited: Set<string>): MoveRecord | null {
      if (depth > maxRelocateDepth) return null;
      if (visited.has(cell.cargaId)) return null;
      visited.add(cell.cargaId);

      const arr = timetableByClase[claseId];
      if (!arr) return null;
      const { start, dur } = findBlockPositions(claseId, cell.cargaId, Math.max(1, cell.duracion ?? 1));
      if (start < 0) return null;

      const origPositions: number[] = [];
      for (let k = 0; k < dur; k++) {
        const idx = start + k;
        if (inBounds(idx) && arr[idx]?.cargaId === cell.cargaId) {
          origPositions.push(idx);
          arr[idx] = null;
        }
      }

      const newPositions: number[] = [];
      let placed = false;

      outerClass:
      for (let d = 0; d < days; d++) {
        for (let p = slotsPerDay - 1; p >= 0; p--) {
          const candidateStart = slotIndex(d, p, slotsPerDay);
          if (!canPlace(claseId, candidateStart, dur)) continue;
          if (!teacherFreeRange(cell.docenteId ?? null, candidateStart, dur)) continue;
          // also ensure docente conflicts relocatable
          let teacherConflicts: MoveRecord[] = [];
          let ok = true;
          for (let k = 0; k < dur; k++) {
            const idx = candidateStart + k;
            for (const [cid, a] of Object.entries(timetableByClase)) {
              const other = a[idx];
              if (other && other.docenteId && other.docenteId === cell.docenteId && !(cid === claseId && other.cargaId === cell.cargaId)) {
                const moved = attemptRelocateCell(other, depth + 1, visited);
                if (!moved) { ok = false; break; }
                teacherConflicts.push(moved);
              }
            }
            if (!ok) break;
          }
          if (!ok) {
            for (const mv of teacherConflicts) {
              const arrMv = timetableByClase[mv.claseId];
              for (const pos of mv.newPositions) arrMv[pos] = null;
              for (const pos of mv.origPositions) arrMv[pos] = mv.cell;
            }
            continue;
          }

          for (let k = 0; k < dur; k++) {
            const idx = candidateStart + k;
            arr[idx] = { ...cell };
            newPositions.push(idx);
          }
          placed = true;
          break outerClass;
        }
      }

      if (!placed) {
        for (const pos of origPositions) arr[pos] = cell;
        visited.delete(cell.cargaId);
        return null;
      }

      return { claseId, origPositions, newPositions, cell };
    }

    function attemptRelocateCell(cell: TimetableCell, depth: number, visited: Set<string>): MoveRecord | null {
      if (depth > maxRelocateDepth) return null;
      if (!cell.docenteId) return null;
      if (visited.has(cell.cargaId)) return null;
      visited.add(cell.cargaId);

      const arr = timetableByClase[cell.claseId];
      if (!arr) return null;
      const { start, dur } = findBlockPositions(cell.claseId, cell.cargaId, Math.max(1, cell.duracion ?? 1));
      if (start < 0) return null;

      const origPositions: number[] = [];
      for (let k = 0; k < dur; k++) {
        const idx = start + k;
        if (inBounds(idx) && arr[idx]?.cargaId === cell.cargaId) {
          origPositions.push(idx);
          arr[idx] = null;
        }
      }

      const newPositions: number[] = [];
      let placed = false;

      outer:
      for (let d = 0; d < days; d++) {
        for (let p = slotsPerDay - 1; p >= 0; p--) {
          const candidateStart = slotIndex(d, p, slotsPerDay);
          if (!canPlace(cell.claseId, candidateStart, dur)) continue;

          // detectar conflictos de docente en ese rango
          const conflicts: { claseId: string; cell: TimetableCell }[] = [];
          for (let k = 0; k < dur; k++) {
            const idx = candidateStart + k;
            for (const [cid, a] of Object.entries(timetableByClase)) {
              if (cid === cell.claseId) continue;
              const other = a[idx];
              if (other && other.docenteId === cell.docenteId) {
                conflicts.push({ claseId: cid, cell: other });
                break;
              }
            }
          }

          // si hay conflictos, intentar moverlos recursivamente
          if (conflicts.length > 0) {
            let allMoved = true;
            const performed: MoveRecord[] = [];
            for (const conf of conflicts) {
              const moved = attemptRelocateCell(conf.cell, depth + 1, visited);
              if (!moved) { allMoved = false; break; }
              performed.push(moved);
            }
            if (!allMoved) {
              // revert lo que se movió en esta iteración
              for (const mv of performed) {
                const arrMv = timetableByClase[mv.claseId];
                for (const pos of mv.newPositions) arrMv[pos] = null;
                for (const pos of mv.origPositions) arrMv[pos] = mv.cell;
              }
              continue;
            }
          }

          // place cell
          for (let k = 0; k < dur; k++) {
            const idx = candidateStart + k;
            arr[idx] = { ...cell };
            newPositions.push(idx);
          }
          placed = true;
          break outer;
        }
      }

      if (!placed) {
        for (const pos of origPositions) arr[pos] = cell;
        visited.delete(cell.cargaId);
        return null;
      }

      return { claseId: cell.claseId, origPositions, newPositions, cell };
    }

    for (const start of candidates) {
      // si la clase está ocupada en el rango, intentar mover esos bloques primero (independientemente del docente)
      const classBlockers: { claseId: string; cell: TimetableCell }[] = [];
      for (let k = 0; k < dur; k++) {
        const idx = start + k;
        const cell = timetableByClase[lesson.claseId]?.[idx] ?? null;
        if (cell) classBlockers.push({ claseId: lesson.claseId, cell });
      }

      let classCleared = classBlockers.length === 0;
      const classMoves: MoveRecord[] = [];
      const visitedClass = new Set<string>();
      if (!classCleared) {
        classCleared = true;
        for (const blk of classBlockers) {
          const moved = attemptRelocateClassBlock(blk.claseId, blk.cell, 1, visitedClass);
          if (!moved) { classCleared = false; break; }
          classMoves.push(moved);
        }
        if (!classCleared) {
          for (const mv of classMoves) {
            const arrMv = timetableByClase[mv.claseId];
            for (const pos of mv.newPositions) arrMv[pos] = null;
            for (const pos of mv.origPositions) arrMv[pos] = mv.cell;
          }
          continue;
        }
      }

      if (!canPlace(lesson.claseId, start, dur)) {
        // revert moves si no cabe
        for (const mv of classMoves) {
          const arrMv = timetableByClase[mv.claseId];
          for (const pos of mv.newPositions) arrMv[pos] = null;
          for (const pos of mv.origPositions) arrMv[pos] = mv.cell;
        }
        continue;
      }

      if (teacherFreeRange(lesson.docenteId ?? null, start, dur)) {
        placeCell(lesson.claseId, start, dur, {
          cargaId: lesson.cargaId,
          asignaturaId: lesson.asignaturaId,
          docenteId: lesson.docenteId ?? null,
          claseId: lesson.claseId,
          duracion: lesson.duracion,
        });
        assignedMap.set(lesson.id, start);
        return true;
      }

      // Conflictos del docente en ese rango: intentar liberarlos recursivamente
      const performedMoves: MoveRecord[] = [];
      let canFree = true;
      const visited = new Set<string>();

      for (let k = 0; k < dur; k++) {
        const idx = start + k;
        for (const [cid, arr] of Object.entries(timetableByClase)) {
          const cell = arr[idx];
          if (cell && cell.docenteId === lesson.docenteId) {
            const moved = attemptRelocateCell(cell, 1, visited);
            if (!moved) { canFree = false; break; }
            performedMoves.push(moved);
          }
        }
        if (!canFree) break;
      }

      if (!canFree) {
        // revert lo movido
        for (const mv of performedMoves) {
          const arrMv = timetableByClase[mv.claseId];
          for (const pos of mv.newPositions) arrMv[pos] = null;
          for (const pos of mv.origPositions) arrMv[pos] = mv.cell;
        }
        continue;
      }

      if (teacherFreeRange(lesson.docenteId ?? null, start, dur) && canPlace(lesson.claseId, start, dur)) {
        placeCell(lesson.claseId, start, dur, {
          cargaId: lesson.cargaId,
          asignaturaId: lesson.asignaturaId,
          docenteId: lesson.docenteId ?? null,
          claseId: lesson.claseId,
          duracion: lesson.duracion,
        });
        assignedMap.set(lesson.id, start);
        return true;
      }

      // revert si no se pudo colocar
      for (const mv of performedMoves) {
        const arrMv = timetableByClase[mv.claseId];
        for (const pos of mv.newPositions) arrMv[pos] = null;
        for (const pos of mv.origPositions) arrMv[pos] = mv.cell;
      }
    }
    return false;
  }

  // Ejecutar reubicación para lecciones pendientes (cualquier duración)
  const unresolvedLessons = lessons.filter(L => !assignedMap.has(L.id));
  for (const L of unresolvedLessons) {
    tryPlaceWithTeacherRelocation(L);
  }

  // -------------------------
  // Backtracking/DFS attempt (limitado por maxBacktracks/time) para cerrar huecos de cualquier duración
  // -------------------------
  const currentAssignedSet = new Set<string>([...assignedMap.keys(), ...Array.from(placedSinglesSet)]);
  const remainingAfterGreedy = lessons.filter(L => !currentAssignedSet.has(L.id));

  let dfsBacktracks = 0;
  let dfsPlacedMap = new Map<string, number>(); // lessonId -> startSlot
  let bestTimetableSnapshot: Record<string, Array<TimetableCell | null>> | null = null;
  let bestAssignedSet: Set<string> | null = null;
  let dfsSolved = false;

  function cloneTimetable() {
    const clone: Record<string, Array<TimetableCell | null>> = {};
    for (const [cid, arr] of Object.entries(timetableByClase)) {
      clone[cid] = [...arr];
    }
    return clone;
  }

  function orderedStartsForLesson(L: LessonItem) {
    const vs = computeValidStartsForLesson(L);
    const base = vs.validStrict.length > 0 ? vs.validStrict : (relaxTeacher ? vs.validSoft : []);
    const ordered = [...base];
    ordered.sort((a, b) => scorePlacement(L, a) - scorePlacement(L, b));
    return ordered;
  }

  function dfsSearch(remainingList: LessonItem[]): boolean {
    if (Date.now() - startTime > timeLimitMs) return false;
    if (dfsBacktracks > maxBacktracks) return false;
    if (remainingList.length === 0) {
      bestTimetableSnapshot = cloneTimetable();
      bestAssignedSet = new Set<string>(dfsPlacedMap.keys());
      return true;
    }

    // MRV sobre el estado actual
    const remainingArray = remainingList.map(L => {
      const vs = computeValidStartsForLesson(L);
      return {
        L,
        strictCount: vs.validStrict.length,
        softCount: vs.validSoft.length,
      };
    }).sort((a, b) => {
      if (a.strictCount !== b.strictCount) return a.strictCount - b.strictCount;
      if (a.softCount !== b.softCount) return a.softCount - b.softCount;
      if (a.L.duracion !== b.L.duracion) return b.L.duracion - a.L.duracion;
      return a.L.id.localeCompare(b.L.id);
    });

    const candidate = remainingArray[0];
    const starts = orderedStartsForLesson(candidate.L);
    for (const start of starts) {
      const sc = scorePlacement(candidate.L, start);
      if (!isFinite(sc)) continue;
      placeCell(candidate.L.claseId, start, candidate.L.duracion, {
        cargaId: candidate.L.cargaId,
        asignaturaId: candidate.L.asignaturaId,
        docenteId: candidate.L.docenteId ?? null,
        claseId: candidate.L.claseId,
        duracion: candidate.L.duracion,
      });
      dfsPlacedMap.set(candidate.L.id, start);

      const next = remainingList.filter(l => l.id !== candidate.L.id);
      const solved = dfsSearch(next);
      if (solved) return true;

      dfsPlacedMap.delete(candidate.L.id);
      removeCell(candidate.L.claseId, start, candidate.L.duracion);
      dfsBacktracks++;
      if (dfsBacktracks > maxBacktracks) break;
      if (Date.now() - startTime > timeLimitMs) break;
    }
    return false;
  }

  if (remainingAfterGreedy.length > 0) {
    // Limpiar timetable y reintentar full search para maximizar colocación
    // Conservar snapshot actual por si DFS no encuentra mejor solución
    const greedySnapshot = cloneTimetable();
    const greedyAssignedIds = new Set<string>(currentAssignedSet);
    placedSinglesSet.clear();

    // Reset pool de "remaining" para el DFS (usa todas las lecciones para heurística)
    remaining.clear();
    for (const L of lessons) remaining.set(L.id, L);

    // reset tablero
    for (const cid of Object.keys(timetableByClase)) {
      timetableByClase[cid] = Array(totalSlots).fill(null);
    }
    dfsPlacedMap = new Map();
    const solved = dfsSearch([...lessons].sort((a, b) => {
      if (a.duracion !== b.duracion) return b.duracion - a.duracion;
      const da = lessonDomains.get(a.id)?.length ?? 0;
      const db = lessonDomains.get(b.id)?.length ?? 0;
      return da - db;
    }));
    dfsSolved = solved;

    if (solved && bestTimetableSnapshot && bestAssignedSet && bestAssignedSet.size >= greedyAssignedIds.size) {
      // aplicar el tablero encontrado
      for (const cid of Object.keys(timetableByClase)) {
        timetableByClase[cid] = bestTimetableSnapshot[cid] ?? Array(totalSlots).fill(null);
      }
      assignedMap.clear();
      for (const lid of bestAssignedSet) assignedMap.set(lid, -1);
    } else {
      // restaurar greedy si DFS no mejora
      for (const cid of Object.keys(timetableByClase)) {
        timetableByClase[cid] = greedySnapshot[cid] ?? Array(totalSlots).fill(null);
      }
      assignedMap.clear();
      for (const lid of greedyAssignedIds) assignedMap.set(lid, -1);
    }
  }

  // recompute totals & unplaced
  const assignedSlotsTotal = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);
  const assignedSetFinal = new Set<string>([...assignedMap.keys(), ...Array.from(placedSinglesSet)]);
  let assignedLessonsCount = assignedSetFinal.size;
  unplacedList = lessons.filter(L => !assignedSetFinal.has(L.id)).map(L => L.id);

  // Paso final: forzar colocación ignorando docente si hay hueco en la clase
  let forcedPlaced = 0;
  if (forcePlaceRemaining && unplacedList.length > 0) {
    for (const L of lessons) {
      if (assignedSetFinal.has(L.id)) continue;
      const arr = timetableByClase[L.claseId];
      if (!arr) continue;
      outerForce:
      for (let d = 0; d < days; d++) {
        for (let p = 0; p <= slotsPerDay - L.duracion; p++) {
          const start = slotIndex(d, p, slotsPerDay);
          if (!canPlace(L.claseId, start, L.duracion)) continue;
          placeCell(L.claseId, start, L.duracion, {
            cargaId: L.cargaId,
            asignaturaId: L.asignaturaId,
            docenteId: L.docenteId ?? null,
            claseId: L.claseId,
            duracion: L.duracion,
          });
          assignedSetFinal.add(L.id);
          forcedPlaced++;
          break outerForce;
        }
      }
    }
    unplacedList = lessons.filter(L => !assignedSetFinal.has(L.id)).map(L => L.id);
    assignedLessonsCount = assignedSetFinal.size;
  }

  // Build debug samples for teacher & class occupancy
  const teacherOccupancySample: Record<string, number[]> = {};
  const teacherSlotDetail: Record<string, Array<{ idx: number; cargaId: string; claseId: string }>> = {};
  for (const arr of Object.values(timetableByClase)) {
    for (let idx = 0; idx < arr.length; idx++) {
      const cell = arr[idx];
      if (!cell || !cell.docenteId) continue;
      teacherOccupancySample[cell.docenteId] = teacherOccupancySample[cell.docenteId] ?? [];
      if (!teacherOccupancySample[cell.docenteId].includes(idx)) teacherOccupancySample[cell.docenteId].push(idx);
      teacherSlotDetail[cell.docenteId] = teacherSlotDetail[cell.docenteId] ?? [];
      teacherSlotDetail[cell.docenteId].push({ idx, cargaId: cell.cargaId, claseId: cell.claseId });
    }
  }
  const classOccupancySample: Record<string, number[]> = {};
  for (const [cid, arr] of Object.entries(timetableByClase)) {
    classOccupancySample[cid] = [];
    for (let i = 0; i < arr.length; i++) if (arr[i]) classOccupancySample[cid].push(i);
  }

  // prepare lessonDebug object (convert Map -> plain object)
  const lessonDebugObj: Record<string, any> = {};
  for (const [k, v] of lessonDebug.entries()) lessonDebugObj[k] = v;

  return {
    timetableByClase,
    success: unplacedList.length === 0,
    unplaced: unplacedList,
    stats: {
      lessonsTotal: lessons.length,
      assigned: assignedLessonsCount,
      assignedSlots: assignedSlotsTotal,
      greedyAssigned,
      backtracks: dfsBacktracks,
      timeMs: Date.now() - startTime,
    },
    meta: {
      note: "Global best-first greedy applied after multi-slot greedy with MRV ordering. Per-lesson debug included.",
      placedByGlobalGreedy: globalPlacements,
      placedSinglesCount: placedSinglesSet.size,
      unplaced: unplacedList,
      lessonDomains: Object.fromEntries(Array.from(lessonDomains.entries())),
      lessonDebug: lessonDebugObj,
      teacherOccupancySample,
      teacherSlotDetail,
      classOccupancySample,
      usedDFS: remainingAfterGreedy.length > 0,
      dfsSolved,
      dfsBacktracks,
      assignedLessons: Array.from(assignedSetFinal),
      assignedSlots: assignedSlotsTotal,
      forcedPlaced,
    },
  };
}
