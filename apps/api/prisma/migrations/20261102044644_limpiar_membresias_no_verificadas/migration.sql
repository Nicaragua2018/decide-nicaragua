-- Las membresías solo son de miembros verificados (ADR-016): se quitan las
-- que quedaron de cuentas no verificadas antes de este cambio.
DELETE FROM "group_memberships" WHERE "profileId" IN (SELECT p."id" FROM "profiles" p JOIN "users" u ON u."id" = p."userId" WHERE u."status" <> 'verified_citizen');
