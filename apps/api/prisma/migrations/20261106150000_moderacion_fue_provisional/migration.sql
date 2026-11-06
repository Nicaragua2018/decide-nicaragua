-- AlterTable
ALTER TABLE "moderation_actions" ADD COLUMN     "fueProvisional" BOOLEAN NOT NULL DEFAULT false;

-- Las solicitudes que ya existían: nacieron provisionales si su plazo fue de 48 h (las pendientes tienen 7 días).
UPDATE "moderation_actions"
SET "fueProvisional" = true
WHERE "status" = 'provisional'
   OR ("venceAt" IS NOT NULL AND "venceAt" - "createdAt" < interval '3 days');
