-- Chat por comunidad: una sala de texto por comunidad (la sala es la comunidad), solo para sus
-- miembros verificados. Guardián responde solo cuando lo llaman. Los mensajes se borran al vencer
-- la regla «chat.conservacion_dias».

-- Un mensaje de chat se modera con el mismo mecanismo que los foros.
ALTER TYPE "ModerationTarget" ADD VALUE 'mensaje';

CREATE TYPE "ChatTipo" AS ENUM ('miembro', 'pregunta_guardian', 'guardian', 'sistema');

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "authorProfileId" UUID,
    "kind" "ChatTipo" NOT NULL DEFAULT 'miembro',
    "body" VARCHAR(1000),
    "enlaces" JSONB,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ,
    "replyToId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_lecturas" (
    "groupId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_lecturas_pkey" PRIMARY KEY ("groupId","profileId")
);

CREATE TABLE "chat_avisos" (
    "messageId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_avisos_pkey" PRIMARY KEY ("messageId","profileId")
);

CREATE INDEX "chat_messages_groupId_createdAt_idx" ON "chat_messages"("groupId", "createdAt");
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_avisos" ADD CONSTRAINT "chat_avisos_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
