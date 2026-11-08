-- AlterEnum
ALTER TYPE "BoardActionType" ADD VALUE 'ocultar_candidatura';

-- AlterTable
ALTER TABLE "candidaturas" ADD COLUMN     "ocultaCausa" "ModeracionCausa";

