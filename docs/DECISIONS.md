# DECISIONS.md — Decide Nicaragua

> Registro de decisiones técnicas (ADR: Architecture Decision Records).
> Formato: ID, Fecha, Estado, Contexto, Decisión, Consecuencias.

---

## ADR-001: Monorepo con pnpm + Turborepo

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
El sistema tiene dos aplicaciones principales (frontend Next.js, backend NestJS) que comparten tipos, DTOs y constantes. Un equipo pequeño necesita coherencia sin duplicación.

### Decisión
Usar monorepo con `pnpm workspaces` + `Turborepo` para gestionar las dependencias y el pipeline de builds.

### Justificación
- `pnpm` ofrece instalación eficiente con hard links y workspace nativo.
- `Turborepo` permite caché de builds y ejecución paralela con dependencias correctas.
- El paquete `@decide/shared` centraliza tipos TypeScript usados por `web` y `api`.
- Coherencia de versiones de TypeScript, ESLint y configuraciones base.

### Alternativas rechazadas
- **Repos separados**: duplicación de tipos, riesgo de drift entre contratos.
- **Nx**: más potente pero más complejo para un equipo pequeño.

### Consecuencias
- Todos los comandos se corren desde la raíz con `turbo run <task>`.
- Cambios en `@decide/shared` requieren rebuild de los paquetes dependientes (Turborepo lo gestiona).

---

## ADR-002: NestJS como framework de backend

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
Se necesita un framework de backend TypeScript que sea modular, mantenible y con soporte robusto para autenticación, validación y testing.

### Decisión
Usar NestJS 10 con arquitectura de módulos por dominio.

### Justificación
- Inyección de dependencias integrada: facilita testing con mocks.
- Ecosystem maduro: Passport, Prisma, Swagger y una cola de trabajo planificada con BullMQ.
- Decoradores de validación con `class-validator`: validación declarativa sin boilerplate.
- Guards y Interceptors: implementación limpia de RBAC y auditoría transversal.

### Alternativas rechazadas
- **Fastify puro / Hono**: menos estructura; requeriría más boilerplate para patrones de enterprise.
- **Express**: sin estructura de módulos; difícil de mantener a medida que el sistema crece.
- **tRPC**: acoplamiento fuerte frontend-backend; dificulta auditoría de contratos de API.

---

## ADR-003: Prisma como ORM

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
Se necesita un ORM TypeScript con migraciones explícitas, type-safety fuerte y compatibilidad con PostgreSQL.

### Decisión
Usar Prisma ORM con PostgreSQL.

### Justificación
- Schema como fuente de verdad única: el tipo `User` en TypeScript se deriva del schema, no al revés.
- Migraciones explícitas y auditables en control de versiones.
- Prisma Migrate genera SQL legible que puede auditarse manualmente.
- Soporte maduro para transacciones, upsert, y queries complejas.

### Alternativas rechazadas
- **Drizzle ORM**: más ligero y type-safe puro, pero menos maduro para equipos pequeños con poco tiempo.
- **TypeORM**: decoradores en entidades causan acoplamiento; patrones activos-record dificultan testing.
- **SQL crudo (pg)**: máximo control pero máximo boilerplate; riesgo de SQLi si no se disciplina.

### Consecuencias
- El schema de Prisma (`schema.prisma`) es el documento de referencia para la base de datos.
- Todas las migraciones deben revisarse antes de aplicarse en producción.

---

## ADR-004: JWT en cookies HttpOnly en lugar de localStorage

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
Los tokens de autenticación deben almacenarse de forma segura en el cliente. La plataforma incluye datos políticos sensibles.

### Decisión
Emitir tokens (access + refresh) como cookies `HttpOnly`, `Secure`, `SameSite=Strict`.

### Justificación
- Cookies `HttpOnly` son inaccesibles desde JavaScript: mitigan XSS completamente para robo de tokens.
- `SameSite=Strict` previene CSRF en la mayoría de escenarios modernos.
- Compatible con Next.js App Router y Server Actions.
- Permite invalidación server-side del refresh token (almacenado en Redis).

