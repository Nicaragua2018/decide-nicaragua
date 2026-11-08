-- La revisión posterior (nivel 3) también cubre las fichas de candidatura, los pedidos de
-- revocación y las observaciones públicas que se publicaron sin revisión del asistente.
-- Estos valores solo se usan en cola_revision_posterior, nunca en moderation_actions.
ALTER TYPE "ModerationTarget" ADD VALUE 'candidatura';
ALTER TYPE "ModerationTarget" ADD VALUE 'revocacion';
ALTER TYPE "ModerationTarget" ADD VALUE 'observacion';
