export type EstadoHorario =
  | "sin-iniciar"
  | "en-progreso"
  | "creado";

export interface Institucion {
  id: string;

  // Datos básicos
  nombre: string;
  nivel: string;
  cicloEscolar: string;

  // Configuración general del horario
  diasPorSemana: number;      // ej: 5
  leccionesPorDia: number;    // ej: 7

  // Estado del proceso
  estadoHorario: EstadoHorario;

  // Metadatos
  creadaEn?: string;
  actualizadaEn?: string;
}