### Alternativas rechazadas
- **localStorage**: vulnerable a XSS; inaceptable para esta plataforma.
- **sessionStorage**: misma vulnerabilidad que localStorage.
- **Tokens en headers (Bearer)**: requiere JS para incluirlos; más complejo con SSR.

### Consecuencias
- El backend debe configurar CORS correctamente para credenciales.
- En desarrollo local, el dominio de cookies debe configurarse explícitamente.
- Los tokens no son accesibles desde el cliente (comportamiento deseado).

---

## ADR-005: Traefik como reverse proxy

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
Se necesita un reverse proxy que gestione TLS, routing y headers de seguridad con mínima configuración manual.

### Decisión
Usar Traefik v3 como reverse proxy en Docker Compose.

### Justificación
- Descubrimiento automático de servicios Docker via labels: sin archivos de configuración por servicio.
- TLS automático con Let's Encrypt (ACME) sin renovación manual.
- Middleware de rate limiting, headers, y autenticación disponibles.
- Dashboard de monitoreo integrado.

### Alternativas rechazadas
- **Nginx**: configuración manual de TLS, sin descubrimiento dinámico; más apropiado para setups estáticos.
- **Caddy**: más simple, pero menos flexible para el futuro del sistema.

### Consecuencias
- La configuración de routing está en labels de `docker-compose.yml`.
- El acme.json de Let's Encrypt debe persistirse en un volumen.
- El dashboard de Traefik debe protegerse con autenticación básica o desactivarse.

---

## ADR-006: Audit log append-only en PostgreSQL

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
La plataforma requiere trazabilidad completa de eventos críticos (logins, votos, cambios de roles, etc.) verificable independientemente.

### Decisión
Implementar tabla `audit_events` en PostgreSQL con restricciones de solo inserción, e implementar un trigger que previene UPDATE y DELETE.

### Justificación
- Append-only garantizable a nivel de base de datos, no solo a nivel de aplicación.
- PostgreSQL permite Row Level Security y triggers para enforcing a nivel DB.
- Los hashes de payloads permiten verificación de integridad sin exponer datos.
- Separado del flujo de negocio: el módulo de auditoría es un interceptor transversal.

### Estructura del evento:
```
audit_events {
  id          UUID (PK)
  created_at  TIMESTAMP WITH TIME ZONE
  actor_id    UUID (FK a users, nullable para eventos de sistema)
  action      VARCHAR (ej: "user.login", "vote.cast", "role.changed")
  resource    VARCHAR (ej: "proposal:uuid")
  ip_hash     VARCHAR (hash de IP, no IP directa)
  payload_hash VARCHAR (SHA-256 del payload completo)
  metadata    JSONB (datos no sensibles del contexto)
}
```

### Consecuencias
- Ningún código de la aplicación puede modificar o eliminar audit_events.
- Los eventos se registran en la base de datos sin bloquear el request; se prevé una futura cola de trabajo con BullMQ para mayor durabilidad.
- Los hashes de IPs protegen la privacidad mientras mantienen trazabilidad.

---

## ADR-007: Separación de identidad y perfil operativo

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
Los usuarios son ciudadanos en el exilio. En el futuro, el modelo de amenazas puede incluir actores estatales que intenten correlacionar identidad real con actividad política.

### Decisión
Separar la tabla `users` (identidad PII) de la tabla `profiles` (identidad operativa pública). Los módulos de negocio operan con `profile_id`.

### Justificación
- Permite anonimización parcial sin afectar la actividad registrada.
- Facilita el derecho al olvido: se puede borrar/cifrar PII sin perder auditoría de acciones.
- Preparación para anonimato fuerte en fase futura sin refactor masivo.

### Consecuencias
- Los joins entre `users` y `profiles` deben ser explícitos y limitados a módulos autorizados.
- El módulo `auth` accede a `users`; los demás módulos acceden a `profiles`.
- Los logs nunca deben incluir campos de `users` directamente.

---

## ADR-008: Redis para gestión de sesiones y rate limiting

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
Se necesita invalidación de tokens server-side y rate limiting distribuido. PostgreSQL puede cumplir este rol, pero con mayor latencia y carga.

