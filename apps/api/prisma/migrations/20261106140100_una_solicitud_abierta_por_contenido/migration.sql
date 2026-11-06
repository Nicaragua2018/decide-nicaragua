-- Una sola solicitud de moderación abierta (pendiente o provisional) por contenido.
-- Va en su propia migración: PostgreSQL no deja usar un valor de enum recién agregado
-- en la misma transacción que lo agrega. Prisma no modela índices parciales.
CREATE UNIQUE INDEX "moderation_actions_abierta_key" ON "moderation_actions" ("target", "targetId")
WHERE "status" IN ('pendiente', 'provisional');
