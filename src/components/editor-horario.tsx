import { Save, Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Institucion } from "@/app/page"
import { Badge } from "@/components/ui/badge"

interface PropsEditorHorario {
  institucion: Institucion
}

export function EditorHorario({ institucion }: PropsEditorHorario) {
  // Días de la semana
  const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

  // Horarios disponibles
  const horas = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]

  // Datos de ejemplo del horario
  const horarioEjemplo = [
    { dia: 0, hora: 0, asignatura: "Matemáticas", docente: "M. González", color: "bg-blue-500" },
    { dia: 0, hora: 1, asignatura: "Lengua", docente: "J. Pérez", color: "bg-green-500" },
    { dia: 1, hora: 0, asignatura: "Ciencias", docente: "A. Martínez", color: "bg-purple-500" },
    { dia: 1, hora: 2, asignatura: "Matemáticas", docente: "M. González", color: "bg-blue-500" },
  ]

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Encabezado con botones de acción */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">Editor de Horarios</h1>
            <p className="text-lg text-muted-foreground">{institucion.nombre} - Crear y editar horario escolar</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Vista Previa
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button>
              <Save className="w-4 h-4 mr-2" />
              Guardar
            </Button>
          </div>
        </div>

        {/* Tabla del horario semanal */}
        <Card>
          <CardHeader>
            <CardTitle>Horario Semanal - 1º Año A</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {/* Columna de horas */}
                    <th className="border border-border bg-muted p-3 text-left font-semibold">Hora</th>
                    {/* Columnas de días */}
                    {dias.map((dia) => (
                      <th key={dia} className="border border-border bg-muted p-3 text-left font-semibold min-w-[150px]">
                        {dia}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Filas por hora */}
                  {horas.map((hora, indiceHora) => (
                    <tr key={hora}>
                      {/* Celda de hora */}
                      <td className="border border-border p-3 font-medium bg-muted/50">{hora}</td>
                      {/* Celdas por día */}
                      {dias.map((dia, indiceDia) => {
                        // Buscar si hay una clase en este día y hora
                        const itemHorario = horarioEjemplo.find(
                          (item) => item.dia === indiceDia && item.hora === indiceHora,
                        )
                        return (
                          <td
                            key={`${dia}-${hora}`}
                            className="border border-border p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            {itemHorario ? (
                              // Si hay clase, mostrar información
                              <div className={`${itemHorario.color} text-white p-3 rounded-lg`}>
                                <div className="font-semibold text-sm">{itemHorario.asignatura}</div>
                                <div className="text-xs opacity-90 mt-1">{itemHorario.docente}</div>
                              </div>
                            ) : (
                              // Si no hay clase, mostrar celda vacía clickeable
                              <div className="h-16 flex items-center justify-center text-muted-foreground text-sm">
                                +
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Panel de asignaturas disponibles */}
        <div className="mt-6 flex gap-4">
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-base">Asignaturas Disponibles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {/* Badges clickeables de asignaturas */}
                <Badge className="bg-blue-500 hover:bg-blue-600 cursor-pointer">Matemáticas</Badge>
                <Badge className="bg-green-500 hover:bg-green-600 cursor-pointer">Lengua</Badge>
                <Badge className="bg-purple-500 hover:bg-purple-600 cursor-pointer">Ciencias</Badge>
                <Badge className="bg-orange-500 hover:bg-orange-600 cursor-pointer">Historia</Badge>
                <Badge className="bg-red-500 hover:bg-red-600 cursor-pointer">Ed. Física</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
