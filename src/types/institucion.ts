export type EstadoHorario =
  | "sin-iniciar"
  | "en-progreso"
  | "creado";

  export interface Institucion {
  id: string;
  nombre: string;
  nivel: string;
  cicloEscolar: string;
  clases?: Clase[]; // <--- necesario
  diasPorSemana: number;
  leccionesPorDia: number;
  estadoHorario: EstadoHorario;
  creadaEn?: string;
  actualizadaEn?: string;
}

