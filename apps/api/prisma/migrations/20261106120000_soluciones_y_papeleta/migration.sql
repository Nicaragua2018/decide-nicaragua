-- CreateEnum
CREATE TYPE "Origen" AS ENUM ('persona', 'asistente');

-- CreateEnum
CREATE TYPE "DecisionFase" AS ENUM ('modo', 'objecion', 'votacion', 'contada', 'cancelada');

-- CreateEnum
CREATE TYPE "DecisionModo" AS ENUM ('excluyentes', 'compatibles');

-- CreateEnum
CREATE TYPE "DecisionResultado" AS ENUM ('aprobada', 'ninguna', 'empate', 'sin_quorum', 'sin_soluciones');

-- AlterEnum
ALTER TYPE "ModerationTarget" ADD VALUE 'solucion';

-- CreateTable
CREATE TABLE "soluciones" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "authorProfileId" UUID NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "origen" "Origen" NOT NULL DEFAULT 'persona',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisiones" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "fase" "DecisionFase" NOT NULL,
    "modo" "DecisionModo",
    "modoPropuesto" "DecisionModo",
    "objecionEndsAt" TIMESTAMPTZ,
    "votacionStartsAt" TIMESTAMPTZ,
    "votacionEndsAt" TIMESTAMPTZ,
    "candidatas" UUID[] DEFAULT ARRAY[]::UUID[],
    "resultado" "DecisionResultado",
    "ganadoras" UUID[] DEFAULT ARRAY[]::UUID[],
    "aprobaciones" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "pairwiseMatrix" JSONB,
    "schulzeMatrix" JSONB,
    "papeletasTotal" INTEGER,
    "abstenciones" INTEGER,
    "miembros" INTEGER,
    "contadaAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "decisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_papeletas" (
    "id" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "abstencion" BOOLEAN NOT NULL,
    "orden" UUID[],
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "decision_papeletas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objeciones_modo" (
    "id" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objeciones_modo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "soluciones_proposalId_idx" ON "soluciones"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "decisiones_proposalId_key" ON "decisiones"("proposalId");

-- CreateIndex
CREATE INDEX "decisiones_fase_idx" ON "decisiones"("fase");

-- CreateIndex
CREATE UNIQUE INDEX "decision_papeletas_decisionId_profileId_key" ON "decision_papeletas"("decisionId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "objeciones_modo_decisionId_profileId_key" ON "objeciones_modo"("decisionId", "profileId");

-- AddForeignKey
ALTER TABLE "soluciones" ADD CONSTRAINT "soluciones_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soluciones" ADD CONSTRAINT "soluciones_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisiones" ADD CONSTRAINT "decisiones_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_papeletas" ADD CONSTRAINT "decision_papeletas_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_papeletas" ADD CONSTRAINT "decision_papeletas_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objeciones_modo" ADD CONSTRAINT "objeciones_modo_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objeciones_modo" ADD CONSTRAINT "objeciones_modo_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

