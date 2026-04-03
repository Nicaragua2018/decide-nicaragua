# ROADMAP.md — Decide Nicaragua

> Última actualización: 2026-04-02

---

## Visión

Construir la infraestructura digital de participación democrática más confiable para ciudadanos nicaragüenses en el exilio, verificable independientemente y diseñada para resistir presiones políticas adversas.

---

## Estado actual: MVP completo

El repositorio contiene un MVP funcional con Fases 0–7 implementadas y 155 tests pasando en el backend.

---

## Fase 0 — Fundamentos del sistema

**Estado: COMPLETA**

- [x] Monorepo configurado (pnpm + Turborepo)
- [x] `apps/api` — NestJS inicializado con módulos base
- [x] `apps/web` — Next.js 15 inicializado con App Router
- [x] `packages/shared` — tipos base compartidos (`@decide/shared`)
- [x] `packages/tsconfig` — configuraciones TypeScript base
- [x] Docker Compose para desarrollo local (PostgreSQL, Redis)
- [x] Docker Compose para producción con Traefik v3
- [x] Schema de Prisma inicial con tablas base
- [x] Variables de entorno documentadas en `.env.example`
- [x] `.gitignore` completo

---

## Fase 1 — Autenticación y usuarios

**Estado: COMPLETA — 37 tests pasan**

- [x] Módulo `auth`: invite, accept-invite, login, refresh, logout
- [x] JWT en cookies HttpOnly + refresh token en Redis con rotación
- [x] Módulo `users`: CRUD con RBAC, AccountStatus enum (7 estados)
- [x] Módulo `profiles`: perfil operativo separado de identidad
- [x] Módulo `audit`: tabla append-only con trigger PostgreSQL (bloquea UPDATE/DELETE)
- [x] Módulo `email`: EmailService abstraído (Resend)
- [x] Módulo `health`: GET /api/health (200/503)
- [x] GET /api/auth/me — datos frescos de DB
- [x] Rate limiting en endpoints de autenticación
- [x] Tests unitarios: 25/25 (auth.service.spec.ts)

---

## Fase 2 — Grupos territoriales y deliberación

**Estado: COMPLETA — 33 tests pasan**

- [x] Módulo `groups`: getMyGroups, getGroupById, syncMemberships
- [x] Seed de 17 departamentos de Nicaragua como grupos territorial_origin
- [x] `profileId` en JwtPayload para evitar queries adicionales por request
- [x] Módulo `deliberation`: propuestas, comentarios (1 nivel), señales de consenso
- [x] ProposalStatus: draft → open → closed → archived
- [x] SignalType: support, neutral, object
- [x] Membresía requerida para ver y participar
- [x] Tests unitarios: 12 (groups) + 21 (deliberation)

---

## Fase 3 — Votación Condorcet-Schulze

**Estado: COMPLETA — 34 tests pasan**

- [x] Módulo `voting`: Election, ElectionCandidate, Ballot, BallotRanking, ElectionResult
- [x] Algoritmo Schulze puro (`schulze.ts`): buildPairwiseMatrix + Floyd-Warshall + findWinnerIndices
- [x] Resultados almacenan matrices completas (pairwiseMatrix + schulzeMatrix) para auditoría independiente
- [x] Ranking parcial: candidatos omitidos = último lugar
- [x] ElectionStatus: draft → open → tallied/cancelled
- [x] Tests: 13 (schulze.spec.ts) + 21 (voting.service.spec.ts)

---

## Fase 4 — Sortition verificable

**Estado: COMPLETA — 39 tests pasan**

- [x] Módulo `sortition`: SortitionDraw, SortitionMember
- [x] Algoritmo Fisher-Yates parcial con SHA-256 como PRNG determinista (v1)
- [x] Verificabilidad: seed pública almacenada, poolSnapshot guardado, endpoint `/verify` recomputa
- [x] SortitionStatus: pending → completed/cancelled
- [x] Tests: 22 (sortition-algorithm.spec.ts) + 17 (sortition.service.spec.ts)

---

## Fase 5 — Despliegue y auditoría pública

**Estado: COMPLETA — 12 tests pasan**

