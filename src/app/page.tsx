// app/page.tsx
"use client";

import { useState } from "react";
import type { Institucion } from "@/types/institucion";
import { BarraLateral } from "@/components/barra-lateral";
import { PanelControl } from "@/components/panel-control";
import { Docentes } from "@/components/docentes";
import { Cursos } from "@/components/cursos";
import { Asignaturas } from "@/components/asignaturas";
import { EditorHorario } from "@/components/editor-horario";
import { Configuracion } from "@/components/configuracion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImportadorExcel } from "@/components/importaciones/ImportadorExcel";

type VistaNavegacion = "panel" | "docentes" | "cursos" | "asignaturas" | "horario" | "configuracion";

export default function HomePage() {
  const [vistaActual, setVistaActual] = useState<VistaNavegacion>("panel");

  // Única variable 'institucion' en la UI
  const [institucion, setInstitucion] = useState<Institucion | null>(null);

  // Wizard controlado
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Campos del wizard
  const [nombreEscuela, setNombreEscuela] = useState("");
  const [cicloEscolar, setCicloEscolar] = useState("");
  const [leccionesPorDia, setLeccionesPorDia] = useState(7);
  const [diasPorSemana, setDiasPorSemana] = useState(5);

  // Crear institución (cliente) — en prod reemplaza por llamada a /api/instituciones
  const crearInstitucionLocal = (payload: {
    nombre: string;
    nivel: string;
    cicloEscolar?: string;
    diasPorSemana?: number;
    leccionesPorDia?: number;
  }) => {
    const nueva: Institucion = {
      id: Date.now().toString(),
      nombre: payload.nombre,
      nivel: payload.nivel,
      estadoHorario: "sin-iniciar",
      cicloEscolar: payload.cicloEscolar ?? "",
      diasPorSemana: payload.diasPorSemana ?? 5,
      leccionesPorDia: payload.leccionesPorDia ?? 7,
      creadaEn: new Date().toISOString(),
    };
    setInstitucion(nueva);
    return nueva;
  };

  // Handlers del wizard
  const handleNext = async () => {
    if (step === 1) return setStep(2);

    if (step === 2) {
      if (!nombreEscuela.trim()) return alert("El nombre de la escuela es requerido");
      if (!cicloEscolar.trim()) return alert("El ciclo escolar es requerido");

      // Aquí puedes llamar a la API real:
      // const res = await fetch('/api/instituciones', { method: 'POST', body: JSON.stringify({...}) })
      // const data = await res.json(); setInstitucion(data.institucion)

      crearInstitucionLocal({
        nombre: nombreEscuela,
        nivel: cicloEscolar,
        cicloEscolar,
        diasPorSemana,
        leccionesPorDia,
      });

      setStep(3);
      return;
    }

    if (step === 3) {
      setWizardOpen(false);
      setStep(1);
      // limpiar campos opcionalmente
      setNombreEscuela("");
      setCicloEscolar("");
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="flex h-screen bg-background">
      <BarraLateral
        vistaActual={vistaActual}
        onCambiarVista={setVistaActual}
        institucionSeleccionada={institucion}
        onSeleccionarInstitucion={setInstitucion}
        instituciones={[]} // si tu barra lateral requiere lista, pásala vacía o impleméntala para una sola institucion
      />

      <main className="flex-1 overflow-auto">
        {vistaActual === "panel" && (
          <PanelControl
            institucion={institucion}
            onSeleccionarInstitucion={setInstitucion}
            onAbrirWizard={() => setWizardOpen(true)}
          />
        )}

        {vistaActual === "docentes" && institucion && <Docentes institucion={institucion} />}
        {vistaActual === "cursos" && institucion && <Cursos institucion={institucion} />}
        {vistaActual === "asignaturas" && institucion && <Asignaturas institucion={institucion} />}
        {vistaActual === "horario" && institucion && <EditorHorario institucion={institucion} />}
        {vistaActual === "configuracion" && <Configuracion />}
      </main>

      {/* Wizard controlado */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear nueva institución</DialogTitle>
            <DialogDescription>Asistente de 3 pasos para configurar la institución y subir datos.</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-4">
              <div className="text-sm font-medium">Paso {step} de 3</div>
            </div>

            {step === 1 && <p className="text-sm text-muted-foreground">Bienvenido: este asistente te guiará...</p>}

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
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Importa el archivo Excel con Docentes, Clases, Asignaturas y Carga Académica.</p>
                {institucion ? (
                  <ImportadorExcel institucionId={institucion.id} />
                ) : (
                  <div className="text-sm text-muted-foreground">Primero crea la institución en el paso anterior.</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <div className="flex w-full justify-between">
              <div>{step > 1 && <Button variant="outline" onClick={handleBack}>Atrás</Button>}</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setWizardOpen(false); setStep(1); }}>Cancelar</Button>
                <Button onClick={handleNext}>{step === 3 ? "Finalizar" : "Siguiente"}</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
