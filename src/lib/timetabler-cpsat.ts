import type { LessonItem, TimetableCell, TimetableResult } from "./timetabler";

type CpSatOptions = {
  maxBacktracks?: number;
  timeLimitMs?: number;
  maxRestarts?: number;
  teacherBlockedSlots?: Record<string, boolean[]>;
  forcedStarts?: Record<string, number>;
  forcedLabels?: Record<string, string>;
  meetingMaxPerDay?: number;
  subjectMaxDailySlots?: number;
};

type LinearTerm = { var: any; coeff: number };

function slotIndex(day: number, period: number, slotsPerDay: number) {
  return day * slotsPerDay + period;
}

function dayOfSlot(slot: number, slotsPerDay: number) {
  return Math.floor(slot / slotsPerDay);
}

function buildLinearExpr(cp: any, terms: LinearTerm[]) {
  if (!terms.length) return null;
  const vars = terms.map((t) => t.var);
  const coeffs = terms.map((t) => t.coeff);
  if (cp?.LinearExpr?.weightedSum) return cp.LinearExpr.weightedSum(vars, coeffs);
  if (cp?.LinearExpr?.sum && coeffs.every((c) => c === 1)) return cp.LinearExpr.sum(vars);
  return { vars, coeffs };
}

function addLinearLeq(cp: any, model: any, expr: any, limit: number) {
  if (!expr) return;
  if (typeof model.addLessOrEqual === "function") {
    model.addLessOrEqual(expr, limit);
    return;
  }
  if (typeof model.addLinearConstraint === "function") {
    model.addLinearConstraint(expr, Number.NEGATIVE_INFINITY, limit);
    return;
  }
  throw new Error("CP-SAT API missing linear constraint helpers. Check ortools binding.");
}

function addExactlyOne(model: any, vars: any[]) {
  if (typeof model.addExactlyOne === "function") {
    model.addExactlyOne(vars);
    return;
  }
  if (typeof model.addBoolOr === "function") {
    model.addBoolOr(vars);
    // Also enforce sum <= 1
    if (typeof model.addAtMostOne === "function") {
      model.addAtMostOne(vars);
      return;
    }
  }
  throw new Error("CP-SAT API missing addExactlyOne. Check ortools binding.");
}

function valueOf(solver: any, v: any) {
  if (typeof solver.value === "function") return solver.value(v);
  if (typeof solver.Value === "function") return solver.Value(v);
  return 0;
}

