-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "alDiaDesde" TIMESTAMPTZ,
ADD COLUMN     "ultimaVisitaAt" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "avisos_cerrados" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "clave" VARCHAR(80) NOT NULL,
    "hasta" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "avisos_cerrados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "avisos_cerrados_profileId_clave_key" ON "avisos_cerrados"("profileId", "clave");

-- AddForeignKey
ALTER TABLE "avisos_cerrados" ADD CONSTRAINT "avisos_cerrados_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

