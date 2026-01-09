-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Institucion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "ciclo_escolar" TEXT,
    "dias_por_semana" INTEGER NOT NULL DEFAULT 5,
    "lecciones_por_dia" INTEGER NOT NULL DEFAULT 7,
    "director_lunes_primera" BOOLEAN NOT NULL DEFAULT true,
    "creador" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Institucion" ("ciclo_escolar", "creador", "createdAt", "dias_por_semana", "id", "lecciones_por_dia", "nombre") SELECT "ciclo_escolar", "creador", "createdAt", "dias_por_semana", "id", "lecciones_por_dia", "nombre" FROM "Institucion";
DROP TABLE "Institucion";
ALTER TABLE "new_Institucion" RENAME TO "Institucion";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