### Decisión
Usar Redis 7 como almacén de sesiones (refresh tokens activos) y rate limiting.

### Justificación
- TTL nativo: los refresh tokens expiran automáticamente sin jobs de limpieza.
- Operaciones O(1): `GET`, `SET`, `DEL` de tokens son instantáneas.
- Rate limiting con sliding window requiere atomicidad que Redis provee con Lua scripts.
- BullMQ (colas de trabajo) también usa Redis, consolidando la dependencia.

### Consecuencias
- Redis es un punto de fallo único en el MVP (sin Sentinel/Cluster).
- Debe incluirse en el backup y monitoreo.
- La pérdida de Redis invalida todas las sesiones activas (aceptable; los usuarios deben re-autenticarse).

---

---

## ADR-009: Onboarding por invitación de admin y AccountStatus como enum único

**Fecha:** 2026-03-21
**Estado:** Aceptado

### Contexto
El MVP no tiene registro público. Los usuarios son invitados por un administrador. Se necesita modelar el ciclo de vida de la cuenta y el nivel de acceso.

### Decisión
Usar un solo enum `AccountStatus` con 7 valores que combinan ciclo de vida y nivel de acceso:
`invited → pending_verification → verified_citizen | observer | external_collaborator | rejected | suspended`

Flujo: admin crea invitación → email con token → usuario completa registro → estado `pending_verification` → admin o proceso asistido cambia a estado final.

### Justificación
- Para MVP de ~1000 usuarios, la separación en dos enums (status + role) añade complejidad sin beneficio inmediato.
- El flujo de onboarding es lineal y bien definido.
- Si se necesita separar en el futuro, es una migración de datos manejable.

### Trade-off documentado
`observer` y `external_collaborator` son tanto estados como roles de acceso. Si en el futuro se necesita que un `verified_citizen` adopte rol de `observer` temporalmente, se necesitará separar en tabla de roles. Esta es deuda técnica aceptada.

### Consecuencias
- El Prisma schema define `AccountStatus` como enum.
- Los permisos funcionales se derivan del status: `CAN_VOTE_STATUSES`, `CAN_PARTICIPATE_STATUSES`, etc. (definidos en `@decide/shared`).
- No existe endpoint de registro público; solo `/auth/accept-invite/:token`.

---

---

## ADR-010: Algoritmo Condorcet — Schulze

**Fecha:** 2026-03-22
**Estado:** Aceptado

### Decisión
Implementar el método **Schulze** (también llamado Beatpath o Schwartz Sequential Dropping).

### Justificación
- Cumple el criterio de Condorcet, Smith y Schwartz.
- Siempre produce un ganador único o un conjunto de ganadores empatados.
- Algoritmo publicado, revisado por pares y ampliamente implementado.
- Implementable con Floyd-Warshall (O(n³)) — suficiente para hasta cientos de candidatos.
- Ranked Pairs y minimax cumplen menos criterios teóricos o producen empates con más frecuencia.

### Implementación
`apps/api/src/voting/schulze.ts` — algoritmo puro (sin efectos secundarios), 13 tests en `schulze.spec.ts`.
Los resultados almacenan `pairwiseMatrix` y `schulzeMatrix` completos para verificación independiente.

---

## ADR-011: Generación de seed para sortition — Fisher-Yates + SHA-256

**Fecha:** 2026-03-22
**Estado:** Aceptado

### Decisión
Usar **Fisher-Yates parcial** con **SHA-256 como PRNG determinista** (v1).

Proceso:
1. Al crear el sorteo, se genera un seed (UUID v4 + timestamp) y se almacena públicamente.
2. El poolSnapshot (lista de elegibles en ese momento) se guarda en la BD.
3. La selección se reproduce determinísticamente con `SHA-256(seed + index)` como función de mezcla.
4. El endpoint `/verify` permite a cualquier usuario recomputar el resultado.

### Justificación
- Verificable sin acceso al servidor: solo se necesita seed + pool.
- Sin dependencia de fuentes externas (blockchain) que podrían no estar disponibles.
- SHA-256 es estándar, auditado y disponible en cualquier lenguaje para verificación independiente.
- El commit-reveal completo (ADR-011v2) se implementará en Iteración 9 si el modelo de amenazas lo requiere.

