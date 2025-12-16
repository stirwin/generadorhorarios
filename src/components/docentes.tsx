import { Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Institucion } from "@/app/page"
import { Badge } from "@/components/ui/badge"

interface PropsDocentes {
  institucion: Institucion
}

export function Docentes({ institucion }: PropsDocentes) {
  // Datos de ejemplo de docentes
  const docentesEjemplo = [
    { id: "1", nombre: "María González", asignatura: "Matemáticas", email: "maria.gonzalez@email.com" },
    { id: "2", nombre: "Juan Pérez", asignatura: "Lengua", email: "juan.perez@email.com" },
    { id: "3", nombre: "Ana Martínez", asignatura: "Ciencias", email: "ana.martinez@email.com" },
  ]

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Encabezado con botón de acción */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">Docentes</h1>
            <p className="text-lg text-muted-foreground">{institucion.nombre} - Gestión de profesores</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Docente
          </Button>
        </div>

        {/* Lista de docentes en tarjetas */}
        <div className="grid gap-4">
          {docentesEjemplo.map((docente) => (
            <Card key={docente.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{docente.nombre}</CardTitle>
                    <CardDescription className="mt-1">{docente.email}</CardDescription>
                  </div>
                  {/* Botones de acción para editar y eliminar */}
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
                {/* Badge con la asignatura del docente */}
                <Badge variant="secondary">{docente.asignatura}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
