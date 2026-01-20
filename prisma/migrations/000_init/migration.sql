-- CreateTable
CREATE TABLE "Institucion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciclo_escolar" TEXT,
    "dias_por_semana" INTEGER NOT NULL DEFAULT 5,
    "lecciones_por_dia" INTEGER NOT NULL DEFAULT 7,
    "director_lunes_primera" BOOLEAN NOT NULL DEFAULT true,
    "creador" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefinicionPeriodo" (
    "id" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,
    "abreviatura" TEXT,
    "hora_inicio" TEXT,
    "hora_fin" TEXT,
    "duracion_min" INTEGER,

    CONSTRAINT "DefinicionPeriodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Docente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "direccionGrupoId" TEXT,
    "institucionId" TEXT NOT NULL,

    CONSTRAINT "Docente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clase" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,

    CONSTRAINT "Clase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asignatura" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,

    CONSTRAINT "Asignatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargaAcademica" (
    "id" TEXT NOT NULL,
    "asignaturaId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "docenteId" TEXT,
    "sesiones_sem" INTEGER NOT NULL,
    "duracion_slots" INTEGER NOT NULL,
    "institucionId" TEXT NOT NULL,

    CONSTRAINT "CargaAcademica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    "usuario" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "raw_json" TEXT,
    "errores" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocenteRestriccion" (
    "id" TEXT NOT NULL,
    "docenteId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "periodoInicio" INTEGER NOT NULL,
    "periodoFin" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,

    CONSTRAINT "DocenteRestriccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Horario" (
    "id" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    "nombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioSlot" (
    "id" TEXT NOT NULL,
    "horarioId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "cargaId" TEXT NOT NULL,
    "docenteId" TEXT,
    "asignaturaId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "duracion" INTEGER NOT NULL,

    CONSTRAINT "HorarioSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Docente_institucionId_abreviatura_key" ON "Docente"("institucionId", "abreviatura");

-- CreateIndex
CREATE UNIQUE INDEX "Clase_institucionId_abreviatura_key" ON "Clase"("institucionId", "abreviatura");

-- CreateIndex
CREATE UNIQUE INDEX "Asignatura_institucionId_abreviatura_key" ON "Asignatura"("institucionId", "abreviatura");

-- AddForeignKey
ALTER TABLE "DefinicionPeriodo" ADD CONSTRAINT "DefinicionPeriodo_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Docente" ADD CONSTRAINT "Docente_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Docente" ADD CONSTRAINT "Docente_direccionGrupoId_fkey" FOREIGN KEY ("direccionGrupoId") REFERENCES "Clase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clase" ADD CONSTRAINT "Clase_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignatura" ADD CONSTRAINT "Asignatura_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaAcademica" ADD CONSTRAINT "CargaAcademica_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaAcademica" ADD CONSTRAINT "CargaAcademica_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaAcademica" ADD CONSTRAINT "CargaAcademica_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaAcademica" ADD CONSTRAINT "CargaAcademica_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocenteRestriccion" ADD CONSTRAINT "DocenteRestriccion_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Horario" ADD CONSTRAINT "Horario_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioSlot" ADD CONSTRAINT "HorarioSlot_horarioId_fkey" FOREIGN KEY ("horarioId") REFERENCES "Horario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioSlot" ADD CONSTRAINT "HorarioSlot_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioSlot" ADD CONSTRAINT "HorarioSlot_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "CargaAcademica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioSlot" ADD CONSTRAINT "HorarioSlot_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioSlot" ADD CONSTRAINT "HorarioSlot_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

