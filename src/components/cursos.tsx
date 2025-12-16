import { Plus, Pencil, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Institucion } from "@/app/page"

interface PropsCursos {
  institucion: Institucion
}

export function Cursos({ institucion }: PropsCursos) {
  // Datos de ejemplo de cursos
  const cursosEjemplo = [
    { id: "1", nombre: "1º Año", seccion: "A", estudiantes: 28, turno: "Mañana" },
    { id: "2", nombre: "1º Año", seccion: "B", estudiantes: 30, turno: "Mañana" },
    { id: "3", nombre: "2º Año", seccion: "A", estudiantes: 25, turno: "Tarde" },
  ]

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Encabezado con botón de acción */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">Cursos</h1>
            <p className="text-lg text-muted-foreground">{institucion.nombre} - Gestión de cursos y secciones</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Curso
          </Button>
        </div>

        {/* Grid de tarjetas de cursos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cursosEjemplo.map((curso) => (
            <Card key={curso.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {curso.nombre} - Sección {curso.seccion}
                    </CardTitle>
                    <CardDescription className="mt-1">Turno {curso.turno}</CardDescription>
                  </div>
                  {/* Botones de acción */}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Información de cantidad de estudiantes */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{curso.estudiantes} estudiantes</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
