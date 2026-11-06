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

## ADR-016: Verificación por dos referencias y mesa directiva (2026-11-01)

**Fecha:** 2026-11-01
**Estado:** Aceptado

### Contexto
El diseño «Primeros 200» (docs/superpowers/specs/2026-11-01-primeros-200-design.md) exige que cada cuenta sea una persona única y nicaragüense, y que muchas personas exiliadas no tienen documentos.

### Decisión
- Una persona queda verificada con dos referencias: quien la invitó y el administrador u otro miembro de su mismo territorio de origen o comunidad de acogida. Tabla `verification_references`.
- Fundación: mientras haya menos de 4 cuentas verificadas, la referencia del administrador basta (`user.verified` con `via: fundacion` en la auditoría).
- Las membresías de comunidades se crean al verificarse, no al registrarse: los endpoints de participación dependen de la membresía.
- La mesa directiva (administrador, coordinador general, secretario) reemplaza al «cualquier ciudadano verificado administra» del MVP. Suspender cuentas y cambiar el territorio de origen requieren 2 de 3 (`board_actions`).
- Pasada la fundación no se reabre: el conteo incluye cuentas suspendidas.
- Los cargos fundadores solo llenan cargos vacantes y nunca el de administrador; reemplazar a alguien requiere una decisión de la mesa (plan 3).

### Consecuencias
- El panel de usuarios ya no verifica ni suspende directamente. Las elecciones que llenan los cargos llegan en el plan 3 (`board_seats.source = eleccion`).
- Suspender a alguien también le quita sus membresías de comunidades, en la misma transacción. Un cargo de la mesa cuyo titular está suspendido no puede actuar (el asiento sigue registrado), y un miembro suspendido no puede dar referencias aunque su sesión diga lo contrario. La migración `limpiar_membresias_no_verificadas` quita las membresías que quedaron de cuentas no verificadas.
- El panel de usuarios solo rechaza cuentas invitadas o pendientes de verificación (y lo audita como `user.status_changed`). Reactivar a alguien suspendido es una acción futura de la mesa (2 de 3); los observadores se eligen.
- Cada referencia queda auditada con su vía (`invitador`, `administrador`, `origen` o `acogida`) y la comunidad de acogida de quien refiere en ese momento.
- La frescura del estado guardado en el token de acceso (un cambio de estado tarda hasta que el token vence) se revisa en el plan 5.
- La regla contra el abuso de las referencias por comunidad de acogida (antigüedad mínima en esa comunidad) se pospone al plan 3.

---

## ADR-017: Foros sobre la deliberación existente (2026-11-02)
**Fecha:** 2026-11-02
**Estado:** Aceptado

### Contexto
El diseño «Primeros 200» (spec §7) pide foros por comunidad y uno general, propuestas formales con votación y consensos visibles para cualquier visitante.

### Decisión
- Los foros (`forums`) son contenedores de los temas de deliberación que ya existían (`proposals`). Cada grupo tiene un foro por defecto, creado al vuelo y único por grupo (índice único parcial `forums_groupId_default_key`).
- Comunidad general: grupo `custom` con slug `general` («Toda la comunidad»). Toda persona verificada entra al verificarse.
- Los foros de julio de 2026 (marcadores de pol.is) no se reutilizan.
- Crear foros y moderar es de la mesa directiva, incluido el administrador del sitio (decisión de Carlos), hasta que el plan 3 agregue a los coordinadores en `ForumsService.canModerate`.
- Un tema se convierte en propuesta formal: 7 días de deliberación y luego una votación de 7 días con «A favor», «En contra» y «Abstención». La votación se abre una sola vez (actualización condicional dentro de la transacción).
- Cerrar exige una conclusión; las objeciones de la minoría son opcionales y sin nombres. Un tema cerrado ya no cambia de estado.
- `GET /api/public/consensos` publica, sin sesión, los temas cerrados con conclusión y no ocultos, sin nombres de personas.
- Moderación: ocultar exige motivo; la persona autora apela una vez; la mesa restaura o mantiene. El contenido oculto nunca se devuelve, salvo a la mesa en la cola de apelaciones.

### Consecuencias
- `PATCH /proposals/:id/status` ya no cierra temas; solo publica borradores o archiva temas abiertos.
- La portada pública con los consensos llega en el plan 4; los plazos pasan a reglas votables en el plan 3.
- Quien es autor pero ya no es miembro del grupo (por ejemplo, suspendido) no puede formalizar, abrir votaciones, cerrar ni apelar.

