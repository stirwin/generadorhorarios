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
  // Seguridad: si no hay institucion, mostramos mensaje
  if (!institucion) {
    return (
      <div className="p-6">
        <Card>  
          <CardHeader>
            <CardTitle>Editor de Horarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">Selecciona una institución para ver o generar el horario.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  // etiquetas de hora: usa periodos si están, si no genera "Slot 1", "Slot 2" o calcula horarios simples
  const horaLabels = useMemo(() => {
    const p = institucion.periodos ?? [];
    if (p.length >= lecciones) {
      return p.slice(0, lecciones).map((x) => x.hora_inicio ?? x.abreviatura ?? `Slot ${x.indice}`);
    }
    // fallback: generar labels numéricas a partir de un inicio 08:00 + 45min por slot (aprox.)
    const baseHour = 8;
    return Array.from({ length: lecciones }, (_, i) => {
      const hour = baseHour + i;
      const h = String(hour).padStart(2, "0");
      return `${h}:00`;
    });
  }, [institucion.periodos, lecciones]);

  // Nombres de dias (slice por dias)
  const diasNombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].slice(0, dias);

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

  // clamp rowSpan to remaining rows in the column
  function getRowSpan(slotIdx: number) {
    const cell = matrix[slotIdx];
    if (!cell) return 1;
    const dur = Math.max(1, Math.floor(cell.duracion ?? 1));
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    const dayEndExclusive = dayStart + lecciones;
    // maximum rows available from slotIdx to dayEndExclusive
    const maxPossible = dayEndExclusive - slotIdx;
    return Math.min(dur, maxPossible);
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
    onSave?.(selectedClassId, timetableByClase ?? undefined);
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
                    <th className="border p-2 bg-muted text-left font-semibold w-28">Hora</th>
                    {diasNombres.map((dia) => (
                      <th key={dia} className="border p-2 bg-muted text-left font-semibold min-w-[160px]">
                        {dia}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {Array.from({ length: lecciones }).map((_, slotInDay) => {
                    return (
                      <tr key={`row-${slotInDay}`}>
                        {/* etiqueta de hora (fila) */}
                        <td className="border p-2 font-medium bg-muted/50 text-sm">{horaLabels[slotInDay] ?? `Slot ${slotInDay + 1}`}</td>

                        {Array.from({ length: dias }).map((_, day) => {
                          const slotIdx = day * lecciones + slotInDay;
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
                          const rowSpan = getRowSpan(slotIdx);

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
                            <td key={`c-${slotIdx}`} rowSpan={rowSpan} className="border p-2 align-top">
                              <div className={`${colorClass} text-white p-2 rounded-lg cursor-pointer`}>
                                <div className="font-semibold text-sm truncate">{asignatura}</div>
                                <div className="text-xs opacity-90 mt-1 truncate">{docente}</div>
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
              <div className="flex flex-wrap gap-2">
                {/* Este bloque es demostrativo; integra tu lista real de asignaturas */}
                <Badge className="bg-blue-500 cursor-pointer">Matemáticas</Badge>
                <Badge className="bg-green-500 cursor-pointer">Lengua</Badge>
                <Badge className="bg-purple-500 cursor-pointer">Ciencias</Badge>
                <Badge className="bg-amber-500 cursor-pointer">Historia</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
