// app/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import type { Institucion } from "@/types/institucion";
import { BarraLateral } from "@/components/barra-lateral";
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
  const [instituciones, setInstituciones] = useState<Institucion[]>([]);

  // Control del wizard: abrimos el modal único
  const [wizardOpen, setWizardOpen] = useState(false);

  const cargarInstituciones = useCallback(async () => {
    try {
      const res = await fetch("/api/instituciones");
      if (!res.ok) return;
      const data = await res.json();
      setInstituciones(Array.isArray(data) ? data : []);
      // si la seleccionada ya no existe, limpiarla
      if (institucion && !data.find((i: any) => i.id === institucion.id)) {
        setInstitucion(null);
      }
    } catch {
      // silencio
    }
  }, [institucion]);

  useEffect(() => {
    cargarInstituciones();
  }, [cargarInstituciones]);

  const handleSeleccionarInstitucion = (inst: Institucion | null) => {
    if (inst) {
      const full = instituciones.find((i) => i.id === inst.id) ?? inst;
      setInstitucion(full);
      setVistaActual("horario");
    } else {
      setInstitucion(null);
    }
  };

  const handleCambiarVista = (vista: VistaNavegacion) => {
    // Si intentan ir a horario sin institución, abre wizard en vez de mostrar panel vacío
    if (vista === "horario" && !institucion) {
      setWizardOpen(true);
      return;
    }
    setVistaActual(vista);
  };

  return (
    <div className="flex h-screen bg-background">
      <BarraLateral
        vistaActual={vistaActual}
        onCambiarVista={handleCambiarVista}
        institucionSeleccionada={institucion}
        onSeleccionarInstitucion={handleSeleccionarInstitucion}
        instituciones={instituciones}
      />

     

      {/* ÚNICA fuente del modal: InstitucionWizard */}
      <InstitucionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onInstitucionCreada={(inst: Institucion) => {
          // Recibe el objeto institución creado desde el wizard y lo guarda en el state global
          handleSeleccionarInstitucion(inst);
          cargarInstituciones();
          setWizardOpen(false);
        }}
      />
    </div>
  );
}
