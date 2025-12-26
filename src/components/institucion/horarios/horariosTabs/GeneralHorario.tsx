"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TimetableCell } from "@/types/institucion";

export type Periodo = { indice: number; abreviatura?: string; hora_inicio?: string; hora_fin?: string; duracion_min?: number };
export type Clase = { id: string; nombre: string };

/**
 * Vista General mejorada:
 * - bloques que "span" varias columnas según duración
 * - gap entre slots
 * - colores y paddings para mejor legibilidad
 */
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

  // helper simple para generar clases de color (determinista)
  function colorClassFor(seed: string | undefined) {
    const colors = [
      "bg-blue-600", "bg-green-600", "bg-purple-600",
      "bg-orange-500", "bg-rose-600", "bg-sky-600", "bg-amber-600",
      "bg-indigo-600", "bg-emerald-600"
    ];
    if (!seed) return "bg-slate-600";
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
    return colors[Math.abs(h) % colors.length];
  }

  // Obtener celda segura
  function getCell(claseId: string, idx: number) {
    const arr = timetableByClase?.[claseId] ?? [];
    return arr[idx] ?? null;
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
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${lecciones}, minmax(96px,1fr))`,
                      gap: "6px",
                    }}
                  >
                    {Array.from({ length: lecciones }).map((_, j) => (
                      <div key={j} className="text-xs p-2 border text-center bg-muted/10">{j + 1}</div>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {classes.map(({ id: claseId }) => (
              <tr key={claseId} className="border-t">
                <td className="sticky left-0 bg-background z-10 p-2 font-medium border-r align-top">
                  {classesMap[claseId]?.nombre ?? claseId}
                </td>

                {Array.from({ length: dias }).map((_, day) => {
                  const dayStart = day * lecciones;

                  // Armamos los items del día: iterar slots, pero saltar los ocupados por span
                  const items: React.ReactNode[] = [];
                  let i = 0;
                  while (i < lecciones) {
                    const slotIdx = dayStart + i;
                    const cell = getCell(claseId, slotIdx);

                    if (!cell) {
                      // celda vacía de 1 slot
                      items.push(
                        <div key={`empty-${day}-${i}`} className="h-14 border rounded-sm flex items-center justify-center text-muted-foreground text-sm">
                          &nbsp;
                        </div>
                      );
                      i += 1;
                      continue;
                    }

                    // Si hay contenido, calcular duración (clamp)
                    const dur = Math.max(1, Math.floor(cell.duracion ?? 1));
                    // determinar clave para detectar el bloque
                    const seed = (cell.cargaId ?? cell.asignaturaNombre ?? cell.asignaturaId ?? String(slotIdx)).toString();
                    const bg = colorClassFor(seed);

                    items.push(
                      <div
                        key={`cell-${day}-${i}-${seed}`}
                        // span columns según duración
                        style={{ gridColumn: `span ${Math.min(dur, lecciones - i)}` }}
                        className={`${bg} text-white p-2 rounded-lg shadow-sm flex flex-col justify-center`}
                      >
                        <div className="font-semibold text-sm leading-tight truncate">{cell.asignaturaNombre ?? cell.asignaturaId}</div>
                        <div className="text-[11px] opacity-90 mt-1 truncate">{cell.docenteNombre ?? cell.docenteId ?? "-"}</div>
                        {cell.duracion && cell.duracion > 1 && (
                          <div className="text-[11px] opacity-80 mt-1">{cell.duracion} slot{cell.duracion > 1 ? "s" : ""}</div>
                        )}
                      </div>
                    );

                    // avanzar i por la duración (las columnas internas se ocuparán por este bloque)
                    i += Math.min(dur, lecciones - i);
                  }

                  // Render del día: grid con gap y columnas = lecciones
                  return (
                    <td key={`${claseId}-d${day}`} className="p-2 align-top">
                      <div
                        className="grid items-start"
                        style={{
                          gridTemplateColumns: `repeat(${lecciones}, minmax(96px,1fr))`,
                          gap: "6px",
                          alignItems: "start",
                        }}
                      >
                        {items}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leyenda y notas */}
      <div className="mt-3 text-sm text-muted-foreground">
        <div>- Las materias ocupan tantos slots como su duración (se muestran como bloques que abarcan columnas).</div>
        <div>- Use el botón "Generar/Regenerar" para recalcular el horario desde el servidor.</div>
      </div>
    </div>
  );
}
