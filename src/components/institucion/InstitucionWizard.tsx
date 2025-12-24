"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportadorExcel } from "../importaciones/ImportadorExcel";
//import EstructuraHorario from "./EstructuraHorario";
import type { Institucion as InstitucionType } from "@/types/institucion";
import HorarioView from "./horarios/HorarioView";

/**
 * InstitucionWizard
 *
 * Componente que:
 * - carga las instituciones (GET /api/instituciones)
 * - permite crear una nueva institución (POST /api/instituciones) vía wizard modal
 * - permite importar/preview mediante ImportadorExcel (paso 3)
 * - dispara la generación del timetable (POST /api/timetable/generate)
 * - muestra la EstructuraHorario (componente separado)
 *
 * Nota: adapta las rutas si las tienes diferentes.
 */

export default function InstitucionWizard() {
  // -------------------------
  // Estados principales
  // -------------------------
  const [instituciones, setInstituciones] = useState<InstitucionType[]>([]);
  const [institucionSeleccionada, setInstitucionSeleccionada] = useState<InstitucionType | null>(null);

  // Wizard modal
  const [wizardOpen, setWizardOpen] = useState(false);
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

  // Timetable (resultado del generador)
  const [timetable, setTimetable] = useState<Record<string, Array<any>> | null>(null);
  const [loadingTimetable, setLoadingTimetable] = useState(false);
  const [timetableStats, setTimetableStats] = useState<any | null>(null);

  // -------------------------
  // Efectos (carga inicial)
  // -------------------------
  useEffect(() => {
    // cargar instituciones al montar
    async function fetchInstituciones() {
      try {
        const res = await fetch("/api/instituciones");
        if (!res.ok) throw new Error(`Error al obtener instituciones: ${res.status}`);
        const data = await res.json();
        // Data expected to be array; adapta si responde distinto.
        const mapped: InstitucionType[] = (data || []).map((ins: any) => ({
          id: ins.id,
          nombre: ins.nombre,
          nivel: ins.nivel ?? "Desconocido",
          estadoHorario: ins.estadoHorario ?? "sin-iniciar",
          dias_por_semana: ins.dias_por_semana ?? 5,
          lecciones_por_dia: ins.lecciones_por_dia ?? 7,
          // Mantener cualquier campo extra como clases
          clases: ins.clases ?? [],
        }));
        setInstituciones(mapped);
        setInstitucionSeleccionada(mapped[0] ?? null);
      } catch (err) {
        console.error("fetchInstituciones error:", err);
      }
    }

    fetchInstituciones();
  }, []);

  // Ajustar periodos cuando cambian leccionesPorDia
  useEffect(() => {
    setPeriodos((prev) => {
      if (prev.length === leccionesPorDia) return prev;
      return Array.from({ length: leccionesPorDia }).map((_, i) => prev[i] ?? {
        indice: i + 1,
        abreviatura: String(i + 1),
        hora_inicio: "08:00",
        hora_fin: "08:45",
        duracion_min: 45,
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

      // Construir objeto InstitucionType mínimo para la UI
      const nueva: InstitucionType = {
      id: data.institucion.id,
  nombre: data.institucion.nombre,
  nivel: cicloEscolar,
  cicloEscolar: cicloEscolar, // Agregado
  estadoHorario: "sin-iniciar",
  dias_por_semana: diasPorSemana,
  diasPorSemana: diasPorSemana, // Agregado
  lecciones_por_dia: leccionesPorDia,
  leccionesPorDia: leccionesPorDia, // Agregado
  clases: [] // Inicializamos como array vacío
      };

      // Prepend a la lista y seleccionar
      setInstituciones((prev) => [nueva, ...prev]);
      setInstitucionSeleccionada(nueva);

      // Reset flags de import
      setImportPreviewLoaded(false);
      setImportPersisted(false);

      return nueva;
    } catch (err: any) {
      console.error("crearInstitucionServidor error ->", err);
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
        body: JSON.stringify({ institucionId: institucionSeleccionada.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);

      // Esperamos data.timetable -> Record<claseId, array de celdas>
      setTimetable(data.timetable ?? null);
      setTimetableStats(data.stats ?? null);
    } catch (err: any) {
      console.error("handleGenerateTimetable error:", err);
      alert("No se pudo generar el horario: " + (err.message || err));
    } finally {
      setLoadingTimetable(false);
    }
  }

  // -------------------------
  // UI helpers / memo
  // -------------------------
  // Map id -> { id, nombre } (usado por EstructuraHorario para mostrar nombre por id)
  const classesMap = useMemo(() => {
    const map: Record<string, { id: string; nombre: string }> = {};
    for (const c of institucionSeleccionada?.clases ?? []) {
      // Asegurarse que la clase tiene id y nombre
      if (c?.id) {
        map[c.id] = { id: c.id, nombre: c.nombre ?? String(c.id) };
      }
    }
    return map;
  }, [institucionSeleccionada?.clases]);

  // Badge helper
  const badgeForEstado = (estado: InstitucionType["estadoHorario"]) => {
    if (estado === "creado") return <Badge>Creado</Badge>;
    if (estado === "en-progreso") return <Badge>En progreso</Badge>;
    return <Badge variant="outline">Sin iniciar</Badge>;
  };

  // -------------------------
  // Wizard handlers
  // -------------------------
  const handleNext = async () => {
    if (step === 1) return setStep(2);

    if (step === 2) {
      if (!nombreEscuela.trim()) { alert("El nombre de la escuela es requerido"); return; }
      if (!cicloEscolar.trim()) { alert("El ciclo escolar es requerido"); return; }
      const nueva = await crearInstitucionServidor();
      if (nueva) setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

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
      {/* Sidebar simple */}
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
                      // reset timetable if institution changes
                      setTimetable(null);
                      setTimetableStats(null);
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
          <h1 className="text-2xl font-bold mb-4">Dashboard de Institución</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Institución seleccionada */}
            <Card>
              <CardHeader>
                <CardTitle>Institución seleccionada</CardTitle>
                <CardDescription>{institucionSeleccionada?.nombre ?? "Ninguna"}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Nivel: {institucionSeleccionada?.nivel ?? "-"}</p>
                <p className="text-sm text-muted-foreground">
                  Días: {institucionSeleccionada?.dias_por_semana ?? "-"} • Lecciones: {institucionSeleccionada?.lecciones_por_dia ?? "-"}
                </p>
              </CardContent>
              <CardFooter>
                <Button onClick={() => setWizardOpen(true)}>Configurar / Reconfigurar</Button>
              </CardFooter>
            </Card>

            {/* Importador */}
            <Card>
              <CardHeader>
                <CardTitle>Importar datos</CardTitle>
                <CardDescription>Docentes, clases, asignaturas y carga académica</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Sube el Excel siguiendo la plantilla</p>
              </CardContent>
              <CardFooter>
                {institucionSeleccionada ? (
                  <ImportadorExcel
                    institucionId={institucionSeleccionada.id}
                    onPreviewLoaded={() => { setImportPreviewLoaded(true); setImportPersisted(false); }}
                    onPersisted={() => { setImportPreviewLoaded(true); setImportPersisted(true); }}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Selecciona una institución para importar</div>
                )}
              </CardFooter>
            </Card>

            {/* Estado y generación */}
            <Card>
              <CardHeader>
                <CardTitle>Estado del horario</CardTitle>
                <CardDescription>Progreso y acciones</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{institucionSeleccionada?.estadoHorario ?? "-"}</p>
              </CardContent>
              <CardFooter>
                <div className="flex items-center gap-4 w-full">
                  <Button
                    disabled={!institucionSeleccionada || loadingTimetable}
                    onClick={handleGenerateTimetable}
                  >
                    {loadingTimetable ? "Generando..." : "Generar horario"}
                  </Button>

                  {timetableStats && (
                    <div className="text-sm text-muted-foreground">
                      {timetableStats.assigned}/{timetableStats.lessonsTotal} asignadas • backtracks: {timetableStats.backtracks}
                    </div>
                  )}
                </div>
              </CardFooter>
            </Card>
          </div>

          {/* Estructura del horario (componente separado) */}
          <HorarioView
            institucion={institucionSeleccionada}
            timetableByClase={timetable ?? undefined}
            onGenerate={handleGenerateTimetable} // opcional: ya tienes la función
          />
        </div>
      </main>

      {/* Wizard modal: creado/config/importar */}
      <Dialog
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) {
            // reset wizard state when closed
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
            {/* Header */}
            <div className="p-6 border-b">
              <DialogHeader>
                <DialogTitle className="text-lg">Crear nueva institución</DialogTitle>
                <DialogDescription className="text-sm">Asistente de 3 pasos para configurar la institución y subir los datos.</DialogDescription>
              </DialogHeader>
              <div className="mt-2 text-sm text-muted-foreground">Paso {step} de 3</div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6 modal-body">
              {/* Step 1 */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Bienvenido: este asistente te guiará para crear la institución, definir los periodos y subir el Excel.
                  </p>
                </div>
              )}

              {/* Step 2: Configuración */}
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
                          <Input type="number" value={p.duracion_min} onChange={(e) => setPeriodos((prev) => prev.map((x, i) => i === idx ? { ...x, duracion_min: Number(e.target.value) } : x))} className="w-24" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Importador */}
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

            {/* Footer */}
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
    </div>
  );
}
