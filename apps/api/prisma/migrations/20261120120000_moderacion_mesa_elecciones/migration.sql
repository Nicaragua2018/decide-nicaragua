-- La revisión posterior de fichas, pedidos de revocación y observaciones abre una solicitud que
-- la mesa confirma con 2 firmas (el asistente nunca oculta solo). Ver ADR-029.

-- Un pedido cuyo motivo ocultó la mesa: no se muestra y no cuenta para la espera entre pedidos.
ALTER TYPE "RevocacionEstado" ADD VALUE 'retirada';

-- Huella (sha256) del texto que revisó el asistente: si cambió, confirmar no oculta.
ALTER TABLE "moderation_actions" ADD COLUMN "huella" VARCHAR(64);

-- Una observación moderada se oculta, no se borra.
ALTER TABLE "observaciones_publicas" ADD COLUMN "oculta" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ocultaCausa" "ModeracionCausa";
