// app/docentes/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Institucion } from "@/types/institucion";
import { BarraLateral } from "@/components/barra-lateral";
import { Docentes } from "@/components/docentes";

type VistaNavegacion = "panel" | "docentes" | "cursos" | "asignaturas" | "horario" | "configuracion";

export default function DocentesPage() {
  const [institucion, setInstitucion] = useState<Institucion | null>(null);
  const [instituciones, setInstituciones] = useState<Institucion[]>([]);
  const router = useRouter();

  const cargarInstituciones = useCallback(async () => {
    try {
      const res = await fetch("/api/instituciones");
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setInstituciones(list);
      setInstitucion((prev) => {
        if (!prev) return prev;
        const updated = list.find((i: any) => i.id === prev.id);
        if (!updated) return null;
        return updated;
      });
    } catch {
      // silencio
    }
  }, []);

  useEffect(() => {
    cargarInstituciones();
  }, [cargarInstituciones]);

  const handleSeleccionarInstitucion = (inst: Institucion | null) => {
    if (inst) {
      const full = instituciones.find((i) => i.id === inst.id) ?? inst;
      setInstitucion(full);
    } else {
      setInstitucion(null);
    }
  };

  const handleCambiarVista = (vista: VistaNavegacion) => {
    if (vista === "docentes") return;
    router.push("/");
  };

  return (
    <div className="flex h-screen bg-background">
      <BarraLateral
        vistaActual="docentes"
        onCambiarVista={handleCambiarVista}
        institucionSeleccionada={institucion}
        onSeleccionarInstitucion={handleSeleccionarInstitucion}
        instituciones={instituciones}
      />
      <main className="flex-1 overflow-auto">
        <Docentes
          institucion={institucion}
          instituciones={instituciones}
          onSeleccionarInstitucion={(inst) => handleSeleccionarInstitucion(inst)}
          onRefetch={cargarInstituciones}
        />
      </main>
    </div>
  );
}