---

## ADR-018: Ciclo de la comunidad: inquietudes, agenda y reglas en dos niveles (2026-11-04)
**Fecha:** 2026-11-04
**Estado:** Aceptado

### Contexto
El diseño del plan 3A (`docs/superpowers/specs/2026-11-04-plan-3a-ciclo-comunitario-design.md`) pone a los cargos al servicio de la conversación de la comunidad. Lo que la gente plantea debe llegar a debate o recibir una respuesta pública.

### Decisión
- Cualquier miembro plantea una **inquietud** en una de sus comunidades y los demás la apoyan. Se muestra cuántos apoyan, nunca quiénes.
- **Garantía de respuesta:** al llegar al umbral (el mayor entre 3 personas y el 10 % de los miembros, reglas locales), quien organiza la agenda tiene 7 días (regla local, máximo 30) para abrir un debate o responder en público. Si no responde, un proceso horario abre el debate solo, con la etiqueta «Abierto por la comunidad».
- Quien organiza puede juntar varias inquietudes de la misma comunidad en un solo debate.
- Organizar la agenda es `ForumsService.canOrganize`, que hoy equivale a la mesa. El plan 3C suma a los coordinadores de cada comunidad.
- **Reglas en dos niveles:** reglas de la colmena y reglas locales de cada comunidad, con valores por defecto y límites fijados por la colmena. Se guardan en `rule_values` solo cuando cambian, y la página «Reglas» las muestra.
- Los apoyos se cuentan solo si la persona sigue siendo miembro, y **no se registran en la auditoría**: la hora exacta podría delatar quién apoyó.
- Las inquietudes se moderan igual que los temas y las respuestas, con motivo, apelación y resolución de la mesa.

### Consecuencias
- Cambiar una regla por votación llega en el plan 3A-3, junto con la votación de soluciones, las bifurcaciones y las comisiones. El debate con frases al estilo Pol.is llega en 3A-2 y el agente asistente en 3B.
- Las reglas de la colmena se muestran pero todavía no las lee el código existente. El plan 3C las conecta.
- No hay rastro de auditoría de los apoyos, a cambio de proteger a quien apoya.

---

## ADR-019: Debate con frases al estilo Pol.is (2026-11-05)
**Fecha:** 2026-11-05
**Estado:** Aceptado

### Contexto
El spec 3A (§4) pide que el consenso real se vea en el debate. Inspirados en Pol.is y en la democracia de las abejas, cada persona opina por su cuenta y el cálculo muestra dónde hay acuerdo entre quienes piensan distinto.

### Decisión
- En cada tema abierto, los miembros escriben **frases** de 10 a 140 caracteres y marcan «de acuerdo», «en desacuerdo» o «paso». Cada persona ve el resultado de una frase **solo después de votarla**. La siguiente frase a votar es una de las que tienen menos votos.
- **Cálculo sin IA**, reproducible, con semilla tomada del id del tema (`apps/api/src/frases/opinion-groups.ts`): matriz persona × frase, PCA a 2 dimensiones y k-means con k de 2 a 4 elegido por silueta, con 5 reinicios por k. Entran al mapa quienes votaron al menos 3 frases.
- **Frase puente:** al menos 60 % de acuerdo en cada grupo, con 3 o más votantes por grupo. Si se forma un solo grupo, cuenta como consenso general. **Frase que divide:** al menos 60 % en un grupo y como mucho 40 % en otro.
- **Privacidad:**
  - el mapa existe con 7 o más participantes (regla local);
  - los grupos de menos de 3 personas no se muestran;
  - porcentajes, tamaños de grupo y participantes se redondean a múltiplos de 5;
  - solo aparecen las frases que la persona ya votó;
  - el resultado de una frase nunca lleva recuentos exactos: solo porcentajes y un total aproximado, redondeados a múltiplos de 5, y con menos de 5 votos no se muestran porcentajes (si no, comparar antes y después de que alguien deje el grupo revelaría todos sus votos);
  - el aviso de frases puente por ver solo sale si le faltan 3 o más, y no cuando todas las que le faltan son puentes;
  - los votos de frases ocultas no entran en el mapa;
  - nunca se devuelve quién está en qué grupo ni cómo votó nadie;
  - los votos de frases no se auditan y solo cuentan los de miembros actuales.
- Las frases se moderan como lo demás: quien modera ve la lista de todas las frases visibles del tema (solo el texto, sin resultados) y puede ocultar cualquiera con un motivo. La autora ve su frase oculta sin el texto, con el motivo y la apelación.

