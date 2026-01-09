// Vista semanal por docente
"use client";

import React, { useMemo, useState } from "react";
import { Eye, Download, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Institucion } from "@/types/institucion";
import type { TimetableCell } from "@/lib/timetabler";

type Teacher = { id: string; nombre: string };

interface Props {
  institucion: Institucion;
  timetableByClase?: Record<string, Array<TimetableCell | null> | undefined>;
  onPreview?: (teacherId: string) => void;
  onExport?: (teacherId: string) => void;
  onSave?: (teacherId: string, timetable?: Record<string, Array<TimetableCell | null>>) => void;
}

export default function VistaSemanalDocente({
  institucion,
  timetableByClase,
  onPreview,
  onExport,
  onSave,
}: Props) {
  if (!institucion) return null;

  const dias = institucion.dias_por_semana ?? institucion.diasPorSemana ?? 5;
  const lecciones = institucion.lecciones_por_dia ?? institucion.leccionesPorDia ?? 6;
  const classes = institucion.clases ?? [];
  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c) => map.set(c.id, c.nombre ?? c.abreviatura ?? c.id));
    return map;
  }, [classes]);

  const normalizedTable = useMemo(() => {
    const out: Record<string, Array<TimetableCell | null>> = {};
    if (!timetableByClase) return out;
    for (const [key, arr] of Object.entries(timetableByClase)) {
      out[key] = Array.isArray(arr) ? arr : [];
    }
    return out;
  }, [timetableByClase]);

  // Construir lista de docentes desde el horario
  const teachers: Teacher[] = useMemo(() => {
    const table = normalizedTable;
    const map = new Map<string, string>();
    for (const arr of Object.values(table)) {
      if (!arr) continue;
      for (const cell of arr) {
        if (!cell) continue;
        const id = cell.docenteId ?? cell.docenteNombre;
        if (!id) continue;
        const nombre = cell.docenteNombre ?? cell.docenteId ?? "Desconocido";
        if (!map.has(id)) map.set(id, nombre);
      }
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [timetableByClase]);

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | undefined>(teachers[0]?.id);

  // Matriz por docente (dias*lecciones) derivada de todo el timetable
  const matrix = useMemo(() => {
    if (!selectedTeacherId) return Array(dias * lecciones).fill(null);
    const out: Array<(TimetableCell & { claseNombre?: string }) | null> = Array(dias * lecciones).fill(null);
    const table = normalizedTable;

    for (const [claseId, arr] of Object.entries(table)) {
      if (!arr) continue;
      arr.forEach((cell, idx) => {
        if (!cell) return;
        const docenteKey = cell.docenteId ?? cell.docenteNombre;
        if (!docenteKey || docenteKey !== selectedTeacherId) return;
        // Si ya hay algo en el slot, marcamos conflicto concatenando nombres
        if (out[idx]) {
          const existing = out[idx]!;
          out[idx] = {
            ...existing,
            asignaturaNombre: `${existing.asignaturaNombre ?? existing.asignaturaId} / ${cell.asignaturaNombre ?? cell.asignaturaId}`,
          };
        } else {
          out[idx] = {
            ...cell,
            claseNombre: classNameById.get(claseId) ?? cell.claseNombre ?? claseId,
          };
        }
      });
    }
    return out;
  }, [selectedTeacherId, normalizedTable, dias, lecciones, classNameById]);

  // Asignaturas impartidas por el docente (derivadas)
  const asignaturasDelDocente = useMemo(() => {
    const map = new Map<string, string>();
    matrix.forEach((cell) => {
      if (!cell) return;
      const key = cell.asignaturaId ?? cell.asignaturaNombre;
      if (!key) return;
      const label = cell.asignaturaNombre ?? cell.asignaturaId ?? key;
      if (!map.has(key)) map.set(key, label);
    });
    return Array.from(map.values());
  }, [matrix]);

  // Hora labels
  const horaLabels = useMemo(() => {
    const p = institucion.periodos ?? [];
    if (p.length >= lecciones) {
      return p.slice(0, lecciones).map((x, idx) => {
        const inicio = x.hora_inicio ?? (x as any).horaInicio;
        const fin = x.hora_fin ?? (x as any).horaFin;
        if (inicio && fin) return `${inicio} - ${fin}`;
        if (inicio) return inicio;
        if (x.abreviatura) return x.abreviatura;
        return `Slot ${x.indice ?? idx + 1}`;
      });
    }
    const baseHour = 6;
    return Array.from({ length: lecciones }, (_, i) => {
      const h = String(baseHour + i).padStart(2, "0");
      return `${h}:00`;
    });
  }, [institucion.periodos, lecciones]);

  const diasNombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].slice(0, dias);

  const isContinuation = (slotIdx: number) => {
    const cell = matrix[slotIdx];
    if (!cell) return false;
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    const prevIdx = slotIdx - 1;
    if (prevIdx < dayStart) return false;
    const prev = matrix[prevIdx];
    if (!prev) return false;
    const key = cell.lessonId ?? `${cell.asignaturaNombre ?? cell.asignaturaId}::${cell.claseNombre ?? cell.claseId}`;
    const prevKey = prev.lessonId ?? `${prev.asignaturaNombre ?? prev.asignaturaId}::${prev.claseNombre ?? prev.claseId}`;
    return key === prevKey;
  };

  const getRowSpan = (slotIdx: number) => {
    const cell = matrix[slotIdx];
    if (!cell) return 1;
    const dur = Math.max(1, Math.floor(cell.duracion ?? 1));
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    const dayEndExclusive = dayStart + lecciones;
    return Math.min(dur, dayEndExclusive - slotIdx);
  };

  const handlePreview = () => selectedTeacherId && onPreview?.(selectedTeacherId);
  const handleExport = () => selectedTeacherId && onExport?.(selectedTeacherId);
  const handleSave = () => selectedTeacherId && onSave?.(selectedTeacherId, Object.keys(normalizedTable).length ? normalizedTable : undefined);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold">{institucion.nombre ?? "Institución"}</h1>
            <p className="text-sm text-muted-foreground">Horario semanal por docente</p>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="text-sm text-muted-foreground mr-2">Docente</label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="px-3 py-1 border rounded bg-white"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePreview}><Eye className="w-4 h-4 mr-2" />Vista previa</Button>
              <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Exportar</Button>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />Guardar</Button>
            </div>
          </div>
        </div>

        {/* Asignaturas del docente */}
        {asignaturasDelDocente.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground uppercase">Asignaturas:</span>
            {asignaturasDelDocente.map((a) => (
              <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Horario Semanal — {teachers.find((t) => t.id === selectedTeacherId)?.nombre ?? "Docente"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-muted text-left font-semibold w-28">Hora</th>
                    {diasNombres.map((dia) => (
                      <th key={dia} className="border p-2 bg-muted text-left font-semibold min-w-[160px]">
                        {dia}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: lecciones }).map((_, slotInDay) => (
                    <tr key={`row-${slotInDay}`}>
                      <td className="border p-2 font-medium bg-muted/50 text-sm">{horaLabels[slotInDay] ?? `Slot ${slotInDay + 1}`}</td>
                      {Array.from({ length: dias }).map((_, day) => {
                        const slotIdx = day * lecciones + slotInDay;
                        const cell = matrix[slotIdx];
                        if (cell && isContinuation(slotIdx)) return null;
                        if (!cell) {
                          return (
                            <td key={`c-${slotIdx}`} className="border p-2 align-top">
                              <div className="h-16 flex items-center justify-center text-muted-foreground text-sm rounded">
                                —
                              </div>
                            </td>
                          );
                        }
                        const rowSpan = getRowSpan(slotIdx);
                        const asignatura = cell.asignaturaNombre ?? cell.asignaturaId ?? "Asignatura";
                        const clase = cell.claseNombre ?? cell.claseId ?? "Clase";
                        const dur = Math.max(1, cell.duracion ?? 1);
                        const colorClass = (() => {
                          const seed = (cell.lessonId ?? asignatura).toString();
                          const colors = ["bg-blue-600", "bg-green-600", "bg-purple-600", "bg-orange-500", "bg-rose-600", "bg-sky-600", "bg-amber-600"];
                          let h = 0;
                          for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
                          return colors[Math.abs(h) % colors.length];
                        })();
                        return (
                          <td key={`c-${slotIdx}`} rowSpan={rowSpan} className="border p-2 align-top">
                            <div className={`${colorClass} text-white p-2 rounded-lg`}>
                              <div className="font-semibold text-sm truncate">{asignatura}</div>
                              <div className="text-xs opacity-90 mt-1 truncate">{clase}</div>
                              <div className="text-[11px] opacity-80 mt-1">{dur > 1 ? `${dur} slots` : "1 slot"}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
