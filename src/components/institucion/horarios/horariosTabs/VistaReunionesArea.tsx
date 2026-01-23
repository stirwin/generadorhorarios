"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Institucion } from "@/types/institucion";

type AreaMeeting = { groupId: string; label: string; slot: number; teachers: string[] };

interface Props {
  institucion: Institucion;
  timetablerMeta?: any;
  onExport?: () => void;
}

function buildHourLabels(institucion: Institucion, lecciones: number) {
  return Array.from({ length: lecciones }, (_, i) => String(i + 1));
}

export default function VistaReunionesArea({ institucion, timetablerMeta, onExport }: Props) {
  if (!institucion) return null;

  const dias = institucion.dias_por_semana ?? 5;
  const lecciones = institucion.lecciones_por_dia ?? 6;
  const diasNombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].slice(0, dias);
  const horaLabels = useMemo(() => buildHourLabels(institucion, lecciones), [institucion, lecciones]);

  const assigned = (timetablerMeta?.areaMeetings?.assigned ?? []) as AreaMeeting[];
  const conflicts = (timetablerMeta?.areaMeetings?.conflicts ?? []) as Array<{ groupId: string; label: string; reason: string }>;

  const cellMap = useMemo(() => {
    const map = new Map<string, AreaMeeting[]>();
    for (const meeting of assigned) {
      const day = Math.floor(meeting.slot / lecciones);
      const slotInDay = meeting.slot % lecciones;
      if (day < 0 || day >= dias) continue;
      const key = `${day}-${slotInDay}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(meeting);
    }
    return map;
  }, [assigned, dias, lecciones]);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Reuniones por Área</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Asignadas: {assigned.length}</Badge>
                <Badge variant={conflicts.length ? "destructive" : "secondary"}>
                  Pendientes: {conflicts.length}
                </Badge>
              </div>
              {onExport && (
                <Button variant="outline" onClick={onExport}>
                  <Download className="w-4 h-4 mr-2" /> Exportar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {assigned.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Aún no hay reuniones asignadas. Genera el horario para verlas aquí.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border p-2 text-left font-medium">Hora</th>
                      {diasNombres.map((dia) => (
                        <th key={dia} className="border p-2 text-left font-medium">{dia}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {horaLabels.map((label, slotInDay) => (
                      <tr key={`row-${slotInDay}`} className="align-top">
                        <td className="border p-2 font-medium bg-muted/40 whitespace-nowrap">{label}</td>
                        {Array.from({ length: dias }).map((_, dayIdx) => {
                          const key = `${dayIdx}-${slotInDay}`;
                          const meetings = cellMap.get(key) ?? [];
                          return (
                            <td key={key} className="border p-2">
                              {meetings.length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {meetings.map((m) => (
                                    <div key={m.groupId} className="rounded-md border bg-background/70 px-2 py-1">
                                      <div className="text-xs font-semibold">{m.label}</div>
                                      <div className="text-[11px] text-muted-foreground">
                                        {m.teachers.length} docentes
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {conflicts.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold text-destructive">Reuniones sin slot común</div>
                <div className="flex flex-wrap gap-2">
                  {conflicts.map((c) => (
                    <Badge key={c.groupId} variant="destructive">
                      {c.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
