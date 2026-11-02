-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('tema', 'propuesta');

-- CreateEnum
CREATE TYPE "ModerationTarget" AS ENUM ('tema', 'respuesta');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('oculto', 'apelado', 'restaurado', 'confirmado');

-- AlterTable
ALTER TABLE "proposal_comments" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "conclusion" VARCHAR(2000),
ADD COLUMN     "deliberationEndsAt" TIMESTAMPTZ,
ADD COLUMN     "electionId" UUID,
ADD COLUMN     "forumId" UUID,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "ProposalKind" NOT NULL DEFAULT 'tema',
ADD COLUMN     "objections" VARCHAR(2000);

-- CreateTable
CREATE TABLE "forums" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByProfileId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "target" "ModerationTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "moderatorProfileId" UUID NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'oculto',
    "appealText" VARCHAR(1000),
    "appealedAt" TIMESTAMPTZ,
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forums_groupId_idx" ON "forums"("groupId");

-- CreateIndex
CREATE INDEX "moderation_actions_target_targetId_idx" ON "moderation_actions"("target", "targetId");

-- CreateIndex
CREATE INDEX "moderation_actions_status_idx" ON "moderation_actions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_electionId_key" ON "proposals"("electionId");

-- CreateIndex
CREATE INDEX "proposals_forumId_idx" ON "proposals"("forumId");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "forums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forums" ADD CONSTRAINT "forums_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forums" ADD CONSTRAINT "forums_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderatorProfileId_fkey" FOREIGN KEY ("moderatorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Comunidad general (grupo custom con slug 'general').
INSERT INTO "groups" ("id", "name", "slug", "type", "description", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Toda la comunidad', 'general', 'custom',
       'Comunidad de todas las personas verificadas de Nicaragua Decide', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "groups" WHERE "slug" = 'general');

-- Todas las personas verificadas entran a la comunidad general.
INSERT INTO "group_memberships" ("id", "groupId", "profileId", "joinedAt")
SELECT gen_random_uuid(), g."id", p."id", now()
FROM "profiles" p
JOIN "users" u ON u."id" = p."userId"
CROSS JOIN (SELECT "id" FROM "groups" WHERE "slug" = 'general') g
WHERE u."status" = 'verified_citizen'
ON CONFLICT ("groupId", "profileId") DO NOTHING;

-- Un foro por defecto para cada grupo que ya tenga temas, y los temas viejos pasan a él.
INSERT INTO "forums" ("id", "groupId", "title", "isDefault", "createdAt")
SELECT gen_random_uuid(), gr."id", 'Foro de ' || gr."name", true, now()
FROM "groups" gr
WHERE EXISTS (SELECT 1 FROM "proposals" pr WHERE pr."groupId" = gr."id")
  AND NOT EXISTS (SELECT 1 FROM "forums" f WHERE f."groupId" = gr."id" AND f."isDefault");

UPDATE "proposals" pr
SET "forumId" = f."id"
FROM "forums" f
WHERE f."groupId" = pr."groupId" AND f."isDefault" AND pr."forumId" IS NULL;

