-- CreateEnum
CREATE TYPE "CargoFin" AS ENUM ('mandato', 'renuncia', 'revocacion', 'suspension');

-- CreateEnum
CREATE TYPE "RevocacionEstado" AS ENUM ('abierta', 'lograda', 'vencida');

-- CreateEnum
CREATE TYPE "ReactivacionEstado" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BoardActionType" ADD VALUE 'reactivate_user';
ALTER TYPE "BoardActionType" ADD VALUE 'rechazar_reactivacion';

-- AlterEnum
ALTER TYPE "EleccionMotivo" ADD VALUE 'anticipada';

-- AlterTable
ALTER TABLE "cargos" ADD COLUMN     "finCausa" "CargoFin";

-- AlterTable
ALTER TABLE "elecciones" ADD COLUMN     "mandatoHasta" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "revocaciones" (
    "id" UUID NOT NULL,
    "cargoId" UUID NOT NULL,
    "solicitanteProfileId" UUID NOT NULL,
    "motivo" VARCHAR(600) NOT NULL,
    "estado" "RevocacionEstado" NOT NULL DEFAULT 'abierta',
    "electoradoN" INTEGER NOT NULL,
    "fraccion" INTEGER NOT NULL,
    "umbral" INTEGER NOT NULL,
    "venceAt" TIMESTAMPTZ NOT NULL,
    "logradaAt" TIMESTAMPTZ,
    "eleccionId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revocaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revocacion_apoyos" (
    "id" UUID NOT NULL,
    "revocacionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revocacion_apoyos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_reactivacion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "texto" VARCHAR(1000) NOT NULL,
    "estado" "ReactivacionEstado" NOT NULL DEFAULT 'pendiente',
    "motivoRechazo" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaAt" TIMESTAMPTZ,

    CONSTRAINT "solicitudes_reactivacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observaciones_publicas" (
    "id" UUID NOT NULL,
    "autorProfileId" UUID NOT NULL,
    "auditEventId" UUID NOT NULL,
    "texto" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observaciones_publicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revocaciones_solicitanteProfileId_cargoId_idx" ON "revocaciones"("solicitanteProfileId", "cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "revocacion_apoyos_revocacionId_profileId_key" ON "revocacion_apoyos"("revocacionId", "profileId");

-- CreateIndex
CREATE INDEX "solicitudes_reactivacion_userId_createdAt_idx" ON "solicitudes_reactivacion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "observaciones_publicas_createdAt_idx" ON "observaciones_publicas"("createdAt");

-- AddForeignKey
ALTER TABLE "revocaciones" ADD CONSTRAINT "revocaciones_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revocacion_apoyos" ADD CONSTRAINT "revocacion_apoyos_revocacionId_fkey" FOREIGN KEY ("revocacionId") REFERENCES "revocaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Índices únicos parciales hechos a mano (Prisma no los conoce; no los borre en migraciones futuras).
-- Un solo pedido de revocación abierto por cargo.
CREATE UNIQUE INDEX "revocaciones_abierta_por_cargo" ON "revocaciones" ("cargoId") WHERE "estado" = 'abierta';

-- Una sola solicitud de reactivación pendiente por persona.
CREATE UNIQUE INDEX "reactivacion_pendiente_por_usuario" ON "solicitudes_reactivacion" ("userId") WHERE "estado" = 'pendiente';
