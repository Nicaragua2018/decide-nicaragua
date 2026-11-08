-- CreateEnum
CREATE TYPE "CargoTipo" AS ENUM ('administrador', 'coordinador_general', 'secretario', 'observador', 'coordinador');

-- CreateEnum
CREATE TYPE "EleccionFase" AS ENUM ('candidaturas', 'votacion', 'contada');

-- CreateEnum
CREATE TYPE "EleccionMotivo" AS ENUM ('primera', 'renovacion', 'reintento');

-- CreateTable
CREATE TABLE "elecciones" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "cargo" "CargoTipo" NOT NULL,
    "puestos" INTEGER NOT NULL,
    "motivo" "EleccionMotivo" NOT NULL,
    "jornadaId" UUID,
    "fase" "EleccionFase" NOT NULL DEFAULT 'candidaturas',
    "candidaturasEndsAt" TIMESTAMPTZ NOT NULL,
    "votacionEndsAt" TIMESTAMPTZ NOT NULL,
    "prorrogada" BOOLEAN NOT NULL DEFAULT false,
    "miembros" INTEGER,
    "papeletasTotal" INTEGER,
    "abstenciones" INTEGER,
    "aprobaciones" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "candidatasOrden" UUID[] DEFAULT ARRAY[]::UUID[],
    "pairwiseMatrix" JSONB,
    "schulzeMatrix" JSONB,
    "ordenFinal" UUID[] DEFAULT ARRAY[]::UUID[],
    "electas" UUID[] DEFAULT ARRAY[]::UUID[],
    "semilla" TEXT,
    "sinQuorum" BOOLEAN NOT NULL DEFAULT false,
    "contadaAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "elecciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidaturas" (
    "id" UUID NOT NULL,
    "eleccionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "presentacion" VARCHAR(600) NOT NULL,
    "compromisos" TEXT[],
    "oculta" BOOLEAN NOT NULL DEFAULT false,
    "retiradaAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "candidaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papeletas_eleccion" (
    "id" UUID NOT NULL,
    "eleccionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "abstencion" BOOLEAN NOT NULL,
    "orden" UUID[],
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "papeletas_eleccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos" (
    "id" UUID NOT NULL,
    "tipo" "CargoTipo" NOT NULL,
    "groupId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "eleccionId" UUID,
    "desde" TIMESTAMPTZ NOT NULL,
    "hasta" TIMESTAMPTZ NOT NULL,
    "enFunciones" BOOLEAN NOT NULL DEFAULT false,
    "terminadoAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "elecciones_fase_idx" ON "elecciones"("fase");

-- CreateIndex
CREATE INDEX "elecciones_groupId_cargo_idx" ON "elecciones"("groupId", "cargo");

-- CreateIndex
CREATE UNIQUE INDEX "candidaturas_eleccionId_profileId_key" ON "candidaturas"("eleccionId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "papeletas_eleccion_eleccionId_profileId_key" ON "papeletas_eleccion"("eleccionId", "profileId");

-- CreateIndex
CREATE INDEX "cargos_groupId_tipo_idx" ON "cargos"("groupId", "tipo");

-- CreateIndex
CREATE INDEX "cargos_profileId_idx" ON "cargos"("profileId");

-- AddForeignKey
ALTER TABLE "elecciones" ADD CONSTRAINT "elecciones_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidaturas" ADD CONSTRAINT "candidaturas_eleccionId_fkey" FOREIGN KEY ("eleccionId") REFERENCES "elecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidaturas" ADD CONSTRAINT "candidaturas_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papeletas_eleccion" ADD CONSTRAINT "papeletas_eleccion_eleccionId_fkey" FOREIGN KEY ("eleccionId") REFERENCES "elecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papeletas_eleccion" ADD CONSTRAINT "papeletas_eleccion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_eleccionId_fkey" FOREIGN KEY ("eleccionId") REFERENCES "elecciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Índice único parcial hecho a mano: una sola elección abierta por ámbito y cargo.
CREATE UNIQUE INDEX "elecciones_abierta_por_cargo" ON "elecciones" ("groupId", "cargo") WHERE "fase" IN ('candidaturas','votacion');