### Consecuencias
- Las frases puente serán el punto de partida de las soluciones en 3A-3, y el resumen con citas del agente llega en 3B.
- Con pocos participantes, el redondeo hace que las cifras sean aproximadas, a cambio de que no se pueda deducir el voto de nadie.

---

## ADR-020: Soluciones y papeleta (2026-11-05)
**Fecha:** 2026-11-05
**Estado:** Aceptado

### Contexto
El spec 3A (§5) pide que de cada debate salgan soluciones y que la comunidad las vote. Carlos Robleto fijó la papeleta el 2026-11-04: con una sola solución se aprueba o no; con varias se ordenan **solo las que se aceptan**.

### Decisión
- **Soluciones:** durante el debate, cualquier miembro propone soluciones (título de 10 a 140 caracteres, descripción de hasta 2000). Quien organiza junta las repetidas. Las soluciones quedan fijas al vencer el plazo del debate (`debate.plazo_dias`).
- **«Llevar a decisión»** reemplaza a «Convertir en propuesta formal» del plan 2. Si el tema no tiene soluciones, el propio tema entra como la única. Se retira «Abrir votación»; las votaciones del plan 2 que ya existían se cuentan como antes, y esos temas no entran en este ciclo.
- **Fases automáticas** (un programador horario): debate → modo → objeción → votación → contada, o cancelada si se oculta el tema. Cada cambio de fase ocurre una sola vez, con bloqueos de fila y actualizaciones condicionadas.
- **Modo:** con varias soluciones, quien organiza propone `excluyentes` o `compatibles`. Si se opone al menos un tercio de quienes participaron en el debate y siguen siendo miembros, se usa el otro modo. Con una sola solución siempre es `compatibles`. Si al final de la objeción no queda ninguna solución visible, el resultado es «No se propusieron soluciones».
- **Papeleta:**
  - una solución: «Apruebo», «No apruebo» o «Me abstengo»;
  - varias: se ordenan las que se aceptan, y las que se dejan fuera cuentan como rechazadas; también «Rechazo todas» o «Me abstengo»;
  - se puede cambiar hasta el cierre.
- **Resultado** (`apps/api/src/decisiones/decision-tally.ts`):
  - **quórum:** han votado al menos `votacion.quorum_porcentaje` de los miembros actuales, contando las abstenciones;
  - **aprobada:** más de la mitad de las papeletas válidas (sin abstenciones) la incluye;
  - **compatibles:** ganan todas las aprobadas;
  - **excluyentes:** gana la preferida por Schulze si está aprobada; si Schulze empata una aprobada con otra que no lo está, gana la aprobada; si empatan dos aprobadas, «Empate» sin decisión.
- **Privacidad:**
  - ninguna cifra antes del conteo;
  - el resultado se calcula una sola vez y queda congelado, con matrices para verificarlo;
  - solo cuentan papeletas de miembros actuales;
  - nadie ve la papeleta ni la objeción de otra persona;
  - papeletas y objeciones no se auditan (mismo criterio que ADR-018 y ADR-019);
  - el texto de una solución oculta no sale por ningún camino.
- **Público:** `GET /api/public/consensos` suma `approvedSolutions` con los títulos de las ganadoras.

### Consecuencias
- Las papeletas guardadas permiten en 3A-4 saber, sin revelarlo, quién puede sumarse a una bifurcación.
- El resto del antiguo 3A-3 se divide en **3A-4** (comisiones y bifurcaciones) y **3A-5** (cambio de reglas por votación).
- La página pública que muestre las soluciones aprobadas llega con la portada del plan 4.

---

## ADR-021: Causas cerradas, segunda firma para ocultar y página «Decisiones» (2026-11-05)
**Fecha:** 2026-11-05
**Estado:** Aceptado

### Contexto
Carlos Robleto pidió el 2026-11-05 tres cosas:
- que la moderación use una **lista cerrada de causas**;
- que ocultar una **solución** o una **propuesta formal** requiera un **quórum mínimo** de la mesa;
- que todo sea «automatizado» y «sencillo», con un lugar donde ver los consensos logrados, los rechazados y los resultados por territorio de origen, comunidad de acogida y exilio y diáspora en general.

### Decisión
- **Causas**, para toda la moderación:
  - datos que identifican o ponen en riesgo a una persona;
  - insultos, amenazas o acoso;
  - correo basura o publicidad ajena al tema;
  - contenido ilegal o que incita a la violencia;
  - suplantación.

  El texto libre pasa a ser un detalle opcional. Las moderaciones anteriores conservan su motivo.
