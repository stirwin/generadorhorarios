// components/horarios/views/VistaGeneralHorario.tsx
"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TimetableCell } from "@/lib/timetabler";

export type Periodo = { indice: number; abreviatura?: string; hora_inicio?: string; hora_fin?: string; duracion_min?: number };
export type Clase = { id: string; nombre: string; abreviatura?: string };

function safeLower(s?: string | null) {
  return (s || "").toString().trim().toLowerCase();
}

export default function VistaGeneralHorario({
  institucion,
  timetableByClase,
  classes,
  onGenerate,
}: {
  institucion: { id: string; nombre?: string; dias_por_semana?: number; lecciones_por_dia?: number; periodos?: Periodo[] };
  timetableByClase: Record<string, Array<TimetableCell | null>> | undefined;
  classes: Clase[];
  onGenerate?: () => Promise<void> | void;
}) {
  const dias = institucion.dias_por_semana ?? 5;
  const lecciones = institucion.lecciones_por_dia ?? 7;
  const totalSlots = dias * lecciones;
  const diasNombres = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].slice(0, dias);

  // map id -> clase (para mostrar nombre)
  const classesMap = useMemo(() => {
    const m: Record<string, Clase> = {};
    for (const c of classes) m[c.id] = c;
    return m;
  }, [classes]);

  // ensure array length = totalSlots
  function padToTotal(arr?: Array<TimetableCell | null> | null) {
    const out = Array.isArray(arr) ? [...arr] : [];
    if (out.length >= totalSlots) return out.slice(0, totalSlots);
    while (out.length < totalSlots) out.push(null);
    return out;
  }

  // Fallback resolution: intenta encontrar la key correcta en timetableByClase
  function findArrayForClassId(classId: string) {
    const table = timetableByClase || {};
    // 1) exact key
    if (table[classId]) return padToTotal(table[classId]);

    // prepare lowercase names for matching
    const targetClase = classes.find((c) => c.id === classId);
    const targetName = safeLower(targetClase?.nombre);
    const targetAbrev = safeLower((targetClase as any)?.abreviatura);

    // 2) try keys that equal either nombre or abreviatura
    for (const k of Object.keys(table)) {
      if (safeLower(k) === targetName || safeLower(k) === targetAbrev) {
        return padToTotal(table[k]);
      }
    }

    // 3) scan cell contents for a match (claseId, claseNombre, asignaturaId, cargaId)
    for (const k of Object.keys(table)) {
      const arr = table[k] ?? [];
      if (!Array.isArray(arr)) continue;
      for (const cell of arr) {
        if (!cell) continue;
        // match por campo claseId exacto
        if (cell.claseId && String(cell.claseId) === classId) return padToTotal(arr);
        // match por claseNombre si viene
        if ((cell as any).claseNombre && safeLower(String((cell as any).claseNombre)) === targetName) return padToTotal(arr);
        // match por coincidencia con asignatura/clase/nombre
        if (targetName && (
          safeLower(String(cell.asignaturaId ?? "")) === targetName ||
          safeLower(String(cell.docenteId ?? "")) === targetName
        )) {
          return padToTotal(arr);
        }
        // match por cargaId que contenga parte del classId (poco probable, pero útil)
        if ((cell as any).cargaId && String((cell as any).cargaId).includes(String(classId).slice(0,6))) {
          return padToTotal(arr);
        }
      }
    }

    // 4) last resort: if there is exactly one key with the same length totalSlots and some assignments, prefer it (only if classes length === 1, avoid false positives)
    const nonEmptyKeys = Object.entries(table).filter(([, arr]) => Array.isArray(arr) && arr.some(Boolean));
    if (nonEmptyKeys.length === 1 && classes.length === 1) {
      return padToTotal(nonEmptyKeys[0][1] as any);
    }

    // nada -> devolver array vacío rellenado
    return Array(totalSlots).fill(null);
  }

  // Normalizar a memoria: map classId -> array length totalSlots
  const normalizedTimetable = useMemo(() => {
    const normalized: Record<string, Array<TimetableCell | null>> = {};
    for (const c of classes) {
      normalized[c.id] = findArrayForClassId(c.id);
    }
    return normalized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableByClase, classes, dias, lecciones]);

  // Debug: resumen de asignaciones
  const debugStats = useMemo(() => {
    const keysFromServer = Object.keys(timetableByClase || {});
    let assignedTotal = 0;
    const perClass: Record<string, { assigned: number; sample: TimetableCell[] }> = {};
    for (const c of classes) {
      const arr = normalizedTimetable[c.id] ?? Array(totalSlots).fill(null);
      const assigned = arr.filter(Boolean).length;
      assignedTotal += assigned;
      const sample = arr.filter(Boolean).slice(0, 3) as TimetableCell[];
      perClass[c.id] = { assigned, sample };
    }
    return { keysFromServer, assignedTotal, perClass };
  }, [normalizedTimetable, classes, timetableByClase, totalSlots]);

  const anyAssigned = debugStats.assignedTotal > 0;

  // color generator
  function colorClassFor(seed: string | undefined) {
    const colors = [
      "bg-blue-600","bg-green-600","bg-purple-600","bg-orange-500","bg-rose-600","bg-sky-600","bg-amber-600",
      "bg-indigo-600","bg-emerald-600"
    ];
    if (!seed) return "bg-slate-600";
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
    return colors[Math.abs(h) % colors.length];
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Vista general — {institucion.nombre}</h3>
        <div className="flex gap-2 items-center">
          <Button onClick={() => onGenerate?.()} variant="outline">Generar/Regenerar</Button>
          <Badge className="text-sm">Clases: {classes.length}</Badge>
          <Badge className="text-sm">Slots: {totalSlots}</Badge>
          <Badge className="text-sm">Asignados: {debugStats.assignedTotal}</Badge>
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
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(96px,1fr))`, gap: "6px" }}>
                    {Array.from({ length: lecciones }).map((_, j) => (
                      <div key={j} className="text-xs p-2 border text-center bg-muted/10">{j + 1}</div>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {classes.map(({ id: claseId }) => {
              const arr = normalizedTimetable[claseId] ?? Array(totalSlots).fill(null);

              return (
                <tr key={claseId} className="border-t">
                  <td className="sticky left-0 bg-background z-10 p-2 font-medium border-r align-top">
                    {classesMap[claseId]?.nombre ?? claseId}
                  </td>

                  {Array.from({ length: dias }).map((_, day) => {
                    const dayStart = day * lecciones;
                    const items: React.ReactNode[] = [];
                    let i = 0;

                    while (i < lecciones) {
                      const slotIdx = dayStart + i;
                      const cell = arr[slotIdx];

                      if (!cell) {
                        items.push(
                          <div key={`empty-${day}-${i}`} className="h-14 border rounded-sm flex items-center justify-center text-muted-foreground text-sm">
                            &nbsp;
                          </div>
                        );
                        i += 1;
                        continue;
                      }

                      // si hay contenido, asegurarnos que duracion es number >=1
                      const dur = Math.max(1, Number((cell as any).duracion ?? 1));
                      const seed = String((cell as any).cargaId ?? cell.asignaturaId ?? slotIdx);
                      const bg = colorClassFor(seed);

                      items.push(
                        <div key={`cell-${day}-${i}-${seed}`} style={{ gridColumn: `span ${Math.min(dur, lecciones - i)}` }}
                          className={`${bg} text-white p-2 rounded-lg shadow-sm flex flex-col justify-center`}>
                          <div className="font-semibold text-sm leading-tight truncate">{(cell as any).asignaturaNombre ?? cell.asignaturaId}</div>
                          <div className="text-[11px] opacity-90 mt-1 truncate">{(cell as any).docenteNombre ?? cell.docenteId ?? "-"}</div>
                          {dur > 1 && <div className="text-[11px] opacity-80 mt-1">{dur} slot{dur > 1 ? "s" : ""}</div>}
                        </div>
                      );

                      i += Math.min(dur, lecciones - i);
                    }

                    return (
                      <td key={`${claseId}-d${day}`} className="p-2 align-top">
                        <div className="grid items-start" style={{ gridTemplateColumns: `repeat(${lecciones}, minmax(96px,1fr))`, gap: "6px", alignItems: "start" }}>
                          {items}
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

      {/* Debug / diagnósticos */}
      <div className="mt-3 text-sm">
        {!anyAssigned && (
          <div className="mb-2 text-yellow-700 bg-yellow-50 border border-yellow-100 p-2 rounded">
            No se detectaron slots asignados en la grilla normalizada. Revisa:
            <ul className="pl-5 list-disc mt-2">
              <li>Que las claves de <code>timetableByClase</code> coincidan con <code>classes[].id</code> o con sus nombres/abreviaturas.</li>
              <li>Que cada array tenga longitud {totalSlots} (dias × lecciones).</li>
              <li>Que las celdas incluyan <code>duracion</code> y <code>cargaId</code> y/o <code>asignaturaId</code>.</li>
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-2 border rounded">
            <div className="font-medium mb-1">Claves recibidas del servidor</div>
            <div className="text-xs text-muted-foreground break-words">
              {JSON.stringify(Object.keys(timetableByClase || {}), null, 2).slice(0, 3200)}
            </div>
          </div>

          <div className="p-2 border rounded">
            <div className="font-medium mb-1">Resumen asignaciones (primeras 3 por clase)</div>
            <div className="text-xs">
              {classes.map((c) => {
                const s = debugStats.perClass[c.id];
                return (
                  <div key={c.id} className="mb-1">
                    <strong>{c.nombre}</strong>: {s.assigned} slots asignados • sample:{" "}
{s.sample
  .map((x) => {
    const asignatura =
      ((x as any).asignaturaNombre ?? x.asignaturaId) || "?";
    const docente =
      ((x as any).docenteNombre ?? x.docenteId) || "-";
    return `${asignatura}/${String(docente)}`;
  })
  .join(", ") || "—"}

                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
