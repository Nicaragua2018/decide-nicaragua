# Decide Nicaragua

**Plataforma de participación democrática verificable para ciudadanos nicaragüenses en el exilio.**

Decide Nicaragua es un MVP de infraestructura digital para debate estructurado, votación verificable y sortition auditable. Está diseñado para organizaciones civiles que requieren confianza, transparencia y protección de datos personales en entornos políticos adversos.

---

## Estado del proyecto

MVP completo — Fases 0–7 implementadas y con tests.

| Módulo | Estado | Tests |
|--------|--------|-------|
| Autenticación por invitación (JWT HttpOnly + refresh rotation) | Completo | 25 |
| Gestión de usuarios y panel de administración | Completo | 12 |
| Grupos territoriales (17 departamentos de Nicaragua) | Completo | 12 |
| Deliberación (propuestas, comentarios, señales de consenso) | Completo | 21 |
| Votación Condorcet-Schulze verificable | Completo | 34 |
| Sortition verificable (selección aleatoria auditable) | Completo | 39 |
| Auditoría append-only pública | Completo | 12 |
| Frontend Next.js (App Router, Server Components) | Completo | — |

**155 tests pasan** en el backend. El frontend está funcional para los flujos de usuario principales.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 (App Router, Server Components) |
| Backend | NestJS 10 |
| Base de datos | PostgreSQL 16 + Prisma ORM |
| Caché / sesiones | Redis 7 |
| Reverse proxy | Traefik v3 (TLS automático, CSP, HSTS) |
| Monorepo | pnpm + Turborepo |
| Tipos compartidos | TypeScript end-to-end (`@decide/shared`) |
| Despliegue | Docker Compose en VPS Ubuntu |

> Nota: la cola de trabajo con BullMQ está planificada como mejora de Fase 2 para mayor durabilidad en auditoría y reintentos de email.

---

## Estructura del repositorio

```
.
├── apps/
│   ├── api/          # NestJS — lógica de negocio, REST API
│   └── web/          # Next.js — interfaz de usuario
├── packages/
│   ├── shared/       # Tipos y constantes TypeScript compartidos (@decide/shared)
│   └── tsconfig/     # Configuraciones TypeScript base
├── infra/
│   └── traefik/      # Configuración de reverse proxy y seguridad HTTP
├── scripts/          # Herramientas de desarrollo
├── docs/             # Documentación técnica
│   ├── ARCHITECTURE.md  # Arquitectura y modelo de datos
│   ├── DECISIONS.md     # ADRs y decisiones técnicas
│   ├── SECURITY.md      # Modelo de amenazas y controles
│   └── ROADMAP.md       # Estado del desarrollo y prioridades
├── docker-compose.yml          # Producción (con Traefik)
├── docker-compose.dev.yml      # Desarrollo local (solo PostgreSQL + Redis)
├── deploy.sh                   # Script de despliegue en VPS
└── .env.example                # Variables de entorno requeridas (sin valores reales)
```

---

## Desarrollo local

### Requisitos

- [Node.js 20+](https://nodejs.org/)
- [pnpm 9+](https://pnpm.io/installation)
- [Docker y Docker Compose](https://docs.docker.com/get-docker/)

### Instalación

```bash
git clone https://github.com/Nicaragua2018/decide-nicaragua.git
cd decide-nicaragua
pnpm install
cp .env.example .env
# Editar .env con los valores correctos para desarrollo local

docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm --filter @decide/api db:seed
pnpm dev
```

El frontend estará en `http://localhost:3000` y la API en `http://localhost:4000`.

### Variables de entorno principales (`.env`)

Ver `.env.example` para la lista completa y las instrucciones.

```bash
DATABASE_URL=postgresql://decide:decide_dev_password@localhost:5432/decide_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=<mínimo 32 caracteres aleatorios — openssl rand -hex 32>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=30d
COOKIE_DOMAIN=localhost
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
RESEND_API_KEY=re_xxxx          # https://resend.com — para emails de invitación
IP_HASH_SALT=<salt aleatorio>   # openssl rand -hex 32
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=<mínimo 12 caracteres>
```

### Comandos principales

```bash
pnpm dev                    # Levanta frontend y backend en paralelo
pnpm build                  # Compila los paquetes del monorepo
pnpm test                   # Ejecuta todos los tests
pnpm lint                   # Ejecuta linters
pnpm db:migrate             # Aplica migraciones de Prisma en apps/api
pnpm --filter @decide/api db:seed  # Ejecuta el seed inicial en apps/api
pnpm --filter @decide/api db:studio # Abre Prisma Studio
```

---

## Despliegue en VPS

### Primera vez

```bash
./scripts/generate-migration.sh
git add apps/api/prisma/migrations/
git commit -m "feat: initial database migration"
./deploy.sh
```

### Actualizaciones

```bash
./deploy.sh
```

`deploy.sh` valida variables de entorno, construye imágenes Docker, ejecuta `prisma migrate deploy` y reinicia los servicios con health checks.

**Requisitos del servidor:**
- Ubuntu 20.04+
- Docker + Docker Compose v2
- Puertos 80 y 443 abiertos
- Dominio apuntando al servidor (para TLS automático con Let's Encrypt)

---

## Documentación técnica

- [Arquitectura](docs/ARCHITECTURE.md) — arquitectura del sistema y modelo de datos
- [Decisiones técnicas](docs/DECISIONS.md) — ADRs y justificaciones de diseño
- [Seguridad](docs/SECURITY.md) — modelo de amenazas y controles implementados
- [Roadmap](docs/ROADMAP.md) — estado del desarrollo, fases y próximas prioridades
- [Documentación técnica](docs/README.md) — índice del contenido del directorio `docs/`

---

## Principios de diseño

- **Legitimidad democrática:** resultados verificables independientemente.
- **Seguridad desde el diseño:** cookies HttpOnly, refresh token rotation, rate limiting, CSP, HSTS.
- **Protección de identidad:** separación de identidad real, perfil operativo y auditoría.
- **Trazabilidad:** auditoría append-only en la base de datos.
- **Modularidad:** monorepo con dominios separados para frontend, backend y tipos compartidos.

---

## Contribuir

1. Abre un issue antes de comenzar trabajo significativo.
2. Lee [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y [`docs/DECISIONS.md`](docs/DECISIONS.md).
3. Ejecuta tests antes de enviar un PR: `pnpm test`.
4. No incluyas credenciales, API keys ni datos personales en commits.
5. Mantén el estilo TypeScript: `strict`, sin `any`, nombres claros.

Para vulnerabilidades de seguridad, abre un issue privado o contacta al mantenedor.

---

## Licencia

[MIT](LICENSE) — Carlos Robleto, 2026.


Este software es libre. Puedes usarlo, modificarlo y distribuirlo bajo los términos de la licencia MIT.
