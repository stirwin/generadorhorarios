"use client"

import { useState } from "react"
import { BarraLateral } from "@/components/barra-lateral"
import { PanelControl } from "@/components/panel-control"
import { Docentes } from "@/components/docentes"
import { Cursos } from "@/components/cursos"
import { Asignaturas } from "@/components/asignaturas"
import { EditorHorario } from "@/components/editor-horario"
import { Configuracion } from "@/components/configuracion"

// Tipo que define la estructura de una institución educativa
export type Institucion = {
  id: string
  nombre: string
  nivel: string
  estadoHorario: "creado" | "en-progreso" | "sin-iniciar"
}

// Tipo que define las vistas de navegación disponibles
export type VistaNavegacion = "panel" | "docentes" | "cursos" | "asignaturas" | "horario" | "configuracion"

export default function Home() {
  // Estado para controlar la vista actual
  const [vistaActual, setVistaActual] = useState<VistaNavegacion>("panel")

  // Estado para la institución seleccionada
  const [institucionSeleccionada, setInstitucionSeleccionada] = useState<Institucion | null>(null)

  // Estado con la lista de instituciones (datos de ejemplo)
  const [instituciones, setInstituciones] = useState<Institucion[]>([
    { id: "1", nombre: "Colegio San Martín", nivel: "Primaria", estadoHorario: "creado" },
    { id: "2", nombre: "Instituto Nacional", nivel: "Secundaria", estadoHorario: "en-progreso" },
    { id: "3", nombre: "Universidad Técnica", nivel: "Superior", estadoHorario: "sin-iniciar" },
  ])

  // Función para seleccionar una institución y volver al panel
  const manejarSeleccionInstitucion = (institucion: Institucion) => {
    setInstitucionSeleccionada(institucion)
    setVistaActual("panel")
  }

  // Función para crear una nueva institución
  const manejarCrearInstitucion = (nombre: string, nivel: string) => {
    const nuevaInstitucion: Institucion = {
      id: Date.now().toString(),
      nombre,
      nivel,
      estadoHorario: "sin-iniciar",
    }
    setInstituciones([...instituciones, nuevaInstitucion])
    setInstitucionSeleccionada(nuevaInstitucion)
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Barra lateral de navegación */}
      <BarraLateral
        vistaActual={vistaActual}
        onCambiarVista={setVistaActual}
        institucionSeleccionada={institucionSeleccionada}
        onSeleccionarInstitucion={setInstitucionSeleccionada}
        instituciones={instituciones}
      />

      {/* Contenido principal según la vista seleccionada */}
      <main className="flex-1 overflow-auto">
        {vistaActual === "panel" && (
          <PanelControl
            instituciones={instituciones}
            onSeleccionarInstitucion={manejarSeleccionInstitucion}
            onCrearInstitucion={manejarCrearInstitucion}
          />
        )}
        {vistaActual === "docentes" && institucionSeleccionada && <Docentes institucion={institucionSeleccionada} />}
        {vistaActual === "cursos" && institucionSeleccionada && <Cursos institucion={institucionSeleccionada} />}
        {vistaActual === "asignaturas" && institucionSeleccionada && (
          <Asignaturas institucion={institucionSeleccionada} />
        )}
        {vistaActual === "horario" && institucionSeleccionada && (
          <EditorHorario institucion={institucionSeleccionada} />
        )}
        {vistaActual === "configuracion" && <Configuracion />}
      </main>
    </div>
  )
}
