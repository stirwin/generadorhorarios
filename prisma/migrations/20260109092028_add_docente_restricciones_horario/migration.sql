-- CreateTable
CREATE TABLE "DocenteRestriccion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docenteId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "periodoInicio" INTEGER NOT NULL,
    "periodoFin" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    CONSTRAINT "DocenteRestriccion_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Horario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institucionId" TEXT NOT NULL,
    "nombre" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Horario_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HorarioSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "horarioId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "cargaId" TEXT NOT NULL,
    "docenteId" TEXT,
    "asignaturaId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "duracion" INTEGER NOT NULL,
    CONSTRAINT "HorarioSlot_horarioId_fkey" FOREIGN KEY ("horarioId") REFERENCES "Horario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HorarioSlot_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HorarioSlot_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "CargaAcademica" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HorarioSlot_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HorarioSlot_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Docente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "direccionGrupoId" TEXT,
    "institucionId" TEXT NOT NULL,
    CONSTRAINT "Docente_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Docente_direccionGrupoId_fkey" FOREIGN KEY ("direccionGrupoId") REFERENCES "Clase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Docente" ("abreviatura", "activo", "id", "institucionId", "nombre") SELECT "abreviatura", "activo", "id", "institucionId", "nombre" FROM "Docente";
DROP TABLE "Docente";
ALTER TABLE "new_Docente" RENAME TO "Docente";
CREATE UNIQUE INDEX "Docente_abreviatura_key" ON "Docente"("abreviatura");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
