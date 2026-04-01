#!/usr/bin/env bash
# =============================================================
# Decide Nicaragua — Script de despliegue en VPS
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh [--no-build]
#
# Requiere:
#   - .env con todas las variables (ver .env.example)
#   - Docker y Docker Compose instalados en el VPS
#   - Puerto 80 y 443 libres
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NO_BUILD=false
for arg in "$@"; do
  case $arg in
    --no-build) NO_BUILD=true ;;
  esac
done

# ── Verificaciones previas ─────────────────────────────────────
echo "==> Verificando entorno..."

if [ ! -f ".env" ]; then
  echo "ERROR: No existe .env. Copiar .env.example y completarlo."
  exit 1
fi

# Cargar .env para verificar variables críticas
set -a
# shellcheck disable=SC1091
source .env
set +a

required_vars=(
  APP_DOMAIN DATABASE_URL REDIS_URL JWT_SECRET
  APP_URL API_URL COOKIE_DOMAIN
  RESEND_API_KEY EMAIL_FROM IP_HASH_SALT
  POSTGRES_PASSWORD INTERNAL_API_KEY
  TRAEFIK_ACME_EMAIL TRAEFIK_DASHBOARD_PASSWORD
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: Variable de entorno requerida no definida: $var"
    exit 1
  fi
done

# JWT_SECRET debe tener al menos 32 caracteres
if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "ERROR: JWT_SECRET debe tener al menos 32 caracteres"
  exit 1
fi

echo "==> Variables de entorno OK"

# ── Verificar migraciones Prisma ────────────────────────────────
MIGRATIONS_DIR="apps/api/prisma/migrations"
if [ ! -d "$MIGRATIONS_DIR" ] || [ -z "$(ls -A "$MIGRATIONS_DIR" 2>/dev/null)" ]; then
  echo ""
  echo "ERROR: No existen archivos de migración en ${MIGRATIONS_DIR}/"
  echo "       Generar la migración inicial antes del primer despliegue:"
  echo ""
  echo "       ./scripts/generate-migration.sh"
  echo "       git add apps/api/prisma/migrations"
  echo "       git commit -m 'chore: add initial prisma migration'"
  echo ""
  exit 1
fi

# ── Preparar directorio Traefik ────────────────────────────────
echo "==> Preparando infraestructura Traefik..."

mkdir -p infra/traefik/dynamic
# Nota: acme.json vive en el volumen Docker 'traefik_acme' (/etc/traefik/acme.json
# dentro del contenedor). Traefik lo crea automáticamente con permisos correctos.

# ── Pull y build ───────────────────────────────────────────────
if [ "$NO_BUILD" = false ]; then
  echo "==> Construyendo imágenes Docker..."
  docker compose build --no-cache
else
  echo "==> Saltando build (--no-build)"
fi

# ── Despliegue ─────────────────────────────────────────────────
echo "==> Deteniendo servicios anteriores..."
docker compose down --remove-orphans

echo "==> Iniciando servicios..."
docker compose up -d

# ── Esperar a que la API esté lista ───────────────────────────
echo "==> Esperando health check del API..."
max_attempts=30
attempt=0
until docker compose exec -T api wget -qO- http://localhost:4000/api/health > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo "ERROR: API no respondió después de ${max_attempts} intentos"
    docker compose logs api --tail=50
    exit 1
  fi
  echo "   Intento ${attempt}/${max_attempts}..."
  sleep 3
done

echo ""
echo "==> ¡Despliegue exitoso!"
echo "    Web:      https://${APP_DOMAIN}"
echo "    API:      https://api.${APP_DOMAIN}/api/health"
echo "    Traefik:  https://traefik.${APP_DOMAIN}"
echo ""
echo "Para ver logs:   docker compose logs -f [api|web|postgres|redis]"
echo ""
echo "PRIMER DESPLIEGUE — seed del admin inicial:"
echo "  (asegurarse de que ADMIN_SEED_EMAIL y ADMIN_SEED_PASSWORD estén en .env)"
echo ""
echo "  docker compose exec api node /app/dist-seed/seed.js"
