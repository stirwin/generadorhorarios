export type EstadoHorario =
  | "sin-iniciar"
  | "en-progreso"
  | "creado";

export interface Clase {
  id: string;
  nombre: string;
  abreviatura: string;
  institucionId: string;
  createdAt?: string;
  updatedAt?: string;
}

  export interface Institucion {
  id: string;
  nombre: string;
  nivel: string;
  cicloEscolar: string;
  clases?: Clase[]; // <--- necesario
  diasPorSemana: number;
  dias_por_semana?: number;
  leccionesPorDia: number;
  lecciones_por_dia?: number;
  estadoHorario: EstadoHorario;
  creadaEn?: string;
  actualizadaEn?: string;
}

