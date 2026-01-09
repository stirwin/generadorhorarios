import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


// GET /api/instituciones - Obtener todas las instituciones
export async function GET() {
  try {
    const instituciones = await prisma.institucion.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        periodos: true,
        docentes: {
          include: {
            restricciones: true,
            direccionGrupo: true,
          },
        },
        clases: true,
        asignaturas: true,
        cargas: true
      }

      
    });
    // con prisma en node console o endpoint temporal
//const carga = await prisma.cargaAcademica.findFirst({
//  where: {
//    institucionId: "cmjt41ymr0000uriv2q21sop7",
//    //clase: { abreviatura: "601" }, // o usa id de la clase si sabes
//    asignaturaId: "cmjm5ytez0045yykg768cjupo"
//  },
//  include: { asignatura: true, clase: true, docente: true }
//});
//console.log("essta es la carga",carga);

    return NextResponse.json( instituciones );
  } catch (error) {
    console.error('Error al obtener instituciones:', error);
    return NextResponse.json(
      { error: "Error al obtener las instituciones" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // leer texto y parsear manualmente para manejar errores de JSON y mostrar el body bruto
    const raw = await request.text();
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("JSON parse error. Raw body:", raw.slice(0, 1000));
      return NextResponse.json({ error: "JSON inválido en el body", raw: raw.slice(0, 1000) }, { status: 400 });
    }

    const {
      nombre,
      ciclo_escolar,
      dias_por_semana = 5,
      lecciones_por_dia = 7,
      periodos = [],
      creador,
    } = body;

    if (!nombre) return NextResponse.json({ error: "Nombre requerido" }, { status: 422 });

    // ... resto igual ...
    const institucion = await prisma.institucion.create({
      data: {
        nombre,
        ciclo_escolar,
        dias_por_semana,
        lecciones_por_dia,
        creador,
        periodos: {
          create: periodos.map((p: any) => ({
            indice: p.indice,
            abreviatura: p.abreviatura,
            hora_inicio: p.hora_inicio,
            hora_fin: p.hora_fin,
            duracion_min: p.duracion_min,
          })),
        },
      },
      include: { periodos: true },
    });




    return NextResponse.json({ institucion }, { status: 201 });
  } catch (error: any) {
    console.error("Error crear institucion (server):", error);
    // En dev, devuelve mensaje; en prod evita exponer detalles sensibles
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
