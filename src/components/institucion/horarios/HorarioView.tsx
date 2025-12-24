"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import VistaGeneralHorario from "./horariosTabs/GeneralHorario";
import VistaSemanalHorario from "./horariosTabs/VistaSemanalHorario";
import { Institucion } from "@/types/institucion";

export type Periodo = { indice: number; abreviatura?: string; hora_inicio?: string; hora_fin?: string; duracion_min?: number };
export type Clase = { id: string; nombre: string };

export type TimetableCell = {
  asignaturaId?: string;
  asignaturaNombre?: string;
  docenteId?: string;
  docenteNombre?: string;
  duracion?: number;
  cargaId?: string;
};

export default function HorariosView({
  institucion,
  timetableByClase,
  onGenerate,
}: {
  institucion: Institucion | null;
  timetableByClase?: Record<string, Array<TimetableCell | null>>;
  onGenerate?: () => Promise<void> | void;
}) {
  // -----------------------
  // Hooks: siempre arriba
  // -----------------------
  const STORAGE_KEY = "horario:view";
  const [tab, setTab] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? "vista-general"; } catch { return "vista-general"; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, tab); } catch {}
  }, [tab]);

  // clases y mapas (pueden usar institucion incluso si es null)
  const classes = institucion?.clases ?? [];
  const claseIds = useMemo(() => classes.map(c => c.id), [classes]);

  const classesMap = useMemo(() => {
    const m: Record<string, Clase> = {};
    for (const c of classes) m[c.id] = c;
    return m;
  }, [classes]);

  // -----------------------
  // Guard clause: después de hooks
  // -----------------------
  if (!institucion) {
    return <div className="p-6">Selecciona una institución para ver el horario.</div>;
  }

  // -----------------------
  // Render
  // -----------------------
  return (
    <div>
      <Tabs value={tab} onValueChange={(v) => setTab(v)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <TabsList>
              <TabsTrigger value="vista-general">Vista general</TabsTrigger>
              <TabsTrigger value="vista-semanal">Vista semanal</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => onGenerate?.()}>Regenerar</Button>
            <Badge className="text-sm">Clases: {claseIds.length}</Badge>
          </div>
        </div>

        <TabsContent value="vista-general">
          <VistaGeneralHorario
            institucion={institucion}
            timetableByClase={timetableByClase ?? {}}
            classes={classes}
            onGenerate={onGenerate}
          />
        </TabsContent>

        <TabsContent value="vista-semanal">
          <VistaSemanalHorario
            institucion={institucion}
            timetableByClase={timetableByClase ?? {}}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