export function generateTimetableCPSAT(
  institucionId: string | null,
  classes: { id: string; nombre?: string }[],
  lessons: LessonItem[],
  days: number,
  slotsPerDay: number,
  options?: CpSatOptions
): TimetableResult {
  const totalSlots = days * slotsPerDay;
  const teacherBlockedSlots = options?.teacherBlockedSlots ?? {};
  const forcedStarts = options?.forcedStarts ?? {};
  const meetingMaxPerDay = options?.meetingMaxPerDay ?? Number.POSITIVE_INFINITY;
  const subjectMaxDailySlots = options?.subjectMaxDailySlots ?? 2;
  const timeLimitMs = options?.timeLimitMs ?? 120000;

  // Init timetable result structure
  const timetableByClase: Record<string, Array<TimetableCell | null>> = {};
  for (const c of classes) timetableByClase[c.id] = Array(totalSlots).fill(null);

  // Ensure placeholder arrays for claseIds referenced by lessons
  for (const L of lessons) {
    if (!timetableByClase[L.claseId]) {
      timetableByClase[L.claseId] = Array(totalSlots).fill(null);
    }
  }

  let ortools: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ortools = require("ortools");
  } catch (err) {
    return {
      timetableByClase,
      success: false,
      unplaced: lessons.map((l) => l.id),
      stats: {
        lessonsTotal: lessons.length,
        assigned: 0,
        assignedSlots: 0,
        greedyAssigned: 0,
        backtracks: 0,
        timeMs: 0,
      },
      meta: {
        infeasible: true,
        error: "CP-SAT solver not installed. Add dependency 'ortools' and run npm install.",
      },
    };
  }

  const cp = ortools?.sat ?? ortools;
  if (!cp?.CpModel || !cp?.CpSolver) {
    return {
      timetableByClase,
      success: false,
      unplaced: lessons.map((l) => l.id),
      stats: {
        lessonsTotal: lessons.length,
        assigned: 0,
        assignedSlots: 0,
        greedyAssigned: 0,
        backtracks: 0,
        timeMs: 0,
      },
      meta: {
        infeasible: true,
        error: "CP-SAT API not found in ortools binding.",
      },
    };
  }

  const model = new cp.CpModel();

  const classIntervals: Record<string, any[]> = {};
  const teacherIntervals: Record<string, any[]> = {};
  const subjectDayTerms: Record<string, Record<number, LinearTerm[]>> = {};
  const meetingDayTerms: Record<number, LinearTerm[]> = {};
  const lessonVars = new Map<string, Array<{ start: number; var: any }>>();

  for (const L of lessons) {
    const domain: number[] = [];
    const isMeeting = L.kind === "meeting";
    const meetingTeachers = Array.isArray(L.meetingTeachers) ? L.meetingTeachers : [];
    const teacherIds = isMeeting ? meetingTeachers : (L.docenteId ? [L.docenteId] : []);
    const forcedStart = forcedStarts[L.id];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < slotsPerDay; p++) {
        const start = slotIndex(d, p, slotsPerDay);
        if (p + L.duracion > slotsPerDay) continue;
        if (typeof forcedStart === "number" && start !== forcedStart) continue;
        let blocked = false;
        for (let k = 0; k < L.duracion; k++) {
          const idx = start + k;
          for (const tid of teacherIds) {
            const blockedArr = teacherBlockedSlots[tid];
            if (blockedArr && blockedArr[idx]) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;
        }
        if (!blocked) domain.push(start);
      }
    }
    if (domain.length === 0) {
      return {
        timetableByClase,
        success: false,
        unplaced: lessons.map((l) => l.id),
        stats: {
          lessonsTotal: lessons.length,
          assigned: 0,
          assignedSlots: 0,
          greedyAssigned: 0,
          backtracks: 0,
          timeMs: 0,
        },
        meta: {
          infeasible: true,
          error: "CP-SAT: leccion sin dominio posible.",
          lessonId: L.id,
        },
      };
    }

    const varList: Array<{ start: number; var: any }> = [];
    for (const start of domain) {
      const v = model.newBoolVar(`L:${L.id}@${start}`);
      varList.push({ start, var: v });

      const interval = model.newOptionalIntervalVar(
        start,
        L.duracion,
        start + L.duracion,
        v,
        `I:${L.id}@${start}`
      );

      if (!isMeeting) {
        if (!classIntervals[L.claseId]) classIntervals[L.claseId] = [];
        classIntervals[L.claseId].push(interval);
      }
      for (const tid of teacherIds) {
        if (!teacherIntervals[tid]) teacherIntervals[tid] = [];
        teacherIntervals[tid].push(interval);
      }

      const day = dayOfSlot(start, slotsPerDay);
      if (isMeeting) {
        if (!meetingDayTerms[day]) meetingDayTerms[day] = [];
        meetingDayTerms[day].push({ var: v, coeff: 1 });
      } else {
        const subjectKey = `${L.claseId}::${L.asignaturaId}::${L.docenteId ?? "no-docente"}`;
        if (!subjectDayTerms[subjectKey]) subjectDayTerms[subjectKey] = {};
        if (!subjectDayTerms[subjectKey][day]) subjectDayTerms[subjectKey][day] = [];
        subjectDayTerms[subjectKey][day].push({ var: v, coeff: L.duracion });
      }
    }

    lessonVars.set(L.id, varList);
    addExactlyOne(model, varList.map((item) => item.var));
  }

  for (const [cid, intervals] of Object.entries(classIntervals)) {
    if (!intervals.length) continue;
    model.addNoOverlap(intervals);
  }
  for (const [tid, intervals] of Object.entries(teacherIntervals)) {
    if (!intervals.length) continue;
    model.addNoOverlap(intervals);
  }

  for (const [subjectKey, dayMap] of Object.entries(subjectDayTerms)) {
    for (const [dayStr, terms] of Object.entries(dayMap)) {
      const day = Number(dayStr);
      const expr = buildLinearExpr(cp, terms);
      addLinearLeq(cp, model, expr, subjectMaxDailySlots);
      subjectDayTerms[subjectKey][day] = terms;
    }
  }

  if (Number.isFinite(meetingMaxPerDay)) {
    for (let d = 0; d < days; d++) {
      const terms = meetingDayTerms[d] ?? [];
      const expr = buildLinearExpr(cp, terms);
      addLinearLeq(cp, model, expr, meetingMaxPerDay);
    }
  }

  const solver = new cp.CpSolver();
  if (solver.parameters) {
    solver.parameters.maxTimeInSeconds = timeLimitMs / 1000;
    solver.parameters.numSearchWorkers = Math.min(8, Math.max(1, (solver.parameters.numSearchWorkers ?? 0) || 8));
  } else {
    solver.maxTimeInSeconds = timeLimitMs / 1000;
  }

  const status = solver.solve(model);
  const statusStr = typeof status === "string" ? status : String(status);
  const solved = statusStr.toLowerCase().includes("optimal") || statusStr.toLowerCase().includes("feasible");

  if (!solved) {
    return {
      timetableByClase,
      success: false,
      unplaced: lessons.map((l) => l.id),
      stats: {
        lessonsTotal: lessons.length,
        assigned: 0,
        assignedSlots: 0,
        greedyAssigned: 0,
        backtracks: 0,
        timeMs: 0,
      },
      meta: {
        infeasible: true,
        solverStatus: statusStr,
      },
    };
  }

  const assignedLessonIds = new Set<string>();
  const meetingAssignments: Array<{ lessonId: string; slot: number }> = [];
  for (const L of lessons) {
    const choices = lessonVars.get(L.id) ?? [];
    const chosen = choices.find((c) => valueOf(solver, c.var) === 1);
    if (!chosen) continue;
    assignedLessonIds.add(L.id);
    if (L.kind === "meeting") {
      meetingAssignments.push({ lessonId: L.id, slot: chosen.start });
      continue;
    }
    for (let k = 0; k < L.duracion; k++) {
      const idx = chosen.start + k;
      if (idx < 0 || idx >= totalSlots) continue;
      timetableByClase[L.claseId][idx] = {
        cargaId: L.cargaId,
        asignaturaId: L.asignaturaId,
        docenteId: L.docenteId ?? null,
        claseId: L.claseId,
        duracion: L.duracion,
      };
    }
  }

  const assignedSlotsTotal = Object.values(timetableByClase).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);
  const assignedLessonsCount = assignedLessonIds.size;
  const unplaced = lessons.filter((L) => L.kind !== "meeting" && !assignedLessonIds.has(L.id)).map((L) => L.id);

  return {
    timetableByClase,
    success: unplaced.length === 0,
    unplaced,
    stats: {
      lessonsTotal: lessons.length,
      assigned: assignedLessonsCount,
      assignedSlots: assignedSlotsTotal,
      greedyAssigned: 0,
      backtracks: 0,
      timeMs: 0,
    },
    meta: {
      solver: "cpsat",
      subjectMaxDailySlots,
      meetingMaxPerDay,
      meetingAssignments,
    },
  };
}
