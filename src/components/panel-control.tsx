// components/panel-control.tsx
"use client";

import { Plus, ArrowRight, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Institucion } from "@/types/institucion";

interface Props {
  institucion: Institucion | null;
  onSeleccionarInstitucion: (institucion: Institucion | null) => void;
  onAbrirWizard: () => void;
}

export function PanelControl({ institucion, onSeleccionarInstitucion, onAbrirWizard }: Props) {
  const badgeFor = (estado?: Institucion["estadoHorario"]) => {
    if (!estado) return <Badge variant="outline">Sin institución</Badge>;
    if (estado === "creado") return <Badge>Creado</Badge>;
    if (estado === "en-progreso") return <Badge>En progreso</Badge>;
    return <Badge variant="outline">Sin iniciar</Badge>;
  };

  return (
    <div>
      <div className="px-8 py-3.5 border-b mb-8">
        <h1 className="text-2xl font-bold">Panel de Control</h1>
        <p className="text-muted-foreground">Gestiona la institución actual y sus horarios</p>
      </div>

      <div className="px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Crear */}
          <Card onClick={onAbrirWizard} className="border-2 border-dashed hover:border-primary cursor-pointer">
            <CardHeader className="flex items-center justify-center min-h-[220px]">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>Crear institución</CardTitle>
                <CardDescription>Configura la institución y sube datos</CardDescription>
              </div>
            </CardHeader>
          </Card>

          {/* Estado actual */}
          <Card className="hover:shadow-md transition">
            <CardHeader>
              <div className="flex justify-between mb-2">
                <CardTitle>{institucion?.nombre ?? "Sin institución"}</CardTitle>
                {badgeFor(institucion?.estadoHorario)}
              </div>
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {institucion?.nivel ?? "-"}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <p className="text-sm text-muted-foreground">
                {institucion ? (institucion.estadoHorario === "creado" ? "Horario generado" : institucion.estadoHorario === "en-progreso" ? "Configuración en proceso" : "Pendiente de configuración") : "No hay institución creada aún"}
              </p>
            </CardContent>

            <CardFooter>
              <Button onClick={() => onSeleccionarInstitucion(institucion ?? null)} className="w-full">
                {institucion ? "Abrir" : "Crear"}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>

          {/* Espacio para otras acciones */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
              <CardDescription>Importar, exportar y otras herramientas</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Importa los datos una vez creada la institución.</p>
            </CardContent>
            <CardFooter>
              <Button onClick={onAbrirWizard}>Configurar</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
