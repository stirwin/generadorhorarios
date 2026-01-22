// app/api/timetable/generate/route.ts
import { NextResponse } from "next/server";
import { generateTimetable, LessonItem } from "@/lib/timetabler";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { Agent } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
};

const buildHintAssignments = (timetable: Record<string, Array<any>> | null | undefined) => {
  const hintAssignments: Record<string, number> = {};
  if (!timetable || typeof timetable !== "object") return hintAssignments;
  for (const slots of Object.values(timetable)) {
    if (!Array.isArray(slots)) continue;
    slots.forEach((cell, idx) => {
      if (!cell || typeof cell !== "object") return;
      const lessonId = (cell as { lessonId?: unknown }).lessonId;
      if (typeof lessonId === "string" && !(lessonId in hintAssignments)) {
        hintAssignments[lessonId] = idx;
      }
    });
  }
  return hintAssignments;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const institucionId = body?.institucionId;
    if (!institucionId) return NextResponse.json({ error: "institucionId requerido" }, { status: 400 });

    const institucion = await prisma.institucion.findUnique({
      where: { id: institucionId },
      include: { periodos: true },
    });
    if (!institucion) return NextResponse.json({ error: "Institución no encontrada" }, { status: 404 });

    const days = institucion.dias_por_semana ?? 5;
    const slotsPerDay = institucion.lecciones_por_dia ?? 7;
    const totalSlots = days * slotsPerDay;

    const docentes = await prisma.docente.findMany({
      where: { institucionId },
      include: { restricciones: true },
    });
    const teacherBlockedSlots: Record<string, boolean[]> = {};
    for (const d of docentes) {
      teacherBlockedSlots[d.id] = Array(totalSlots).fill(false);
    }
    for (const d of docentes) {
      if (!d.restricciones || d.restricciones.length === 0) continue;
      const arr = teacherBlockedSlots[d.id] ?? Array(totalSlots).fill(false);
      for (const r of d.restricciones) {
        if (r.tipo !== "bloqueo") continue;
        if (r.dia < 0 || r.dia >= days) continue;
        const start = Math.max(0, r.periodoInicio);
        const end = Math.min(slotsPerDay - 1, r.periodoFin);
        for (let p = start; p <= end; p++) {
          const idx = r.dia * slotsPerDay + p;
          if (idx >= 0 && idx < totalSlots) arr[idx] = true;
        }
      }
      teacherBlockedSlots[d.id] = arr;
    }

    // Cargar cargas con relaciones
    const cargas = await prisma.cargaAcademica.findMany({
      where: { institucionId },
      include: { asignatura: true, clase: true, docente: true },
    });

    // Map de info por carga (para normalizar resultado)
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

    // Construir lessons: **USAR docenteId (ID)** para constraints; incluir nombre solo para UI/debug
    const lessons: LessonItem[] = [];
    for (const c of cargas) {
      const sesiones = (c as any).sesiones_sem ?? 1;
      const dur = (c as any).duracion_slots ?? 1;
      for (let i = 0; i < sesiones; i++) {
        lessons.push({
          id: `${c.id}__${i}`,
          cargaId: c.id,
          claseId: c.claseId,
          docenteId: c.docenteId ?? null,
          claseNombre: c.clase?.nombre ?? String(c.claseId),
          asignaturaId: c.asignaturaId,
          duracion: Math.max(1, Number(dur) || 1),
        });
      }
    }
    const lessonById = new Map<string, LessonItem>(lessons.map((l) => [l.id, l]));
    // Restriccion: director de grupo siempre lunes primera hora con su clase (si está activada)
    const forcedStarts: Record<string, number> = {};
    const forcedStartOptions: Record<string, number[]> = {};
    const forcedLabels: Record<string, string> = {};
    const forcedConflicts: Array<{ docenteId: string; claseId: string; reason: string }> = [];
    const directorsApplied: Array<{ docenteId: string; claseId: string; lessonId: string; slot: number | null; label: string }> = [];
    const mondayStart = 0;
    const applyDirectorRule = institucion.director_lunes_primera !== false;
    const directorWindowMode = body?.directorWindowMode ?? "full-day";
    const directorFallbackAnyDay = body?.directorFallbackAnyDay ?? true;
    const directorFallbacks: Array<{ docenteId: string; claseId: string; reason: string }> = [];
    const forcedByClass = new Set<string>();

    const directorMap = new Map<string, string>();
    for (const d of docentes) {
      if (d.direccionGrupoId && d.directorLunesAplica !== false) {
        directorMap.set(d.id, d.direccionGrupoId);
      }
    }

    if (applyDirectorRule) {
      for (const [docenteId, claseId] of directorMap.entries()) {
        const candidates = lessons.filter((l) => l.docenteId === docenteId && l.claseId === claseId);
        if (candidates.length === 0) {
          forcedConflicts.push({ docenteId, claseId, reason: "sin lecciones del docente en su grupo" });
          continue;
        }
        if (forcedByClass.has(claseId)) {
          forcedConflicts.push({ docenteId, claseId, reason: "clase ya tiene una leccion forzada" });
          continue;
        }
        const withOneSlot = candidates.filter((c) => c.duracion === 1);
        const withTwoSlots = candidates.filter((c) => c.duracion >= 2);
        const chosen = (withOneSlot.length > 0
          ? withOneSlot[0]
          : (withTwoSlots.length > 0 ? withTwoSlots[0] : candidates.slice().sort((a, b) => a.duracion - b.duracion)[0]));
        const blocked = teacherBlockedSlots[docenteId];
        const requiredSlots = chosen.duracion;
        const maxStartOffset = Math.max(0, slotsPerDay - requiredSlots);
        const mondayOffsets = Array.from({ length: maxStartOffset + 1 }, (_, i) => i);
        const limitedOffsets = directorWindowMode === "first-two"
          ? mondayOffsets.filter((i) => i <= 1)
          : mondayOffsets;
        const mondayStarts = limitedOffsets.map((i) => mondayStart + i);
        let allowedStarts = mondayStarts.filter((start) => {
          for (let p = 0; p < requiredSlots; p++) {
            const idx = start + p;
            if (blocked && blocked[idx]) return false;
          }
          return true;
        });
        if (allowedStarts.length === 0 && directorFallbackAnyDay) {
          const weekStarts: number[] = [];
          for (let d = 0; d < days; d++) {
            for (let p = 0; p <= slotsPerDay - requiredSlots; p++) {
              const start = d * slotsPerDay + p;
              let blockedAny = false;
              for (let k = 0; k < requiredSlots; k++) {
                const idx = start + k;
                if (blocked && blocked[idx]) {
                  blockedAny = true;
                  break;
                }
              }
              if (!blockedAny) weekStarts.push(start);
            }
          }
          allowedStarts = weekStarts;
          if (allowedStarts.length > 0) {
            directorFallbacks.push({ docenteId, claseId, reason: "sin lunes disponible, se amplio a semana" });
          }
        }
        if (allowedStarts.length === 0) {
          const reason = directorWindowMode === "first-two"
            ? "slot lunes 1-2 bloqueado por restricciones"
            : "sin slot disponible el lunes";
          forcedConflicts.push({ docenteId, claseId, reason });
          continue;
        }
        if (allowedStarts.length === 1) {
          forcedStarts[chosen.id] = allowedStarts[0];
        } else {
          forcedStartOptions[chosen.id] = allowedStarts;
        }
        if (directorFallbacks.some((f) => f.docenteId === docenteId && f.claseId === claseId)) {
          forcedLabels[chosen.id] = "Dir. grupo (flex)";
        } else if (directorWindowMode === "first-two") {
          forcedLabels[chosen.id] = requiredSlots >= 2 ? "Dir. grupo (Lun 1-2)" : "Dir. grupo (Lun 1ra/2da)";
        } else {
          forcedLabels[chosen.id] = "Dir. grupo (Lun)";
        }
        directorsApplied.push({
          docenteId,
          claseId,
          lessonId: chosen.id,
          slot: allowedStarts.length === 1 ? allowedStarts[0] : null,
          label: forcedLabels[chosen.id],
        });
        forcedByClass.add(claseId);
      }
    }

    // -------------------------
    // Reuniones de area (slot semanal comun para docentes del grupo)
    // -------------------------
    function normalizeSubjectName(name?: string | null) {
      return (name || "")
        .toString()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    }

    const areaGroups = [
      { id: "bioquimfis", label: "Biologia/Quimica/Fisica", subjects: ["BIOLOGIA", "QUIMICA", "QUIM/FISI", "FISICA"] },
      { id: "lenguaje", label: "Lenguaje/Lectora", subjects: ["LENGUAJE", "LECTORA"] },
      { id: "ingles", label: "Ingles", subjects: ["INGLES"] },
      { id: "sociales", label: "Sociales/Catedra", subjects: ["SOCIALES", "CATEDRA"] },
      { id: "tecnicas", label: "Informatica/Artistica/Ed.Fisica/Etica/Religion", subjects: ["INFORMATICA", "ARTISTICA", "EDU.FISICA", "ETICA", "RELIGION"] },
      { id: "mates", label: "Geometria/Estadistica/Matematicas", subjects: ["GEOMETRIA", "ESTADISTICAS", "MATEMATICAS"] },
    ];
    const groupSubjectSets = new Map<string, Set<string>>();
    for (const g of areaGroups) {
      groupSubjectSets.set(g.id, new Set(g.subjects.map((s) => normalizeSubjectName(s))));
    }

    const groupTeachers = new Map<string, Set<string>>();
    for (const c of cargas) {
      if (!c.docenteId) continue;
      const subjectKey = normalizeSubjectName(c.asignatura?.nombre ?? "");
      for (const g of areaGroups) {
        const set = groupSubjectSets.get(g.id);
        if (set?.has(subjectKey)) {
          if (!groupTeachers.has(g.id)) groupTeachers.set(g.id, new Set());
          groupTeachers.get(g.id)!.add(c.docenteId);
        }
      }
    }

    const meetingAssignments: Array<{ groupId: string; label: string; slot: number; teachers: string[] }> = [];
    const meetingConflicts: Array<{ groupId: string; label: string; reason: string }> = [];

    const groupsToSchedule = areaGroups
      .map((g) => ({ ...g, teachers: Array.from(groupTeachers.get(g.id) ?? []) }))
      .filter((g) => g.teachers.length > 0);

    const teacherRequiredSlots: Record<string, number> = {};
    const teacherSubjects: Record<string, Set<string>> = {};
    for (const c of cargas) {
      if (!c.docenteId) continue;
      const slots = (c as any).sesiones_sem * (c as any).duracion_slots;
      teacherRequiredSlots[c.docenteId] = (teacherRequiredSlots[c.docenteId] ?? 0) + (Number(slots) || 0);
      if (!teacherSubjects[c.docenteId]) teacherSubjects[c.docenteId] = new Set();
      teacherSubjects[c.docenteId].add(c.asignatura?.nombre ?? c.asignaturaId);
    }

    const teacherBlockedCount: Record<string, number> = {};
    for (const d of docentes) {
      const arr = teacherBlockedSlots[d.id] ?? Array(totalSlots).fill(false);
      teacherBlockedCount[d.id] = arr.reduce((acc, blocked) => acc + (blocked ? 1 : 0), 0);
    }

    const teacherMeetingCount: Record<string, number> = {};
    for (const g of groupsToSchedule) {
      for (const tid of g.teachers) {
        teacherMeetingCount[tid] = (teacherMeetingCount[tid] ?? 0) + 1;
      }
    }

    const teacherForcedSlots: Record<string, number> = {};
    for (const [lessonId] of Object.entries(forcedStarts)) {
      const lesson = lessonById.get(lessonId);
      if (!lesson?.docenteId) continue;
      teacherForcedSlots[lesson.docenteId] = (teacherForcedSlots[lesson.docenteId] ?? 0) + lesson.duracion;
    }

    const teacherConflicts = docentes
      .map((d) => {
        const required = teacherRequiredSlots[d.id] ?? 0;
        const blocked = teacherBlockedCount[d.id] ?? 0;
        const meetings = teacherMeetingCount[d.id] ?? 0;
        const forced = teacherForcedSlots[d.id] ?? 0;
        const available = totalSlots - blocked - meetings - forced;
        if (required <= available) return null;
        const subjects = Array.from(teacherSubjects[d.id] ?? []).slice(0, 8);
        return {
          docenteId: d.id,
          docenteNombre: d.nombre ?? d.id,
          required,
          available,
          blocked,
          meetings,
          forced,
          subjects,
        };
      })
      .filter(Boolean);

    const teacherDayAvailability: Record<string, number> = {};
    for (const d of docentes) {
      const arr = teacherBlockedSlots[d.id] ?? Array(totalSlots).fill(false);
      let availableDays = 0;
      for (let day = 0; day < days; day++) {
        let anyFree = false;
        for (let p = 0; p < slotsPerDay; p++) {
          const idx = day * slotsPerDay + p;
          if (!arr[idx]) {
            anyFree = true;
            break;
          }
        }
        if (anyFree) availableDays += 1;
      }
      teacherDayAvailability[d.id] = availableDays;
    }

    const subjectDayConflicts: Array<{
      docenteId: string;
      docenteNombre: string;
      asignatura: string;
      slotsNeeded: number;
      maxSlots: number;
      maxDailySlots: number;
      diasDisponibles: number;
      claseId?: string;
      claseNombre?: string;
    }> = [];

    const claseNameById = new Map<string, string>();
    for (const c of cargas) {
      if (c.claseId && c.clase?.nombre) claseNameById.set(c.claseId, c.clase.nombre);
    }
    const teacherSubjectSlots = new Map<string, number>();
    for (const c of cargas) {
      if (!c.docenteId) continue;
      const key = `${c.docenteId}::${c.claseId}::${c.asignatura?.nombre ?? c.asignaturaId}`;
      const sesiones = Number((c as any).sesiones_sem ?? 0) || 0;
      const duracion = Number((c as any).duracion_slots ?? 1) || 1;
      const slotsNeeded = sesiones * duracion;
      teacherSubjectSlots.set(key, (teacherSubjectSlots.get(key) ?? 0) + slotsNeeded);
    }
    for (const [key, slotsNeeded] of teacherSubjectSlots.entries()) {
      const parts = key.split("::");
      const docenteId = parts[0];
      const claseId = parts[1];
      const asignatura = parts.slice(2).join("::");
      const diasDisponibles = teacherDayAvailability[docenteId] ?? days;
      const maxDailySlots = 2;
      const maxSlots = diasDisponibles * maxDailySlots;
      if (slotsNeeded > maxSlots) {
        const docenteNombre = docentes.find((d) => d.id === docenteId)?.nombre ?? docenteId;
        subjectDayConflicts.push({
          docenteId,
          docenteNombre,
          asignatura,
          slotsNeeded,
          maxSlots,
          maxDailySlots,
          diasDisponibles,
          claseId,
          claseNombre: claseNameById.get(claseId) ?? claseId,
        });
      }
    }

    if (teacherConflicts.length > 0 || subjectDayConflicts.length > 0) {
      // noop: mantener consola limpia
      return NextResponse.json({
        error: "Restricciones imposibles con la disponibilidad docente.",
        teacherConflicts,
        subjectDayConflicts,
      }, { status: 400 });
    }

    const meetingInfoByLessonId = new Map<string, { groupId: string; label: string; teachers: string[] }>();
    const meetingLessons: LessonItem[] = [];
    const meetingDomain: number[] = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < slotsPerDay; p++) {
        if (d === 0 && p < 2) continue; // lunes 1ra y 2da hora
        meetingDomain.push(d * slotsPerDay + p);
      }
    }

    for (const g of groupsToSchedule) {
      const lessonId = `meeting::${g.id}`;
      meetingInfoByLessonId.set(lessonId, { groupId: g.id, label: g.label, teachers: g.teachers });
      meetingLessons.push({
        id: lessonId,
        cargaId: `meeting::${g.id}`,
        claseId: `meeting-${g.id}`,
        asignaturaId: "AREA_MEETING",
        docenteId: null,
        duracion: 1,
        kind: "meeting",
        meetingTeachers: g.teachers,
        meetingGroupId: g.id,
        meetingLabel: g.label,
        domain: meetingDomain,
      });
    }

    if (meetingLessons.length > 0) {
      lessons.push(...meetingLessons);
    }

    // cargar lista ordenada de clases
    const clases = await prisma.clase.findMany({ where: { institucionId } });
    const cls = clases.map((c) => ({ id: c.id, nombre: c.nombre }));

    // Diagnóstico: carga total de slots por clase vs capacidad
    const classLoad: Record<string, { requiredSlots: number; capacity: number; deficit: number }> = {};
    for (const c of clases) {
      classLoad[c.id] = { requiredSlots: 0, capacity: days * slotsPerDay, deficit: 0 };
    }
    for (const c of cargas) {
      const slots = (c as any).sesiones_sem * (c as any).duracion_slots;
      const entry = classLoad[c.claseId] || { requiredSlots: 0, capacity: days * slotsPerDay, deficit: 0 };
      entry.requiredSlots += slots;
      entry.deficit = Math.max(0, entry.requiredSlots - entry.capacity);
      classLoad[c.claseId] = entry;
    }
    const overCapacityClasses = Object.entries(classLoad).filter(([, v]) => v.deficit > 0).map(([k, v]) => ({ claseId: k, ...v }));

    if (overCapacityClasses.length > 0) {
      return NextResponse.json({
        error: "La carga académica supera la capacidad de algunas clases.",
        overCapacityClasses,
        classLoad,
      }, { status: 400 });
    }

    const meetingMaxPerDay = Math.max(1, Math.ceil(meetingLessons.length / Math.max(1, days)));
    const subjectMaxDailySlots = Number(body?.subjectMaxDailySlots) || 2;
    const constraintsHash = createHash("sha1")
      .update(stableStringify({
        days,
        slotsPerDay,
        meetingMaxPerDay,
        subjectMaxDailySlots,
        teacherBlockedSlots,
        forcedStarts,
        forcedStartOptions,
        lessons: lessons.map((l) => ({
          lessonId: l.lessonId,
          claseId: l.claseId,
          asignaturaId: l.asignaturaId,
          docenteId: l.docenteId ?? null,
          duracion: l.duracion,
          isMeeting: Boolean((l as any).isMeeting),
        })),
      }))
      .digest("hex");

    const availabilityChecks = lessons
      .filter((l: any) => !l.isMeeting)
      .map((lesson) => {
        const dur = lesson.duracion ?? 1;
        const blocked = lesson.docenteId ? teacherBlockedSlots[lesson.docenteId] : undefined;
        const availableDays: number[] = [];
        let domainSize = 0;
        for (let d = 0; d < days; d++) {
          let dayHasSlot = false;
          for (let start = 0; start <= slotsPerDay - dur; start++) {
            let ok = true;
            for (let k = 0; k < dur; k++) {
              const idx = d * slotsPerDay + start + k;
              if (blocked && blocked[idx]) {
                ok = false;
                break;
              }
            }
            if (ok) {
              domainSize += 1;
              dayHasSlot = true;
            }
          }
          if (dayHasSlot) availableDays.push(d);
        }
        return {
          lessonId: lesson.lessonId,
          cargaId: lesson.cargaId,
          claseId: lesson.claseId,
          asignaturaId: lesson.asignaturaId,
          docenteId: lesson.docenteId ?? null,
          duracion: dur,
          availableDays,
          domainSize,
        };
      });
    const availabilityConflicts = availabilityChecks.filter((l) => l.domainSize === 0);
    if (availabilityConflicts.length > 0) {
      return NextResponse.json({
        error: "Restricciones imposibles con la disponibilidad docente.",
        constraintsHash,
        availabilityConflicts,
      }, { status: 400 });
    }

    // Ejecutar generador: microservicio CP-SAT si existe URL, heuristico local si no
    const solverUrl = process.env.TIMETABLER_SOLVER_URL;
    const solverOptions = {
      maxBacktracks: Number(body?.maxBacktracks) || 1200000,
      timeLimitMs: Number(body?.timeLimitMs) || 120000,
      maxRestarts: Number(body?.maxRestarts) || 30,
      repairIterations: Number(body?.repairIterations) || 300,
      repairSampleSize: Number(body?.repairSampleSize) || 6,
      repairMaxConflicts: Number(body?.repairMaxConflicts) || 4,
      repairCandidateStarts: Number(body?.repairCandidateStarts) || 40,
      targetedReoptSize: Number(body?.targetedReoptSize) || 8,
      targetedReoptMaxAttempts: Number(body?.targetedReoptMaxAttempts) || 2,
      teacherBlockedSlots,
      forcedStarts,
      forcedStartOptions,
      forcedLabels,
      meetingMaxPerDay,
      subjectMaxDailySlots,
      priorityLessonIds: Array.isArray(body?.priorityLessonIds) ? body.priorityLessonIds : undefined,
      priorityTeacherIds: Array.isArray(body?.priorityTeacherIds) ? body.priorityTeacherIds : undefined,
    };
    let result;
    if (solverUrl) {
      const hintAssignments: Record<string, number> = {};
      let hybridHintCount = 0;
      let hybridUsed = false;
      const hybridSolve = body?.hybridSolve !== false;
      const hintConstraintsHash = typeof body?.hintConstraintsHash === "string" ? body.hintConstraintsHash : null;
      const hintTimetable = body?.hintTimetable;
      if (hintConstraintsHash && hintConstraintsHash === constraintsHash && hintTimetable && typeof hintTimetable === "object") {
        Object.assign(hintAssignments, buildHintAssignments(hintTimetable));
      }
      if (Object.keys(hintAssignments).length === 0 && hybridSolve) {
        const localOptions = {
          ...solverOptions,
          timeLimitMs: Math.min(solverOptions.timeLimitMs, 60000),
          maxRestarts: Math.min(solverOptions.maxRestarts ?? 4, 4),
          repairIterations: Math.min(solverOptions.repairIterations ?? 200, 200),
          repairSampleSize: Math.min(solverOptions.repairSampleSize ?? 6, 6),
        };
        const localResult = generateTimetable(institucionId, cls, lessons, days, slotsPerDay, localOptions);
        const localHints = buildHintAssignments(localResult?.timetableByClase ?? {});
        Object.assign(hintAssignments, localHints);
        hybridHintCount = Object.keys(hintAssignments).length;
        hybridUsed = hybridHintCount > 0;
      }
      const payload = {
        days,
        slotsPerDay,
        classes: cls,
        lessons,
        teacherBlockedSlots,
        forcedStarts,
        forcedStartOptions,
        meetingMaxPerDay,
        subjectMaxDailySlots,
        timeLimitMs: solverOptions.timeLimitMs,
        maxRestarts: solverOptions.maxRestarts,
        randomSeed: Number.isFinite(Number(body?.randomSeed)) ? Number(body?.randomSeed) : undefined,
        hintAssignments: Object.keys(hintAssignments).length > 0 ? hintAssignments : undefined,
      };
      const controller = new AbortController();
      const timeoutMs = Math.max(60000, solverOptions.timeLimitMs + 30000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const dispatcher = new Agent({
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      let resp;
      let solverData: any = null;
      try {
        resp = await fetch(solverUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
          signal: controller.signal,
          dispatcher,
        });
        solverData = await resp.json();
      } catch (err: any) {
        const timedOut = err?.name === "AbortError";
        const cause = err?.cause;
        const causeInfo = {
          code: cause?.code ?? null,
          message: cause?.message ?? null,
          name: cause?.name ?? null,
        };
        return NextResponse.json({
          error: timedOut ? "Solver remoto no respondió a tiempo." : "No se pudo conectar con el solver remoto.",
          solver: "python",
          constraintsHash,
          solverData: { error: err?.message ?? String(err), cause: causeInfo },
        }, { status: 502 });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!resp.ok || !solverData?.ok) {
        return NextResponse.json({
          error: solverData?.error ?? "Solver remoto fallo.",
          solver: "python",
          constraintsHash,
          teacherConflicts: solverData?.teacherConflicts ?? [],
          subjectDayConflicts: solverData?.subjectDayConflicts ?? [],
          tightLessons: solverData?.tightLessons ?? [],
          tightLessonsBreakdown: solverData?.tightLessonsBreakdown ?? [],
          realAvailability: availabilityChecks.filter((l) => l.domainSize <= 2),
          hybridHints: { used: hybridUsed, count: hybridHintCount },
          solverData,
        }, { status: 400 });
      }
      result = {
        timetableByClase: solverData.timetable ?? {},
        success: Array.isArray(solverData?.unplaced) ? solverData.unplaced.length === 0 : true,
        unplaced: solverData.unplaced ?? [],
        stats: solverData.stats ?? {
          lessonsTotal: lessons.length,
          assigned: lessons.length,
          assignedSlots: 0,
          greedyAssigned: 0,
          backtracks: 0,
          timeMs: 0,
        },
        meta: solverData.debug ?? {},
      };
      result.meta = {
        ...(result.meta ?? {}),
        hybridHints: { used: hybridUsed, count: hybridHintCount },
      };
    } else {
      result = generateTimetable(institucionId, cls, lessons, days, slotsPerDay, solverOptions);
    }
    result.meta = { ...(result.meta ?? {}), constraintsHash };

    const meetingAssignmentMap = new Map<string, number>();
    const rawMeetingAssignments = Array.isArray(result.meta?.meetingAssignments) ? result.meta.meetingAssignments : [];
    for (const m of rawMeetingAssignments) {
      if (m && typeof m.lessonId === "string" && Number.isFinite(m.slot)) {
        meetingAssignmentMap.set(m.lessonId, Number(m.slot));
      }
    }
    for (const [lessonId, info] of meetingInfoByLessonId.entries()) {
      const slot = meetingAssignmentMap.get(lessonId);
      if (typeof slot === "number") {
        meetingAssignments.push({ groupId: info.groupId, label: info.label, slot, teachers: info.teachers });
      } else {
        meetingConflicts.push({ groupId: info.groupId, label: info.label, reason: "sin slot comun disponible" });
      }
    }
    const meetingLessonIds = new Set(meetingLessons.map((l) => l.id));
    const unplaced: string[] = Array.isArray(result.unplaced)
      ? result.unplaced.filter((id: string) => !meetingLessonIds.has(id))
      : [];
    const meetingAssignedCount = meetingAssignments.length;
    const adjustedStats = {
      ...result.stats,
      lessonsTotal: Math.max(0, result.stats.lessonsTotal - meetingLessons.length),
      assigned: Math.max(0, result.stats.assigned - meetingAssignedCount),
    };

    // Map de clases para nombres/abreviaturas
    const claseNameMap = new Map<string, { nombre?: string | null }>();
    for (const c of cls) claseNameMap.set(c.id, { nombre: c.nombre });

    // Normalizar timetable (añadir nombres para UI)
    const normalized: Record<string, Array<any | null>> = {};

    for (const [claseId, arr] of Object.entries(result.timetableByClase)) {
      normalized[claseId] = arr.map((cell: any) => {
        if (!cell) return null;
        const cm = cargaMap.get(cell.cargaId) ?? null;
        return {
          cargaId: cell.cargaId,
          asignaturaId: cm?.asignaturaId ?? cell.asignaturaId ?? null,
          asignaturaNombre: cm?.asignaturaNombre ?? cell.asignaturaId ?? null,
          docenteId: cm?.docenteId ?? cell.docenteId ?? null,
          docenteNombre: cm?.docenteNombre ?? cell.docenteId ?? null,
          claseId: claseId,
          claseNombre: claseNameMap.get(claseId)?.nombre ?? (cell as any)?.claseNombre ?? claseId,
          duracion: cell.duracion ?? cm?.duracion ?? 1,
        };
      });
    }

    const assignedLessonIds = new Set<string>(
      lessons
        .filter((l) => !meetingLessonIds.has(l.id))
        .map((l) => l.id)
        .filter((id) => !unplaced.includes(id))
    );

    // Summary por clase
    const assignedSummary: Record<string, { assignedSlots: number; sample: string | number }> = {};
    for (const c of cls) {
      const arr = normalized[c.id] ?? [];
      const assignedSlots = arr.filter(Boolean).length;
      const first = arr.find((x: any) => x) ?? null;
      const sample = first ? `${first.asignaturaNombre ?? first.asignaturaId} / ${first.docenteNombre ?? first.docenteId}` : "—";
      assignedSummary[c.id] = { assignedSlots, sample };
    }


    // Prepare debug payload: include timetabler meta debug if present
    const unplacedDetails: Record<string, any> = {};
    if (Array.isArray(unplaced) && result.meta?.lessonDebug) {
      for (const lid of unplaced) {
        unplacedDetails[lid] = result.meta.lessonDebug?.[lid] ?? null;
      }
    }

    const unplacedInfo = unplaced.map((lid) => {
      const cargaId = String(lid).split("__")[0];
      const cm = cargaMap.get(cargaId);
      return {
        lessonId: lid,
        cargaId,
        asignatura: cm?.asignaturaNombre ?? cm?.asignaturaId ?? "Asignatura",
        docente: cm?.docenteNombre ?? cm?.docenteId ?? "Sin docente",
        docenteId: cm?.docenteId ?? null,
        clase: (cm?.claseId && claseNameMap.get(cm.claseId)?.nombre) ?? cm?.claseId ?? "Clase",
        duracion: cm?.duracion ?? 1,
      };
    });

    const debugPayload = {
      keys: Object.keys(normalized),
      assignedSummary,
      unplaced,
      unplacedDetails,
      unplacedInfo,
      unplacedCandidates: Array.isArray(result.meta?.unplacedCandidates) ? result.meta.unplacedCandidates : [],
      unplacedBreakdown: Array.isArray(result.meta?.unplacedBreakdown) ? result.meta.unplacedBreakdown : [],
      splitReport: Array.isArray(result.meta?.splitReport) ? result.meta.splitReport : [],
      saturatedClasses: Array.isArray(result.meta?.saturatedClasses) ? result.meta.saturatedClasses : [],
      realAvailability: availabilityChecks.filter((l) => l.domainSize <= 2),
      subjectsExceedAvailableDays: Array.isArray(result.meta?.subjectsExceedAvailableDays)
        ? result.meta.subjectsExceedAvailableDays
        : [],
      lessonsTotal: lessons.length - meetingLessons.length,
      assignedLessonsCount: assignedLessonIds.size,
      cargasTotal: cargas.length,
      timetablerMeta: result.meta ?? null,
      classLoad,
      overCapacityClasses,
      forcedDirector: {
        forcedCount: Object.keys(forcedStarts).length,
        conflicts: forcedConflicts,
        fallbacks: directorFallbacks,
        applied: directorsApplied,
      },
      areaMeetings: {
        assigned: meetingAssignments,
        conflicts: meetingConflicts,
      },
      solver: solverUrl ? "python" : "local",
      constraintsHash,
    };

    return NextResponse.json({
      timetable: normalized,
      stats: adjustedStats,
      unplaced,
      solver: solverUrl ? "python" : "local",
      constraintsHash,
      debug: debugPayload,
    }, { status: 200 });

  } catch (err: any) {
    // noop: mantener consola limpia
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
