import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function Configuracion() {
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Encabezado */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">Configuración</h1>
          <p className="text-lg text-muted-foreground">Ajustes generales del sistema</p>
        </div>

        {/* Configuración de la institución */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Configuración General</CardTitle>
            <CardDescription>Parámetros básicos del sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre-sistema">Nombre del Sistema</Label>
              <Input id="nombre-sistema" defaultValue="Sistema de Gestión de Horarios" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="año-academico">Año Académico</Label>
              <Input id="año-academico" defaultValue="2024" />
            </div>
          </CardContent>
        </Card>

        {/* Configuración de horarios */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Configuración de Horarios</CardTitle>
            <CardDescription>Ajustes para la creación de horarios</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hora-inicio">Hora de Inicio</Label>
              <Input id="hora-inicio" type="time" defaultValue="08:00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hora-fin">Hora de Fin</Label>
              <Input id="hora-fin" type="time" defaultValue="16:00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duracion-clase">Duración de Clase (minutos)</Label>
              <Input id="duracion-clase" type="number" defaultValue="45" />
            </div>
          </CardContent>
        </Card>

        {/* Botón para guardar cambios */}
        <div className="flex justify-end">
          <Button>
            <Save className="w-4 h-4 mr-2" />
            Guardar Cambios
          </Button>
        </div>
      </div>
    </div>
  )
}
