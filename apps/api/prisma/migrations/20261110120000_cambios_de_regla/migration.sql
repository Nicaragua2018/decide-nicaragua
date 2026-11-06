-- CreateEnum
CREATE TYPE "CambioReglaEstado" AS ENUM ('en_votacion', 'pendiente_mesa', 'aplicado', 'rechazado', 'rechazado_mesa', 'sin_participacion', 'anulado');

-- AlterEnum
ALTER TYPE "BoardActionType" ADD VALUE 'change_rule';

-- DropForeignKey
ALTER TABLE "board_actions" DROP CONSTRAINT "board_actions_proposedByProfileId_fkey";

-- AlterTable
ALTER TABLE "board_actions" ALTER COLUMN "targetUserId" DROP NOT NULL,
ALTER COLUMN "proposedByProfileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "cambios_regla" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "nivel" TEXT NOT NULL,
    "ambitoGroupId" UUID NOT NULL,
    "valorAnterior" VARCHAR(40) NOT NULL,
    "valorPropuesto" VARCHAR(40) NOT NULL,
    "proposalId" UUID NOT NULL,
    "autorProfileId" UUID NOT NULL,
    "estado" "CambioReglaEstado" NOT NULL DEFAULT 'en_votacion',
    "boardActionId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoAt" TIMESTAMPTZ,

    CONSTRAINT "cambios_regla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cambios_regla_proposalId_key" ON "cambios_regla"("proposalId");

-- AddForeignKey
ALTER TABLE "board_actions" ADD CONSTRAINT "board_actions_proposedByProfileId_fkey" FOREIGN KEY ("proposedByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_regla" ADD CONSTRAINT "cambios_regla_ambitoGroupId_fkey" FOREIGN KEY ("ambitoGroupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_regla" ADD CONSTRAINT "cambios_regla_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Índice único parcial hecho a mano: un solo cambio abierto por regla y ámbito.
CREATE UNIQUE INDEX "cambios_regla_abierto_key" ON "cambios_regla" ("key", "ambitoGroupId") WHERE "estado" IN ('en_votacion','pendiente_mesa');
