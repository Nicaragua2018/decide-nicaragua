#!/usr/bin/env bash
# =============================================================
# Decide Nicaragua - VPS deployment script
#
# Usage:
#   bash deploy.sh
#   bash deploy.sh --env-file env.production
#   bash deploy.sh --env-file env.production --seed-admin
#   bash deploy.sh --no-build
#
# Requirements:
#   - Docker and Docker Compose installed on the VPS
#   - Ports 80 and 443 open
#   - DNS A/AAAA records pointing to the VPS:
#       nicaraguadecide.org, api.nicaraguadecide.org, traefik.nicaraguadecide.org
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NO_BUILD=false
SEED_ADMIN=false
ENV_FILE="${ENV_FILE:-.env}"

usage() {
  cat <<EOF
Usage: bash deploy.sh [--env-file FILE] [--no-build] [--seed-admin]

Options:
  --env-file FILE   Environment file for Docker Compose. Defaults to .env.
                    If .env is missing and env.production exists, env.production is used.
  --no-build        Skip image build and restart existing images.
  --seed-admin      Run the idempotent initial admin seed after the API is healthy.
  -h, --help        Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-build)
      NO_BUILD=true
      ;;
    --seed-admin)
      SEED_ADMIN=true
      ;;
    --env-file)
      shift
      if [ "$#" -eq 0 ]; then
        echo "ERROR: --env-file requires a file path"
        exit 1
      fi
      ENV_FILE="$1"
      ;;
    --env-file=*)
      ENV_FILE="${1#*=}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

if [ ! -f "$ENV_FILE" ] && [ "$ENV_FILE" = ".env" ] && [ -f "env.production" ]; then
  ENV_FILE="env.production"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Environment file not found: $ENV_FILE"
  echo "       Create .env from .env.example, or run: bash deploy.sh --env-file env.production"
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

