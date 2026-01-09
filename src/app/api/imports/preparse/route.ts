// app/api/imports/preparse/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Normaliza claves para comparaciones:
 * - trim
 * - lowercase
 */
function normalizarClave(s?: string) {
  return (s || "").toString().trim().toLowerCase();
}

/**
 * Quitador de tildes / diacríticos
 */
function removeAccents(str: string) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
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
 * ExcelJS cell.value puede ser:
 * - string
 * - number
 * - { formula, result }
 * - rich text object, etc.
 */
function getCellString(cell: any): string {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();
  if (typeof v === "object") {
    // fórmula u objeto con result
    if ("result" in v) return String(v.result ?? "").trim();
    // rich text: { richText: [{text: '...'}] }
    if (Array.isArray(v.richText)) {
      return v.richText.map((t: any) => t.text).join("").trim();
    }
    // fallback a text si existe
    if ("text" in v) return String(v.text ?? "").trim();
  }
  return "";
}

/**
 * INTENTAR EXTRAER UN NÚMERO ENTERO A PARTIR DE UNA CADENA
 * Acepta:
 *  - "2"
 *  - "2 lecciones"
 *  - "Dos lecciones"
 *  - "LECCIÓN" -> 1
 *  - "Una lección" -> 1
 *  - "tres" (con o sin tilde)
 *
 * Retorna entero >=1 o null si no se puede inferir.
 */
