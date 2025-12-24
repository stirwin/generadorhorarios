// components/horarios/views/VistaGeneralHorario.tsx
"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TimetableCell } from "@/types/institucion";

export type Periodo = { indice: number; abreviatura?: string; hora_inicio?: string; hora_fin?: string; duracion_min?: number };
export type Clase = { id: string; nombre: string };

export default function VistaGeneralHorario({
  institucion,
  timetableByClase,
  classes,
  onGenerate,
}: {
  institucion: { id: string; nombre?: string; dias_por_semana?: number; lecciones_por_dia?: number; periodos?: Periodo[] };
  timetableByClase: Record<string, Array<TimetableCell | null>>;
  classes: Clase[];
  onGenerate?: () => Promise<void> | void;
}) {
  const dias = institucion.dias_por_semana ?? 5;
  const lecciones = institucion.lecciones_por_dia ?? 7;
  const diasNombres = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].slice(0, dias);

  const classesMap = useMemo(() => {
    const m: Record<string, Clase> = {};
    for (const c of classes) m[c.id] = c;
    return m;
  }, [classes]);

  function getCell(claseId: string, slotIdx: number) {
    const arr = timetableByClase?.[claseId] ?? [];
    return arr[slotIdx] ?? null;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Vista general — {institucion.nombre}</h3>
        <div className="flex gap-2 items-center">
          <Button onClick={() => onGenerate?.()} variant="outline">Generar/Regenerar</Button>
          <Badge className="text-sm">Clases: {classes.length}</Badge>
        </div>
      </div>

      <div className="overflow-auto border rounded">
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background z-10 p-2 border">Clase</th>
              {diasNombres.map(d => <th key={d} className="p-2 text-center border">{d}</th>)}
            </tr>

            <tr>
              <th />
              {diasNombres.map((d, i) => (
                <th key={`sub-${i}`} className="p-0 border">
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(48px,1fr))` }}>
                    {Array.from({ length: lecciones }).map((_, j) => (
                      <div key={j} className="text-xs p-2 border text-center">{j + 1}</div>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {classes.map(({ id: claseId }) => (
              <tr key={claseId} className="border-t">
                <td className="sticky left-0 bg-background z-10 p-2 font-medium border-r">
                  {classesMap[claseId]?.nombre ?? claseId}
                </td>

                {Array.from({ length: dias }).map((_, day) => {
                  const dayStart = day * lecciones;
                  return (
                    <td key={`${claseId}-d${day}`} className="p-0 align-top">
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(48px,1fr))` }}>
                        {Array.from({ length: lecciones }).map((__, slotInDay) => {
                          const slotIdx = dayStart + slotInDay;
                          const cell = getCell(claseId, slotIdx);

                          return (
                            <div key={slotIdx} className="h-12 p-1 border text-xs flex flex-col justify-center items-start">
                              {cell ? (
                                <>
                                  <div className="font-medium truncate">{cell.asignaturaNombre ?? cell.asignaturaId}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">{cell.docenteNombre ?? cell.docenteId ?? "-"}</div>
                                  {cell.duracion && cell.duracion > 1 && <div className="text-[11px] text-muted-foreground">({cell.duracion} slots)</div>}
                                </>
                              ) : (
                                <div className="text-muted-foreground text-[11px] w-full h-full">&nbsp;</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
