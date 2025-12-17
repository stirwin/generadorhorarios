"use client";

import { useState } from "react";

export function ImportadorExcel({ institucionId }: { institucionId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const manejarSubidaPreparse = async () => {
    if (!file) return alert("Selecciona un archivo .xlsx");
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/imports/preparse", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.errors || [data.error || "Error desconocido"]);
        setPreview(null);
      } else {
        setPreview(data.preview);
        setErrors(data.errors && data.errors.length ? data.errors : null);
      }
    } catch (err) {
      console.error(err);
      setErrors(["Error de red al subir el archivo"]);
    } finally {
      setLoading(false);
    }
  };

  const manejarCommit = async () => {
    if (!preview) return alert("No hay preview para persistir");
    setLoading(true);
    try {
      const res = await fetch("/api/imports/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview, institucionId, usuario: "usuario_demo" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Error al persistir: " + (data.error || "desconocido"));
      } else {
        alert("Importación guardada correctamente");
        setPreview(null);
        setFile(null);
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al persistir");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Archivo Excel (.xlsx)</label>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
          className="mt-2"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={manejarSubidaPreparse}
          disabled={!file || loading}
          className="btn btn-primary"
        >
          Previsualizar
        </button>
        <button
          onClick={manejarCommit}
          disabled={!preview || loading}
          className="btn btn-secondary"
        >
          Guardar importación
        </button>
      </div>

      {loading && <p>Procesando...</p>}

      {errors && (
        <div className="rounded p-3 bg-red-50 border border-red-200">
          <h4 className="font-semibold">Errores detectados</h4>
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div className="rounded p-3 bg-surface border">
          <h4 className="font-semibold">Preview</h4>
          <p>Docentes: {preview.conteos.docentes} • Cursos: {preview.conteos.cursos} • Asignaturas: {preview.conteos.asignaturas} • Cargas: {preview.conteos.cargas}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">Ver detalle</summary>
            <pre className="whitespace-pre-wrap text-xs mt-2">{JSON.stringify(preview, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
