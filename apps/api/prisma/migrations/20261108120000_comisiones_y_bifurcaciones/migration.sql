-- AlterEnum
ALTER TYPE "TrabajoEstado" ADD VALUE 'eligiendo';

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "activadaAt" TIMESTAMPTZ,
ADD COLUMN     "ampliada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eleccionEndsAt" TIMESTAMPTZ,
ADD COLUMN     "eleccionResultado" JSONB,
ADD COLUMN     "forma" VARCHAR(20),
ADD COLUMN     "origenGrupoId" UUID,
ADD COLUMN     "origenSolucionId" UUID,
ADD COLUMN     "pausaApelacion" VARCHAR(1000),
ADD COLUMN     "pausaApeladaAt" TIMESTAMPTZ,
ADD COLUMN     "pausaCausa" "ModeracionCausa",
ADD COLUMN     "pausaDetalle" VARCHAR(500),
ADD COLUMN     "proximoInformeAt" TIMESTAMPTZ,
ADD COLUMN     "puestos" INTEGER,
ADD COLUMN     "seleccionAlgoritmo" TEXT,
ADD COLUMN     "seleccionPool" JSONB,
ADD COLUMN     "seleccionSemilla" TEXT,
ADD COLUMN     "tarea" VARCHAR(2000);

-- CreateTable
CREATE TABLE "comision_voluntarios" (
    "id" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "experiencia" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comision_voluntarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comision_informes" (
    "id" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "autorProfileId" UUID NOT NULL,
    "texto" VARCHAR(5000) NOT NULL,
    "final" BOOLEAN NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comision_informes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comision_renovacion_apoyos" (
    "id" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comision_renovacion_apoyos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comision_papeletas" (
    "id" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "orden" UUID[],

    CONSTRAINT "comision_papeletas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comision_voluntarios_grupoId_profileId_key" ON "comision_voluntarios"("grupoId", "profileId");

-- CreateIndex
CREATE INDEX "comision_informes_grupoId_createdAt_idx" ON "comision_informes"("grupoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "comision_renovacion_apoyos_grupoId_profileId_key" ON "comision_renovacion_apoyos"("grupoId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "comision_papeletas_grupoId_profileId_key" ON "comision_papeletas"("grupoId", "profileId");

-- AddForeignKey
ALTER TABLE "comision_voluntarios" ADD CONSTRAINT "comision_voluntarios_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_voluntarios" ADD CONSTRAINT "comision_voluntarios_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_informes" ADD CONSTRAINT "comision_informes_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_renovacion_apoyos" ADD CONSTRAINT "comision_renovacion_apoyos_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_renovacion_apoyos" ADD CONSTRAINT "comision_renovacion_apoyos_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_papeletas" ADD CONSTRAINT "comision_papeletas_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_papeletas" ADD CONSTRAINT "comision_papeletas_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Índices únicos parciales (hechos a mano; Prisma no los conoce)
CREATE UNIQUE INDEX "grupos_comision_viva_por_solucion" ON "groups"("origenSolucionId")
  WHERE "trabajoTipo" = 'comision' AND "trabajoEstado" NOT IN ('cerrado', 'archivado');

CREATE UNIQUE INDEX "grupos_bifurcacion_por_solucion" ON "groups"("origenSolucionId")
  WHERE "trabajoTipo" = 'bifurcacion';
