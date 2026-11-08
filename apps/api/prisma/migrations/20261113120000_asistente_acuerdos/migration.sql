-- CreateEnum
CREATE TYPE "SugerenciaTipo" AS ENUM ('agrupar', 'umbral', 'presentacion', 'mapa', 'borradores', 'comision');

-- DropForeignKey
ALTER TABLE "inquietudes" DROP CONSTRAINT "inquietudes_authorProfileId_fkey";

-- DropForeignKey
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_authorProfileId_fkey";

-- AlterTable
ALTER TABLE "inquietudes" ADD COLUMN     "origen" "Origen" NOT NULL DEFAULT 'persona',
ALTER COLUMN "authorProfileId" DROP NOT NULL,
ALTER COLUMN "title" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "origen" "Origen" NOT NULL DEFAULT 'persona',
ALTER COLUMN "authorProfileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "sugerencias_asistente" (
    "id" UUID NOT NULL,
    "tipo" "SugerenciaTipo" NOT NULL,
    "objetoId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "contenido" JSONB NOT NULL,
    "base" JSONB NOT NULL,
    "final" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sugerencias_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcas_asistente" (
    "clave" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcas_asistente_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "sugerencias_asistente_groupId_tipo_idx" ON "sugerencias_asistente"("groupId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "sugerencias_asistente_tipo_objetoId_key" ON "sugerencias_asistente"("tipo", "objetoId");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquietudes" ADD CONSTRAINT "inquietudes_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

