"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import VistaGeneralHorario from "./horariosTabs/GeneralHorario";
import VistaSemanalHorario from "./horariosTabs/VistaSemanalHorario";
import { Institucion } from "@/types/institucion";
import type { TimetableCell } from "@/lib/timetabler"; // <-- usar el tipo canonical

export type Periodo = { indice: number; abreviatura?: string; hora_inicio?: string; hora_fin?: string; duracion_min?: number };
export type Clase = { id: string; nombre: string };

export default function HorariosView({
  institucion,
  timetableByClase,
  onGenerate,
  timetablerMeta, // NUEVO: prop opcional con debug/meta
}: {
  institucion: Institucion | null;
  timetableByClase?: Record<string, Array<TimetableCell | null>>;
  onGenerate?: () => Promise<void> | void;
  timetablerMeta?: any;
}) {
  // -----------------------
  // Hooks: siempre arriba
  // -----------------------
  const STORAGE_KEY = "horario:view";
  const [tab, setTab] = useState<string>(() => {
    try { return (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null) ?? "vista-general"; } catch { return "vista-general"; }
  });

  useEffect(() => {
    try { if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, tab); } catch {}
  }, [tab]);

  // -----------------------
  // classes: preferir institucion.clases, si está vacío derivar desde timetableByClase
  // -----------------------
  const classesFromInstitution = institucion?.clases ?? [];
  const [fetchedClasses, setFetchedClasses] = useState<Clase[]>([]);

  // Si no tenemos clases en la institución seleccionada, intenta cargarlas desde el API (filtro por id)
  useEffect(() => {
    let abort = false;
    async function maybeFetch() {
      if (!institucion?.id) return;
      if (Array.isArray(classesFromInstitution) && classesFromInstitution.length > 0) {
        setFetchedClasses([]);
        return;
      }
      try {
        const res = await fetch("/api/instituciones");
        if (!res.ok) return;
        const data = await res.json();
        const match = (data || []).find((ins: any) => ins.id === institucion.id);
        if (!match) return;
        if (abort) return;
        const mapped: Clase[] = Array.isArray(match.clases)
          ? match.clases.map((c: any) => ({
              id: c.id,
              nombre: c.nombre ?? c.abreviatura ?? String(c.id),
            }))
          : [];
        setFetchedClasses(mapped);
      } catch (e) {
        // silencio: es solo mejora visual
      }
    }
    maybeFetch();
    return () => { abort = true; };
  }, [institucion?.id, classesFromInstitution]);

  const derivedClasses = useMemo<Clase[]>(() => {
    if (Array.isArray(classesFromInstitution) && classesFromInstitution.length > 0) {
      return classesFromInstitution.map((c: any) => ({ id: c.id, nombre: c.nombre ?? String(c.id) }));
    }
    if (fetchedClasses.length > 0) {
      return fetchedClasses;
    }

    const table = timetableByClase ?? {};
    const keys = Object.keys(table);
    if (keys.length === 0) return [];

    return keys.map((k) => {
      const arr = table[k] ?? [];
      const sample = Array.isArray(arr) ? arr.find(Boolean) as TimetableCell | undefined : undefined;
      const claseNombre = sample?.claseNombre ?? sample?.claseId ?? undefined;
      const asignatura = sample?.asignaturaNombre ?? sample?.asignaturaId ?? undefined;
      const displayName = claseNombre ?? asignatura ?? k;
      return { id: k, nombre: String(displayName) };
    });
  }, [classesFromInstitution, fetchedClasses, timetableByClase]);

  const claseIds = useMemo(() => derivedClasses.map(c => c.id), [derivedClasses]);

  if (!institucion) {
    return <div className="p-6">Selecciona una institución para ver el horario.</div>;
  }

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
            classes={derivedClasses}
            onGenerate={onGenerate}
            // REENVÍO de metadatos para que la vista muestre logs
            timetablerMeta={timetablerMeta}
          />
        </TabsContent>

        <TabsContent value="vista-semanal">
          <VistaSemanalHorario
            institucion={institucion}
            timetableByClase={timetableByClase ?? {}}
            // opcional: si quieres, reenvía timetablerMeta también a la vista semanal
            // timetablerMeta={timetablerMeta}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
