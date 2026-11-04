-- CreateEnum
CREATE TYPE "InquietudStatus" AS ENUM ('abierta', 'en_plazo', 'en_debate', 'respondida', 'abierta_por_la_comunidad');

-- AlterEnum
ALTER TYPE "ModerationTarget" ADD VALUE 'inquietud';

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "abiertoPorComunidad" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "rule_values" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "groupId" UUID,
    "value" VARCHAR(40) NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rule_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquietudes" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "authorProfileId" UUID NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" "InquietudStatus" NOT NULL DEFAULT 'abierta',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "thresholdReachedAt" TIMESTAMPTZ,
    "deadlineAt" TIMESTAMPTZ,
    "response" VARCHAR(2000),
    "respondedByProfileId" UUID,
    "respondedAt" TIMESTAMPTZ,
    "proposalId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inquietudes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquietud_apoyos" (
    "id" UUID NOT NULL,
    "inquietudId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquietud_apoyos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inquietudes_groupId_status_idx" ON "inquietudes"("groupId", "status");

-- CreateIndex
CREATE INDEX "inquietudes_status_deadlineAt_idx" ON "inquietudes"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "inquietud_apoyos_inquietudId_profileId_key" ON "inquietud_apoyos"("inquietudId", "profileId");

-- AddForeignKey
ALTER TABLE "rule_values" ADD CONSTRAINT "rule_values_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquietudes" ADD CONSTRAINT "inquietudes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquietudes" ADD CONSTRAINT "inquietudes_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquietudes" ADD CONSTRAINT "inquietudes_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquietud_apoyos" ADD CONSTRAINT "inquietud_apoyos_inquietudId_fkey" FOREIGN KEY ("inquietudId") REFERENCES "inquietudes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquietud_apoyos" ADD CONSTRAINT "inquietud_apoyos_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Unicidad de reglas: una por clave en colmena y una por (clave, grupo) en local
CREATE UNIQUE INDEX "rule_values_colmena_key" ON "rule_values" ("key") WHERE "groupId" IS NULL;
CREATE UNIQUE INDEX "rule_values_local_key" ON "rule_values" ("key", "groupId") WHERE "groupId" IS NOT NULL;
