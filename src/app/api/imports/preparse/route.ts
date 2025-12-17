// app/api/imports/preparse/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

function normalizarClave(s?: string) {
  return (s || "").toString().trim().toLowerCase();
}

function findSheetByName(workbook: any, pattern: RegExp) {
  return workbook.worksheets.find((ws: any) => pattern.test((ws.name || "").toString().toLowerCase()));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No se envió archivo" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // localizar hojas (case-insensitive)
    const docentesSheet = findSheetByName(workbook, /docent|docentes|profesor|teacher/);
    const cursosSheet = findSheetByName(workbook, /clases|curso|grupos/);
    const asignaturasSheet = findSheetByName(workbook, /asignatur|asignaturas|materia/);
    const cargaSheet = findSheetByName(workbook, /carga|carga academica|carga_academica|load/);

    const errors: string[] = [];
    if (!docentesSheet) errors.push("No se encontró hoja: Docentes");
    if (!cursosSheet) errors.push("No se encontró hoja: Clases / Cursos");
    if (!asignaturasSheet) errors.push("No se encontró hoja: Asignaturas");
    if (!cargaSheet) errors.push("No se encontró hoja: carga academica");

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 422 });
    }

    // parsear funciones genéricas: asumimos las dos primeras columnas en cada hoja
    function parseDosColumnas(sheet: any, colAName: string, colBName: string) {
      const rows: any[] = [];
      sheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) return; // ignorar header
        const a = row.getCell(1).text?.trim();
        const b = row.getCell(2).text?.trim();
        if (!a && !b) return;
        rows.push({ fila: rowNumber, [colAName]: a || "", [colBName]: b || "" });
      });
      return rows;
    }

    const docentes = parseDosColumnas(docentesSheet, "nombre", "abreviatura");
    const cursos = parseDosColumnas(cursosSheet, "nombre", "abreviatura");
    const asignaturas = parseDosColumnas(asignaturasSheet, "nombre", "abreviatura");

    // cargaSheet tiene 5 columnas: ASIGNATURA, CLASE, CANTIDAD, DURACION, DOCENTE
    const cargas: any[] = [];
    cargaSheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return;
      const asignatura = row.getCell(1).text?.trim();
      const curso = row.getCell(2).text?.trim();
      const cantidadRaw = row.getCell(3).value;
      const duracionRaw = row.getCell(4).value;
      const docenteAbrev = row.getCell(5).text?.trim();

      if (!asignatura && !curso && !cantidadRaw && !duracionRaw && !docenteAbrev) return;
      const cantidad = Number.isFinite(Number(cantidadRaw)) ? Number(cantidadRaw) : null;
      const duracion = Number.isFinite(Number(duracionRaw)) ? Number(duracionRaw) : null;

      const obj = { fila: rowNumber, asignatura, curso, cantidad, duracion, docenteAbrev };
      cargas.push(obj);
    });

    // validaciones cross-check
    const docentesAbrevSet = new Set(docentes.map((d: any) => normalizarClave(d.abreviatura)));
    const cursosAbrevSet = new Set(cursos.map((c: any) => normalizarClave(c.abreviatura)));
    const asignAbrevSet = new Set(asignaturas.map((a: any) => normalizarClave(a.abreviatura)));

    cargas.forEach((c) => {
      if (!c.asignatura) errors.push(`Carga fila ${c.fila}: ASIGNATURA vacío`);
      if (!c.curso) errors.push(`Carga fila ${c.fila}: CLASE vacío`);
      if (!Number.isInteger(c.cantidad) || c.cantidad < 1) errors.push(`Carga fila ${c.fila}: CANTIDAD debe ser entero >= 1`);
      if (!Number.isInteger(c.duracion) || c.duracion < 1) errors.push(`Carga fila ${c.fila}: DURACION debe ser entero >= 1`);
      if (!docentesAbrevSet.has(normalizarClave(c.docenteAbrev))) errors.push(`Carga fila ${c.fila}: DOCENTE '${c.docenteAbrev}' no existe en hoja Docentes`);
      if (!cursosAbrevSet.has(normalizarClave(c.curso))) errors.push(`Carga fila ${c.fila}: CLASE '${c.curso}' no existe en hoja Clases`);
      if (!asignAbrevSet.has(normalizarClave(c.asignatura))) {
        // aceptar que la asignatura se refiera por nombre o abreviatura; si no está, lo marcamos
        errors.push(`Carga fila ${c.fila}: ASIGNATURA '${c.asignatura}' no encontrada en hoja Asignaturas`);
      }
    });

    const preview = {
      conteos: {
        docentes: docentes.length,
        cursos: cursos.length,
        asignaturas: asignaturas.length,
        cargas: cargas.length,
      },
      docentes,
      cursos,
      asignaturas,
      cargas,
    };

    return NextResponse.json({ preview, errors }, { status: 200 });
  } catch (error: any) {
    console.error("preparse error:", error);
    return NextResponse.json({ error: error.message || "Error parseando Excel" }, { status: 500 });
  }
}
