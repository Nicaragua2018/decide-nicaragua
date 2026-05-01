# =============================================================
# Decide Nicaragua — API Dockerfile
# Contexto de build: raíz del monorepo
#   docker build -f apps/api/Dockerfile -t decide-api .
# =============================================================

# ── Stage 1: base ─────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# ── Stage 2: instalar dependencias (todas, incluyendo devDeps para build) ─────
FROM base AS deps
WORKDIR /monorepo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/shared/package.json    ./packages/shared/
COPY apps/api/package.json           ./apps/api/

RUN pnpm install --frozen-lockfile

# ── Stage 3: compilar shared + API ────────────────────────────
FROM deps AS builder
WORKDIR /monorepo

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# 1. Compilar @decide/shared a CJS (produce packages/shared/dist/)
RUN pnpm --filter @decide/shared build

# 2. Generar Prisma Client (necesita el schema)
RUN pnpm --filter @decide/api exec prisma generate

# 3. Compilar NestJS (produce apps/api/dist/)
RUN pnpm --filter @decide/api build

# 3b. Compilar seed.ts a JS (para poder ejecutarlo en producción sin tsx)
# --rootDir apps/api/prisma → produce dist-seed/seed.js (sin subdirectorios extra)
RUN pnpm --filter @decide/api run build:seed

# 4. Crear bundle de producción con pnpm deploy
#    — solo dependencias de producción, workspace deps copiados como directorios reales
RUN pnpm --filter @decide/api --prod deploy /app/prod

# ── Stage 4: imagen de producción ─────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Usuario sin privilegios
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# node_modules de producción (de pnpm deploy)
COPY --from=builder /app/prod/node_modules ./node_modules

# Garantizar que @decide/shared tiene su dist/ compilada
# (pnpm deploy copia el directorio workspace; esto lo hace explícito)
COPY --from=builder /monorepo/packages/shared/dist ./node_modules/@decide/shared/dist
COPY --from=builder /monorepo/packages/shared/package.json ./node_modules/@decide/shared/package.json

# Código compilado de NestJS
COPY --from=builder /monorepo/apps/api/dist ./dist

# Seed compilado (para primer despliegue)
COPY --from=builder /monorepo/apps/api/dist-seed ./dist-seed

# Prisma Client generado
COPY --from=builder /monorepo/node_modules/.prisma ./node_modules/.prisma

# Schema de Prisma (necesario para prisma migrate deploy en entrypoint)
COPY apps/api/prisma ./prisma

# Script de arranque
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER appuser
EXPOSE 4000

ENTRYPOINT ["/app/entrypoint.sh"]