# Read KEY=value without sourcing the file. This avoids shell-expanding secrets
# such as htpasswd hashes that contain dollar signs.
get_env_var() {
  local key="$1"
  local line value

  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    printf ''
    return 0
  fi

  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

require_env() {
  local key="$1"
  local value
  value="$(get_env_var "$key")"
  if [ -z "$value" ]; then
    echo "ERROR: Required environment variable is missing: $key"
    exit 1
  fi
}

echo "==> Using environment file: $ENV_FILE"
echo "==> Checking deployment prerequisites..."

required_vars=(
  NODE_ENV APP_DOMAIN DATABASE_URL REDIS_URL JWT_SECRET
  APP_URL API_URL COOKIE_DOMAIN
  RESEND_API_KEY EMAIL_FROM IP_HASH_SALT
  POSTGRES_PASSWORD INTERNAL_API_KEY
  TRAEFIK_ACME_EMAIL TRAEFIK_DASHBOARD_PASSWORD
)

for var in "${required_vars[@]}"; do
  require_env "$var"
done

JWT_SECRET_VALUE="$(get_env_var JWT_SECRET)"
if [ "${#JWT_SECRET_VALUE}" -lt 32 ]; then
  echo "ERROR: JWT_SECRET must be at least 32 characters"
  exit 1
fi

NODE_ENV_VALUE="$(get_env_var NODE_ENV)"
APP_DOMAIN_VALUE="$(get_env_var APP_DOMAIN)"
APP_URL_VALUE="$(get_env_var APP_URL)"
API_URL_VALUE="$(get_env_var API_URL)"
DATABASE_URL_VALUE="$(get_env_var DATABASE_URL)"
REDIS_URL_VALUE="$(get_env_var REDIS_URL)"
EMAIL_FROM_VALUE="$(get_env_var EMAIL_FROM)"

if [[ "$APP_DOMAIN_VALUE" == http://* || "$APP_DOMAIN_VALUE" == https://* || "$APP_DOMAIN_VALUE" == */ ]]; then
  echo "ERROR: APP_DOMAIN must be a bare domain, for example: nicaraguadecide.org"
  exit 1
fi

if [ "$NODE_ENV_VALUE" = "production" ]; then
  case "$APP_URL_VALUE" in
    https://*) ;;
    *) echo "ERROR: APP_URL must use https:// in production"; exit 1 ;;
  esac
  case "$API_URL_VALUE" in
    https://*) ;;
    *) echo "ERROR: API_URL must use https:// in production"; exit 1 ;;
  esac
  if [[ "$DATABASE_URL_VALUE" == *@localhost:* || "$DATABASE_URL_VALUE" == *@127.0.0.1:* ]]; then
    echo "ERROR: DATABASE_URL points to localhost. Use the Compose host 'postgres' or an external DB host."
    exit 1
  fi
  if [[ "$REDIS_URL_VALUE" == redis://localhost:* || "$REDIS_URL_VALUE" == redis://127.0.0.1:* ]]; then
    echo "ERROR: REDIS_URL points to localhost. Use the Compose host 'redis' or an external Redis host."
    exit 1
  fi
  if [[ "$EMAIL_FROM_VALUE" == *@resend.dev ]]; then
    echo "WARN: EMAIL_FROM uses resend.dev. Configure a verified sender on $APP_DOMAIN_VALUE before inviting real users."
  fi
fi

if [ "$SEED_ADMIN" = true ]; then
  require_env ADMIN_SEED_EMAIL
  require_env ADMIN_SEED_PASSWORD
  ADMIN_SEED_PASSWORD_VALUE="$(get_env_var ADMIN_SEED_PASSWORD)"
  if [ "${#ADMIN_SEED_PASSWORD_VALUE}" -lt 12 ]; then
    echo "ERROR: ADMIN_SEED_PASSWORD must be at least 12 characters"
    exit 1
  fi
fi

echo "==> Environment OK"

MIGRATIONS_DIR="apps/api/prisma/migrations"
if [ ! -d "$MIGRATIONS_DIR" ] || [ -z "$(ls -A "$MIGRATIONS_DIR" 2>/dev/null)" ]; then
  echo "ERROR: No Prisma migrations found in $MIGRATIONS_DIR"
  echo "       Generate and commit migrations before the first deploy."
  exit 1
fi

echo "==> Preparing Traefik directories..."
mkdir -p infra/traefik/dynamic

if [ "$NO_BUILD" = false ]; then
  echo "==> Building Docker images..."
  compose build --no-cache
else
  echo "==> Skipping build (--no-build)"
fi

echo "==> Stopping previous services..."
compose down --remove-orphans

echo "==> Starting services..."
compose up -d

echo "==> Waiting for API health check..."
max_attempts=30
attempt=0
until compose exec -T api wget -qO- http://localhost:4000/api/health > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "ERROR: API did not become healthy after ${max_attempts} attempts"
    compose logs api --tail=80
    exit 1
  fi
  echo "   Attempt ${attempt}/${max_attempts}..."
  sleep 3
done

if [ "$SEED_ADMIN" = true ]; then
  echo "==> Running initial admin seed..."
  ADMIN_SEED_EMAIL_VALUE="$(get_env_var ADMIN_SEED_EMAIL)"
  ADMIN_SEED_PASSWORD_VALUE="$(get_env_var ADMIN_SEED_PASSWORD)"
  compose exec -T \
    -e ADMIN_SEED_EMAIL="$ADMIN_SEED_EMAIL_VALUE" \
    -e ADMIN_SEED_PASSWORD="$ADMIN_SEED_PASSWORD_VALUE" \
    api node /app/dist-seed/seed.js
fi

echo ""
echo "==> Deployment successful"
echo "    Web:     https://${APP_DOMAIN_VALUE}"
echo "    API:     https://api.${APP_DOMAIN_VALUE}/api/health"
echo "    Traefik: https://traefik.${APP_DOMAIN_VALUE}"
echo ""
echo "Logs:"
echo "  docker compose --env-file ${ENV_FILE} logs -f [api|web|postgres|redis|traefik]"
echo ""
echo "Initial admin seed, if still needed:"
echo "  bash deploy.sh --env-file ${ENV_FILE} --no-build --seed-admin"
