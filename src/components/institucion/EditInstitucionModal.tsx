"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Institucion as InstitucionType } from "@/types/institucion";

type HorarioItem = {
  id: string;
  nombre?: string | null;
  createdAt?: string;
  statsJson?: any;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institucion: InstitucionType | null;
  onUpdated?: () => void;
  onDeleted?: () => void;
};

export default function EditInstitucionModal({
  open,
  onOpenChange,
  institucion,
  onUpdated,
  onDeleted,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [horarios, setHorarios] = useState<HorarioItem[]>([]);
  const latestHorarioId = horarios[0]?.id ?? null;
  const [loadingHorarios, setLoadingHorarios] = useState(false);

  useEffect(() => {
    if (!institucion) {
      setNombre("");
      return;
    }
    setNombre(institucion.nombre ?? "");
  }, [institucion?.id, institucion?.nombre]);

  useEffect(() => {
    let cancelled = false;
    const fetchHorarios = async () => {
      if (!open || !institucion) return;
      try {
        setLoadingHorarios(true);
        const res = await fetch(`/api/instituciones/${institucion.id}/horarios`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
        if (!cancelled) {
          setHorarios(Array.isArray(data?.horarios) ? data.horarios : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setHorarios([]);
          toast.error("No se pudo cargar el historial", { description: err?.message ?? String(err) });
        }
      } finally {
        if (!cancelled) setLoadingHorarios(false);
      }
    };
    fetchHorarios();
    return () => {
      cancelled = true;
    };
  }, [open, institucion?.id]);

  const handleDeleteHorario = async (horarioId: string) => {
    const ok = window.confirm("¿Eliminar este horario generado?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/horarios/${horarioId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setHorarios((prev) => prev.filter((h) => h.id !== horarioId));
      toast.success("Horario eliminado");
    } catch (err: any) {
      toast.error("No se pudo eliminar el horario", { description: err?.message ?? String(err) });
    }
  };

  const handleSave = async () => {
    if (!institucion) return;
    const trimmed = nombre.trim();
    if (!trimmed) {
      toast.error("Nombre requerido", { description: "Escribe un nombre válido para la institución." });
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`/api/instituciones/${institucion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? `Status ${res.status}`);
      }
      toast.success("Institución actualizada");
      onUpdated?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("No se pudo guardar", { description: err?.message ?? String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!institucion) return;
    const ok = window.confirm(`¿Eliminar la institución "${institucion.nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/instituciones/${institucion.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? `Status ${res.status}`);
      }
      toast.success("Institución eliminada");
      onDeleted?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("No se pudo eliminar", { description: err?.message ?? String(err) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Editar institución</DialogTitle>
          <DialogDescription>Actualiza el nombre o elimina la institución seleccionada.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="institucion-nombre">Nombre</Label>
            <Input
              id="institucion-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de la institución"
              disabled={!institucion || saving || deleting}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="destructive" onClick={handleDelete} disabled={!institucion || saving || deleting}>
              {deleting ? "Eliminando..." : "Eliminar institución"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!institucion || saving || deleting}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Historial de horarios</p>
              <span className="text-xs text-muted-foreground">{loadingHorarios ? "Cargando..." : `${horarios.length}`}</span>
            </div>
            {loadingHorarios ? (
              <div className="text-xs text-muted-foreground">Cargando historial...</div>
            ) : horarios.length === 0 ? (
              <div className="text-xs text-muted-foreground">Sin horarios generados.</div>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-auto pr-1">
                {horarios.map((h) => {
                  const created = h.createdAt ? new Date(h.createdAt).toLocaleString("es-CO") : "—";
                  const stats = h.statsJson;
                  const summary =
                    stats && typeof stats === "object"
                      ? `${stats.assigned ?? "—"}/${stats.lessonsTotal ?? "—"}`
                      : "—";
                  const isLatest = latestHorarioId === h.id;
                  return (
                    <li key={h.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{h.nombre || "Horario"}</p>
                          {isLatest && (
                            <span className="text-[10px] rounded-full border px-2 py-0.5 uppercase tracking-wide">
                              Actual
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{`Creado: ${created} • ${summary}`}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isLatest}
                        onClick={() => handleDeleteHorario(h.id)}
                      >
                        Eliminar
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
