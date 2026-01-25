"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportadorExcel } from "../importaciones/ImportadorExcel";
import type { Institucion as InstitucionType } from "@/types/institucion";
import HorarioView from "./horarios/HorarioView";
import type { TimetableCell } from "@/lib/timetabler"; // <-- usar el tipo canonical
import EditInstitucionModal from "./EditInstitucionModal";

export default function InstitucionWizard() {
  // -------------------------
  // Estados principales
  // -------------------------
  const [instituciones, setInstituciones] = useState<InstitucionType[]>([]);
  const [institucionSeleccionada, setInstitucionSeleccionada] = useState<InstitucionType | null>(null);

  // Wizard modal
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Paso 2 - configuración
  const [nombreEscuela, setNombreEscuela] = useState("");
  const [cicloEscolar, setCicloEscolar] = useState("");
  const [leccionesPorDia, setLeccionesPorDia] = useState<number>(7);
  const [diasPorSemana, setDiasPorSemana] = useState<number>(5);
  const [periodos, setPeriodos] = useState(() =>
    Array.from({ length: 7 }).map((_, i) => ({
      indice: i + 1,
      abreviatura: String(i + 1),
      hora_inicio: "08:00",
      hora_fin: "08:45",
      duracion_min: 45,
    }))
  );

  // Import/preview flags para el paso 3
  const [importPreviewLoaded, setImportPreviewLoaded] = useState(false);
  const [importPersisted, setImportPersisted] = useState(false);

  // Timetable (resultado del generador) TIPADO correctamente
  const [timetable, setTimetable] = useState<Record<string, Array<TimetableCell | null>> | null>(null);
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [timetableStats, setTimetableStats] = useState<any | null>(null);
  const [horarioId, setHorarioId] = useState<string | null>(null);
  const [horarioCreatedAt, setHorarioCreatedAt] = useState<string | null>(null);
  const [lastUnplacedIds, setLastUnplacedIds] = useState<string[]>([]);
  const [lastUnplacedTeacherIds, setLastUnplacedTeacherIds] = useState<string[]>([]);
  const [bestAssignedCount, setBestAssignedCount] = useState<number | null>(null);
  const [lastConstraintsHash, setLastConstraintsHash] = useState<string | null>(null);

  // NUEVO: metadatos / debug del timetabler (se muestran en la UI)
  const [timetableMeta, setTimetableMeta] = useState<any | null>(null);

  // -------------------------
  // Efectos (carga inicial)
  // -------------------------
  async function fetchInstituciones() {
    try {
      const res = await fetch("/api/instituciones");
      if (!res.ok) throw new Error(`Error al obtener instituciones: ${res.status}`);
      const data = await res.json();
      const mapped: InstitucionType[] = (data || []).map((ins: any) => ({
          id: ins.id,
          nombre: ins.nombre,
          nivel: ins.nivel ?? "Desconocido",
          estadoHorario: ins.estadoHorario ?? "sin-iniciar",
          dias_por_semana: ins.dias_por_semana ?? 5,
          lecciones_por_dia: ins.lecciones_por_dia ?? 7,
          periodos: Array.isArray(ins.periodos) ? ins.periodos : [],
          clases: Array.isArray(ins.clases)
            ? ins.clases.map((c: any) => ({
                id: c.id,
                nombre: c.nombre ?? c.abreviatura ?? String(c.id),
                abreviatura: c.abreviatura ?? "",
                institucionId: c.institucionId ?? ins.id,
              }))
            : [],
          docentes: Array.isArray(ins.docentes)
            ? ins.docentes.map((d: any) => ({ id: d.id, nombre: d.nombre ?? String(d.id), abreviatura: d.abreviatura ?? "" }))
            : [],
          asignaturas: Array.isArray(ins.asignaturas)
            ? ins.asignaturas.map((a: any) => ({ id: a.id, nombre: a.nombre ?? String(a.id), abreviatura: a.abreviatura ?? "" }))
            : [],
          cargas: Array.isArray(ins.cargas)
            ? ins.cargas.map((c: any) => ({ id: c.id, asignaturaId: c.asignaturaId, claseId: c.claseId, docenteId: c.docenteId ?? null }))
            : [],
      }));
      setInstituciones(mapped);
      setInstitucionSeleccionada((prev) => {
        if (!prev) return mapped[0] ?? null;
        return mapped.find((i) => i.id === prev.id) ?? mapped[0] ?? null;
      });
    } catch (err) {
      // noop: mantener consola limpia
    }
  }

  useEffect(() => {
    fetchInstituciones();
  }, []);

  useEffect(() => {
    setLastUnplacedIds([]);
    setLastUnplacedTeacherIds([]);
    setBestAssignedCount(null);
    setLastConstraintsHash(null);
  }, [institucionSeleccionada?.id]);

  async function handleInstitucionDeleted() {
    setInstitucionSeleccionada(null);
    setTimetable(null);
    setTimetableStats(null);
    setTimetableMeta(null);
    setHorarioId(null);
    setHorarioCreatedAt(null);
    setLastConstraintsHash(null);
    setLastUnplacedIds([]);
    setLastUnplacedTeacherIds([]);
    await fetchInstituciones();
  }

  async function fetchLatestHorario(institucionId: string) {
    try {
      const res = await fetch(`/api/timetable/latest?institucionId=${encodeURIComponent(institucionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const returnedTimetable = (data && typeof data === "object" && data.timetable && typeof data.timetable === "object")
        ? (data.timetable as Record<string, Array<TimetableCell | null>>)
        : null;
      if (returnedTimetable && Object.keys(returnedTimetable).length > 0) {
        setTimetable(returnedTimetable);
        setTimetableStats(data?.stats ?? null);
        setHorarioId(typeof data?.horarioId === "string" ? data.horarioId : null);
        setHorarioCreatedAt(typeof data?.createdAt === "string" ? data.createdAt : null);
        if (data?.areaMeetings) {
          setTimetableMeta({ areaMeetings: data.areaMeetings });
        } else {
          setTimetableMeta(null);
        }
      }
    } catch (err) {
      // noop: mantener consola limpia
    }
  }

  useEffect(() => {
    if (!institucionSeleccionada?.id) return;
    if (timetable) return;
    fetchLatestHorario(institucionSeleccionada.id);
  }, [institucionSeleccionada?.id, timetable]);

  // Ajustar periodos cuando cambian leccionesPorDia
  useEffect(() => {
    const startMinutes = 6 * 60; // 06:00
    const dur = 60; // minutos por defecto (1 hora)
    const toHHMM = (m: number) => {
      const hh = Math.floor(m / 60).toString().padStart(2, "0");
      const mm = (m % 60).toString().padStart(2, "0");
      return `${hh}:${mm}`;
    };
    setPeriodos((prev) => {
      return Array.from({ length: leccionesPorDia }).map((_, i) => {
        const ini = startMinutes + i * dur;
        const fin = ini + dur;
        const base = {
          indice: i + 1,
          abreviatura: String(i + 1),
          hora_inicio: toHHMM(ini),
          hora_fin: toHHMM(fin),
          duracion_min: dur,
        };
        const existing = prev[i];
        // Si el periodo existente solo tiene los defaults 08:00-08:45, remplaza; si el usuario ya editó, conserva.
        if (!existing) return base;
        const looksDefault =
          (!existing.hora_inicio && !existing.hora_fin) ||
          (existing.hora_inicio === "08:00" && existing.hora_fin === "08:45") ||
          (existing.hora_inicio === "06:00" && existing.hora_fin === "06:45");
        if (looksDefault) return { ...existing, ...base };
        return existing;
      });
    });
  }, [leccionesPorDia]);

  // -------------------------
  // Helpers: fetch / create / generate
  // -------------------------
  async function crearInstitucionServidor(): Promise<InstitucionType | null> {
    try {
      const payload = {
        nombre: nombreEscuela,
        ciclo_escolar: cicloEscolar,
        dias_por_semana: diasPorSemana,
        lecciones_por_dia: leccionesPorDia,
        periodos,
      };
      const res = await fetch("/api/instituciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : null;

      if (!res.ok) {
        const message = data?.error ?? `Status ${res.status}`;
        throw new Error(message);
      }

      const nueva: InstitucionType = {
        id: data.institucion.id,
        nombre: data.institucion.nombre,
        nivel: cicloEscolar,
        cicloEscolar: cicloEscolar,
        estadoHorario: "sin-iniciar",
        dias_por_semana: diasPorSemana,
        diasPorSemana: diasPorSemana,
        lecciones_por_dia: leccionesPorDia,
        leccionesPorDia: leccionesPorDia,
        periodos: Array.isArray(data?.institucion?.periodos) ? data.institucion.periodos : periodos,
        clases: [],
        docentes: [],
        asignaturas: [],
        cargas: [],
      };

      setInstituciones((prev) => [nueva, ...prev]);
      setInstitucionSeleccionada(nueva);

      setImportPreviewLoaded(false);
      setImportPersisted(false);

      return nueva;
    } catch (err: any) {
      // noop: mantener consola limpia
      alert("No se pudo crear la institución: " + (err.message || "Error desconocido"));
      return null;
    }
  }

  async function handleGenerateTimetable() {
    if (!institucionSeleccionada) {
      alert("Selecciona una institución antes de generar el horario.");
      return;
    }

    setLoadingTimetable(true);

    try {
      const res = await fetch("/api/timetable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institucionId: institucionSeleccionada.id,
          repairIterations: 1200,
          repairSampleSize: 12,
          repairMaxConflicts: 4,
          repairCandidateStarts: 40,
          targetedReoptSize: 8,
          targetedReoptMaxAttempts: 2,
          timeLimitMs: 240000,
          maxRestarts: 4,
          hybridSolve: true,
          directorWindowMode: "first-two",
          priorityLessonIds: lastUnplacedIds.length > 0 ? lastUnplacedIds : undefined,
          priorityTeacherIds: lastUnplacedTeacherIds.length > 0 ? lastUnplacedTeacherIds : undefined,
          hintTimetable: timetable ?? undefined,
          hintConstraintsHash: lastConstraintsHash ?? undefined,
        }),
      });

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      let data: any = null;

      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch (jsonErr) {
          // noop: mantener consola limpia
          const txt = await res.text();
          try {
            data = JSON.parse(txt);
          } catch {
            data = txt;
          }
        }
      } else {
        const txt = await res.text();
        try {
          data = JSON.parse(txt);
        } catch {
          data = txt;
        }
      }

      console.log("generate response (raw):", data, "status:", res.status, "content-type:", contentType);

      if (!res.ok) {
        let message = `Status ${res.status}`;
        if (data != null) {
          if (typeof data === "object") {
            if (data.error) message = String(data.error);
            else if (data.message) message = String(data.message);
            else if (data.errors) {
              if (Array.isArray(data.errors)) message = data.errors.join("; ");
              else message = String(data.errors);
            } else {
              try { message = JSON.stringify(data).slice(0, 1000); } catch { message = String(data); }
            }
          } else {
            message = String(data).slice(0, 1000);
          }
        }
        if (Array.isArray((data as any)?.teacherConflicts)) {
          const details = (data as any).teacherConflicts
            .slice(0, 6)
            .map((c: any) => {
              const subjects = Array.isArray(c.subjects) && c.subjects.length > 0 ? ` (${c.subjects.join(", ")})` : "";
              return `${c.docenteNombre ?? c.docenteId}: requiere ${c.required}, disponible ${c.available}${subjects}`;
            })
            .join(" | ");
          message = `${message} ${details}`;
        }
        if (Array.isArray((data as any)?.subjectDayConflicts)) {
          const details = (data as any).subjectDayConflicts
            .slice(0, 6)
            .map((c: any) => {
              const clase = c.claseNombre ?? c.claseId ?? "";
              const slotsNeeded = typeof c.slotsNeeded === "number" ? c.slotsNeeded : c.sesiones;
              const maxSlots = typeof c.maxSlots === "number" ? c.maxSlots : c.diasDisponibles;
              return `${c.docenteNombre ?? c.docenteId} ${c.asignatura} ${clase}: ${slotsNeeded} slots > ${maxSlots} max`;
            })
            .join(" | ");
          message = `${message} ${details}`;
        }
        if (Array.isArray((data as any)?.overCapacityClasses)) {
          const classMap = new Map<string, string>();
          (institucionSeleccionada?.clases ?? []).forEach((c: any) => {
            classMap.set(c.id, c.nombre ?? c.abreviatura ?? c.id);
          });
          const details = (data as any).overCapacityClasses
            .slice(0, 10)
            .map((c: any) => {
              const name = classMap.get(c.claseId) ?? c.claseId;
              return `${name} (deficit ${c.deficit})`;
            })
            .join(", ");
          message = `Carga académica supera la capacidad. ${details}`;
        }
        if (
          Array.isArray((data as any)?.teacherConflicts) ||
          Array.isArray((data as any)?.subjectDayConflicts) ||
          Array.isArray((data as any)?.tightLessons) ||
          Array.isArray((data as any)?.tightLessonsBreakdown)
        ) {
          setTimetableMeta({
            teacherConflicts: Array.isArray((data as any)?.teacherConflicts) ? (data as any).teacherConflicts : [],
            subjectDayConflicts: Array.isArray((data as any)?.subjectDayConflicts) ? (data as any).subjectDayConflicts : [],
            tightLessons: Array.isArray((data as any)?.tightLessons) ? (data as any).tightLessons : [],
            tightLessonsBreakdown: Array.isArray((data as any)?.tightLessonsBreakdown) ? (data as any).tightLessonsBreakdown : [],
            solver: (data as any).solver ?? null,
          });
        }
        throw new Error(message);
      }

      const returnedTimetable = (data && typeof data === "object" && data.timetable && typeof data.timetable === "object")
        ? (data.timetable as Record<string, Array<TimetableCell | null>>)
        : (data?.timetable === null ? {} : (data?.timetable ?? {}));
      const nextAssigned = typeof data?.stats?.assigned === "number" ? data.stats.assigned : null;

      const shouldReplaceTimetable = bestAssignedCount === null || (nextAssigned !== null && nextAssigned >= bestAssignedCount);
      if (shouldReplaceTimetable) {
        setTimetable(returnedTimetable);
      }

      // Agrega conteo de no asignadas para mostrarlo rápido en UI
      const unplacedFromServer = Array.isArray(data?.unplaced) ? data.unplaced : (Array.isArray(data?.debug?.unplaced) ? data.debug.unplaced : []);
      if (shouldReplaceTimetable) {
        setTimetableStats(data?.stats ? { ...data.stats, unplacedCount: unplacedFromServer.length } : null);
      }
      setLastUnplacedIds(Array.isArray(unplacedFromServer) ? unplacedFromServer : []);
      const unplacedInfo = Array.isArray(data?.debug?.unplacedInfo) ? data.debug.unplacedInfo : [];
      const teacherIds = unplacedInfo
        .map((info: any) => info?.docenteId)
        .filter((id: any) => typeof id === "string" && id.length > 0);
      setLastUnplacedTeacherIds(teacherIds);
      if (shouldReplaceTimetable) {
        setHorarioId(null);
        setHorarioCreatedAt(null);
      }

      // ---------- NUEVO: extraer metadatos / debug ----------
      const metaCandidate = data?.debug
        ? { ...data.debug, timetablerMeta: data.debug.timetablerMeta ?? data?.meta ?? null }
        : (data?.meta ?? data?.debug?.timetablerMeta ?? null);
      if (shouldReplaceTimetable) {
        setTimetableMeta(metaCandidate);
        const nextHash = typeof data?.constraintsHash === "string"
          ? data.constraintsHash
          : (typeof data?.debug?.constraintsHash === "string" ? data.debug.constraintsHash : null);
        setLastConstraintsHash(nextHash);
      }
      void metaCandidate;
      if (data?.debug) {
        if (Array.isArray(data.debug?.realAvailability)) {
          console.log("debug.realAvailability:", data.debug.realAvailability);
        }
        const unplacedIds = Array.isArray(data.debug?.unplaced) ? data.debug.unplaced : [];
        const cargaIds = Array.from(
          new Set(
            unplacedIds
              .map((id: any) => String(id).split("__")[0])
              .filter((id: string) => id.length > 0)
          )
        );
        if (cargaIds.length > 0) {
          await fetch("/api/debug/cargas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: cargaIds }),
          });
        }
      }
      if (nextAssigned !== null && (bestAssignedCount === null || nextAssigned > bestAssignedCount)) {
        setBestAssignedCount(nextAssigned);
      }
      if (!shouldReplaceTimetable && bestAssignedCount !== null && nextAssigned !== null) {
        alert(`Se generó un horario con ${nextAssigned} asignadas, pero se mantiene el mejor (${bestAssignedCount}).`);
      }
      alert("Horario generado correctamente.");
    } catch (err: any) {
      // noop: mantener consola limpia
      alert("No se pudo generar el horario: " + (err?.message ?? String(err)));
    } finally {
      setLoadingTimetable(false);
    }
  }

  async function handleSaveTimetable() {
    if (!institucionSeleccionada) {
      alert("Selecciona una institución antes de guardar el horario.");
      return;
    }
    if (!timetable || Object.keys(timetable).length === 0) {
      alert("Primero genera un horario antes de guardar.");
      return;
    }

    setLoadingTimetable(true);
    try {
      const res = await fetch("/api/timetable/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institucionId: institucionSeleccionada.id,
          timetable,
          areaMeetings: timetableMeta?.areaMeetings ?? null,
          stats: timetableStats ?? null,
        }),
      });

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const data = contentType.includes("application/json") ? await res.json() : await res.text();

      if (!res.ok) {
        const message = typeof data === "object" && data?.error ? String(data.error) : String(data);
        throw new Error(message || `Status ${res.status}`);
      }

      setHorarioId(typeof data?.horarioId === "string" ? data.horarioId : null);
      setHorarioCreatedAt(typeof data?.createdAt === "string" ? data.createdAt : null);
      alert("Horario guardado correctamente.");
    } catch (err: any) {
      // noop: mantener consola limpia
      alert("No se pudo guardar el horario: " + (err?.message ?? String(err)));
    } finally {
      setLoadingTimetable(false);
    }
  }

  // -------------------------
  // UI helpers / memo
  // -------------------------
  const classesMap = useMemo(() => {
    const map: Record<string, { id: string; nombre: string }> = {};
    for (const c of institucionSeleccionada?.clases ?? []) {
      if (c?.id) {
        map[c.id] = { id: c.id, nombre: c.nombre ?? String(c.id) };
      }
    }
    return map;
  }, [institucionSeleccionada?.clases]);

  const badgeForEstado = (estado: InstitucionType["estadoHorario"]) => {
    if (estado === "creado") return <Badge>Creado</Badge>;
    if (estado === "en-progreso") return <Badge>En progreso</Badge>;
    return <Badge variant="outline">Sin iniciar</Badge>;
  };

  const handleNext = async () => {
    if (step === 1) return setStep(2);
    if (step === 2) {
      if (!nombreEscuela.trim()) { alert("El nombre de la escuela es requerido"); return; }
      if (!cicloEscolar.trim()) { alert("El ciclo escolar es requerido"); return; }
      const nueva = await crearInstitucionServidor();
      if (nueva) setStep(3);
    }
  };

  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const handleFooterPrimary = async () => {
    if (step === 3) {
      if (!importPreviewLoaded) {
        const ok = confirm("Aún no ha previsualizado. ¿Desea cerrar el asistente sin previsualizar/importar?");
        if (!ok) return;
      } else if (!importPersisted) {
        const ok = confirm("Ha previsualizado pero no ha guardado en servidor. ¿Finalizar sin guardar?");
        if (!ok) return;
      }
      setWizardOpen(false);
      setStep(1);
      setImportPreviewLoaded(false);
      setImportPersisted(false);
      return;
    }
    await handleNext();
  };

  // -------------------------
  // Render
  // -------------------------
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r">
        <div className="p-4 border-b">Menu</div>
        <div className="p-4 space-y-2">
          <Button onClick={() => setWizardOpen(true)}>Crear institución</Button>

          <div className="mt-4">
            <h4 className="text-sm font-medium">Instituciones</h4>
            <ul className="space-y-2 mt-2">
              {instituciones.map((ins) => (
                <li key={ins.id}>
                  <button
                    className="w-full text-left p-2 rounded hover:bg-muted/50"
                    onClick={() => {
                      setInstitucionSeleccionada(ins);
                      setImportPreviewLoaded(false);
                      setImportPersisted(false);
                      setTimetable(null);
                      setTimetableStats(null);
                      setTimetableMeta(null);
                      setHorarioId(null);
                      setHorarioCreatedAt(null);
                      setLastConstraintsHash(null);
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span>{ins.nombre}</span>
                      <span className="ml-2">{badgeForEstado(ins.estadoHorario)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{ins.nivel}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Institución</h1>
              <p className="text-sm text-muted-foreground">Resumen y acciones rápidas para la institución activa.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setEditOpen(true)}
                disabled={!institucionSeleccionada}
              >
                Editar institución
              </Button>
             
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 mb-6">
            <Card className="flex-1 lg:max-w-4xl">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{institucionSeleccionada?.nombre ?? "Selecciona una institución"}</CardTitle>
                    <CardDescription>{institucionSeleccionada?.nivel ?? "—"}</CardDescription>
                  </div>
                  {institucionSeleccionada && badgeForEstado(institucionSeleccionada.estadoHorario)}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                <div className="rounded-md border px-3 py-2 min-w-[96px]">
                  <p className="text-[11px] text-muted-foreground uppercase">Días/sem</p>
                  <p className="text-base font-semibold">{institucionSeleccionada?.dias_por_semana ?? "—"}</p>
                </div>
                <div className="rounded-md border px-3 py-2 min-w-[96px]">
                  <p className="text-[11px] text-muted-foreground uppercase">Lecciones/día</p>
                  <p className="text-base font-semibold">{institucionSeleccionada?.lecciones_por_dia ?? "—"}</p>
                </div>
                <div className="rounded-md border px-3 py-2 min-w-[96px]">
                  <p className="text-[11px] text-muted-foreground uppercase">Clases</p>
                  <p className="text-base font-semibold">{institucionSeleccionada?.clases?.length ?? 0}</p>
                </div>
                <div className="rounded-md border px-3 py-2 min-w-[120px]">
                  <p className="text-[11px] text-muted-foreground uppercase">Horario</p>
                  <p className="text-base font-semibold">
                    {timetableStats ? `${timetableStats.assigned}/${timetableStats.lessonsTotal}` : "—"}
                  </p>
                  {timetableStats && (
                    <p className="text-[11px] text-muted-foreground">
                      {typeof timetableStats.unplacedCount === "number" ? `Sin asignar: ${timetableStats.unplacedCount}` : ""}
                      {` • slots: ${timetableStats.assignedSlots ?? "—"}`}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex flex-col items-end gap-2">
                  <Button
                    size="sm"
                    disabled={!institucionSeleccionada || loadingTimetable}
                    onClick={() => handleGenerateTimetable()}
                  >
                    {loadingTimetable ? "Generando..." : "Generar horario"}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!institucionSeleccionada || loadingTimetable || !timetable}
                      onClick={handleSaveTimetable}
                    >
                      Guardar horario
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      {horarioId ? "Guardado" : "No guardado"}
                    </span>
                  </div>
                  {horarioCreatedAt && (
                    <span className="text-[11px] text-muted-foreground">
                      {`Último guardado: ${new Date(horarioCreatedAt).toLocaleString("es-CO")}`}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>Importar datos</CardTitle>
                <CardDescription>
                  Actualiza docentes, clases, asignaturas y cargas para la institución seleccionada.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Sube el Excel usando la plantilla. Los datos se aplicarán a esta institución.</p>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {institucionSeleccionada ? (
                  <ImportadorExcel
                    institucionId={institucionSeleccionada.id}
                    onPreviewLoaded={() => { setImportPreviewLoaded(true); setImportPersisted(false); }}
                    onPersisted={async () => {
                      setImportPreviewLoaded(true);
                      setImportPersisted(true);
                      await fetchInstituciones();
                    }}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Selecciona una institución para importar</div>
                )}
                {importPreviewLoaded && (
                  <Badge variant={importPersisted ? "default" : "secondary"}>
                    {importPersisted ? "Datos guardados" : "Previsualización cargada"}
                  </Badge>
                )}
              </CardFooter>
            </Card>
          </div>

          <HorarioView
            institucion={institucionSeleccionada}
            timetableByClase={timetable ?? undefined}
            onGenerate={handleGenerateTimetable}
            // NUEVO: prop con metadatos/diagnóstico que pasamos a las vistas de horarios
            timetablerMeta={timetableMeta}
          />
        </div>
      </main>

      {/* Wizard modal */}
      <Dialog
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) {
            setStep(1);
            setImportPreviewLoaded(false);
            setImportPersisted(false);
          }
        }}
      >
        <DialogContent
          className="max-w-[1400px] sm:max-w-[1400px] w-[98vw] h-[92vh] p-0 overflow-hidden rounded-lg"
          style={{ boxShadow: "0 12px 30px rgba(0,0,0,0.15)" }}
        >
          <div className="flex flex-col h-full">
            <div className="p-6 border-b">
              <DialogHeader>
                <DialogTitle className="text-lg">Crear nueva institución</DialogTitle>
                <DialogDescription className="text-sm">Asistente de 3 pasos para configurar la institución y subir el Excel.</DialogDescription>
              </DialogHeader>
              <div className="mt-2 text-sm text-muted-foreground">Paso {step} de 3</div>
            </div>

            <div className="flex-1 overflow-auto p-6 modal-body">
              {/* ... contenido wizard (igual que antes) ... */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Bienvenido: este asistente te guiará para crear la institución, definir los periodos y subir el Excel.</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 max-w-full">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <Label>Nombre de la escuela</Label>
                      <Input value={nombreEscuela} onChange={(e) => setNombreEscuela(e.target.value)} placeholder="Ej: Colegio San Martín" />
                    </div>
                    <div>
                      <Label>Ciclo escolar</Label>
                      <Input value={cicloEscolar} onChange={(e) => setCicloEscolar(e.target.value)} placeholder="Ej: 2025" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label>Lecciones por día</Label>
                      <Input type="number" value={leccionesPorDia} onChange={(e) => setLeccionesPorDia(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label>Días por semana</Label>
                      <Select value={String(diasPorSemana)} onValueChange={(v) => setDiasPorSemana(Number(v))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 (Lun-Vie)</SelectItem>
                          <SelectItem value="6">6 (Lun-Sáb)</SelectItem>
                          <SelectItem value="7">7 (Lun-Dom)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Timbres / Periodos (editar)</Label>
                    <div className="mt-2 grid gap-2 max-h-72 overflow-auto p-2 border rounded">
                      {periodos.map((p, idx) => (
                        <div key={p.indice} className="flex items-center gap-2">
                          <div className="w-8 text-center">{p.indice}</div>
                          <Input value={p.abreviatura} onChange={(e) => setPeriodos((prev) => prev.map((x, i) => i === idx ? { ...x, abreviatura: e.target.value } : x))} />
                          <Input value={p.hora_inicio} onChange={(e) => setPeriodos((prev) => prev.map((x, i) => i === idx ? { ...x, hora_inicio: e.target.value } : x))} className="w-28" />
                          <Input value={p.hora_fin} onChange={(e) => setPeriodos((prev) => prev.map((x, i) => i === idx ? { ...x, hora_fin: e.target.value } : x))} className="w-28" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="p-4 border rounded max-h-[60vh] overflow-auto">
                    {institucionSeleccionada ? (
                      <ImportadorExcel
                        institucionId={institucionSeleccionada.id}
                        onPreviewLoaded={() => { setImportPreviewLoaded(true); setImportPersisted(false); }}
                        onPersisted={() => { setImportPreviewLoaded(true); setImportPersisted(true); }}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">Primero guarda la configuración en el paso anterior.</div>
                    )}
                  </div>

                  <div className="p-4 border rounded max-h-[60vh] overflow-auto bg-surface">
                    <h4 className="font-semibold mb-2">Panel de soporte</h4>
                    <div className="text-sm text-muted-foreground mb-4">
                      Aquí se mostrará el resumen del preview, errores y recomendaciones.
                    </div>
                    <div className="mb-4">
                      <h5 className="font-medium">Checklist</h5>
                      <ul className="list-disc pl-5 text-sm mt-2">
                        <li>Previsualizar archivo</li>
                        <li>Revisar y corregir datos en preview</li>
                        <li>Guardar local si desea continuar después</li>
                        <li>Persistir para finalizar</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium">Estado actual</h5>
                      <div className="mt-2">
                        <div className="text-sm">Previsualizado: <strong>{importPreviewLoaded ? "Sí" : "No"}</strong></div>
                        <div className="text-sm">Persistido: <strong>{importPersisted ? "Sí" : "No"}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-background flex justify-between">
              <div>
                {step > 1 && <Button variant="outline" onClick={handleBack}>Atrás</Button>}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  const hasWorkNotSaved = step === 3 && importPreviewLoaded && !importPersisted;
                  if (hasWorkNotSaved) {
                    const ok = confirm("Hay una previsualización no persistida. ¿Desea cancelar y perder los cambios?");
                    if (!ok) return;
                  }
                  setWizardOpen(false);
                  setStep(1);
                  setImportPreviewLoaded(false);
                  setImportPersisted(false);
                }}>Cancelar</Button>

                <Button onClick={handleFooterPrimary}>{step === 3 ? "Finalizar" : "Siguiente"}</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditInstitucionModal
        open={editOpen}
        onOpenChange={setEditOpen}
        institucion={institucionSeleccionada}
        onUpdated={fetchInstituciones}
        onDeleted={handleInstitucionDeleted}
      />
    </div>
  );
}
