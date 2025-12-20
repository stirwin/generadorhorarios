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
import InstitucionWizard from "@/components/institucion/InstitucionWizard";

type VistaNavegacion = "panel" | "docentes" | "cursos" | "asignaturas" | "horario" | "configuracion";

export default function HomePage() {
  const [vistaActual, setVistaActual] = useState<VistaNavegacion>("panel");

  // Estado global principal: institución seleccionada (levántalo aquí si quieres que otras vistas lo usen)
  const [institucion, setInstitucion] = useState<Institucion | null>(null);

  // Control del wizard: abrimos el modal único
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      <BarraLateral
        vistaActual={vistaActual}
        onCambiarVista={setVistaActual}
        institucionSeleccionada={institucion}
        onSeleccionarInstitucion={setInstitucion}
        instituciones={institucion ? [institucion] : []}
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

      {/* ÚNICA fuente del modal: InstitucionWizard */}
      <InstitucionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onInstitucionCreada={(inst: Institucion) => {
          // Recibe el objeto institución creado desde el wizard y lo guarda en el state global
          setInstitucion(inst);
          setWizardOpen(false);
        }}
      />
    </div>
  );
}