- **Segunda firma:** ocultar una solución o una propuesta formal necesita a 2 personas distintas de la mesa, el mismo umbral que las acciones 2 de 3 del plan 1.
  - **Causas urgentes** (datos personales, ilegal o violento): se oculta enseguida de forma **provisional**. Si nadie más de la mesa lo confirma en 48 h, vuelve a mostrarse solo.
  - **Demás causas:** queda una **solicitud**, y el contenido sigue visible hasta que otra persona de la mesa la confirme. Vence a los 7 días.
  - Nadie confirma ni rechaza su propia solicitud. Hay una sola solicitud abierta por contenido (índice único parcial). Un programador revisa los plazos cada 15 minutos.
  - Si se oculta una inquietud cuyo debate ya es una propuesta formal, ese debate sigue la misma regla de dos firmas con la misma causa.
  - Lo provisional **solo pausa**: una propuesta o solución oculta de forma provisional no avanza ni se cuenta, pero su decisión no se cancela ni la solución sale de las candidatas hasta que la segunda firma confirme. Un contenido que ya tuvo una provisional rechazada o vencida no vuelve a ocultarse de inmediato: la nueva solicitud urgente queda como solicitud normal.
  - El resto del contenido (respuestas, frases, inquietudes y temas no formales) sigue con una sola firma.
- **Página «Decisiones»:** por cada comunidad de la persona (origen, acogida y general) muestra «Aprobadas», «Rechazadas o sin decisión» y «En curso», con enlaces a cada tema. Excluye los temas ocultos y enmascara las soluciones ocultas.

### Consecuencias
- La mesa necesita al menos 2 personas con cargo para que el quórum funcione. Si no, lo urgente vuelve a mostrarse a las 48 h y las demás solicitudes vencen.
- Si una ocultación vinculada provisional vence sin confirmarse, el debate vuelve a verse aunque la inquietud siga oculta.
- La versión pública de «Decisiones», sin sesión, llega con la portada del plan 4.

---

## ADR-022: Grupos de trabajo y subgrupos por tema (2026-11-05)
**Fecha:** 2026-11-05
**Estado:** Aceptado

### Contexto
Carlos Robleto aclaró el 2026-11-05 la estructura: cada persona tiene **dos comunidades** (territorio de origen y país o estado de acogida) y participa en el **nivel general «Exilio y diáspora»**. Dentro de ellas se crean mesas de trabajo, comisiones o subgrupos por temas de interés. Eligió estas opciones:
- cualquiera propone un subgrupo y nace solo con suficientes personas;
- la comunidad lee lo que pasa dentro y solo participan sus miembros;
- lo aprobado pasa a la comunidad;
- un solo tipo de grupo de trabajo con variantes;
- también hay subgrupos en el nivel general.

### Decisión
- Un **grupo de trabajo** es un `Group` hijo (`type = 'trabajo'`, `parentGroupId`) con variantes `subgrupo`, `comision` y `bifurcacion`. Así reutiliza sin cambios los foros, temas, frases, soluciones, decisiones y la moderación.
- **Lectura y participación** (`GroupAccessService`): leen los miembros del grupo y los del ámbito; participan solo los miembros del grupo. Quien solo lee no ve resultados de frases ni datos propios, y recibe `soloLectura`.
- **Subgrupo:**
  - lo propone cualquier miembro del ámbito;
  - nace solo al reunir `subgrupo.minimo_personas` (5) en `subgrupo.plazo_dias` (14), una sola vez aunque se sumen a la vez;
  - si no llega al mínimo, se archiva solo; también si queda con menos de 3 miembros durante 30 días;
  - la entrada y la salida son libres, y se auditan, porque la lista de miembros es visible en el ámbito.
- **Llevar a la comunidad:** una solución ganadora de una votación aprobada del subgrupo pasa al ámbito como inquietud que ya pide respuesta, una sola vez.
- Los grupos de trabajo **no** tienen inquietudes, elecciones ni sorteos propios: deciden con soluciones y votación, y lo demás se lleva a la comunidad.
- «Decisiones» y la nueva página «Grupos de trabajo» muestran los grupos de cada ámbito.

### Consecuencias
- Organizar dentro de un subgrupo (juntar soluciones, proponer el modo) sigue en manos de la mesa hasta que existan coordinadores (3C). Los plazos automáticos evitan que algo se quede trabado.
- Las comisiones y las bifurcaciones (3A-4b) usarán el mismo modelo.

