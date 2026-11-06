-- DropForeignKey
ALTER TABLE "board_actions" DROP CONSTRAINT "board_actions_proposedByProfileId_fkey";

-- AddForeignKey
ALTER TABLE "board_actions" ADD CONSTRAINT "board_actions_proposedByProfileId_fkey" FOREIGN KEY ("proposedByProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
