-- CreateTable
CREATE TABLE "Institucion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "ciclo_escolar" TEXT,
    "dias_por_semana" INTEGER NOT NULL DEFAULT 5,
    "lecciones_por_dia" INTEGER NOT NULL DEFAULT 7,
    "creador" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DefinicionPeriodo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institucionId" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,
    "abreviatura" TEXT,
    "hora_inicio" TEXT,
    "hora_fin" TEXT,
    "duracion_min" INTEGER,
    CONSTRAINT "DefinicionPeriodo_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Docente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "institucionId" TEXT NOT NULL,
    CONSTRAINT "Docente_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    CONSTRAINT "Curso_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asignatura" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    CONSTRAINT "Asignatura_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CargaAcademica" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asignaturaId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "docenteId" TEXT,
    "sesiones_sem" INTEGER NOT NULL,
    "duracion_slots" INTEGER NOT NULL,
    "institucionId" TEXT NOT NULL,
    CONSTRAINT "CargaAcademica_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CargaAcademica_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CargaAcademica_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CargaAcademica_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institucionId" TEXT NOT NULL,
    "usuario" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "raw_json" TEXT,
    "errores" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportJob_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Docente_abreviatura_key" ON "Docente"("abreviatura");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_abreviatura_key" ON "Curso"("abreviatura");

-- CreateIndex
CREATE UNIQUE INDEX "Asignatura_abreviatura_key" ON "Asignatura"("abreviatura");
