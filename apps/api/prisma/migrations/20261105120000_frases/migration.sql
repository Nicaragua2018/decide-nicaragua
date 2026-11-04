-- CreateEnum
CREATE TYPE "FraseVotoValor" AS ENUM ('de_acuerdo', 'en_desacuerdo', 'paso');

-- AlterEnum
ALTER TYPE "ModerationTarget" ADD VALUE 'frase';

-- CreateTable
CREATE TABLE "frases" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "authorProfileId" UUID NOT NULL,
    "text" VARCHAR(140) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frase_votos" (
    "id" UUID NOT NULL,
    "fraseId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "value" "FraseVotoValor" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "frase_votos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "frases_proposalId_idx" ON "frases"("proposalId");

-- CreateIndex
CREATE INDEX "frase_votos_profileId_idx" ON "frase_votos"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "frase_votos_fraseId_profileId_key" ON "frase_votos"("fraseId", "profileId");

-- AddForeignKey
ALTER TABLE "frases" ADD CONSTRAINT "frases_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frases" ADD CONSTRAINT "frases_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frase_votos" ADD CONSTRAINT "frase_votos_fraseId_fkey" FOREIGN KEY ("fraseId") REFERENCES "frases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frase_votos" ADD CONSTRAINT "frase_votos_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

