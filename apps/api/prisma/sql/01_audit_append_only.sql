-- =============================================================
-- Trigger: audit_events es append-only
--
-- Este trigger se ejecuta BEFORE UPDATE OR DELETE en audit_events
-- y lanza un error, haciendo la tabla inmutable a nivel de base de datos.
--
-- Ejecutar DESPUÉS de la primera migración de Prisma:
--   psql $DATABASE_URL -f prisma/sql/01_audit_append_only.sql
--
-- No es gestionado por Prisma Migrate intencionalmente:
-- queremos que sea explícito y resistente a migraciones futuras.
-- =============================================================

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_events is append-only. Attempted operation: % on row id=%',
    TG_OP,
    OLD.id
  USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Eliminar si existe (para idempotencia)
DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- Verificar que el trigger fue creado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'audit_events_immutable'
      AND event_object_table = 'audit_events'
  ) THEN
    RAISE NOTICE 'OK: trigger audit_events_immutable creado correctamente.';
  ELSE
    RAISE EXCEPTION 'ERROR: trigger audit_events_immutable no fue creado.';
  END IF;
END;
$$;
