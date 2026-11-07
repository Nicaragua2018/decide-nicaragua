-- DropForeignKey
ALTER TABLE "moderation_actions" DROP CONSTRAINT "moderation_actions_moderatorProfileId_fkey";

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderatorProfileId_fkey" FOREIGN KEY ("moderatorProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

