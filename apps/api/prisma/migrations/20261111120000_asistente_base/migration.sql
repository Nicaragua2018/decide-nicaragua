-- AlterEnum
ALTER TYPE "ModeracionCausa" ADD VALUE 'odio';

-- DropForeignKey
ALTER TABLE "moderation_actions" DROP CONSTRAINT "moderation_actions_moderatorProfileId_fkey";

-- AlterTable
ALTER TABLE "moderation_actions" ADD COLUMN     "origen" "Origen" NOT NULL DEFAULT 'persona',
ALTER COLUMN "moderatorProfileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "uso_asistente" (
    "mes" TEXT NOT NULL,
    "costoMicrodolares" BIGINT NOT NULL DEFAULT 0,
    "avisoTopeAt" TIMESTAMPTZ,

    CONSTRAINT "uso_asistente_pkey" PRIMARY KEY ("mes")
);

-- CreateTable
CREATE TABLE "textos_en_revision" (
    "id" UUID NOT NULL,
    "autorProfileId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "texto" TEXT NOT NULL,
    "causa" "ModeracionCausa" NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "motivo" TEXT,
    "creadoAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceAt" TIMESTAMPTZ NOT NULL,
    "resueltoAt" TIMESTAMPTZ,

    CONSTRAINT "textos_en_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmas_revision" (
    "revisionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "aprobar" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmas_revision_pkey" PRIMARY KEY ("revisionId","profileId")
);

-- CreateTable
CREATE TABLE "cola_revision_posterior" (
    "id" UUID NOT NULL,
    "target" "ModerationTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "creadaAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intentos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cola_revision_posterior_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "textos_en_revision_estado_venceAt_idx" ON "textos_en_revision"("estado", "venceAt");

-- CreateIndex
CREATE UNIQUE INDEX "cola_revision_posterior_target_targetId_key" ON "cola_revision_posterior"("target", "targetId");

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderatorProfileId_fkey" FOREIGN KEY ("moderatorProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textos_en_revision" ADD CONSTRAINT "textos_en_revision_autorProfileId_fkey" FOREIGN KEY ("autorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmas_revision" ADD CONSTRAINT "firmas_revision_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "textos_en_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

