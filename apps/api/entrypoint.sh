#!/bin/sh
# =============================================================
# Decide Nicaragua — API entrypoint
#
# Ejecuta migraciones de Prisma antes de arrancar el servidor.
# Diseñado para correr como usuario sin privilegios (appuser).
# =============================================================

set -e

echo "[entrypoint] Ejecutando migraciones de base de datos..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "[entrypoint] Iniciando servidor NestJS..."
exec node /app/dist/main
