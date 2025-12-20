"use client";

import React, { useEffect, useState } from "react";
import { BarraLateral } from "@/components/barra-lateral";
import { PanelControl } from "@/components/panel-control";
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportadorExcel } from "../importaciones/ImportadorExcel";

export type Institucion = {
  id: string;
  nombre: string;
  nivel: string;
  estadoHorario: "creado" | "en-progreso" | "sin-iniciar";
  dias_por_semana?: number;
  lecciones_por_dia?: number;
};

export default function InstitucionWizard() {
  // Estado global de instituciones
  const [instituciones, setInstituciones] = useState<Institucion[]>([]);
  const [institucionSeleccionada, setInstitucionSeleccionada] = useState<Institucion | null>(null);

  // Wizard modal state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Paso 2 (configuracion)
  const [nombreEscuela, setNombreEscuela] = useState("");
  const [cicloEscolar, setCicloEscolar] = useState("");
  const [leccionesPorDia, setLeccionesPorDia] = useState(7);
  const [diasPorSemana, setDiasPorSemana] = useState(5);
  const [periodos, setPeriodos] = useState(() =>
    Array.from({ length: 7 }).map((_, i) => ({
      indice: i + 1,
      abreviatura: String(i + 1),
      hora_inicio: "08:00",
      hora_fin: "08:45",
      duracion_min: 45,
    }))
  );

  // Import/preview flags
  const [importPreviewLoaded, setImportPreviewLoaded] = useState(false);
  const [importPersisted, setImportPersisted] = useState(false);
  const [previewCargado, setPreviewCargado] = useState(false);

  // Cargar instituciones desde API al montar
  useEffect(() => {
    async function cargarInstituciones() {
      try {
        const res = await fetch("/api/instituciones");
        if (!res.ok) throw new Error("Error al obtener instituciones");
        const data = await res.json();

        const institucionesServer: Institucion[] = data.map((ins: any) => ({
          id: ins.id,
          nombre: ins.nombre,
          nivel: ins.nivel || "Desconocido",
          
          estadoHorario: ins.estadoHorario || "sin-iniciar",
          dias_por_semana: ins.dias_por_semana || 5,
          lecciones_por_dia: ins.lecciones_por_dia || 7,
          clases: ins.clases || [],
        }));

        setInstituciones(institucionesServer);
        setInstitucionSeleccionada(institucionesServer[0] || null);
      } catch (err) {
        console.error("Error cargando instituciones:", err);
      }
    }

    cargarInstituciones();
  }, []);

  // Ajustar periodos si cambia leccionesPorDia
  useEffect(() => {
    setPeriodos((prev) => {
      if (prev.length === leccionesPorDia) return prev;
      return Array.from({ length: leccionesPorDia }).map((_, i) => prev[i] || {
        indice: i + 1,
        abreviatura: String(i + 1),
        hora_inicio: "08:00",
        hora_fin: "08:45",
        duracion_min: 45,
      });
    });
  }, [leccionesPorDia]);

  // Función para crear institucion en servidor
  async function crearInstitucionServidor() {
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
      let data: any = null;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Respuesta inesperada del servidor: ${text.slice(0, 1000)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || JSON.stringify(data));
      }

      const nueva: Institucion = {
        id: data.institucion.id,
        nombre: data.institucion.nombre,
        nivel: cicloEscolar,
        estadoHorario: "sin-iniciar",
        dias_por_semana: diasPorSemana,
        lecciones_por_dia: leccionesPorDia,
      };

      setInstituciones((prev) => [nueva, ...prev]);
      setInstitucionSeleccionada(nueva);
      setImportPreviewLoaded(false);
      setImportPersisted(false);

      return nueva;
    } catch (err: any) {
      console.error("crearInstitucionServidor error ->", err);
      alert("No se pudo crear la institución: " + (err.message || "Error desconocido"));
      return null;
    }
  }

  // Wizard handlers
  const handleNext = async () => {
    if (step === 1) return setStep(2);

    if (step === 2) {
      if (!nombreEscuela.trim()) { alert('El nombre de la escuela es requerido'); return; }
      if (!cicloEscolar.trim()) { alert('El ciclo escolar es requerido'); return; }
      const nueva = await crearInstitucionServidor();
      if (nueva) setStep(3);
      return;
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const badgeForEstado = (estado: Institucion['estadoHorario']) => {
    if (estado === 'creado') return <Badge>Creado</Badge>;
    if (estado === 'en-progreso') return <Badge>En progreso</Badge>;
    return <Badge variant="outline">Sin iniciar</Badge>;
  };

 function EstructuraHorario({ institucion }: { institucion: Institucion | null }) {
  // Si no hay institución, mostramos tabla vacía
  if (!institucion) return <div className="p-6">Selecciona una institución para ver la estructura.</div>;

  const dias = institucion.dias_por_semana || 5;
  const lecciones = institucion.lecciones_por_dia || 7;
  const diasNombres = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].slice(0, dias);

  // Usamos las clases reales
  const clases = institucion.clases ?? [];

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Estructura del horario — {institucion.nombre}</h2>
      <div className="overflow-auto border rounded">
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background z-10 p-2 border">Clase</th>
              {diasNombres.map((dia) => (
                <th key={dia} className="p-2 text-center">{dia}</th>
              ))}
            </tr>
            <tr>
              <th />
              {diasNombres.map((dia) => (
                <th key={dia + '-sub'} className="p-0">
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(48px,1fr))` }}>
                    {Array.from({ length: lecciones }).map((_, i) => (
                      <div key={i} className="text-xs p-2 border text-center">{i + 1}</div>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clases.map((clase) => (
              <tr key={clase.id} className="border-t">
                <td className="sticky left-0 bg-background z-10 p-2 font-medium border-r">{clase.nombre}</td>
                {diasNombres.map((dia) => (
                  <td key={clase.id + dia} className="p-0">
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(48px,1fr))` }}>
                      {Array.from({ length: lecciones }).map((_, i) => (
                        <div key={i} className="h-12 border p-1 text-xs"></div>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


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
      setPreviewCargado(false);
      return;
    }
    await handleNext();
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Barra lateral */}
      <div className="w-60 border-r">
        <div className="p-4 border-b">Menu</div>
        <div className="p-4 space-y-2">
          <Button onClick={() => setWizardOpen(true)}>Crear institución</Button>
          <div className="mt-4">
            <h4 className="text-sm font-medium">Instituciones</h4>
            <ul className="space-y-2 mt-2">
              {instituciones.map((ins) => (
                <li key={ins.id}>
                  <button className="w-full text-left p-2 rounded hover:bg-muted/50" onClick={() => {
                    setInstitucionSeleccionada(ins);
                    setImportPreviewLoaded(false);
                    setImportPersisted(false);
                  }}>
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
      </div>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">Dashboard de Institución</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Institución seleccionada */}
            <Card>
              <CardHeader>
                <CardTitle>Institución seleccionada</CardTitle>
                <CardDescription>{institucionSeleccionada?.nombre || 'Ninguna'}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Nivel: {institucionSeleccionada?.nivel || '-'}</p>
                <p className="text-sm text-muted-foreground">Días: {institucionSeleccionada?.dias_por_semana || '-'} • Lecciones: {institucionSeleccionada?.lecciones_por_dia || '-'}</p>
              </CardContent>
              <CardFooter>
                <Button onClick={() => setWizardOpen(true)}>Configurar / Reconfigurar</Button>
              </CardFooter>
            </Card>

            {/* Importador */}
            <Card>
              <CardHeader>
                <CardTitle>Importar datos</CardTitle>
                <CardDescription>Docentes, cursos, asignaturas y carga académica</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Sube el Excel siguiendo la plantilla</p>
              </CardContent>
              <CardFooter>
                {institucionSeleccionada ? (
                  <ImportadorExcel
                    institucionId={institucionSeleccionada.id}
                    onPreviewLoaded={() => {
                      setImportPreviewLoaded(true);
                      setImportPersisted(false);
                    }}
                    onPersisted={() => {
                      setImportPreviewLoaded(true);
                      setImportPersisted(true);
                    }}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Selecciona una institución para importar</div>
                )}
              </CardFooter>
            </Card>

            {/* Estado del horario */}
            <Card>
              <CardHeader>
                <CardTitle>Estado del horario</CardTitle>
                <CardDescription>Progreso y acciones</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{institucionSeleccionada?.estadoHorario || '-'}</p>
              </CardContent>
              <CardFooter>
                <Button disabled={!institucionSeleccionada}>Ver estructura</Button>
              </CardFooter>
            </Card>
          </div>

          <EstructuraHorario institucion={institucionSeleccionada} />
        </div>
      </main>

      {/* Wizard modal */}
      <Dialog open={wizardOpen} onOpenChange={(open) => {
        setWizardOpen(open);
        if (!open) {
          setStep(1);
          setImportPreviewLoaded(false);
          setImportPersisted(false);
          setPreviewCargado(false);
        }
      }}>
        <DialogTrigger asChild><div /></DialogTrigger>
        <DialogContent className="max-w-[1400px] sm:max-w-[1400px] w-[98vw] h-[92vh] p-0 overflow-hidden rounded-lg" style={{ boxShadow: "0 12px 30px rgba(0,0,0,0.15)" }}>
          {/* Header */}
          <div className="flex flex-col h-full">
            <div className="p-6 border-b">
              <DialogHeader>
                <DialogTitle className="text-lg">Crear nueva institución</DialogTitle>
                <DialogDescription className="text-sm">Asistente de 3 pasos para configurar la institución y subir los datos.</DialogDescription>
              </DialogHeader>
              <div className="mt-2 text-sm text-muted-foreground">Paso {step} de 3</div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6 modal-body">
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
                          <Input value={p.abreviatura} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, abreviatura: e.target.value}:x))} />
                          <Input value={p.hora_inicio} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, hora_inicio: e.target.value}:x))} className="w-28" />
                          <Input value={p.hora_fin} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, hora_fin: e.target.value}:x))} className="w-28" />
                          <Input type="number" value={p.duracion_min} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, duracion_min: Number(e.target.value)}:x))} className="w-24" />
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
                  setPreviewCargado(false);
                }}>Cancelar</Button>
                <Button onClick={handleFooterPrimary}>{step === 3 ? 'Finalizar' : 'Siguiente'}</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
