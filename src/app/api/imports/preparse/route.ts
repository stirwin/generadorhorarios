// app/api/imports/preparse/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

/**
 * Normaliza claves para comparaciones:
 * - trim
 * - lowercase
 */
function normalizarClave(s?: string) {
  return (s || "").toString().trim().toLowerCase();
}

/**
 * Busca una hoja por nombre usando regex (case-insensitive)
 */
function findSheetByName(workbook: any, pattern: RegExp) {
  return workbook.worksheets.find((ws: any) =>
    pattern.test((ws.name || "").toString().toLowerCase())
  );
}

/**
 * LECTOR SEGURO DE CELDAS (CRÍTICO)
 * ExcelJS no siempre expone bien `.text`
 * Esto maneja:
 * - strings
 * - números
 * - fórmulas
 * - celdas formateadas
 */
function getCellString(cell: any): string {
  const v = cell?.value;

  if (v == null) return "";

  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();

  // Fórmulas: { formula: "...", result: ... }
  if (typeof v === "object" && "result" in v) {
    return String(v.result ?? "").trim();
  }

  return "";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se envió archivo" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // ===========================
    // 1️⃣ Localizar hojas
    // ===========================
    const docentesSheet = findSheetByName(
      workbook,
      /docent|docentes|profesor|teacher/
    );

    const clasesSheet = findSheetByName(
      workbook,
      /clases|clase|grupos|grupo/
    );

    const asignaturasSheet = findSheetByName(
      workbook,
      /asignatur|asignaturas|materia/
    );

    const cargaSheet = findSheetByName(
      workbook,
      /carga|carga academica|carga_academica|load/
    );

    const errors: string[] = [];

    if (!docentesSheet) errors.push("No se encontró hoja: Docentes");
    if (!clasesSheet) errors.push("No se encontró hoja: Clases / Grupos");
    if (!asignaturasSheet) errors.push("No se encontró hoja: Asignaturas");
    if (!cargaSheet) errors.push("No se encontró hoja: Carga Académica");

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 422 });
    }

    // ===========================
    // 2️⃣ Parse genérico 2 columnas
    // ===========================
    function parseDosColumnas(
      sheet: any,
      colAName: string,
      colBName: string
    ) {
      const rows: any[] = [];

      sheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) return; // header

        const a = getCellString(row.getCell(1));
        const b = getCellString(row.getCell(2));

        if (!a && !b) return;

        rows.push({
          fila: rowNumber,
          [colAName]: a,
          [colBName]: b,
        });
      });

      return rows;
    }

    const docentes = parseDosColumnas(
      docentesSheet,
      "nombre",
      "abreviatura"
    );

    const clases = parseDosColumnas(
      clasesSheet,
      "nombre",
      "abreviatura"
    );

    const asignaturas = parseDosColumnas(
      asignaturasSheet,
      "nombre",
      "abreviatura"
    );

    // ===========================
    // 3️⃣ Parse CARGA ACADÉMICA
    // ===========================
    const cargas: any[] = [];

    cargaSheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return;

      const asignatura = getCellString(row.getCell(1));
      const clase = getCellString(row.getCell(2));
      const cantidadRaw = row.getCell(3).value;
      const duracionRaw = row.getCell(4).value;
      const docenteAbrev = getCellString(row.getCell(5));

      if (
        !asignatura &&
        !clase &&
        !cantidadRaw &&
        !duracionRaw &&
        !docenteAbrev
      )
        return;

      const cantidad = Number.isFinite(Number(cantidadRaw))
        ? Number(cantidadRaw)
        : null;

      const duracion = Number.isFinite(Number(duracionRaw))
        ? Number(duracionRaw)
        : null;

      cargas.push({
        fila: rowNumber,
        asignatura,
        clase,
        cantidad,
        duracion,
        docenteAbrev,
      });
      console.log({
  fila: rowNumber,
  asignaturaRaw: row.getCell(1).value,
  claseRaw: row.getCell(2).value,
  docenteRaw: row.getCell(5).value,
});

    });

    // ===========================
    // 4️⃣ Validaciones cruzadas
    // ===========================
    const docentesAbrevSet = new Set(
      docentes.map((d) => normalizarClave(d.abreviatura))
    );

    const clasesAbrevSet = new Set(
      clases.map((c) => normalizarClave(c.abreviatura))
    );

    const asignAbrevSet = new Set(
      asignaturas.map((a) => normalizarClave(a.abreviatura))
    );

    cargas.forEach((c) => {
      if (!c.asignatura)
        errors.push(`Carga fila ${c.fila}: ASIGNATURA vacío`);

      if (!c.clase)
        errors.push(`Carga fila ${c.fila}: CLASE vacío`);

      if (!Number.isInteger(c.cantidad) || c.cantidad < 1)
        errors.push(
          `Carga fila ${c.fila}: CANTIDAD debe ser entero >= 1`
        );

      if (!Number.isInteger(c.duracion) || c.duracion < 1)
        errors.push(
          `Carga fila ${c.fila}: DURACION debe ser entero >= 1`
        );

      if (!docentesAbrevSet.has(normalizarClave(c.docenteAbrev))) {
        errors.push(
          `Carga fila ${c.fila}: DOCENTE '${c.docenteAbrev}' no existe`
        );
      }

      if (!clasesAbrevSet.has(normalizarClave(c.clase))) {
        errors.push(
          `Carga fila ${c.fila}: CLASE '${c.clase}' no existe`
        );
      }

      if (!asignAbrevSet.has(normalizarClave(c.asignatura))) {
        errors.push(
          `Carga fila ${c.fila}: ASIGNATURA '${c.asignatura}' no existe`
        );
      }
      
    });

    // ===========================
    // 5️⃣ Preview
    // ===========================
    const preview = {
      conteos: {
        docentes: docentes.length,
        clases: clases.length,
        asignaturas: asignaturas.length,
        cargas: cargas.length,
      },
      docentes,
      clases,
      asignaturas,
      cargas,
    };

    return NextResponse.json({ preview, errors }, { status: 200 });
  } catch (error: any) {
    console.error("preparse error:", error);
    return NextResponse.json(
      { error: error.message || "Error parseando Excel" },
      { status: 500 }
    );
  }
}
