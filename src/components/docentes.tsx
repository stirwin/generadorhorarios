"use client"

import { Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Institucion } from "@/types/institucion"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMemo, useState } from "react"

interface PropsDocentes {
  institucion: Institucion | null
  instituciones: Institucion[]
  onSeleccionarInstitucion: (institucion: Institucion) => void
  onRefetch: () => void
}

type EditableDocente = {
  id: string
  nombre: string
  abreviatura?: string
  direccionGrupoId?: string | null
  directorLunesAplica?: boolean
  restricciones?: Array<{ dia: number; periodoInicio: number; periodoFin: number; tipo: string }>
}

export function Docentes({ institucion, instituciones, onSeleccionarInstitucion, onRefetch }: PropsDocentes) {
  const docentes = institucion?.docentes ?? []
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingDirectorRule, setUpdatingDirectorRule] = useState(false)
  const [form, setForm] = useState<EditableDocente | null>(null)
  const [availability, setAvailability] = useState<boolean[][]>([])

  const dias = institucion?.dias_por_semana ?? institucion?.diasPorSemana ?? 5
  const slotsPerDay = institucion?.lecciones_por_dia ?? institucion?.leccionesPorDia ?? 7
  const dayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]

  const clasesOptions = useMemo(() => {
    return (institucion?.clases ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))
  }, [institucion?.clases])
  const directorRuleEnabled = institucion?.director_lunes_primera !== false

  function buildAvailabilityFromDocente(docente: EditableDocente) {
    const base = Array.from({ length: dias }).map(() => Array.from({ length: slotsPerDay }).map(() => true))
    for (const r of docente.restricciones ?? []) {
      if (r.tipo !== "bloqueo") continue
      for (let p = r.periodoInicio; p <= r.periodoFin; p++) {
        if (base[r.dia] && base[r.dia][p]) base[r.dia][p] = false
      }
    }
    return base
  }

  function openEdit(docente: EditableDocente) {
    setForm({
      id: docente.id,
      nombre: docente.nombre,
      abreviatura: docente.abreviatura,
      direccionGrupoId: docente.direccionGrupoId ?? null,
      directorLunesAplica: docente.directorLunesAplica ?? true,
      restricciones: docente.restricciones ?? [],
    })
    setAvailability(buildAvailabilityFromDocente(docente))
    setEditOpen(true)
  }

  function toggleSlot(day: number, period: number) {
    setAvailability((prev) => {
      const next = prev.map((row) => row.slice())
      next[day][period] = !next[day][period]
      return next
    })
  }

  function toggleDay(day: number) {
    setAvailability((prev) => {
      const next = prev.map((row) => row.slice())
      const allBlocked = next[day]?.every((slot) => !slot)
      if (allBlocked) {
        next[day] = next[day].map(() => true)
      } else {
        next[day] = next[day].map(() => false)
      }
      return next
    })
  }

  function buildBloqueos() {
    const bloqueos: Array<{ dia: number; periodo: number }> = []
    for (let d = 0; d < availability.length; d++) {
      for (let p = 0; p < availability[d].length; p++) {
        if (!availability[d][p]) bloqueos.push({ dia: d, periodo: p })
      }
    }
    return bloqueos
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    try {
      const res = await fetch(`/api/docentes/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre,
          abreviatura: form.abreviatura,
          direccionGrupoId: form.direccionGrupoId,
          directorLunesAplica: form.directorLunesAplica,
          bloqueos: buildBloqueos(),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Status ${res.status}`)
      }
      setEditOpen(false)
      onRefetch()
    } catch (err: any) {
      alert("No se pudo guardar: " + (err?.message ?? String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function toggleDirectorRule() {
    if (!institucion) return
    const nextValue = !directorRuleEnabled
    setUpdatingDirectorRule(true)
    try {
      const res = await fetch(`/api/instituciones/${institucion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ director_lunes_primera: nextValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Status ${res.status}`)
      }
      onRefetch()
    } catch (err: any) {
      alert("No se pudo actualizar la regla: " + (err?.message ?? String(err)))
    } finally {
      setUpdatingDirectorRule(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Encabezado con botón de acción */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">Docentes</h1>
            <p className="text-lg text-muted-foreground">
              {institucion ? `${institucion.nombre} - Gestión de profesores` : "Selecciona una institución"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={directorRuleEnabled ? "default" : "secondary"}>
                {directorRuleEnabled ? "Directores: Lunes 1ra" : "Directores: libre"}
              </Badge>
              <Button variant="outline" size="sm" onClick={toggleDirectorRule} disabled={!institucion || updatingDirectorRule}>
                {directorRuleEnabled ? "Desactivar regla" : "Activar regla"}
              </Button>
            </div>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Agregar Docente
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Instituciones</CardTitle>
              <CardDescription>Haz clic para ver sus docentes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {instituciones.length === 0 && (
                <div className="text-sm text-muted-foreground">No hay instituciones registradas.</div>
              )}
              {instituciones.map((ins) => (
                <button
                  key={ins.id}
                  onClick={() => onSeleccionarInstitucion(ins)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    institucion?.id === ins.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <div className="font-medium">{ins.nombre}</div>
                  <div className="text-xs text-muted-foreground">{ins.docentes?.length ?? 0} docentes</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {institucion && docentes.length === 0 && (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  Esta institución aún no tiene docentes registrados.
                </CardContent>
              </Card>
            )}
            {docentes.map((docente) => (
              <Card key={docente.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{docente.nombre}</CardTitle>
                      <CardDescription className="mt-1">{docente.abreviatura || "Sin abreviatura"}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(docente as EditableDocente)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">Docente</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Editar docente</DialogTitle>
            <DialogDescription>Actualiza información y restricciones de horario.</DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Abreviatura</Label>
                  <Input
                    value={form.abreviatura ?? ""}
                    onChange={(e) => setForm({ ...form, abreviatura: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Dirección de grupo</Label>
                  <Select
                    value={form.direccionGrupoId ?? "none"}
                    onValueChange={(v) => setForm({ ...form, direccionGrupoId: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin grupo</SelectItem>
                      {clasesOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.direccionGrupoId && (
                  <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-emerald-600"
                      checked={form.directorLunesAplica ?? true}
                      onChange={(e) => setForm({ ...form, directorLunesAplica: e.target.checked })}
                    />
                    <span>
                      <span className="block font-medium">Aplicar regla de director el lunes</span>
                      <span className="block text-xs text-muted-foreground">
                        Activa el inicio del lunes con su grupo cuando tenga dirección asignada.
                      </span>
                    </span>
                  </label>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Restricciones de disponibilidad</h4>
                    <p className="text-xs text-muted-foreground">Haz clic en cada bloque para marcar como bloqueado.</p>
                  </div>
                </div>
                <div className="border rounded-lg p-3 overflow-auto">
                  <div className="grid min-w-[520px] gap-2">
                    {availability.map((row, d) => (
                      <div key={`day-${d}`} className="flex items-center gap-2">
                        <div className="w-12 text-xs font-medium text-muted-foreground">{dayLabels[d] ?? `D${d + 1}`}</div>
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-rose-500"
                            checked={row.every((slot) => !slot)}
                            onChange={() => toggleDay(d)}
                          />
                          Bloquear día
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {row.map((slot, p) => (
                            <button
                              key={`slot-${d}-${p}`}
                              type="button"
                              className={`h-7 w-7 rounded text-xs font-semibold border transition ${
                                slot
                                  ? "border-border bg-background text-foreground hover:bg-muted"
                                  : "border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200"
                              }`}
                              onClick={() => toggleSlot(d, p)}
                              title={`${dayLabels[d] ?? `D${d + 1}`} ${p + 1}`}
                            >
                              {p + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