- [x] Dockerfiles multi-stage para `api` y `web`
- [x] `docker-compose.yml` de producción con Traefik, health checks y red interna
- [x] `infra/traefik/dynamic/security.yml`: HSTS, CSP, X-Content-Type, anti-clickjacking
- [x] `apps/api/entrypoint.sh`: prisma migrate deploy + node dist/main
- [x] `deploy.sh`: validaciones + build + up + health check
- [x] GET /api/audit/events (paginado, filtros: action, resource, from/to)
- [x] GET /api/audit/events/:id (detalle sin PII: actorDisplayName en lugar de actorId)
- [x] Acceso restringido a `verified_citizen` (no observable por todos los roles)
- [x] Tests: 12 (audit.service.spec.ts)

---

## Fase 6 — Frontend Next.js MVP

**Estado: COMPLETA**

- [x] CSS Modules con design tokens (sin Tailwind)
- [x] `middleware.ts`: protección de rutas, comprueba cookie access_token
- [x] `lib/api.ts`: serverFetch() para Server Components (reenvía cookies)
- [x] `lib/actions.ts`: Server Actions para todas las mutaciones
- [x] Auth: login + accept-invite como client components (necesario para Set-Cookie)
- [x] Páginas: dashboard, groups/[id] (tabs), proposals/[id], elections/[id], sortition/[id], audit, audit/[id], me
- [x] Formularios de creación: proposals/new, elections/new, sortition/new

---

## Fase 7 — Panel de administración

**Estado: COMPLETA — 12 tests pasan**

- [x] GET /api/users (filtrable por ?status=) + PATCH /api/users/:id/status
- [x] Ambos endpoints protegidos por VerifiedCitizenGuard
- [x] admin/users/page.tsx: tabla con filtros, badges de estado, fechas
- [x] admin/users/ChangeStatusForm.tsx: dropdown con transiciones permitidas
- [x] admin/invite/page.tsx: formulario de invitación
- [x] NavBar muestra enlace "Admin" solo para verified_citizen
- [x] admin/layout.tsx: verificación server-side del rol (no solo client-side)
- [x] Tests: 12 (users.service.spec.ts)

---

## Próximas iteraciones

### Iteración 8 — Validación en VPS (inmediata)

- [ ] Ejecutar `deploy.sh` en VPS Hostinger limpio
- [ ] Verificar flujo completo: invitación → activación → cambio de estado → votación
- [ ] Confirmar que el trigger append-only bloquea UPDATE/DELETE en audit_events
- [ ] Configurar backup diario de PostgreSQL (pg_dump a storage externo)
- [ ] Configurar UFW + Fail2ban en VPS

### Iteración 9 — Endurecimiento (Fase 2)

- [ ] MFA con TOTP (Google Authenticator)
- [ ] Endpoint `DELETE /api/auth/invite/:token` (revocación de invitaciones)
- [ ] Origin header validation para CSRF protection adicional
- [ ] BullMQ para durabilidad del audit log (actualmente fire-and-forget)
- [ ] Cifrado en reposo de PII (pgcrypto o cifrado a nivel aplicación)
- [ ] Backup cifrado automático a almacenamiento offsite

### Iteración 10 — Verificación independiente

- [ ] Script standalone de verificación de resultados Schulze (sin acceso al servidor)
- [ ] Exportación de resultados en JSON/CSV firmado
- [ ] Verificador de sortition como herramienta CLI pública
- [ ] GitHub Actions: CI con typecheck + test en cada PR

### Iteración 11 — UX y accesibilidad

- [ ] Internacionalización: español (es-NI) explícito como base
- [ ] Drag-and-drop para ranking en votaciones
- [ ] Visualización gráfica de resultados Condorcet
- [ ] Notificaciones in-app básicas

---

## Fuera del alcance (por ahora)

- Procesamiento de pagos en línea (donaciones diferidas)
- Aplicación móvil nativa
- Anonimato fuerte a nivel de red (Tor integration)
- Microservicios (monolito modular hasta necesitar escala)
- IA/ML para moderación de contenido

---

## Métricas de éxito del MVP

| Métrica | Objetivo |
|---------|---------|
| Usuarios registrados y verificados | 100+ para primera votación real |
| Tiempo de respuesta API (p95) | < 500ms |
| Uptime | > 99% mensual |
| Votaciones completadas sin incidentes | 1 votación piloto exitosa |
| Resultados verificados externamente | 100% de votaciones |
| Incidentes de seguridad Nivel 1 | 0 |
