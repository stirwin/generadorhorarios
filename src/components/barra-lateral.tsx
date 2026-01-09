"use client"

import { Building2, Home, Users, BookOpen, Calendar, Settings, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Institucion } from "@/types/institucion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PropsBarra {
  vistaActual: VistaNavegacion
  onCambiarVista: (vista: VistaNavegacion) => void
  institucionSeleccionada: Institucion | null
  onSeleccionarInstitucion: (institucion: Institucion | null) => void
  instituciones: Institucion[]
}

type VistaNavegacion = "panel" | "docentes" | "cursos" | "asignaturas" | "horario" | "configuracion"

export function BarraLateral({
  vistaActual,
  onCambiarVista,
  institucionSeleccionada,
  onSeleccionarInstitucion,
  instituciones,
}: PropsBarra) {
  // Definición de los elementos de navegación
  const itemsNavegacion = [
    { id: "panel" as const, etiqueta: "Dashboard", icono: Home, deshabilitado: false },
    { id: "docentes" as const, etiqueta: "Docentes", icono: Users, deshabilitado: false },
    { id: "cursos" as const, etiqueta: "Cursos", icono: BookOpen, deshabilitado: !institucionSeleccionada },
    {
      id: "asignaturas" as const,
      etiqueta: "Asignaturas",
      icono: GraduationCap,
      deshabilitado: !institucionSeleccionada,
    },
    {
      id: "horario" as const,
      etiqueta: "Crear/Editar Horario",
      icono: Calendar,
      deshabilitado: false,
    },
    { id: "configuracion" as const, etiqueta: "Configuración", icono: Settings, deshabilitado: false },
  ]

  return (
    <aside className="w-64 bg-background border-r border-border flex flex-col">
      {/* Encabezado con logo y título */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Horarios</h1>
            <p className="text-xs text-muted-foreground">Sistema de Gestión</p>
          </div>
        </div>
      </div>

      {/* Selector de institución */}
      <div className="p-4 border-b border-border">
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Institución Seleccionada</label>
        <Select
          value={institucionSeleccionada?.id || ""}
          onValueChange={(valor) => {
            const institucion = instituciones.find((i) => i.id === valor)
            onSeleccionarInstitucion(institucion || null)
          }}
        >
          <SelectTrigger className="bg-background border-border text-foreground">
            <SelectValue placeholder="Seleccionar institución" />
          </SelectTrigger>
          <SelectContent>
            {instituciones.map((institucion) => (
              <SelectItem key={institucion.id} value={institucion.id}>
                {institucion.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Menú de navegación */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {itemsNavegacion.map((item) => {
            const Icono = item.icono
            return (
              <li key={item.id}>
                <button
                  onClick={() => !item.deshabilitado && onCambiarVista(item.id)}
                  disabled={item.deshabilitado}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    // Estilos para vista activa
                    vistaActual === item.id
                      ? "bg-accent text-accent-foreground"
                      : // Estilos para item deshabilitado
                        item.deshabilitado
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : // Estilos para item normal con hover
                          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icono className="w-5 h-5" />
                  <span>{item.etiqueta}</span>
                </button>
                
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Pie de página con versión */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          <p>Sistema de Gestión v1.0</p>
        </div>
      </div>
    </aside>
  )
}
