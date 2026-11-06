-- CreateEnum
CREATE TYPE "TrabajoTipo" AS ENUM ('subgrupo', 'comision', 'bifurcacion');

-- CreateEnum
CREATE TYPE "TrabajoEstado" AS ENUM ('convocando', 'activo', 'pausado', 'cerrado', 'archivado');

-- AlterEnum
ALTER TYPE "GroupType" ADD VALUE 'trabajo';

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "convocatoriaEndsAt" TIMESTAMPTZ,
ADD COLUMN     "creadoPorProfileId" UUID,
ADD COLUMN     "parentGroupId" UUID,
ADD COLUMN     "pocosMiembrosDesde" TIMESTAMPTZ,
ADD COLUMN     "proposito" VARCHAR(1000),
ADD COLUMN     "trabajoEstado" "TrabajoEstado",
ADD COLUMN     "trabajoTipo" "TrabajoTipo";

-- AlterTable
ALTER TABLE "inquietudes" ADD COLUMN     "origenSolucionId" UUID;

-- CreateIndex
CREATE INDEX "groups_parentGroupId_trabajoEstado_idx" ON "groups"("parentGroupId", "trabajoEstado");

-- CreateIndex
CREATE UNIQUE INDEX "inquietudes_origenSolucionId_key" ON "inquietudes"("origenSolucionId");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

