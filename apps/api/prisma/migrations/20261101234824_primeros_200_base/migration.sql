-- CreateEnum
CREATE TYPE "BoardRole" AS ENUM ('administrador', 'coordinador_general', 'secretario');

-- CreateEnum
CREATE TYPE "SeatSource" AS ENUM ('fundador', 'eleccion');

-- CreateEnum
CREATE TYPE "ReferenceKind" AS ENUM ('invitador', 'segunda');

-- CreateEnum
CREATE TYPE "BoardActionType" AS ENUM ('suspend_user', 'change_origin');

-- CreateEnum
CREATE TYPE "BoardActionStatus" AS ENUM ('pending', 'approved', 'rejected', 'executed');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "currentRegion" TEXT;

-- CreateTable
CREATE TABLE "board_seats" (
    "id" UUID NOT NULL,
    "role" "BoardRole" NOT NULL,
    "profileId" UUID NOT NULL,
    "source" "SeatSource" NOT NULL,
    "since" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_references" (
    "id" UUID NOT NULL,
    "subjectUserId" UUID NOT NULL,
    "refereeProfileId" UUID NOT NULL,
    "kind" "ReferenceKind" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_actions" (
    "id" UUID NOT NULL,
    "type" "BoardActionType" NOT NULL,
    "targetUserId" UUID NOT NULL,
    "params" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "BoardActionStatus" NOT NULL DEFAULT 'pending',
    "proposedByProfileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,

    CONSTRAINT "board_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_approvals" (
    "id" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "role" "BoardRole" NOT NULL,
    "approve" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_seats_role_key" ON "board_seats"("role");

-- CreateIndex
CREATE INDEX "board_seats_profileId_idx" ON "board_seats"("profileId");

-- CreateIndex
CREATE INDEX "verification_references_refereeProfileId_idx" ON "verification_references"("refereeProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_references_subjectUserId_kind_key" ON "verification_references"("subjectUserId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "verification_references_subjectUserId_refereeProfileId_key" ON "verification_references"("subjectUserId", "refereeProfileId");

-- CreateIndex
CREATE INDEX "board_actions_status_idx" ON "board_actions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "board_approvals_actionId_profileId_key" ON "board_approvals"("actionId", "profileId");

-- AddForeignKey
ALTER TABLE "board_seats" ADD CONSTRAINT "board_seats_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_references" ADD CONSTRAINT "verification_references_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_references" ADD CONSTRAINT "verification_references_refereeProfileId_fkey" FOREIGN KEY ("refereeProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_actions" ADD CONSTRAINT "board_actions_proposedByProfileId_fkey" FOREIGN KEY ("proposedByProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_approvals" ADD CONSTRAINT "board_approvals_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "board_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_approvals" ADD CONSTRAINT "board_approvals_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
