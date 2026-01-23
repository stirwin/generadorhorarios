// Vista semanal por docente
"use client";

import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Institucion } from "@/types/institucion";
import type { TimetableCell } from "@/lib/timetabler";

type Teacher = { id: string; nombre: string };

interface Props {
  institucion: Institucion;
  timetableByClase?: Record<string, Array<TimetableCell | null> | undefined>;
  timetablerMeta?: any;
  onExport?: (teacherId: string) => void;
}

export default function VistaSemanalDocente({
  institucion,
  timetableByClase,
  timetablerMeta,
  onExport,
}: Props) {
  if (!institucion) return null;

  const dias = institucion.dias_por_semana ?? institucion.diasPorSemana ?? 5;
  const lecciones = institucion.lecciones_por_dia ?? institucion.leccionesPorDia ?? 6;
  const rowHeightPx = 64;
  const breakAfterIndex = 2;
  const classes = institucion.clases ?? [];
  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c) => map.set(c.id, c.nombre ?? c.abreviatura ?? c.id));
    return map;
  }, [classes]);
  const teacherNameById = useMemo(() => {
    const map = new Map<string, string>();
    (institucion.docentes ?? []).forEach((d) => map.set(d.id, d.nombre ?? d.id));
    return map;
  }, [institucion.docentes]);

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
    const meetings = (timetablerMeta?.areaMeetings?.assigned ?? []) as Array<{ teachers: string[] }>;
    for (const meeting of meetings) {
      for (const id of meeting.teachers ?? []) {
        const nombre = teacherNameById.get(id) ?? id;
        if (!map.has(id)) map.set(id, nombre);
      }
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [timetableByClase, timetablerMeta, teacherNameById]);

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
    const assignedMeetings = (timetablerMeta?.areaMeetings?.assigned ?? []) as Array<{
      groupId: string;
      label: string;
      slot: number;
      teachers: string[];
    }>;
    for (const meeting of assignedMeetings) {
      if (!meeting.teachers?.includes(selectedTeacherId)) continue;
      const slotIdx = meeting.slot;
      if (slotIdx < 0 || slotIdx >= out.length) continue;
      if (out[slotIdx]) {
        const existing = out[slotIdx]!;
        existing.asignaturaNombre = `${existing.asignaturaNombre ?? existing.asignaturaId} / Reunión de área`;
        if (meeting.label) {
          existing.claseNombre = `${existing.claseNombre ?? existing.claseId} · ${meeting.label}`;
        }
      } else {
        out[slotIdx] = {
          cargaId: `meeting::${meeting.groupId}`,
          lessonId: `meeting::${meeting.groupId}`,
          asignaturaId: "meeting",
          asignaturaNombre: "Reunión de área",
          docenteId: selectedTeacherId,
          docenteNombre: teacherNameById.get(selectedTeacherId) ?? selectedTeacherId,
          claseId: `meeting::${meeting.groupId}`,
          claseNombre: meeting.label ?? "Reunión de área",
          duracion: 1,
        };
      }
    }
    return out;
  }, [selectedTeacherId, normalizedTable, dias, lecciones, classNameById, timetablerMeta, teacherNameById]);

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
    return Array.from({ length: lecciones }, (_, i) => String(i + 1));
  }, [lecciones]);

  const diasNombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].slice(0, dias);

  const getLessonKey = (cell: TimetableCell & { claseNombre?: string } | null) => {
    if (!cell) return "";
    return cell.lessonId ?? `${cell.asignaturaNombre ?? cell.asignaturaId}::${cell.claseNombre ?? cell.claseId}`;
  };

  const isContinuation = (slotIdx: number) => {
    const cell = matrix[slotIdx];
    if (!cell) return false;
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    const prevIdx = slotIdx - 1;
    if (prevIdx < dayStart) return false;
    if (prevIdx === dayStart + breakAfterIndex) return false;
    const prev = matrix[prevIdx];
    if (!prev) return false;
    return getLessonKey(cell) === getLessonKey(prev);
  };

  const getRowSpan = (slotIdx: number) => {
    const cell = matrix[slotIdx];
    if (!cell) return 1;
    const day = Math.floor(slotIdx / lecciones);
    const dayStart = day * lecciones;
    const dayEndExclusive = dayStart + lecciones;
    const breakIdx = dayStart + breakAfterIndex;
    const key = getLessonKey(cell);
    let span = 1;
    for (let i = slotIdx + 1; i < dayEndExclusive; i++) {
      if (slotIdx <= breakIdx && i === breakIdx + 1) break;
      const next = matrix[i];
      if (!next) break;
      if (getLessonKey(next) !== key) break;
      span += 1;
    }
    return Math.min(span, dayEndExclusive - slotIdx);
  };

  const handleExport = () => selectedTeacherId && onExport?.(selectedTeacherId);

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
              <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Exportar</Button>
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
              <table className="w-full border-collapse table-fixed">
                <colgroup>
                  <col className="w-28" />
                  <col span={dias} />
                </colgroup>
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
                  {Array.from({ length: lecciones }).flatMap((_, slotInDay) => {
                    const row = (
                      <tr key={`row-${slotInDay}`} style={{ height: rowHeightPx }}>
                      <td className="border p-2 font-medium bg-muted/50 text-sm w-28">{horaLabels[slotInDay] ?? `Slot ${slotInDay + 1}`}</td>
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
                        const displayRowSpan = Math.min(rowSpan, lecciones - slotInDay);
                        const cellHeight = rowHeightPx * displayRowSpan;
                        return (
                          <td
                            key={`c-${slotIdx}`}
                            rowSpan={displayRowSpan}
                            className="border align-top p-2"
                            style={{ height: `${cellHeight}px` }}
                          >
                            <div className={`${colorClass} text-white p-2 rounded-lg h-full w-full flex flex-col justify-between`}>
                              <div className="font-semibold text-sm truncate">{asignatura}</div>
                              <div className="text-xs opacity-90 mt-1 truncate">{clase}</div>
                              <div className="text-[11px] opacity-80 mt-1">{dur > 1 ? `${dur} slots` : "1 slot"}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    );
                    if (slotInDay === 2) {
                      return [
                        row,
                        (
                          <tr key={`break-${slotInDay}`}>
                            <td colSpan={dias + 1} className="border p-2 text-center text-xs font-semibold text-amber-700 bg-amber-50">
                              DESCANSO
                            </td>
                          </tr>
                        ),
                      ];
                    }
                    return [row];
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