### Limitación documentada
El seed lo genera el servidor. Un servidor comprometido podría elegir un seed favorable. Mitigación futura: protocolo commit-reveal donde los participantes contribuyen entropía antes del sorteo.

---

## ADR-012: Cifrado en reposo de PII — diferido a Fase 2

**Fecha:** 2026-03-22
**Estado:** Diferido (aceptado diferimiento)

### Decisión
No implementar cifrado en reposo de PII en el MVP. Diferido a Iteración 9.

### Justificación
- El MVP opera con ~1000 usuarios en círculo cerrado.
- La complejidad operativa de gestionar claves de cifrado (pgcrypto o capa de aplicación) es significativa.
- La mitigación actual (acceso restringido al servidor, sin exposición pública de DB) es suficiente para MVP.
- La tabla `users` tiene acceso restringido: solo el módulo `auth` la consulta directamente.

### Plan Fase 2
Implementar cifrado de campos `email` y `displayName` con pgcrypto o cifrado simétrico a nivel aplicación antes de apertura pública con datos sensibles reales.

---

## ADR-013: Proveedor de email — Resend

**Fecha:** 2026-03-22
**Estado:** Aceptado

### Decisión
Usar **Resend** como proveedor de email transaccional.

### Justificación
- API REST simple, SDK TypeScript oficial.
- Reputación de entregabilidad alta sin configuración de SPF/DKIM compleja.
- Plan gratuito suficiente para MVP (~1000 usuarios, pocos emails por mes).
- `EmailService` está abstraído: cambiar de proveedor requiere modificar solo `email.service.ts`.

### Consecuencias
- `RESEND_API_KEY` requerida en variables de entorno.
- Si Resend falla, los emails de invitación fallan silenciosamente (Fase 2: reintentos con BullMQ).

---

## ADR-016: Servidor MCP de OpenArt para generación de imágenes

**Fecha:** 2026-08-05
**Estado:** Aceptado

### Contexto
El proyecto necesita generar material visual (ilustraciones para la web pública, prototipos como Renacer City, material de difusión) sin depender de diseño manual en cada iteración. Claude Code soporta servidores MCP (Model Context Protocol) configurados a nivel de proyecto.

### Decisión
Registrar el servidor MCP de OpenArt (`https://mcp.openart.ai/mcp`) en `.mcp.json` en la raíz del repositorio, con transporte HTTP.

### Justificación
- `.mcp.json` es el mecanismo estándar de Claude Code para compartir servidores MCP entre todo el equipo vía git.
- La autenticación se realiza por OAuth gestionado por Claude Code en cada máquina: **no se almacena ningún secreto en el repositorio**, consistente con la política de secretos del proyecto.
- El servidor solo se usa como herramienta de desarrollo; no forma parte del runtime de la plataforma ni procesa datos de usuarios.

### Consecuencias
- Cada colaborador debe aprobar el servidor la primera vez que abra el proyecto en Claude Code (prompt de confianza de `.mcp.json`) y autenticarse con su propia cuenta de OpenArt.
- Los assets generados que se incorporen al repositorio deben revisarse igual que cualquier otro contenido antes de commitear.

---

## ADR-017: Estudio de video con clones digitales para comunicación política

**Fecha:** 2026-08-05
**Estado:** Propuesto (pendiente de validación con piloto)

### Contexto
Renacer Democrático necesita proyectar masivamente la imagen y las propuestas de sus voceros mediante video, con producción frecuente (varias piezas por semana) y presencia constante en las plataformas que consume la diáspora nicaragüense (WhatsApp, TikTok, YouTube, Facebook). Grabar cada video de forma tradicional no escala con un equipo pequeño.

La tecnología de clones digitales (voz clonada + avatar visual del vocero real, con su consentimiento) permite generar videos a partir de un guion en minutos. Sin embargo, introduce riesgos serios en el contexto de un movimiento opositor en el exilio:

