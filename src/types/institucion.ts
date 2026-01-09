export type EstadoHorario =
  | "sin-iniciar"
  | "en-progreso"
  | "creado";

export interface Clase {
  id: string;
  nombre: string;
  abreviatura?: string;
  institucionId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Docente {
  id: string;
  nombre: string;
  abreviatura?: string;
  direccionGrupoId?: string | null;
  restricciones?: DocenteRestriccion[];
}

export interface DocenteRestriccion {
  id: string;
  dia: number;
  periodoInicio: number;
  periodoFin: number;
  tipo: string;
}

export interface Asignatura {
  id: string;
  nombre: string;
  abreviatura?: string;
}

export interface CargaAcademica {
  id: string;
  asignaturaId: string;
  claseId: string;
  docenteId?: string | null;
}

type Periodo = {
  indice: number;
  abreviatura?: string;
  hora_inicio?: string; // "08:00"
  hora_fin?: string; // "08:45"
  duracion_min?: number;
};

  export interface Institucion {
  id: string;
  nombre: string;
  nivel: string;
  cicloEscolar: string;
      periodos?: Periodo[]; // si existe, se usa para las etiquetas de hora
  clases?: Clase[]; // <--- necesario
  docentes?: Docente[];
  asignaturas?: Asignatura[];
  cargas?: CargaAcademica[];
  diasPorSemana: number;
  dias_por_semana?: number;
  leccionesPorDia: number;
  lecciones_por_dia?: number;
  estadoHorario: EstadoHorario;
  creadaEn?: string;
  actualizadaEn?: string;
}
