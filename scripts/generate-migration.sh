#!/usr/bin/env bash
# =============================================================
# Decide Nicaragua — Generación de la migración inicial
#
# Uso (ejecutar desde la raíz del monorepo, UNA VEZ antes del
# primer despliegue):
#
#   chmod +x scripts/generate-migration.sh
#   ./scripts/generate-migration.sh
#
# Requiere:
#   - Docker corriendo localmente
#   - pnpm instalado
#
# Qué hace:
#   1. Levanta un PostgreSQL temporal en el puerto 5433
#   2. Ejecuta `prisma migrate dev --name init`
#      → Genera prisma/migrations/TIMESTAMP_init/migration.sql
#   3. Detiene y borra el postgres temporal
#
# Después: commitear la carpeta prisma/migrations/ generada.
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

PG_CONTAINER="decide_migrate_tmp"
PG_PASSWORD="migrate_tmp_pass_$(date +%s)"
PG_PORT=5433

cleanup() {
  echo "==> Eliminando postgres temporal..."
  docker rm -f "$PG_CONTAINER" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# Iniciar postgres temporal
echo "==> Iniciando PostgreSQL temporal en puerto ${PG_PORT}..."
docker run -d \
  --name "$PG_CONTAINER" \
  -e POSTGRES_USER=decide \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB=decide_migrate \
  -p "${PG_PORT}:5432" \
  postgres:16-alpine > /dev/null

# Esperar a que esté listo
echo "==> Esperando PostgreSQL..."
until docker exec "$PG_CONTAINER" pg_isready -U decide > /dev/null 2>&1; do
  sleep 1
done

# Ejecutar prisma migrate dev
echo "==> Generando migración inicial..."
DATABASE_URL="postgresql://decide:${PG_PASSWORD}@localhost:${PG_PORT}/decide_migrate" \
  pnpm --filter @decide/api exec prisma migrate dev --name init

echo ""
echo "==> Migración generada en apps/api/prisma/migrations/"
echo "    Commitear esa carpeta antes de hacer deploy:"
echo "    git add apps/api/prisma/migrations"
echo "    git commit -m 'chore: add initial prisma migration'"