---

## ADR-023: Comisiones e iniciativas de un grupo (2026-11-06)
**Fecha:** 2026-11-06
**Estado:** Aceptado

### Contexto
El spec 3A (§6 y §7) y el spec 3A-4 (§4 y §5) piden dos cosas. Que alguien lleve a cabo lo que la comunidad aprueba, y que una minoría pueda impulsar su solución sin salir de la colmena. Carlos pidió además que «toda complejidad esté automatizada».

### Decisión
- **Comisión** (grupo de trabajo `comision`):
  - **Nacimiento.** Nace sola por cada solución ganadora de una votación aprobada, con la tarea, los puestos y la forma por defecto. Quien organiza solo ajusta si quiere.
  - **Voluntarios.** Cualquier miembro del ámbito se ofrece, con su experiencia si quiere. Si faltan voluntarios, la convocatoria se amplía 7 días una sola vez. Después se forma con quienes haya, o se archiva si no hay nadie.
  - **Elección.** Por **sorteo verificable**: se publican la semilla y la lista, y cualquiera lo comprueba. Si la regla `comision.forma` lo dice, por **votación de preferencias** con Schulze repetido para varios puestos, con desempate determinista.
  - **Informes.** Hay un informe cada `comision.informe_cada_dias` y el aviso aparece en la página. No hay notificaciones todavía.
  - **Renovación.** Si falta a dos informes, la comunidad pide renovarla con el apoyo de una fracción de quienes participaron en el debate; nace entonces una comisión nueva.
  - **Informe final.** Se publica junto al consenso, sin nombres.
- **Iniciativa de un grupo** (bifurcación):
  - **Quién se suma.** Solo quienes incluyeron esa solución en su papeleta, comprobado con la papeleta guardada. La negativa es idéntica para quien votó otra cosa y para quien no votó.
  - **Nacimiento.** Nace con `bifurcacion.minimo_personas`.
  - **Privacidad.** Nunca se revela quién la forma:
    - el ámbito no lee su foro, porque los nombres de quienes escriben delatarían el voto;
    - fuera solo se ve cuántos son;
    - sumarse no se audita;
    - toda acción dentro de ella o de su comisión se audita sin actor, porque el registro de auditoría lo lee cualquier persona verificada;
    - quien lleva la solución de vuelta a la comunidad aparece como «Iniciativa de un grupo».
  - **Pausa.** Quien organiza la pausa con una causa de la lista; sus miembros apelan una vez y la mesa decide. Si la mesa mantiene la pausa, la iniciativa queda en pausa sin plazo.
    - La pausa detiene todo: sus temas, sus decisiones y su comisión no avanzan ni admiten escrituras. Al reanudarse, sus plazos se corren lo que duró la pausa.
    - Quien organiza pausa desde la lista de grupos, sin entrar a la iniciativa. Si es miembro de ella, la pausa se audita sin actor.

### Consecuencias
- El primer despliegue creará comisiones para las soluciones aprobadas que ya existan. Hoy no hay datos reales; antes de producción se decide si poner una fecha de corte.
- Una comisión archivada cierra el camino automático para esa solución; solo la renovación crea otra.
- Las notificaciones de informes llegarán con el agente (3B) o con el correo.
- **La mesa no lee lo de dentro de una iniciativa.** La privacidad pesa más que la moderación: la mesa resuelve la apelación de una pausa solo con la causa, el detalle, la apelación y el título de la solución (enmascarado si se ocultó). Es un límite conocido de la moderación; si hiciera falta, más adelante se agregaría una vista de la mesa con los nombres enmascarados.
- **La última persona puede salir de una comisión activa.** La comisión no se archiva por quedarse sin miembros: deja de informar, se atrasa y la comunidad la renueva.
- **La semilla del sorteo se genera después de conocer la lista de voluntarios.** El sorteo es reproducible (semilla, lista y algoritmo publicados), pero la semilla no se comprometió antes. El compromiso previo (commit-reveal) sigue pendiente en ADR-014.

---

## Decisiones pendientes

| ID | Pregunta | Prioridad |
|---|---|---|
| ADR-014 | ¿Implementar commit-reveal para sortition (participantes aportan entropía)? | Media — Iteración 9 |
| ADR-015 | ¿Dominio de producción definitivo? Requerido para configurar TLS, CORS y COOKIE_DOMAIN | Alta — antes del primer deploy |
