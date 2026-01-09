// app/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Institucion } from "@/types/institucion";
import { BarraLateral } from "@/components/barra-lateral";
import { Cursos } from "@/components/cursos";
import { Configuracion } from "@/components/configuracion";
import InstitucionWizard from "@/components/institucion/InstitucionWizard";

type VistaNavegacion = "panel" | "docentes" | "cursos" | "asignaturas" | "horario" | "configuracion";

export default function HomePage() {
  const [vistaActual, setVistaActual] = useState<VistaNavegacion>("panel");
  const router = useRouter();

  // Estado global principal: institución seleccionada (levántalo aquí si quieres que otras vistas lo usen)
  const [institucion, setInstitucion] = useState<Institucion | null>(null);
  const [instituciones, setInstituciones] = useState<Institucion[]>([]);

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
    if (vista === "docentes") {
      router.push("/docentes");
      return;
    }
    if (vista === "horario" && !institucion) {
      setVistaActual("panel");
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
      <main className="flex-1 overflow-auto">
        {vistaActual === "panel" && <InstitucionWizard />}
        {vistaActual === "cursos" && institucion && <Cursos institucion={institucion} />}
        {vistaActual === "horario" && <InstitucionWizard />}
        {vistaActual === "configuracion" && <Configuracion />}
      </main>
    </div>
  );
}