function parseDurationRaw(raw: any): number | null {
  // si ya es número
  if (raw == null) return null;

  // si es objeto ExcelJS cell.value (ej. {result: ..}) pasar por String
  if (typeof raw === "object" && raw !== null && "result" in raw) {
    raw = raw.result;
  }

  // si es número
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n >= 1 ? n : null;
  }

  // si es string
  const s = String(raw).trim();
  if (!s) return null;

  // 1) Buscar dígitos en la cadena (ej. "2", "2 lecciones", "3x45")
  const digitMatch = s.match(/(\d+)(?!.*\d)/); // tomar último número (si hubiera varios)
  if (digitMatch) {
    const n = Number(digitMatch[1]);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }

  // 2) Normalizar (quitar tildes, lower)
  const normalized = removeAccents(s).toLowerCase();

  // 3) Mapa de palabras (español) básicas
  const wordsToNumber: Record<string, number> = {
    "uno": 1, "una": 1, "un": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
    "diez": 10,
    "once": 11,
    "doce": 12
    // puedes extender según necesites
  };

  // buscar palabra numérica
  for (const [w, val] of Object.entries(wordsToNumber)) {
    // coincidencia de palabra completa
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(normalized)) return val;
  }

  // 4) Frases comunes sin número que implican 1
  // ej: "leccion", "leccion unica", "una leccion", "lección"
  if (/leccion(es)?\b/.test(normalized) || /\blectiva\b/.test(normalized)) {
    // si la cadena tiene una palabra numérica la habríamos cogido antes,
    // si no, asumimos 1 (p. ej. "Lección", "Lección semanal")
    return 1;
  }

  // 5) No pudimos determinar
  return null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se envió archivo" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as any);

    // ===========================
    // 1️⃣ Localizar hojas
    // ===========================
    const docentesSheet = findSheetByName(workbook, /docent|docentes|profesor|teacher/);
    const clasesSheet = findSheetByName(workbook, /clases|clase|grupos|grupo/);
    const asignaturasSheet = findSheetByName(workbook, /asignatur|asignaturas|materia/);
    const cargaSheet = findSheetByName(workbook, /carga|carga academica|carga_academica|load/);

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
    function parseDosColumnas(sheet: any, colAName: string, colBName: string) {
      const rows: any[] = [];
      sheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) return; // header
        const a = getCellString(row.getCell(1));
        const b = getCellString(row.getCell(2));
        if (!a && !b) return;
        rows.push({ fila: rowNumber, [colAName]: a, [colBName]: b });
      });
      return rows;
    }

    function parseDocentes(sheet: any) {
      const rows: any[] = [];
      const headerRow = sheet.getRow(1);
      const headerValues = Array.isArray(headerRow?.values) ? headerRow.values : [];
      const headerNormalized = headerValues.map((v: any) => getCellString({ value: v }).toUpperCase());
      const hasClaseAbrev = headerNormalized.includes("CLASEABREV");

      sheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) return; // header
        const nombre = getCellString(row.getCell(1));
        const abreviatura = getCellString(row.getCell(2));
        const claseAbrev = hasClaseAbrev ? getCellString(row.getCell(3)) : "";
        if (!nombre && !abreviatura && !claseAbrev) return;
        const rowData: any = { fila: rowNumber, nombre, abreviatura };
        if (hasClaseAbrev) rowData.claseAbrev = claseAbrev;
        rows.push(rowData);
      });
      return rows;
    }

    const docentes = parseDocentes(docentesSheet);
    const clases = parseDosColumnas(clasesSheet, "nombre", "abreviatura");
    const asignaturas = parseDosColumnas(asignaturasSheet, "nombre", "abreviatura");

    // ===========================
    // 3️⃣ Parse CARGA ACADÉMICA
    //    columnas esperadas:
    //    1: ASIGNATURA
    //    2: CLASE
    //    3: CANTIDAD (sesiones por semana)
    //    4: DURACION (puede ser numérico o texto)
    //    5: DOCENTE (abreviatura o nombre)
    // ===========================
    const cargas: any[] = [];
    cargaSheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return;
      const asignaturaRaw = row.getCell(1).value;
      const claseRaw = row.getCell(2).value;
      const cantidadRaw = row.getCell(3).value;
      const duracionRaw = row.getCell(4).value;
      const docenteRaw = row.getCell(5).value;

      // transformar a strings seguros para nombre/abreviatura usando getCellString
      const asignatura = getCellString(row.getCell(1));
      const clase = getCellString(row.getCell(2));
      const docenteAbrev = getCellString(row.getCell(5));

      // parse cantidad (sesiones por semana) como entero si es posible
      const cantidad = (cantidadRaw == null || String(cantidadRaw).toString().trim() === "") ? null
        : (Number.isFinite(Number(cantidadRaw)) ? Math.floor(Number(cantidadRaw)) : null);

      // parse duracion: usar parser potente que acepta textos
      const durParsed = parseDurationRaw(duracionRaw);

      // si fila completamente vacía saltar
      if (!asignatura && !clase && !cantidad && !durParsed && !docenteAbrev) return;

      cargas.push({
        fila: rowNumber,
        asignatura,
        clase,
        cantidad,
        // duracion numeric (entero) o null si no se pudo inferir
        duracion: durParsed,
        // mantenemos raw en caso de querer mostrar en preview/debug
        duracionRaw: duracionRaw,
        docenteAbrev,
        // para debugging leve en servidor
        __debug_raw: { asignaturaRaw, claseRaw, docenteRaw, duracionRaw, cantidadRaw }
      });

      // opcional: log para diagnóstico en dev
      // console.log({ fila: rowNumber, asignaturaRaw, claseRaw, docenteRaw, duracionRaw, cantidadRaw });
    });

    // ===========================
    // 4️⃣ Validaciones cruzadas
    // ===========================
    const docentesAbrevSet = new Set(docentes.map((d) => normalizarClave(d.abreviatura)));
    const docentesNameSet = new Set(docentes.map((d) => normalizarClave(d.nombre)));
    const clasesAbrevSet = new Set(clases.map((c) => normalizarClave(c.abreviatura)));
    const asignAbrevSet = new Set(asignaturas.map((a) => normalizarClave(a.abreviatura)));
    const asignNameSet = new Set(asignaturas.map((a) => normalizarClave(a.nombre)));

    docentes.forEach((d) => {
      if (d.claseAbrev && !clasesAbrevSet.has(normalizarClave(d.claseAbrev))) {
        errors.push(`Docente fila ${d.fila}: CLASEABREV '${d.claseAbrev}' no existe en hoja Clases`);
      }
    });

    cargas.forEach((c) => {
      if (!c.asignatura) errors.push(`Carga fila ${c.fila}: ASIGNATURA vacío`);
      if (!c.clase) errors.push(`Carga fila ${c.fila}: CLASE vacío`);
      if (!Number.isInteger(c.cantidad) || c.cantidad < 1) errors.push(`Carga fila ${c.fila}: CANTIDAD debe ser entero >= 1`);

      // Validar duracion: ahora es número o null
      if (!Number.isInteger(c.duracion) || c.duracion < 1) {
        errors.push(`Carga fila ${c.fila}: DURACION inválida ('${String(c.duracionRaw)}') — debe ser entero >= 1 o texto reconocible`);
      }

      // DOCENTE: aceptar abreviatura o nombre
      const docenteKey = normalizarClave(c.docenteAbrev);
      if (!docentesAbrevSet.has(docenteKey) && !docentesNameSet.has(docenteKey)) {
        errors.push(`Carga fila ${c.fila}: DOCENTE '${c.docenteAbrev}' no existe (ni por abreviatura ni por nombre)`);
      }

      // CLASE: buscar por abreviatura
      if (!clasesAbrevSet.has(normalizarClave(c.clase))) {
        errors.push(`Carga fila ${c.fila}: CLASE '${c.clase}' no existe en hoja Clases`);
      }

      // ASIGNATURA: aceptar nombre o abreviatura
      const asignKey = normalizarClave(c.asignatura);
      if (!asignAbrevSet.has(asignKey) && !asignNameSet.has(asignKey)) {
        errors.push(`Carga fila ${c.fila}: ASIGNATURA '${c.asignatura}' no encontrada en hoja Asignaturas`);
      }
    });

    // ===========================
    // 5️⃣ Preview (estructura que envía al frontend)
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
    return NextResponse.json({ error: error.message || "Error parseando Excel" }, { status: 500 });
  }
}
