import { Plus, Pencil, Trash2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Institucion } from "@/app/page"

interface PropsAsignaturas {
  institucion: Institucion
}

export function Asignaturas({ institucion }: PropsAsignaturas) {
  // Datos de ejemplo de asignaturas con códigos de color
  const asignaturasEjemplo = [
    { id: "1", nombre: "Matemáticas", codigo: "MAT101", horas: 4, color: "bg-blue-500" },
    { id: "2", nombre: "Lengua y Literatura", codigo: "LEN101", horas: 4, color: "bg-green-500" },
    { id: "3", nombre: "Ciencias Naturales", codigo: "CIE101", horas: 3, color: "bg-purple-500" },
    { id: "4", nombre: "Historia", codigo: "HIS101", horas: 3, color: "bg-orange-500" },
    { id: "5", nombre: "Educación Física", codigo: "EDF101", horas: 2, color: "bg-red-500" },
  ]

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Encabezado con botón de acción */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">Asignaturas</h1>
            <p className="text-lg text-muted-foreground">{institucion.nombre} - Gestión de materias</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Asignatura
          </Button>
        </div>

        {/* Lista de asignaturas */}
        <div className="grid gap-4">
          {asignaturasEjemplo.map((asignatura) => (
            <Card key={asignatura.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Indicador de color de la asignatura */}
                    <div className={`w-3 h-3 rounded-full ${asignatura.color}`} />
                    <div>
                      <CardTitle className="text-xl">{asignatura.nombre}</CardTitle>
                      <CardDescription className="mt-1">Código: {asignatura.codigo}</CardDescription>
                    </div>
                  </div>
                  {/* Botones de acción */}
                  <div className="flex gap-2">
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
                {/* Información de horas semanales */}
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{asignatura.horas} horas semanales</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
