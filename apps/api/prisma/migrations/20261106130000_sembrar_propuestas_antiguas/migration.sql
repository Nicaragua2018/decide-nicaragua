-- Siembra de propuestas antiguas (plan 2) en el ciclo de soluciones (3A-3).
-- Cada propuesta formal abierta, sin votación propia y sin soluciones recibe una
-- solución con su propio texto, de su misma autora. Así, al vencer el debate,
-- tiene al menos una candidata en lugar de cerrarse «sin soluciones».
-- Solo datos: no cambia el esquema. Es idempotente (no repite si ya hay soluciones).
INSERT INTO "soluciones" ("id", "proposalId", "authorProfileId", "title", "description", "origen", "hidden", "createdAt")
SELECT
  gen_random_uuid(),
  p."id",
  p."authorProfileId",
  left(p."title", 140),
  left(coalesce(nullif(p."body", ''), p."title"), 2000),
  'persona',
  false,
  now()
FROM "proposals" p
WHERE p."kind" = 'propuesta'
  AND p."status" = 'open'
  AND p."electionId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "soluciones" s WHERE s."proposalId" = p."id");
