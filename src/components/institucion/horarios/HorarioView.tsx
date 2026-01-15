"use client";

import { useMemo, useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import VistaGeneralHorario from "./horariosTabs/GeneralHorario";
import VistaSemanalHorario from "./horariosTabs/VistaSemanalHorario";
import VistaSemanalDocente from "./horariosTabs/VistaSemanalDocente";
import VistaReunionesArea from "./horariosTabs/VistaReunionesArea";
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

  // Exportar un PDF simple con todos los horarios por clase (HTML + print)
  const handleExportAllClasses = () => {
    if (!institucion) return;
    const dias = institucion.dias_por_semana ?? (institucion as any).diasPorSemana ?? 5;
    const lecciones = institucion.lecciones_por_dia ?? (institucion as any).leccionesPorDia ?? 6;
    const diasNombres = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].slice(0, dias);
    const periodos = (institucion as any).periodos ?? [];
    const horaLabels = Array.from({ length: lecciones }, (_, i) => {
      if (Array.isArray(periodos) && periodos[i]) {
        const p = periodos[i];
        const inicio = p.hora_inicio ?? p.horaInicio;
        const fin = p.hora_fin ?? p.horaFin;
        if (inicio && fin) return `${inicio} - ${fin}`;
        if (inicio) return inicio;
        if (p.abreviatura) return p.abreviatura;
      }
      const base = 6 + i;
      return `${String(base).padStart(2,"0")}:00`;
    });

    const table = timetableByClase ?? {};
    const classList = derivedClasses.length > 0
      ? derivedClasses
      : Object.keys(table).map((id) => ({ id, nombre: id }));

    const style = `
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; }
        h2 { margin-top: 24px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #ccc; padding: 6px; font-size: 12px; }
        th { background: #f5f5f5; }
        .slot { min-height: 32px; }
      </style>
    `;

    const content = classList.map((clase) => {
      const arr = table[clase.id] ?? [];
      const cells = Array.from({ length: dias * lecciones }, (_, i) => arr[i] ?? null);
      const rows = horaLabels.map((label, slotInDay) => {
        const cellsHtml = diasNombres.map((_, day) => {
          const idx = day * lecciones + slotInDay;
          const cell = cells[idx] as TimetableCell | null;
          if (!cell) return `<td class="slot"></td>`;
          const asignatura = cell.asignaturaNombre ?? cell.asignaturaId ?? "Asignatura";
          const docente = cell.docenteNombre ?? cell.docenteId ?? "";
          return `<td class="slot"><div><strong>${asignatura}</strong><br/><span>${docente}</span></div></td>`;
        }).join("");
        return `<tr><td><strong>${label}</strong></td>${cellsHtml}</tr>`;
      }).join("");

      const headerCols = diasNombres.map((d) => `<th>${d}</th>`).join("");
      return `
        <div>
          <h2>${clase.nombre}</h2>
          <table>
            <thead>
              <tr>
                <th>Hora</th>${headerCols}
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Horarios por clase</title>${style}</head><body>${content}</body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // dar tiempo a cargar estilos antes de imprimir
    setTimeout(() => {
      win.print();
    }, 300);
  };

  // Exportar un PDF con el horario semanal por docente
  const handleExportAllTeachers = () => {
    if (!institucion) return;
    const dias = institucion.dias_por_semana ?? (institucion as any).diasPorSemana ?? 5;
    const lecciones = institucion.lecciones_por_dia ?? (institucion as any).leccionesPorDia ?? 6;
    const diasNombres = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].slice(0, dias);
    const periodos = (institucion as any).periodos ?? [];
    const horaLabels = Array.from({ length: lecciones }, (_, i) => {
      if (Array.isArray(periodos) && periodos[i]) {
        const p = periodos[i];
        const inicio = p.hora_inicio ?? p.horaInicio;
        const fin = p.hora_fin ?? p.horaFin;
        if (inicio && fin) return `${inicio} - ${fin}`;
        if (inicio) return inicio;
        if (p.abreviatura) return p.abreviatura;
      }
      const base = 6 + i;
      return `${String(base).padStart(2,"0")}:00`;
    });

    const table = timetableByClase ?? {};
    const teacherMap = new Map<string, string>(); // id -> nombre
    for (const arr of Object.values(table)) {
      if (!arr) continue;
      for (const cell of arr) {
        if (!cell) continue;
        const id = cell.docenteId ?? cell.docenteNombre;
        if (!id) continue;
        const nombre = cell.docenteNombre ?? cell.docenteId ?? "Docente";
        if (!teacherMap.has(id)) teacherMap.set(id, nombre);
      }
    }
    const teachers = Array.from(teacherMap.entries()).map(([id, nombre]) => ({ id, nombre }));
    if (teachers.length === 0) return;

    const classNameById = new Map<string, string>();
    derivedClasses.forEach((c) => classNameById.set(c.id, c.nombre ?? c.id));

    const style = `
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; }
        h2 { margin-top: 24px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #ccc; padding: 6px; font-size: 12px; }
        th { background: #f5f5f5; }
        .slot { min-height: 32px; }
      </style>
    `;

    const content = teachers.map((teacher) => {
      const matrix: Array<(TimetableCell & { claseNombre?: string }) | null> = Array(dias * lecciones).fill(null);
      for (const [claseId, arr] of Object.entries(table)) {
        if (!arr) continue;
        arr.forEach((cell, idx) => {
          if (!cell) return;
          const docenteKey = cell.docenteId ?? cell.docenteNombre;
          if (docenteKey !== teacher.id) return;
          if (matrix[idx]) {
            const existing = matrix[idx]!;
            matrix[idx] = {
              ...existing,
              asignaturaNombre: `${existing.asignaturaNombre ?? existing.asignaturaId} / ${cell.asignaturaNombre ?? cell.asignaturaId}`,
            };
          } else {
            matrix[idx] = { ...cell, claseNombre: classNameById.get(claseId) ?? cell.claseNombre ?? claseId };
          }
        });
      }

      const rows = horaLabels.map((label, slotInDay) => {
        const cellsHtml = diasNombres.map((_, day) => {
          const idx = day * lecciones + slotInDay;
          const cell = matrix[idx];
          if (!cell) return `<td class="slot"></td>`;
          const asignatura = cell.asignaturaNombre ?? cell.asignaturaId ?? "Asignatura";
          const clase = cell.claseNombre ?? cell.claseId ?? "";
          return `<td class="slot"><div><strong>${asignatura}</strong><br/><span>${clase}</span></div></td>`;
        }).join("");
        return `<tr><td><strong>${label}</strong></td>${cellsHtml}</tr>`;
      }).join("");

      const headerCols = diasNombres.map((d) => `<th>${d}</th>`).join("");
      return `
        <div>
          <h2>${teacher.nombre}</h2>
          <table>
            <thead>
              <tr>
                <th>Hora</th>${headerCols}
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Horarios por docente</title>${style}</head><body>${content}</body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  };

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
              <TabsTrigger value="vista-docente">Por docente</TabsTrigger>
              <TabsTrigger value="vista-reuniones">Reuniones de área</TabsTrigger>
            </TabsList>
          </div>
          <Badge className="text-sm">Clases: {claseIds.length}</Badge>
        </div>

        <TabsContent value="vista-general">
          <VistaGeneralHorario
            institucion={institucion}
            timetableByClase={timetableByClase ?? {}}
            classes={derivedClasses}
            onGenerate={onGenerate}
            // REENVÍO de metadatos para que la vista muestre logs
            timetablerMeta={timetablerMeta}
            onExportAll={() => handleExportAllClasses()}
          />
        </TabsContent>

        <TabsContent value="vista-semanal">
          <VistaSemanalHorario
            institucion={institucion}
            timetableByClase={timetableByClase ?? {}}
            // opcional: si quieres, reenvía timetablerMeta también a la vista semanal
            // timetablerMeta={timetablerMeta}
            onExport={() => handleExportAllClasses()}
          />
        </TabsContent>

        <TabsContent value="vista-docente">
          <VistaSemanalDocente
            institucion={institucion}
            timetableByClase={timetableByClase ?? {}}
            onExport={() => handleExportAllTeachers()}
          />
        </TabsContent>

        <TabsContent value="vista-reuniones">
          <VistaReunionesArea
            institucion={institucion}
            timetablerMeta={timetablerMeta}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
