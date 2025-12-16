"use client";

import { Plus, ArrowRight, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Institucion } from "@/app/page";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PropsPanelControl {
  instituciones: Institucion[];
  onSeleccionarInstitucion: (institucion: Institucion) => void;
  onCrearInstitucion: (nombre: string, nivel: string) => void;
}

export function PanelControl({
  instituciones,
  onSeleccionarInstitucion,
  onCrearInstitucion,
}: PropsPanelControl) {
  // Estado para controlar el diálogo de creación
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [nombreNuevaInstitucion, setNombreNuevaInstitucion] = useState("");
  const [nivelNuevaInstitucion, setNivelNuevaInstitucion] = useState("");

  // Función para manejar la creación de una nueva institución
  const manejarCreacion = () => {
    if (nombreNuevaInstitucion && nivelNuevaInstitucion) {
      onCrearInstitucion(nombreNuevaInstitucion, nivelNuevaInstitucion);
      // Limpiar campos y cerrar diálogo
      setNombreNuevaInstitucion("");
      setNivelNuevaInstitucion("");
      setDialogoAbierto(false);
    }
  };

  // Función para obtener el badge según el estado del horario
  const obtenerBadgeEstado = (estado: Institucion["estadoHorario"]) => {
    const variantes = {
      creado: {
        etiqueta: "Creado",
        className: "bg-success/10 text-success border-success/20",
      },
      "en-progreso": {
        etiqueta: "En progreso",
        className: "bg-warning/10 text-warning border-warning/20",
      },
      "sin-iniciar": {
        etiqueta: "Sin iniciar",
        className: "bg-muted text-muted-foreground border-border",
      },
    };
    const variante = variantes[estado];
    return (
      <Badge variant="outline" className={variante.className}>
        {variante.etiqueta}
      </Badge>
    );
  };

  return (
    <div>
      <div className="px-8 py-3.5 border-b border-border mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2 text-balance">
          Panel de Control
        </h1>
        <p className="text-base text-muted-foreground">
          Gestiona las instituciones educativas y sus horarios
        </p>
      </div>
      <div className="px-8">
        <div className="max-w-7xl mx-auto">
          {/* Encabezado del panel */}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Tarjeta para crear nueva institución */}
            <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
              <DialogTrigger asChild>
                <Card className="border-2 border-dashed border-border hover:border-primary transition-colors cursor-pointer group">
                  <CardHeader className="flex-row items-center justify-center space-y-0 h-full min-h-[240px]">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                        <Plus className="w-8 h-8 text-primary" />
                      </div>
                      <CardTitle className="text-xl mb-2">
                        Crear Nueva Institución
                      </CardTitle>
                      <CardDescription>
                        Agregar una nueva institución educativa
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nueva Institución</DialogTitle>
                  <DialogDescription>
                    Ingresa los datos de la nueva institución educativa
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre de la Institución</Label>
                    <Input
                      id="nombre"
                      placeholder="Ej: Colegio San Martín"
                      value={nombreNuevaInstitucion}
                      onChange={(e) =>
                        setNombreNuevaInstitucion(e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nivel">Nivel Educativo</Label>
                    <Select
                      value={nivelNuevaInstitucion}
                      onValueChange={setNivelNuevaInstitucion}
                    >
                      <SelectTrigger id="nivel">
                        <SelectValue placeholder="Seleccionar nivel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Inicial">Inicial</SelectItem>
                        <SelectItem value="Primaria">Primaria</SelectItem>
                        <SelectItem value="Secundaria">Secundaria</SelectItem>
                        <SelectItem value="Superior">Superior</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDialogoAbierto(false)}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={manejarCreacion}>Crear Institución</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Tarjetas de instituciones existentes */}
            {instituciones.map((institucion) => (
              <Card
                key={institucion.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <CardTitle className="text-xl text-balance">
                      {institucion.nombre}
                    </CardTitle>
                    {obtenerBadgeEstado(institucion.estadoHorario)}
                  </div>
                  <CardDescription className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {institucion.nivel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {institucion.estadoHorario === "creado"
                      ? "Horario completado y listo para usar"
                      : institucion.estadoHorario === "en-progreso"
                      ? "Configuración de horario en proceso"
                      : "Horario pendiente de configuración"}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={() => onSeleccionarInstitucion(institucion)}
                    className="w-full group"
                    variant={
                      institucion.estadoHorario === "sin-iniciar"
                        ? "outline"
                        : "default"
                    }
                  >
                    {institucion.estadoHorario === "sin-iniciar"
                      ? "Configurar"
                      : "Ver Horario"}
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
