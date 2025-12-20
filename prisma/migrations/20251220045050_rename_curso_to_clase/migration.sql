/*
  Warnings:

  - You are about to drop the `Curso` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `cursoId` on the `CargaAcademica` table. All the data in the column will be lost.
  - Added the required column `claseId` to the `CargaAcademica` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Curso_abreviatura_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Curso";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Clase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    CONSTRAINT "Clase_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CargaAcademica" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asignaturaId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "docenteId" TEXT,
    "sesiones_sem" INTEGER NOT NULL,
    "duracion_slots" INTEGER NOT NULL,
    "institucionId" TEXT NOT NULL,
    CONSTRAINT "CargaAcademica_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CargaAcademica_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CargaAcademica_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CargaAcademica_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CargaAcademica" ("asignaturaId", "docenteId", "duracion_slots", "id", "institucionId", "sesiones_sem") SELECT "asignaturaId", "docenteId", "duracion_slots", "id", "institucionId", "sesiones_sem" FROM "CargaAcademica";
DROP TABLE "CargaAcademica";
ALTER TABLE "new_CargaAcademica" RENAME TO "CargaAcademica";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Clase_abreviatura_key" ON "Clase"("abreviatura");
