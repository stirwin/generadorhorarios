"use client";

import React, { useState, useEffect } from "react";
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

// Tipos locales simplificados
export type Institucion = {
  id: string;
  nombre: string;
  nivel: string;
  estadoHorario: "creado" | "en-progreso" | "sin-iniciar";
  dias_por_semana?: number;
  lecciones_por_dia?: number;
};

export default function VistaInstitucionDemo() {
  // estado global simulado (reemplazar por fetch/PRISMA)
  const [instituciones, setInstituciones] = useState<Institucion[]>([
    { id: "1", nombre: "Colegio San Martín", nivel: "Primaria", estadoHorario: "creado", dias_por_semana: 5, lecciones_por_dia: 7 },
    { id: "2", nombre: "Instituto Nacional", nivel: "Secundaria", estadoHorario: "en-progreso", dias_por_semana: 5, lecciones_por_dia: 7 },
  ]);
  const [institucionSeleccionada, setInstitucionSeleccionada] = useState<Institucion | null>(instituciones[0] || null);

  // Wizard modal state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Paso 2 (configuracion)
  const [nombreEscuela, setNombreEscuela] = useState("");
  const [cicloEscolar, setCicloEscolar] = useState("");
  const [leccionesPorDia, setLeccionesPorDia] = useState(7);
  const [diasPorSemana, setDiasPorSemana] = useState(5);
  const [periodos, setPeriodos] = useState(() => {
    // crear periodos por defecto para 7 lecciones
    return Array.from({ length: 7 }).map((_, i) => ({ indice: i + 1, abreviatura: String(i + 1), hora_inicio: "08:00", hora_fin: "08:45", duracion_min: 45 }));
  });

  // preview/import state
  const [previewCargado, setPreviewCargado] = useState(false);

  // Efecto: si cambia leccionesPorDia, ajustar periodos por defecto (preguntar confirmacion en prod)
  useEffect(() => {
    setPeriodos((prev) => {
      if (prev.length === leccionesPorDia) return prev;
      return Array.from({ length: leccionesPorDia }).map((_, i) => prev[i] || { indice: i + 1, abreviatura: String(i + 1), hora_inicio: "08:00", hora_fin: "08:45", duracion_min: 45 });
    });
  }, [leccionesPorDia]);

  // Función para crear institucion (llama a API /api/instituciones)
  async function crearInstitucionServidor() {
    try {
      const payload = {
        nombre: nombreEscuela,
        ciclo_escolar: cicloEscolar,
        dias_por_semana: diasPorSemana,
        lecciones_por_dia: leccionesPorDia,
        periodos,
      };
      const res = await fetch('/api/instituciones', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al crear institución');

      const nueva: Institucion = {
        id: data.institucion.id,
        nombre: data.institucion.nombre,
        nivel: cicloEscolar,
        estadoHorario: 'sin-iniciar',
        dias_por_semana: diasPorSemana,
        lecciones_por_dia: leccionesPorDia,
      };
      setInstituciones((prev) => [nueva, ...prev]);
      setInstitucionSeleccionada(nueva);
      return nueva;
    } catch (err: any) {
      console.error(err);
      alert('No se pudo crear la institución: ' + (err.message || 'Error'));
      return null;
    }
  }

  // Handlers del wizard
  const handleNext = async () => {
    if (step === 1) return setStep(2);
    if (step === 2) {
      // validar campos
      if (!nombreEscuela.trim()) return alert('El nombre de la escuela es requerido');
      if (!cicloEscolar.trim()) return alert('El ciclo escolar es requerido');
      // crear institución en servidor
      const nueva = await crearInstitucionServidor();
      if (nueva) setStep(3);
      return;
    }
    if (step === 3) {
      // paso final: ya se importó el excel o el usuario decide saltar
      setWizardOpen(false);
      setStep(1);
      setPreviewCargado(false);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // UI helpers
  const badgeForEstado = (estado: Institucion['estadoHorario']) => {
    if (estado === 'creado') return <Badge>Creado</Badge>;
    if (estado === 'en-progreso') return <Badge>En progreso</Badge>;
    return <Badge variant="outline">Sin iniciar</Badge>;
  };

  // Estructura vacía del horario: filas = cursos, cols = dias x lecciones
  function EstructuraHorario({ institucion }: { institucion: Institucion | null }) {
    // obtener cursos de ejemplo (en prod hacer fetch al endpoint /api/institucion/:id/cursos)
    const cursosEjemplo = [
      { id: 'c1', nombre: '6A' },
      { id: 'c2', nombre: '6B' },
      { id: 'c3', nombre: '7A' },
    ];
    const dias = institucion?.dias_por_semana || 5;
    const lecciones = institucion?.lecciones_por_dia || 7;

    const diasNombres = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].slice(0, dias);

    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Estructura del horario — {institucion?.nombre || 'Sin institución'}</h2>
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
                    <div className="grid grid-cols-" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(48px,1fr))` }}>
                      {Array.from({ length: lecciones }).map((_, i) => (
                        <div key={i} className="text-xs p-2 border text-center">{i + 1}</div>
                      ))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cursosEjemplo.map((curso) => (
                <tr key={curso.id} className="border-t">
                  <td className="sticky left-0 bg-background z-10 p-2 font-medium border-r">{curso.nombre}</td>
                  {diasNombres.map((dia) => (
                    <td key={curso.id + dia} className="p-0">
                      <div className="grid grid-cols-" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(48px,1fr))` }}>
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

  return (
    <div className="flex h-screen bg-background">
      {/* Barra lateral placeholder (importada) */}
      <div className="w-60 border-r">
        <div className="p-4 border-b">Menu</div>
        <div className="p-4 space-y-2">
          <Button onClick={() => setWizardOpen(true)}>Crear institución</Button>
          <div className="mt-4">
            <h4 className="text-sm font-medium">Instituciones</h4>
            <ul className="space-y-2 mt-2">
              {instituciones.map((ins) => (
                <li key={ins.id}>
                  <button className="w-full text-left p-2 rounded hover:bg-muted/50" onClick={() => setInstitucionSeleccionada(ins)}>
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

          {/* Tarjeta resumen y botón para abrir wizard (también se puede abrir desde el sidebar) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Institución seleccionada</CardTitle>
                <CardDescription>{institucionSeleccionada?.nombre || 'Ninguna'}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Nivel: {institucionSeleccionada?.nivel || '-'}</p>
                <p className="text-sm text-muted-foreground">Días: {institucionSeleccionada?.dias_por_semana || '-' } • Lecciones: {institucionSeleccionada?.lecciones_por_dia || '-'}</p>
              </CardContent>
              <CardFooter>
                <Button onClick={() => setWizardOpen(true)}>Configurar / Reconfigurar</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Importar datos</CardTitle>
                <CardDescription>Docentes, cursos, asignaturas y carga académica</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Sube el Excel siguiendo la plantilla</p>
              </CardContent>
              <CardFooter>
                {/* Si hay institucion seleccionada, mostrar ImportadorExcel */}
                {institucionSeleccionada ? (
                  <ImportadorExcel institucionId={institucionSeleccionada.id} />
                ) : (
                  <div className="text-sm text-muted-foreground">Selecciona una institución para importar</div>
                )}
              </CardFooter>
            </Card>

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

          {/* Estructura vacía del horario */}
          <EstructuraHorario institucion={institucionSeleccionada} />
        </div>
      </main>

      {/* Wizard modal - 3 pasos */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogTrigger asChild>
          {/* invisible: usar botones para abrir */}
          <div />
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear nueva institución</DialogTitle>
            <DialogDescription>Asistente de 3 pasos para configurar la institución y subir datos.</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-4">
              <div className="text-sm font-medium">Paso {step} de 3</div>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Bienvenido: este asistente te guiará para crear la institución, definir los periodos (timbres) y subir el Excel con docentes, cursos y cargas académicas. Sigue los pasos y revisa las validaciones.</p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <Label>Nombre de la escuela</Label>
                  <Input value={nombreEscuela} onChange={(e) => setNombreEscuela(e.target.value)} placeholder="Ej: Colegio San Martín" />
                </div>
                <div>
                  <Label>Ciclo escolar</Label>
                  <Input value={cicloEscolar} onChange={(e) => setCicloEscolar(e.target.value)} placeholder="Ej: 2025" />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                  <div className="mt-2 grid gap-2">
                    {periodos.map((p, idx) => (
                      <div key={p.indice} className="flex items-center gap-2">
                        <div className="w-8 text-center">{p.indice}</div>
                        <Input value={p.abreviatura} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, abreviatura: e.target.value}:x))} />
                        <Input value={p.hora_inicio} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, hora_inicio: e.target.value}:x))} className="w-24" />
                        <Input value={p.hora_fin} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, hora_fin: e.target.value}:x))} className="w-24" />
                        <Input type="number" value={p.duracion_min} onChange={(e) => setPeriodos((prev) => prev.map((x,i)=> i===idx?{...x, duracion_min: Number(e.target.value)}:x))} className="w-20" />
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Importa el archivo Excel con Docentes, Clases, Asignaturas y Carga Académica. Usa la plantilla recomendada para evitar errores. Después de previsualizar podrás persistir los datos.</p>
                {/* Importador integrado */}
                {/* Si la institución fue creada se pasa el id real. Aquí usamos la institucion seleccionada */}
                {institucionSeleccionada ? (
                  <ImportadorExcel institucionId={institucionSeleccionada.id} />
                ) : (
                  <div className="text-sm text-muted-foreground">Primero guarda la configuración en el paso anterior.</div>
                )}

              </div>
            )}

          </div>

          <DialogFooter>
            <div className="flex w-full justify-between">
              <div>
                {step > 1 && <Button variant="outline" onClick={handleBack}>Atrás</Button>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setWizardOpen(false); setStep(1); }}>Cancelar</Button>
                <Button onClick={handleNext}>{step === 3 ? 'Finalizar' : 'Siguiente'}</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
