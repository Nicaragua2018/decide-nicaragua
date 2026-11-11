# ROADMAP.md — Nicaragua Decide

> Última actualización: 2026-11-06

---

## Visión

Construir la infraestructura digital de participación democrática más confiable para ciudadanos nicaragüenses en el exilio, verificable independientemente y diseñada para resistir presiones políticas adversas.

---

## Estado actual: MVP completo

El repositorio contiene un MVP funcional con Fases 0–7 implementadas y 155 tests pasando en el backend.

---

## Primeros 200 — Plan 1 (base): COMPLETO

Base del diseño «Primeros 200» entregada en las tareas 1 a 9:

- [x] Constantes de comunidades y tipos de la mesa
- [x] Base de datos: `board_seats`, `verification_references`, `board_actions`, `board_approvals`, `profiles.currentRegion`
- [x] Pendientes pueden iniciar sesión; límite de 5 invitaciones; origen protegido; `profileId` al renovar sesión
- [x] Comunidades de acogida por país o estado; activación con 7 miembros
- [x] Mesa directiva con acciones que requieren 2 de 3
- [x] Verificación por dos referencias, atómica, con fundación
- [x] Panel de usuarios solo para el administrador
- [x] Semilla del administrador fundador
- [x] Web: registro con comunidad de acogida, «Tu verificación», «Verificaciones» y «Mesa»

---

## Primeros 200 — Plan 3B-1 (asistente: base y moderación): COMPLETO

El asistente de IA cuida la conversación sin decidir qué opiniones valen (ADR-025):

- [x] Puerta única hacia Claude con interruptor apagado por defecto, tope de gasto de 20 USD (80 % y 100 %) y limpieza del texto
- [x] Guía de valores e instrucciones fijas; el texto de los miembros va aparte, como material
- [x] Moderación previa en tres niveles, con la causa nueva `odio`; la crítica política nunca se frena
- [x] Revisión de la mesa para los textos de nivel 2, con 2 firmas y vencimiento a los 7 días
- [x] Revisión posterior para lo que se publicó sin revisar
- [x] Web: aviso amable, bloqueo del nivel 2 y textos en revisión
- [x] Examen del asistente (pendiente de correrlo en el servidor con la clave)

**Sigue:** 3B-2 y 3B-3 (hechos; ver más abajo).

---

## Primeros 200 — Plan 3B-2 (asistente: acompañar): COMPLETO

El asistente acompaña a cada persona sin decidir por ella (ADR-026):

- [x] Panel de preguntas con el modelo rápido, límite diario por perfil y enlaces que pone el servidor
- [x] Privacidad e imparcialidad: no dice quién votó ni qué opción elegir
- [x] «Desde tu última visita»: resumen breve de las novedades de tus comunidades
- [x] Tarjeta para hacer crecer la comunidad, que se cierra por 7 días
- [x] Búsqueda y plazos solo de lo que la persona puede leer
- [x] Con el asistente apagado no hay tarjetas ni panel
- [x] Examen del panel (23 casos; pendiente de correrlo en el servidor con la clave)

**Sigue:** 3B-3 Acuerdos (hecho; ver más abajo).

---

## Primeros 200 — Plan 3C-1 (elegir): COMPLETO

La plataforma elige a quienes la representan, sin intervención humana en la convocatoria (ADR-028):

- [x] Cargos con historial (`Cargo`) sincronizado con los asientos de la mesa; «en funciones» para que nunca falte quien ocupe el puesto
- [x] Convocatoria automática: primera jornada, activación de una comunidad y una sola convocatoria por cargo (renovación 21 días antes, vacantes a los 30 días)
- [x] Fichas de candidatura iguales para todas, con revisión previa y ocultar con 2 de 3 de la mesa
- [x] Papeleta secreta y cambiable hasta el cierre; conteo con Schulze entre las aprobadas y desempate con semilla pública
- [x] Un cargo a la vez e incompatibilidades (fundadores incluidos)
- [x] Coordinadores de comunidad con moderación en su comunidad (no en bifurcaciones)
- [x] Páginas «Elecciones» y «Quiénes nos representan»; la guía del asistente las explica sin recomendar candidaturas

**Sigue:** 3C-2 (hecho; ver abajo).

---

## Primeros 200 — Plan 3C-2 (cuidar los cargos): COMPLETO

Los cargos se pueden dejar, pedir que se repitan o perder, sin que nadie quede sin mesa (ADR-029):

- [x] Revocación: cualquier persona verificada pide repetir un cargo y los apoyos son secretos; la fracción sale de la regla `revocacion.fraccion`
- [x] Renuncia a un cargo elegido (los fundadores no renuncian) y elección anticipada, salvo con 45 días o menos de mandato
- [x] La suspensión quita también los asientos fundadores y abre anticipadas
- [x] Mesa incompleta: 2 observadores provisionales firman solo las dos revisiones de 2 firmas
- [x] Reactivación de cuentas: pase de 30 minutos, pedido a la mesa, 2 de 3 para reactivar o rechazar, estado previo restaurado
- [x] Página «Observar»: auditoría, verificaciones, matrices y gastos, con observaciones públicas revisadas; sin correos en los metadatos

**Sigue:** moderación posterior de fichas.

---

## Primeros 200 — Plan 3B-3 (asistente: acuerdos): COMPLETO

El asistente ayuda a encontrar acuerdos sin decidir nada (ADR-027):