- Los assets biométricos (modelo de voz, avatar) permiten fabricar declaraciones falsas de dirigentes si son comprometidos.
- Normalizar avatares de IA facilita que terceros hostiles hagan pasar deepfakes por comunicados oficiales.
- El uso no transparente de IA erosionaría la legitimidad democrática que es principio fundacional del proyecto.

### Decisión
Construir un módulo de estudio de video dentro del monorepo con las siguientes decisiones vinculantes:

1. **Proveedores iniciales (Ruta A):** HeyGen o Tavus para avatar visual y ElevenLabs para voz, orquestados desde un backend propio (NestJS + BullMQ). El proveedor queda abstraído tras una interfaz propia (patrón ya usado con `EmailService`/Resend) para permitir migración futura a modelos autoalojados (Ruta B: LivePortrait/EchoMimic + XTTS/F5-TTS) si el costo o el riesgo lo justifican.
2. **Consentimiento explícito y revocable:** ningún clon se crea sin consentimiento documentado del vocero. La revocación desactiva el clon y elimina los assets ante el proveedor.
3. **Assets biométricos como secretos:** acceso restringido por rol, nunca en el repositorio, y cada generación de video queda registrada en la auditoría append-only (quién, cuándo, qué guion, qué avatar).
4. **Flujo de aprobación editorial:** redactor → revisor → aprobación final del vocero cuyo avatar se usa. Ningún video se publica sin la aprobación de la persona clonada.
5. **Transparencia obligatoria:** todo video generado lleva divulgación visible de que fue producido con IA y metadatos de procedencia (C2PA/watermark cuando el tooling lo permita).
6. **Registro público verificable:** cada video oficial publicado se registra con su hash SHA-256 en una página pública del sitio. Esto permite a cualquier persona verificar si un video que circula es auténtico, y da al movimiento una respuesta inmediata frente a deepfakes hostiles ("no está en el registro, es falso").
7. **Piloto antes de escalar:** se valida con un solo vocero (calidad del español, acento, recepción de la audiencia) antes de onboardear al resto del equipo.

### Justificación
- La Ruta A produce calidad alta con semanas (no meses) de desarrollo y sin operar GPUs propias; el MVP es esencialmente orquestación de APIs.
- El registro público de hashes convierte la transparencia en defensa activa: protege contra acusaciones de fabricación y contra suplantaciones de terceros, alineado con el principio de verificabilidad independiente del proyecto.
- La abstracción del proveedor evita lock-in y deja abierta la vía de soberanía de datos (Ruta B) sin rediseño.

### Alternativas rechazadas
- **Ruta B desde el inicio (autoalojado):** calidad inferior, requiere GPU dedicada (~24 GB VRAM) y carga operativa que el equipo no puede asumir antes de validar el formato.
- **Grabación tradicional:** no escala a la frecuencia de publicación necesaria con un equipo pequeño.
- **Uso de avatares sin divulgación de IA:** rechazado por incompatible con la legitimidad democrática del proyecto, además del riesgo reputacional si se descubre.

### Consecuencias
- Se suben datos biométricos de opositores a proveedores comerciales en EE.UU. (HeyGen/Tavus/ElevenLabs). Cada vocero debe aceptar este riesgo explícitamente en su consentimiento; quien no lo acepte no participa hasta que exista la Ruta B.
- Costo recurrente por suscripción/minuto renderizado (decenas a pocos cientos de USD/mes según volumen); revisar umbral de migración a Ruta B si el volumen crece.
- Nuevo módulo en el monorepo (panel editorial Next.js + orquestación NestJS/BullMQ), con roles nuevos en el RBAC (redactor, revisor, vocero).
- `docs/SECURITY.md` debe actualizarse con el modelo de amenazas de los clones cuando el módulo entre en desarrollo.

---

## Decisiones pendientes

| ID | Pregunta | Prioridad |
|---|---|---|
| ADR-014 | ¿Implementar commit-reveal para sortition (participantes aportan entropía)? | Media — Iteración 9 |
| ADR-015 | ¿Dominio de producción definitivo? Requerido para configurar TLS, CORS y COOKIE_DOMAIN | Alta — antes del primer deploy |
