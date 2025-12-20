"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, Save, Eye } from "lucide-react";
import { toast } from "sonner";

type PreviewShape = {
  conteos: { docentes: number; clases: number; asignaturas: number; cargas: number };
  docentes?: { nombre: string; abreviatura: string }[];
  clases?: { nombre: string; abreviatura: string }[];
  asignaturas?: { nombre: string; abreviatura: string }[];
  cargas?: {
    asignatura: string;
    clase: string;
    cantidad: number;
    duracion: number;
    docenteAbrev: string;
  }[];
  errors?: string[];
};


export function ImportadorExcel({
  institucionId,
  onPreviewLoaded,
  onPersisted,
}: {
  institucionId: string;
  onPreviewLoaded?: (preview: PreviewShape) => void;
  onPersisted?: (preview: PreviewShape) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewShape | null>(null);
  const [editedPreview, setEditedPreview] = useState<PreviewShape | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [previewSaved, setPreviewSaved] = useState(false);

  // Habilitar botones
  const canPrevisualize = !!file && !loading;
  const canSaveImport = !!preview && !loading;
  const canFinalize = persisted || false;

  // ------------------ helpers ------------------
  const resetState = () => {
    setFile(null);
    setPreview(null);
    setEditedPreview(null);
    setErrors([]);
    setPersisted(false);
    setPreviewSaved(false);
  };

  const toCSV = (rows: string[]) => {
    const csv = rows.map((r) => `"${r.replace(/"/g, '""')}"`).join("\n");
    return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  };

  const descargarErrores = () => {
    if (!errors || errors.length === 0) {
      toast.info("No hay errores", { description: "No se encontraron errores para descargar." });
      return;
    }
    const blob = toCSV(errors);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `errores_importacion_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ------------------ preparse en servidor ------------------
  const manejarSubidaPreparse = async () => {
    if (!file) {
      toast.error("Archivo requerido", { description: "Selecciona un archivo .xlsx" });
      return;
    }
    setLoading(true);
    setErrors([]);
    setPreview(null);
    setEditedPreview(null);
    setPersisted(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // endpoint que parsea y devuelve preview (debes implementar en servidor /api/imports/preparse)
      const res = await fetch("/api/imports/preparse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        const e = data?.errors ?? [data?.error ?? "Error desconocido en preparse"];
        setErrors(Array.isArray(e) ? e : [String(e)]);
        toast.error("Preparse fallido", { description: "Revisa los errores antes de persistir." });
        setLoading(false);
        return;
      }
      // data.preview: estructura del preview; data.errors: warnings
      const p: PreviewShape = data.preview;
      setPreview(p);
      setEditedPreview(p); // clon para edición
      setErrors(data.errors && data.errors.length ? data.errors : []);
      setPreviewSaved(false);
      setPersisted(false);
      onPreviewLoaded?.(p);
      toast.success("Previsualización lista", { description: "Revise y edite si es necesario antes de guardar." });
    } catch (err) {
      console.error(err);
      setErrors(["Error de red al subir el archivo"]);
      toast.error("Error de red", { description: "No se pudo conectar al servidor." });
    } finally {
      setLoading(false);
    }
  };

  // ------------------ guardar (commit) ------------------
  const manejarCommit = async () => {
    if (!editedPreview) return toast.error("Sin preview", { description: "Previsualiza el archivo antes de guardar." });
    setLoading(true);
    try {
      // estructura esperada por backend: { preview, institucionId }
      const res = await fetch("/api/imports/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: editedPreview, institucionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data?.error ?? "Error al persistir importación";
        toast.error("Error al guardar", { description: String(err) });
        // si el server retorna errores específicos, muéstralos
        if (data?.errors) setErrors(Array.isArray(data.errors) ? data.errors : [String(data.errors)]);
        setLoading(false);
        return;
      }
      toast.success("Importación guardada", { description: "Los datos fueron persistidos correctamente." });
      setPersisted(true);
      setPreviewSaved(true);
      onPersisted?.(editedPreview);
    } catch (err) {
      console.error(err);
      toast.error("Error de red", { description: "No se pudo persistir la importación." });
    } finally {
      setLoading(false);
    }
  };

  // ------------------ edición simple del preview (inline) ------------------
  const handleEditCarga = (index: number, field: keyof NonNullable<PreviewShape["cargas"]>[number], value: any) => {
    if (!editedPreview) return;
    const cargas = editedPreview.cargas ? [...editedPreview.cargas] : [];
    const item = { ...(cargas[index] as any) };
    item[field] = field === "cantidad" || field === "duracion" ? Number(value) : String(value);
    cargas[index] = item;
    setEditedPreview({ ...editedPreview, cargas });
    setPreviewSaved(false);
  };

  // ------------------ small computed helpers ------------------
  const errorsCount = useMemo(() => (errors?.length || 0), [errors]);
  const cargasPreview = editedPreview?.cargas ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Label>Archivo Excel (.xlsx)</Label>
        <Input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            setFile(e.target.files ? e.target.files[0] : null);
            // reset preview-related flags when user picks new file
            setPreview(null);
            setEditedPreview(null);
            setErrors([]);
            setPersisted(false);
            setPreviewSaved(false);
          }}
          className="mt-2"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={manejarSubidaPreparse} disabled={!canPrevisualize || loading} variant="outline" >
          <Eye className="mr-2" size={14} /> Previsualizar
        </Button>

        <Button onClick={manejarCommit} disabled={!canSaveImport || loading || !editedPreview} >
          <Save className="mr-2" size={14} /> Guardar importación
        </Button>

        <Button onClick={() => { if (errorsCount) descargarErrores(); else toast.error("Sin errores", { description: "No hay errores para descargar." }); }} variant="ghost">
          <Download className="mr-2" size={14} /> Descargar errores
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Procesando...</p>}

      {/* Errores: panel con scroll si es grande */}
      {errors && errors.length > 0 && (
        <div className="rounded p-3 bg-red-50 border border-red-200 max-h-56 overflow-auto">
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-semibold text-red-700 flex items-center gap-2"><FileText /> Errores detectados ({errors.length})</h4>
            <div className="text-sm text-muted-foreground">Revise y descargue para corregir</div>
          </div>
          <ul className="list-disc pl-5 text-sm">
            {errors.map((e, i) => <li key={i} className="py-1">{e}</li>)}
          </ul>
        </div>
      )}

      {/* Preview resumen */}
      {editedPreview && (
        <div className="rounded p-3 bg-surface border max-h-[45vh] overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-semibold">Preview</h4>
              <div className="text-sm text-muted-foreground">Docentes: {editedPreview.conteos.docentes} • Cursos: {editedPreview.conteos.cursos} • Asignaturas: {editedPreview.conteos.asignaturas} • Cargas: {editedPreview.conteos.cargas}</div>
            </div>
            <div className="text-sm">
              <span className="mr-3">Preview guardada: {previewSaved ? "Sí" : "No"}</span>
              <span>Persistido: {persisted ? "Sí" : "No"}</span>
            </div>
          </div>

          {/* tablas editables: solo cargas por simplicidad */}
          <div className="space-y-4">
            <div>
              <h5 className="font-medium">Cargas (edite para correcciones rápidas)</h5>
              <div className="w-full overflow-auto border rounded mt-2">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/20">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">Asignatura</th>
                      <th className="p-2 text-left">Clase</th>
                      <th className="p-2 text-left">Cantidad</th>
                      <th className="p-2 text-left">Duración (slots)</th>
                      <th className="p-2 text-left">Docente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargasPreview.map((c, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-transparent" : ""}>
                        <td className="p-2">{i + 1}</td>
                        <td className="p-2">
                          <Input value={c.asignatura} onChange={(e) => handleEditCarga(i, "asignatura", e.target.value)} />
                        </td>
                        <td className="p-2">
                          <Input value={c.clase} onChange={(e) => handleEditCarga(i, "clase", e.target.value)} />
                        </td>
                        <td className="p-2 w-24">
                          <Input type="number" value={c.cantidad} onChange={(e) => handleEditCarga(i, "cantidad", Number(e.target.value))} />
                        </td>
                        <td className="p-2 w-28">
                          <Input type="number" value={c.duracion} onChange={(e) => handleEditCarga(i, "duracion", Number(e.target.value))} />
                        </td>
                        <td className="p-2">
                          <Input value={c.docenteAbrev} onChange={(e) => handleEditCarga(i, "docenteAbrev", e.target.value)} />
                        </td>
                      </tr>
                    ))}
                    {cargasPreview.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-3 text-muted-foreground">No hay filas de carga en el preview</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* mostrar también listas cortas de docentes, cursos, asignaturas */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <h6 className="font-medium">Docentes</h6>
                <ul className="text-sm mt-2 max-h-36 overflow-auto">
                  {editedPreview.docentes?.slice(0, 200).map((d, i) => <li key={i}>{d.nombre} — {d.abreviatura}</li>)}
                </ul>
              </div>
              <div>
                <h6 className="font-medium">Clases</h6>
                <ul className="text-sm mt-2 max-h-36 overflow-auto">
                  {editedPreview.clases?.slice(0, 200).map((c, i) => <li key={i}>{c.nombre} — {c.abreviatura}</li>)}
                </ul>
              </div>
              <div>
                <h6 className="font-medium">Asignaturas</h6>
                <ul className="text-sm mt-2 max-h-36 overflow-auto">
                  {editedPreview.asignaturas?.slice(0, 200).map((s, i) => <li key={i}>{s.nombre} — {s.abreviatura}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={resetState}>Limpiar</Button>
        <Button onClick={() => {
          if (!editedPreview) return toast.error("Nada que guardar", { description: "Previsualiza primero." });
          // marcar preview como 'guardada localmente' (opcional)
          setPreviewSaved(true);
          toast.success("Cambios en preview guardados", { description: "Ahora puedes persistir la importación." });
        }} disabled={!editedPreview}>
          <Save className="mr-2" size={14} /> Guardar cambios locales
        </Button>
      </div>
    </div>
  );
}
