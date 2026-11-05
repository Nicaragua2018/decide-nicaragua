-- Causas cerradas de moderación y segunda firma de la mesa (plan 3A-3b).

-- CreateEnum
CREATE TYPE "ModeracionCausa" AS ENUM ('datos_personales', 'insultos_amenazas', 'spam', 'ilegal_violencia', 'suplantacion');

-- AlterEnum (PostgreSQL 12+ acepta varios ADD VALUE en una migración)
ALTER TYPE "ModerationStatus" ADD VALUE 'pendiente';
ALTER TYPE "ModerationStatus" ADD VALUE 'provisional';
ALTER TYPE "ModerationStatus" ADD VALUE 'rechazado';

-- AlterTable
ALTER TABLE "moderation_actions" ADD COLUMN     "causa" "ModeracionCausa",
ADD COLUMN     "confirmadorProfileId" UUID,
ADD COLUMN     "venceAt" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "moderation_actions_status_venceAt_idx" ON "moderation_actions"("status", "venceAt");
