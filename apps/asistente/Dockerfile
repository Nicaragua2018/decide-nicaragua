# Asistente Agéntico — imagen de producción para el VPS (Docker + EasyPanel)
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/asistente ./apps/asistente
RUN pnpm install --frozen-lockfile --filter @decide/asistente...
WORKDIR /repo/apps/asistente
RUN pnpm db:generate && pnpm build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
# LibreOffice headless para la conversión xlsx → pdf (PRD §10)
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-calc fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/asistente/node_modules ./apps/asistente/node_modules
COPY --from=build /repo/apps/asistente/dist ./apps/asistente/dist
COPY --from=build /repo/apps/asistente/prisma ./apps/asistente/prisma
COPY --from=build /repo/apps/asistente/package.json ./apps/asistente/package.json

WORKDIR /app/apps/asistente
EXPOSE 4100
# Aplica migraciones pendientes y arranca
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
