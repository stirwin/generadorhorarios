// components/institucion/EditorHorario.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Save, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Institucion } from "@/types/institucion";
import type { TimetableCell } from "@/lib/timetabler";

/**
 * Tipos mínimos esperados (ajusta a tus tipos reales)
 */

type Clase = {
  id: string;
  nombre: string;
};


interface Props {
    institucion: Institucion;

  /**
   * Matriz por clase: key = classId, value = array de length (dias * lecciones)
   * Cada elemento: TimetableCell | null
   */
  timetableByClase?: Record<string, Array<TimetableCell | null> | undefined>;

  /**
   * Opcionales: callbacks para acciones de UI
   */
  onPreview?: (classId: string) => void;
  onExport?: (classId: string) => void;
  onSave?: (classId: string, timetable?: Record<string, Array<TimetableCell | null>>) => void;
}

export default function VistaSemanalHorario({
  institucion,
  timetableByClase,
  onPreview,
  onExport,
  onSave,
}: Props) {
  // Seguridad: si no hay institución, no renderizamos nada (ya lo maneja el nivel superior)
  if (!institucion) return null;

  const dias = institucion.dias_por_semana ?? 5;
  const lecciones = institucion.lecciones_por_dia ?? 7;

  // Lista de clases (fallback vacío)
  const clases = institucion.clases ?? [];

  // clase seleccionada por defecto: primera
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>(clases[0]?.id);

  // obtener la matriz para la clase seleccionada y garantizar longitud correcta
  const matrix = useMemo(() => {
    if (!selectedClassId) return Array(dias * lecciones).fill(null);
    const raw = timetableByClase?.[selectedClassId] ?? [];
    const filled = Array.from({ length: dias * lecciones }, (_, i) => raw[i] ?? null);
    return filled;
  }, [selectedClassId, timetableByClase, dias, lecciones]);

  // Asignaturas presentes en la clase seleccionada (derivadas del horario renderizado, no de BD)
  const asignaturasEnClase = useMemo(() => {
    if (!selectedClassId) return [];
    const arr = timetableByClase?.[selectedClassId] ?? [];
    const map = new Map<string, string>();
    for (const cell of arr) {
      if (!cell) continue;
      const key = cell.asignaturaId || cell.asignaturaNombre || cell.cargaId;
      if (!key) continue;
      const label = cell.asignaturaNombre || cell.asignaturaId || key;
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.values());
  }, [selectedClassId, timetableByClase]);

  // etiquetas de hora: usa periodos si están, si no genera "Slot 1", "Slot 2" o calcula horarios simples
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
    // fallback: generar labels numéricas a partir de un inicio 06:00 + 60min por slot
    const baseHour = 6;
    return Array.from({ length: lecciones }, (_, i) => {
      const hour = baseHour + i;
      const h = String(hour).padStart(2, "0");
      return `${h}:00`;
    });
  }, [institucion.periodos, lecciones]);

  // Nombres de dias (slice por dias)
  const diasNombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].slice(0, dias);
  const breakAfterIndex = 2;
  const rowHeightPx = 64;
  const headerHeightPx = 40;
  const topSlotCount = breakAfterIndex + 1;
  const bottomSlotStart = breakAfterIndex + 1;

  // helpers para rowSpan:
  // Es inicio de bloque si la celda existe y la anterior en la misma columna NO corresponde a la misma lessonId
  function isContinuation(slotIdx: number) {
    const cell = matrix[slotIdx];
    if (!cell) return false;
    const prevIdx = slotIdx - 1;
    // prev must be same day (i.e., same column): prevIdx >= dayStart
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    if (prevIdx < dayStart) return false;
    const prev = matrix[prevIdx];
    if (!prev) return false;
    // compare by lessonId when present, otherwise by asignaturaNombre+docenteNombre
    const key = cell.lessonId ?? `${cell.asignaturaNombre ?? cell.asignaturaId}::${cell.docenteNombre ?? cell.docenteId}`;
    const prevKey = prev.lessonId ?? `${prev.asignaturaNombre ?? prev.asignaturaId}::${prev.docenteNombre ?? prev.docenteId}`;
    return key === prevKey;
  }

  function getCellKey(cell: TimetableCell | null | undefined) {
    if (!cell) return null;
    return cell.lessonId ?? `${cell.asignaturaNombre ?? cell.asignaturaId}::${cell.docenteNombre ?? cell.docenteId}`;
  }

  function getLessonBounds(slotIdx: number) {
    const cell = matrix[slotIdx];
    if (!cell) return null;
    const key = getCellKey(cell);
    if (!key) return null;
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    const dayEndExclusive = dayStart + lecciones;
    let start = slotIdx;
    let end = slotIdx;
    for (let i = slotIdx - 1; i >= dayStart; i--) {
      const prevKey = getCellKey(matrix[i]);
      if (prevKey !== key) break;
      start = i;
    }
    for (let i = slotIdx + 1; i < dayEndExclusive; i++) {
      const nextKey = getCellKey(matrix[i]);
      if (nextKey !== key) break;
      end = i;
    }
    return { start, end, dayStart, dayEndExclusive };
  }

  // rowSpan dentro de un segmento (top/bottom) sin cruzar el descanso
  function getRowSpanWithin(slotIdx: number, segmentEndExclusive: number) {
    const cell = matrix[slotIdx];
    if (!cell) return 1;
    const key = getCellKey(cell);
    if (!key) return 1;
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    const dayEndExclusive = dayStart + lecciones;
    const maxPossible = Math.min(segmentEndExclusive, dayEndExclusive) - slotIdx;
    let span = 1;
    for (let i = 1; i < maxPossible; i++) {
      const nextKey = getCellKey(matrix[slotIdx + i]);
      if (nextKey !== key) break;
      span++;
    }
    return span;
  }

  // obtener nombre de clase por id
  function claseNombreById(id?: string) {
    return clases.find((c) => c.id === id)?.nombre ?? id ?? "Sin clase";
  }

  // acciones
  const handlePreview = () => {
    if (!selectedClassId) return;
    onPreview?.(selectedClassId);
  };
  const handleExport = () => {
    if (!selectedClassId) return;
    onExport?.(selectedClassId);
  };
  const handleSave = () => {
    if (!selectedClassId) return;
    const normalized: Record<string, Array<TimetableCell | null>> = {};
    const table = timetableByClase ?? {};
    for (const [key, arr] of Object.entries(table)) {
      normalized[key] = Array.isArray(arr) ? arr : [];
    }
    onSave?.(selectedClassId, Object.keys(normalized).length ? normalized : undefined);
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header + acciones */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold">{institucion.nombre ?? "Institución"}</h1>
            <p className="text-sm text-muted-foreground">Editor de Horarios — vista semanal</p>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="text-sm text-muted-foreground mr-2">Clase</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="px-3 py-1 border rounded bg-white"
              >
                {clases.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="w-4 h-4 mr-2" /> Vista previa
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" /> Exportar
              </Button>
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" /> Guardar
              </Button>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <Card>
          <CardHeader>
            <CardTitle>Horario Semanal — {claseNombreById(selectedClassId)}</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-muted text-left font-semibold w-28" style={{ height: headerHeightPx }}>Hora</th>
                    {diasNombres.map((dia) => (
                      <th key={dia} className="border p-2 bg-muted text-left font-semibold min-w-[160px]" style={{ height: headerHeightPx }}>
                        {dia}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {Array.from({ length: topSlotCount }).map((_, slotInDay) => {
                    return (
                      <tr key={`row-${slotInDay}`} style={{ height: rowHeightPx }}>
                        {/* etiqueta de hora (fila) */}
                        <td className="border p-2 font-medium bg-muted/50 text-sm">{horaLabels[slotInDay] ?? `Slot ${slotInDay + 1}`}</td>

                        {Array.from({ length: dias }).map((_, dayIdx) => {
                          const slotIdx = dayIdx * lecciones + slotInDay;
                          const cell = matrix[slotIdx];

                          // Si es continuación (parte de un rowSpan superior), no renderizamos nada
                          if (cell && isContinuation(slotIdx)) {
                            return null; // browser seguirá la celda con rowSpan anterior
                          }

                          // Si no hay contenido -> celda vacía clickeable
                          if (!cell) {
                            return (
                              <td key={`c-${slotIdx}`} className="border p-2 align-top">
                                <div className="h-16 flex items-center justify-center text-muted-foreground text-sm cursor-pointer hover:bg-muted/10 rounded">
                                  <span className="select-none">+</span>
                                </div>
                              </td>
                            );
                          }

                          // si existe, calcular rowSpan
                          const dayCalc = Math.floor(slotIdx / lecciones);
                          const dayStart = dayCalc * lecciones;
                          const slotInDayCalc = slotIdx - dayStart;
                          const rowSpan = getRowSpanWithin(slotIdx, dayStart + topSlotCount);
                          const bounds = getLessonBounds(slotIdx);
                          const crossesBreak = bounds ? (bounds.start <= dayStart + breakAfterIndex && bounds.end > dayStart + breakAfterIndex) : false;

                          // clamping y presentacion
                          const asignatura = cell.asignaturaNombre ?? cell.asignaturaId ?? "Asignatura";
                          const docente = cell.docenteNombre ?? cell.docenteId ?? "-";
                          const dur = Math.max(1, cell.duracion ?? 1);

                          // color: simple hashing por lessonId/asignatura para generar clase tailwind bg
                          const colorClass = (() => {
                            const seed = (cell.lessonId ?? asignatura).toString();
                            const colors = [
                              "bg-blue-600", "bg-green-600", "bg-purple-600",
                              "bg-orange-500", "bg-rose-600", "bg-sky-600", "bg-amber-600",
                            ];
                            let h = 0;
                            for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
                            return colors[Math.abs(h) % colors.length];
                          })();

                          return (
                            <td key={`c-${slotIdx}`} rowSpan={Math.min(rowSpan, topSlotCount - slotInDay)} className="border p-2 align-top">
                              <div className={`${colorClass} text-white p-2 rounded-lg cursor-pointer`}>
                                <div className="font-semibold text-sm truncate">{asignatura}</div>
                                <div className="text-xs opacity-90 mt-1 truncate">{docente}</div>
                                {crossesBreak && (
                                  <div className="mt-1 inline-flex rounded bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                                    Continúa después del descanso
                                  </div>
                                )}
                                <div className="text-[11px] opacity-80 mt-1">
                                  {dur > 1 ? `${dur} slots` : "1 slot"}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="my-3">
                <div className="relative">
                  <div className="border-t border-dashed border-amber-300" />
                  <div className="absolute left-1/2 -translate-x-1/2 -top-2 bg-background px-3 text-xs font-semibold text-amber-700">
                    Descanso
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse">
                <tbody>
                  {Array.from({ length: lecciones - bottomSlotStart }).map((_, offset) => {
                    const slotInDay = bottomSlotStart + offset;
                    return (
                      <tr key={`row-b-${slotInDay}`} style={{ height: rowHeightPx }}>
                        <td className="border p-2 font-medium bg-muted/50 text-sm">{horaLabels[slotInDay] ?? `Slot ${slotInDay + 1}`}</td>
                        {Array.from({ length: dias }).map((_, dayIdx) => {
                          const slotIdx = dayIdx * lecciones + slotInDay;
                          const cell = matrix[slotIdx];

                          if (cell && slotInDay !== bottomSlotStart && isContinuation(slotIdx)) {
                            return null;
                          }

                          if (!cell) {
                            return (
                              <td key={`c-b-${slotIdx}`} className="border p-2 align-top">
                                <div className="h-16 flex items-center justify-center text-muted-foreground text-sm cursor-pointer hover:bg-muted/10 rounded">
                                  <span className="select-none">+</span>
                                </div>
                              </td>
                            );
                          }

                          const dayCalc = Math.floor(slotIdx / lecciones);
                          const dayStart = dayCalc * lecciones;
                          const slotInDayCalc = slotIdx - dayStart;
                          const rowSpan = getRowSpanWithin(slotIdx, dayStart + lecciones);
                          const bounds = getLessonBounds(slotIdx);
                          const crossesBreak = bounds ? (bounds.start <= dayStart + breakAfterIndex && bounds.end > dayStart + breakAfterIndex) : false;

                          const asignatura = cell.asignaturaNombre ?? cell.asignaturaId ?? "Asignatura";
                          const docente = cell.docenteNombre ?? cell.docenteId ?? "-";
                          const dur = Math.max(1, cell.duracion ?? 1);

                          const colorClass = (() => {
                            const seed = (cell.lessonId ?? asignatura).toString();
                            const colors = [
                              "bg-blue-600", "bg-green-600", "bg-purple-600",
                              "bg-orange-500", "bg-rose-600", "bg-sky-600", "bg-amber-600",
                            ];
                            let h = 0;
                            for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
                            return colors[Math.abs(h) % colors.length];
                          })();

                          return (
                            <td key={`c-b-${slotIdx}`} rowSpan={Math.min(rowSpan, lecciones - slotInDay)} className="border p-2 align-top">
                              <div className={`${colorClass} text-white p-2 rounded-lg cursor-pointer`}>
                                <div className="font-semibold text-sm truncate">{asignatura}</div>
                                <div className="text-xs opacity-90 mt-1 truncate">{docente}</div>
                                {crossesBreak && (
                                  <div className="mt-1 inline-flex rounded bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                                    Continúa después del descanso
                                  </div>
                                )}
                                <div className="text-[11px] opacity-80 mt-1">
                                  {dur > 1 ? `${dur} slots` : "1 slot"}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Panel lateral: Asignaturas disponibles (simple) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                - Las celdas con color representan una lección asignada (incluye duración en slots). <br />
                - Haciendo click en + se podría abrir editor inline para asignar una asignatura/ docente (pendiente de implementar).
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Asignaturas Disponibles</CardTitle>
            </CardHeader>
            <CardContent>
              {asignaturasEnClase.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {asignaturasEnClase.map((asig) => (
                    <Badge key={asig} variant="secondary" className="text-xs">
                      {asig}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No se encontraron asignaturas en el horario de esta clase.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
