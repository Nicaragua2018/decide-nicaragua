# ARCHITECTURE.md — Decide Nicaragua

> Documento vivo. Actualizar cuando cambie la arquitectura del sistema.
> Última actualización: 2026-03-21

---

## Visión general

Decide Nicaragua es una plataforma de participación democrática verificable para ciudadanos nicaragüenses. La arquitectura está diseñada para:

1. **Legitimidad**: resultados verificables independientemente.
2. **Seguridad**: protección de datos personales, resistencia a actores adversariales.
3. **Trazabilidad**: auditoría append-only de todos los eventos críticos.
4. **Escalabilidad progresiva**: suficiente para 1000 usuarios; preparada para crecer.

---

## Diagrama de componentes (MVP)

```
┌─────────────────────────────────────────────────────────┐
│                        Internet                         │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS (TLS automático)
              ┌───────▼────────┐
              │    Traefik v3  │  ← Reverse proxy, TLS, rate limiting L7
              └───────┬────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
  ┌───────▼───────┐       ┌───────▼────────┐
  │  Next.js 15   │       │   NestJS 10    │
  │  (apps/web)   │       │   (apps/api)   │
  │  Puerto 3000  │       │   Puerto 4000  │
  └───────────────┘       └───────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
            ┌───────▼──────┐ ┌───▼───┐  ┌──────▼──────┐
            │  PostgreSQL  │ │ Redis │  │  BullMQ     │
            │  Puerto 5432 │ │  6379 │  │  (workers)  │
            └──────────────┘ └───────┘  └─────────────┘
```

---

## Componentes

### Traefik v3 (Reverse Proxy)
- TLS automático via Let's Encrypt (ACME).
- Rate limiting por IP en rutas de autenticación.
- Headers de seguridad: HSTS, X-Frame-Options, CSP base.
- Separación de rutas: `/` → Next.js, `/api` → NestJS.

### Next.js 15 — `apps/web`
- App Router con Server Components por defecto.
- Autenticación via cookies HttpOnly (tokens gestionados por el API).
- No se almacena JWT en localStorage.
- Internacionalización: español (es-NI) como idioma base.

### NestJS 10 — `apps/api`
- Arquitectura modular por dominio.
- Validación estricta de inputs con `class-validator` + `class-transformer`.
- Pipes globales de validación.
- Exception filters centralizados con logging seguro (sin PII en logs).
- Guards de autenticación y autorización por roles (RBAC).

**Módulos del API:**

| Módulo | Responsabilidad |
|---|---|
| `auth` | Login, registro, refresh tokens, logout, MFA (futuro) |
| `users` | Gestión de identidad, roles, estados de cuenta |
| `profiles` | Perfil público/operativo separado de identidad |
| `groups` | Grupos territoriales por origen y residencia |
| `deliberation` | Debates, propuestas, consenso |
| `voting` | Votación Condorcet, resultados verificables |
| `sortition` | Selección aleatoria verificable (asambleas) |
| `audit` | Log append-only de eventos críticos |
| `donations` | Causas, presupuestos, trazabilidad de donaciones |

### PostgreSQL 16
- Base de datos principal, ACID.
- Schema gestionado por Prisma Migrate.
- Separación de tablas PII vs tablas operativas.
- Tabla `audit_events` con restricciones de solo inserción.
- Backups automáticos con retención configurable.

### Redis 7
- Rate limiting distribuido.
- Sesiones de servidor (almacén de refresh tokens activos).
- Caché de resultados de votaciones publicadas.
- Cola de trabajos (BullMQ): emails, notificaciones, jobs de auditoría.

---

## Modelo de datos principal (alto nivel)

```
users                    # Identidad: email, hash password, rol, estado
  └── profiles           # Perfil operativo: nombre público, origen, residencia
        └── group_memberships  # Membresías territoriales

audit_events             # Append-only. Nunca UPDATE ni DELETE.
  - id, timestamp, actor_id, action, resource_type, resource_id, payload_hash, ip

sessions                 # Refresh tokens activos (Redis preferido para TTL)

proposals                # Propuestas de deliberación
  └── votes              # Votos individuales (cifrados en votaciones secretas)
  └── comments           # Debates

sortition_pools          # Pools para selección aleatoria
  └── selections         # Selecciones realizadas con seed verificable

donations                # Donaciones con trazabilidad
  └── donation_events    # Historial de estados
```

---

## Flujo de autenticación

```
1. Usuario envía email + password
2. API valida credenciales
3. API emite:
   - access_token (JWT, 15 min, en cookie HttpOnly Secure SameSite=Strict)
   - refresh_token (opaco, 30 días, en cookie HttpOnly Secure)
4. API registra evento en audit_events
5. Cliente usa access_token automáticamente (cookie)
6. Al expirar: /auth/refresh rota ambos tokens
7. Logout: invalida refresh_token en Redis y borra cookies
```

---

## Separación de identidad

Un principio central para proteger a los usuarios:

```
users (tabla privada, acceso restringido)
  - email (cifrado en reposo en producción)
  - password_hash
  - identity_verified: boolean
  - real_name (cifrado)
  - document_hash (huella de documento, no el documento)

profiles (tabla operativa, acceso controlado)
  - display_name
  - birth_department (origen nicaragüense)
  - current_country
  - is_public: boolean
```

Los módulos de votación y deliberación operan con `profile_id`, nunca con `user_id` directamente.

---

## Decisiones de infraestructura

### Docker Compose (MVP)
- Un `docker-compose.yml` para producción.
- Un `docker-compose.dev.yml` para desarrollo local con hot reload.
- Volúmenes nombrados para persistencia de PostgreSQL y Redis.
- Red interna Docker; solo Traefik expone puertos al exterior.

### Traefik como proxy
Preferido sobre Nginx por:
- Descubrimiento automático de servicios Docker.
- TLS automático sin configuración manual de certificados.
- Dashboard de monitoreo integrado (protegido con auth).

---

## Supuestos arquitectónicos y deuda técnica conocida

| Supuesto | Implicación | Deuda |
|---|---|---|
| VPS único sin HA | Sin failover automático | Migrar a multi-node cuando supere 5000 usuarios |
| Email verificado manualmente al inicio | Riesgo de cuentas falsas | Implementar verificación automática en fase 2 |
| Cifrado en reposo no implementado desde día 1 | PII expuesta si DB comprometida | Implementar pgcrypto o cifrado a nivel aplicación en fase 2 |
| Sin MFA en MVP | Mayor riesgo de cuentas comprometidas | MFA TOTP en fase 2 |
| Logs en stdout/archivos | Sin SIEM centralizado | Configurar log shipping a sistema externo en fase 2 |

---

## Principios de evolución

1. Cada módulo debe poder extraerse a un microservicio sin refactor masivo.
2. El audit log nunca se modifica; solo se agrega.
3. Las votaciones secretas deben poder verificarse sin revelar identidades.
4. Cualquier dato personal debe poder eliminarse o anonimizarse (derecho al olvido).
