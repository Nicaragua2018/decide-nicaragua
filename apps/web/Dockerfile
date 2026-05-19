# =============================================================
# Decide Nicaragua — Web Dockerfile
# Contexto de build: raíz del monorepo
#   docker build -f apps/web/Dockerfile -t decide-web .
# =============================================================

# ── Stage 1: base ─────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# ── Stage 2: instalar dependencias ────────────────────────────
FROM base AS deps
WORKDIR /monorepo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/shared/package.json    ./packages/shared/
COPY apps/web/package.json           ./apps/web/

RUN pnpm install --frozen-lockfile

# ── Stage 3: build ────────────────────────────────────────────
FROM deps AS builder
WORKDIR /monorepo

COPY packages/ ./packages/
COPY apps/web/  ./apps/web/

# Compilar @decide/shared (produce dist/ para que Next.js lo importe como JS)
RUN pnpm --filter @decide/shared build

# Variables de entorno de build
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_URL
ARG API_URL=http://api:4000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV API_URL=${API_URL}

# Build Next.js (produce apps/web/.next/standalone/)
RUN pnpm --filter @decide/web build

# ── Stage 4: imagen de producción ─────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Next.js standalone: incluye server.js + node_modules mínimos
# En monorepo, el standalone se genera en apps/web/.next/standalone/
# y replica la estructura de directorios desde la raíz del monorepo
COPY --from=builder /monorepo/apps/web/.next/standalone ./
COPY --from=builder /monorepo/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /monorepo/apps/web/public           ./apps/web/public

USER appuser
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# server.js está en apps/web/ dentro del standalone (monorepo path)
CMD ["node", "apps/web/server.js"]
