# Decide Nicaragua

Plataforma de participación democrática verificable para ciudadanos nicaragüenses. Diseñada para toma de decisiones auditable, debate estructurado y votación con métodos verificables.

## Estado del proyecto

MVP en desarrollo activo — Fases 0–7 completadas.

| Módulo | Estado |
|--------|--------|
| Autenticación (invitación, login, JWT + refresh) | Completo |
| Perfiles de usuario | Completo |
| Grupos territoriales | Completo |
| Deliberación (propuestas, comentarios, señales) | Completo |
| Votación Condorcet-Schulze | Completo |
| Auditoría append-only | Completo |
| Panel de administración | Completo |

## Stack

- **Frontend**: Next.js 15 (App Router, Server Components)
- **Backend**: NestJS 10
- **Base de datos**: PostgreSQL 16 + Prisma ORM
- **Caché / sesiones**: Redis 7
- **Reverse proxy**: Traefik v3 (TLS automático, CSP, HSTS)
- **Monorepo**: pnpm + Turborepo
- **Despliegue**: Docker Compose en VPS Ubuntu (Hostinger)

## Estructura del repositorio

```
.
├── apps/
│   ├── api/          # NestJS — lógica de negocio, REST API
│   └── web/          # Next.js — interfaz de usuario
├── packages/
│   └── shared/       # Tipos TypeScript compartidos
├── infra/
│   └── traefik/      # Configuración de reverse proxy y seguridad
├── scripts/          # Herramientas de desarrollo (generate-migration.sh)
├── docs/             # Documentación técnica
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── SECURITY.md
│   └── ROADMAP.md
├── docker-compose.yml
└── deploy.sh
```

## Desarrollo local

### Requisitos

- Node.js 20+
- pnpm 9+
- Docker y Docker Compose

### Configuración inicial

```bash
# 1. Instalar dependencias
pnpm install

# 2. Crear variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Editar ambos archivos con los valores correctos

# 3. Levantar servicios de base de datos
docker compose up -d postgres redis

# 4. Aplicar migraciones y seed
pnpm --filter @decide/api exec prisma migrate dev
pnpm --filter @decide/api exec prisma db seed

# 5. Iniciar en modo desarrollo
pnpm dev
```

El frontend estará disponible en `http://localhost:3000` y la API en `http://localhost:4000`.

### Tests

```bash
pnpm test                    # Todos los tests
pnpm --filter @decide/api test   # Solo backend
```

## Despliegue en VPS

### Primera vez (con migraciones vacías)

```bash
# 1. Generar migraciones iniciales (solo una vez)
./scripts/generate-migration.sh
git add apps/api/prisma/migrations/
git commit -m "feat: initial database migration"

# 2. Desplegar
./deploy.sh
```

### Actualizaciones

```bash
./deploy.sh
```

El script valida requisitos, construye imágenes, ejecuta migraciones y reinicia servicios.

## Variables de entorno requeridas

### API (`apps/api/.env`)

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_TTL_SECONDS=2592000
COOKIE_DOMAIN=tudominio.com
NODE_ENV=production
PORT=4000
```

### Web (`apps/web/.env.local`)

```
API_URL=http://api:4000          # URL interna (Docker network)
NEXT_PUBLIC_APP_URL=https://tudominio.com
NEXT_PUBLIC_API_URL=https://tudominio.com
```

## Documentación técnica

- [Arquitectura](docs/ARCHITECTURE.md) — Diagrama de componentes, decisiones de diseño
- [Decisiones técnicas](docs/DECISIONS.md) — ADRs (Architecture Decision Records)
- [Seguridad](docs/SECURITY.md) — Modelo de amenazas, controles implementados
- [Roadmap](docs/ROADMAP.md) — Fases completadas y pendientes

## Principios de diseño

- **Legitimidad primero**: todo resultado importante es verificable de forma independiente.
- **Seguridad seria**: JWT HttpOnly, refresh token rotation, rate limiting, CSP, HSTS.
- **Auditoría append-only**: todos los eventos críticos quedan registrados.
- **Mínima complejidad**: suficiente para el MVP, preparado para escalar.

## Licencia

Por definir.
