# Decide Nicaragua

**Plataforma de participación democrática verificable para ciudadanos nicaragüenses.**

Decide Nicaragua es una infraestructura digital de código abierto para toma de decisiones auditable, debate estructurado y votación con métodos verificables. Está diseñada para organizaciones políticas y civiles que operan en condiciones adversas — en particular para comunidades en el exilio que necesitan deliberar y decidir de forma legítima, transparente y resistente a interferencias.

El proyecto nace de la necesidad de los nicaragüenses en el exilio de contar con herramientas propias para organizarse democráticamente, sin depender de plataformas comerciales que no garantizan ni la integridad de los resultados ni la protección de la identidad de sus participantes.

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

**155 tests pasan** en el backend. El frontend está funcional para todos los módulos.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 (App Router, Server Components) |
| Backend | NestJS 10 |
| Base de datos | PostgreSQL 16 + Prisma ORM |
| Caché / sesiones | Redis 7 + BullMQ |
| Reverse proxy | Traefik v3 (TLS automático, CSP, HSTS) |
| Monorepo | pnpm + Turborepo |
| Tipos compartidos | TypeScript end-to-end (`@decide/shared`) |
| Despliegue | Docker Compose en VPS Ubuntu |

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
│   ├── ARCHITECTURE.md  # Diagrama de componentes y decisiones de diseño
│   ├── DECISIONS.md     # ADRs — por qué se eligió cada tecnología
│   ├── SECURITY.md      # Modelo de amenazas y controles implementados
│   └── ROADMAP.md       # Fases completadas y próximas
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
# 1. Clonar el repositorio
git clone https://github.com/carlosrobleto/decide-nicaragua.git
cd decide-nicaragua

# 2. Instalar dependencias
pnpm install

# 3. Crear variables de entorno
cp .env.example .env
# Editar .env con los valores correctos para desarrollo local

# 4. Levantar PostgreSQL y Redis
docker compose -f docker-compose.dev.yml up -d

# 5. Aplicar migraciones y crear datos iniciales
pnpm --filter @decide/api exec prisma migrate dev
pnpm db:seed

# 6. Iniciar en modo desarrollo (hot reload)
pnpm dev
```

El frontend estará en `http://localhost:3000` y la API en `http://localhost:4000`.

### Variables de entorno principales (`.env`)

Ver `.env.example` para la lista completa con instrucciones. Las más importantes:

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

### Tests

```bash
pnpm test                          # Todos los tests (155 en backend)
pnpm --filter @decide/api test     # Solo backend
pnpm --filter @decide/api typecheck  # Verificación de tipos
```

---

## Despliegue en VPS

### Primera vez

```bash
# 1. Generar migración inicial
./scripts/generate-migration.sh
git add apps/api/prisma/migrations/
git commit -m "feat: initial database migration"

# 2. Desplegar (valida requisitos, construye imágenes, migra y reinicia)
./deploy.sh
```

### Actualizaciones

```bash
./deploy.sh
```

El script valida que estén presentes las variables de entorno requeridas, construye las imágenes Docker, ejecuta `prisma migrate deploy` y reinicia los servicios con health checks.

**Requisitos del servidor:**
- Ubuntu 20.04+
- Docker + Docker Compose v2
- Puertos 80 y 443 abiertos
- Dominio apuntando al servidor (para TLS automático con Let's Encrypt)

---

## Documentación técnica

- [Arquitectura](docs/ARCHITECTURE.md) — Diagrama de componentes, separación de identidad, modelo de datos
- [Decisiones técnicas](docs/DECISIONS.md) — ADRs explicando por qué se eligió cada tecnología
- [Seguridad](docs/SECURITY.md) — Modelo de amenazas, controles implementados, auditoría interna
- [Roadmap](docs/ROADMAP.md) — Fases completadas y próximas iteraciones

---

## Principios de diseño

- **Legitimidad primero**: los resultados de votaciones y sortitions son verificables de forma independiente, sin confiar en el servidor.
- **Seguridad seria**: JWT HttpOnly, refresh token rotation en Redis, rate limiting, CSP, HSTS, auditoría append-only.
- **Protección de identidad**: separación de tabla de identidad (PII) y perfil operativo; IPs almacenadas como hash.
- **Mínima complejidad**: suficiente para operar con confianza, preparado para escalar.
- **Código auditable**: algoritmos críticos (Schulze, Fisher-Yates con SHA-256) tienen tests exhaustivos y están documentados.

---

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Abre un issue antes de empezar trabajo significativo.
2. Lee [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y [`docs/DECISIONS.md`](docs/DECISIONS.md) para entender las decisiones existentes.
3. Los módulos críticos requieren tests. Ejecuta `pnpm test` antes de enviar un PR.
4. No incluyas credenciales, API keys ni datos personales en commits.
5. Sigue el estilo TypeScript del proyecto (strict, sin `any`, nombres explícitos).

Para vulnerabilidades de seguridad, abre un issue privado o contacta directamente al mantenedor.

---

## Licencia

[MIT](LICENSE) — Carlos Robleto, 2026.

Este software es libre. Puedes usarlo, modificarlo y distribuirlo bajo los términos de la licencia MIT.