- [x] Sugerencias marcadas «Sugerencia del asistente», en una tabla única, con acceso comprobado al leer
- [x] Agrupar inquietudes parecidas, aviso de umbral y presentación neutral del tema (sin reemplazar el texto del autor)
- [x] Mapa de opiniones: con el debate abierto solo lo ve quien votó 3 frases o más; al terminar, cualquiera
- [x] Borradores de soluciones desde las frases puente, que la persona puede adoptar y editar
- [x] Comentario para comisiones y las doce preguntas iniciales (sin autor, con marca)
- [x] Ronda horaria con tope de 20 pedidos y prioridad nocturna
- [x] Examen de acuerdos (17 casos; pendiente de correrlo en el servidor con la clave)

**Sigue:** 3C-1 (hecho; ver arriba).

---

## Primeros 200 — Plan 3A-5 (cambio de reglas por votación): COMPLETO

La comunidad ajusta sus propias reglas (ADR-024):

- [x] Proponer un cambio desde «Reglas», con límites de la colmena y un solo cambio abierto por regla
- [x] Debate y votación automáticos con participación mínima del 30 %
- [x] Las reglas locales se aplican solas; las de la colmena, con 2 de 3 de la mesa
- [x] Historial de cambios por regla, sin nombres

---

## Primeros 200 — Plan 3A-4b (comisiones e iniciativas de un grupo): COMPLETO

Quién lleva a cabo lo aprobado y cómo una minoría impulsa su solución (ADR-023):

- [x] Comisiones que nacen solas, con voluntarios, sorteo verificable o votación por preferencias
- [x] Informes, aviso de atraso, renovación y informe final público
- [x] Iniciativas de un grupo solo para quienes apoyaron la solución, sin revelar nunca quiénes son
- [x] Pausa con apelación a la mesa y vuelta a la colmena
- [x] Web: comisiones, iniciativas y apelaciones de pausa en «Mesa»

---

## Primeros 200 — Plan 3A-4a (grupos de trabajo y subgrupos): COMPLETO

Grupos dentro de cada comunidad y del nivel general (ADR-022):

- [x] Grupo de trabajo como grupo hijo; el ámbito lee y solo sus miembros participan
- [x] Subgrupos por tema que nacen con 5 personas en 14 días y se archivan solos
- [x] «Llevar a la comunidad»: lo aprobado en un subgrupo pasa como inquietud que pide respuesta
- [x] Nivel general «Exilio y diáspora» (antes «Toda la comunidad»)
- [x] Web: «Grupos de trabajo», página de cada grupo y bloque en «Decisiones»

---

## Primeros 200 — Plan 3A-3 (soluciones y papeleta): COMPLETO

Votación de las soluciones de cada debate (ADR-020):

- [x] Soluciones propuestas por los miembros, con juntar repetidas y moderación con apelación
- [x] «Llevar a decisión»: plazo de debate y fases automáticas (modo, objeción de un tercio, votación, conteo)
- [x] Papeleta: Apruebo / No apruebo / Me abstengo, u ordenar solo las aceptadas, «Rechazo todas» y «Me abstengo»
- [x] Resultado con quórum, aprobación por más de la mitad y Schulze entre las aprobadas, publicado con sus matrices
- [x] Web: sección «Soluciones y decisión», papeleta y resultado en cada tema
- [x] Moderación con lista cerrada de causas y segunda firma de la mesa para ocultar soluciones y propuestas (ADR-021)
- [x] Página «Decisiones»: aprobadas, rechazadas y en curso por territorio de origen, comunidad de acogida y exilio y diáspora

---

## Primeros 200 — Plan 3A-2 (frases): COMPLETO

Debate con frases al estilo Pol.is (ADR-019):

- [x] Frases cortas con «de acuerdo / en desacuerdo / paso» y resultado visible solo después de votar
- [x] Cálculo reproducible de grupos de opinión, frases puente y frases que dividen, sin IA
- [x] Privacidad: mínimo de 7, grupos de 3 o más, cifras redondeadas, nada sin votar
- [x] Moderación de frases con apelación
- [x] Web: sección «Frases» y «Mapa de opiniones» en cada tema

---

## Primeros 200 — Plan 3A-1 (reglas e inquietudes): COMPLETO

Primera entrega del ciclo de la comunidad (ADR-018):

- [x] Reglas en dos niveles (colmena y locales) con valores por defecto, límites y página «Reglas» (también pública para las de la colmena)
- [x] Inquietudes con apoyo anónimo, umbral y plazo de respuesta
- [x] Agenda: abrir debates (juntando inquietudes), responder en público y apertura automática al vencer el plazo
- [x] Moderación de inquietudes con apelación
- [x] Web: «Inquietudes», detalle, «Agenda», «Reglas» y origen del debate en cada tema

---

## Primeros 200 — Plan 2 (foros): COMPLETO

Foros, propuestas formales, consensos públicos y moderación (ADR-017):

- [x] Base de datos: `forums`, `moderation_actions`; temas con tipo, plazo, votación, conclusión, objeciones y ocultos
- [x] Comunidad general «Toda la comunidad» para toda persona verificada
- [x] Temas dentro de foros; contenido oculto sin su texto; cierre solo con consenso
- [x] Propuesta formal (7 días) y votación «A favor / En contra / Abstención» (7 días)
- [x] `GET /api/public/consensos` sin sesión y sin nombres
- [x] Moderación con motivo, apelación de la persona autora y resolución de la mesa
- [x] Web: «Foros», página de cada foro, acciones del tema y apelaciones en «Mesa»

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
