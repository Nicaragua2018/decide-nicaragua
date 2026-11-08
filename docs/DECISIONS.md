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

## ADR-024: Cambio de reglas por votación (2026-11-06)
**Fecha:** 2026-11-06
**Estado:** Aceptado

### Contexto
El spec 3A (§8) pide que las reglas no las fije nadie por su cuenta: la comunidad las cambia votando. Las locales se aplican solas; las de la colmena necesitan además a la mesa.

### Decisión
- **Proponer.** Cualquier miembro propone un cambio desde la página «Reglas», con un valor dentro de los límites de la colmena y un motivo opcional.
  - Las reglas locales se cambian en su comunidad: origen, acogida o el nivel general.
  - Las de la colmena solo se cambian en «Exilio y diáspora».
  - Hay un solo cambio abierto por regla y comunidad.
  - Las reglas de la colmena que todavía no usa ninguna parte del sistema (observadores, activación de comunidades, primera elección, revocación, duración de los cargos y plazos de las elecciones) no se pueden proponer hasta 3C, cuando se conecten con las elecciones. La página las marca «Aún no tiene efecto»: ninguna votación debe quedar sin efecto.
  - El mínimo de puestos de una comisión no puede ser mayor que el máximo de la misma comunidad. Se comprueba al proponer y otra vez al aplicar; si al aplicar ya no se cumple, el cambio queda rechazado.
- **Debatir y votar.** El cambio abre un tema que ya es propuesta formal, con una única solución («Cambiar a …»). Pasa por el plazo de debate y después por la votación automática de 3A-3, con «Apruebo / No apruebo / Me abstengo».
  - No admite otras soluciones.
  - No genera comisiones ni iniciativas de grupo.
- **Participación.** Para valer debe votar al menos `reglas.participacion_minima` (30 %) de la comunidad. Si no, el resultado es «Sin participación suficiente».
- **Aplicar.** El resultado se aplica una sola vez, de forma automática:
  - una **regla local** aprobada se guarda al instante, después de comprobar de nuevo sus límites;
  - una **regla de la colmena** aprobada crea una acción de la mesa, que la aplica con 2 aprobaciones (o la rechaza con 2), comprobando otra vez los límites.
  - Nadie puede crear a mano una acción de la mesa para cambiar una regla.
  - Si la mesa no la resuelve en 30 días, la acción vence: el cambio queda «Rechazado por la mesa» y la regla queda libre para otra propuesta.
  - Si el tema del cambio se oculta en firme por moderación, el cambio queda anulado (y, si esperaba a la mesa, su acción queda rechazada).
- **Historial.** Cada regla muestra su cambio en curso y los últimos cambios resueltos (aplicado, rechazado, rechazado por la mesa, sin participación o anulado), sin nombres.

### Consecuencias
- Con esto se cierra el ciclo de la comunidad de 3A: inquietud, debate, votación, comisión, iniciativa de un grupo y reglas que la propia comunidad ajusta.
- Para cambiar las reglas de la colmena, la mesa necesita al menos 2 personas con cargo.

---

## ADR-025: Asistente de IA, base y moderación previa (2026-11-06)
**Fecha:** 2026-11-06
**Estado:** Aceptado

### Contexto
El spec 3B (§6 y §7) pide un asistente de IA (Claude) que cuide la conversación sin decidir qué opiniones valen. La crítica política, contra cualquier lado, nunca se frena. Carlos pidió que toda complejidad esté automatizada y que el asistente nunca actúe por su cuenta.

### Decisión
- **La puerta única.** Toda llamada al servicio de IA pasa por `AsistenteService.pedir()`, que aplica el interruptor, el tope de gasto, la limpieza del texto (`limpiarTexto()` quita correos y teléfonos, pero no los rangos de años ni las fechas), el tiempo máximo y la validación de la salida. Nunca lanza: ante cualquier problema devuelve nada y la plataforma sigue como en 3A.
  - Las instrucciones son fijas y viven en el código; el texto de los miembros va solo en el turno de usuario, dentro de `<material>`. Si el texto trae `<material>` o `</material>`, se neutraliza (`<\material`, `<\/material`) para que no pueda abrir ni cerrar la etiqueta. Una salida que no cumple el esquema se descarta.
  - Al servicio de IA nunca van nombres, correos, identificadores de perfil ni datos de verificación.
  - Solo los modelos Haiku aceptan forzar la herramienta; con Sonnet y Opus se pide por instrucción y se valida (si no hay una llamada válida, no hay resultado).
- **Los tres niveles** de la moderación previa:
  - **0:** se publica sin aviso. Incluye siempre la crítica política con argumentos, contra cualquier lado.
  - **1:** se publica y se avisa en privado y con amabilidad, con una sugerencia que conserva la idea. Un insulto suelto es nivel 1. No se guarda el texto del aviso.
  - **2:** no se publica sin la mesa, solo por `odio`, `insultos_amenazas` (amenazas y acoso), `datos_personales` o `ilegal_violencia`. Un nivel 2 sin una de esas causas baja a 1. Si el modelo duda entre dos niveles, elige el más bajo.
  - El servidor revisa aunque la web no lo haya hecho (responde 422 en el nivel 2). Si el asistente no responde en **5 s**, el texto se publica y entra en la cola de la revisión posterior (nivel 3), que reintenta. Con el asistente apagado no se revisa ni se encola nada: la plataforma funciona igual que en 3A.
  - La sugerencia conserva el título y el cuerpo cuando el texto los tiene; la web la reparte en los dos campos.
- **La causa `odio`:** «Incita al odio o ataca a un grupo por lo que es (origen, etnia, color, religión, sexo, orientación, discapacidad)», no urgente.
- **La revisión de la mesa** de un texto de nivel 2: 2 aprobaciones de miembros distintos de la mesa publican y 2 rechazos rechazan; vence a los 7 días y nunca se publica sola. Quien escribió el texto no puede firmar su propia revisión. Pedir dos veces la misma revisión (misma persona, tipo, texto y destino, sin vencer) no crea otra. Si al publicar el destino ya no existe, la revisión queda «no publicable» con el motivo.
- **Solicitud de moderación del asistente** (revisión posterior, nivel 2). El asistente nunca oculta en firme: su solicitud nunca queda «oculto» por sí sola y nunca cuenta como firma de la mesa.
  - Con causa urgente queda **provisional**: el contenido se oculta ya durante 48 h y vuelve a mostrarse si la mesa la rechaza o si vence. Si ese contenido ya tuvo antes una solicitud provisional, queda **pendiente**.
  - Con causa no urgente queda **pendiente**: el contenido sigue visible mientras la mesa decide.
- **Firmas según el quórum de 3A-3b** para resolver la solicitud del asistente:
  - donde 3A-3b exige quórum (temas formales y soluciones) hacen falta 2 firmas de personas distintas de la mesa: la primera aprobación queda como primera firma y la solicitud sigue abierta hasta la segunda;
  - en el resto, una sola aprobación de la mesa la resuelve, como cuando un moderador oculta hoy;
  - un rechazo de la mesa la cierra.
- **Fecha al publicar desde la revisión:** el texto aprobado se publica con la fecha actual, no con la original. Pasar la fecha a cada publicador cuesta más de lo que aporta; si importa, se agrega en 3B-2.
- **El tope de gasto:** `ASISTENTE_TOPE_MENSUAL_USD`, por defecto **20 USD** al mes. Las tareas nocturnas paran al **80 %** y las interactivas al **100 %**; después la moderación funciona como «servicio caído». Al llegar al 100 % se audita y se avisa una sola vez al mes por correo a `ASISTENTE_AVISO_EMAIL` (si falta, solo queda el registro).
- **El interruptor:** `ASISTENTE_ACTIVO`, apagado por defecto. Solo funciona si vale exactamente `"true"` y hay clave. Apagado, la plataforma funciona igual que en 3A: la revisión previa no toca Redis ni deja nada en la cola del nivel 3 (Ruling 14). Solo «encendido pero sin respuesta» (lento, tope o límite diario) publica y encola.
- **Límite diario por perfil:** 100 revisiones del asistente por perfil y día UTC, sumando las de la web (`POST /asistente/revisar`) y las de la guardia. Se cuentan en Redis con un hash del perfil (plazo de 26 h); si Redis falla o tarda, se permite. Pasado el límite, el texto cuenta como no revisado: se publica y entra en la cola. `POST /asistente/revisar` admite hasta 5000 caracteres; un texto más largo lo revisa la guardia al enviarlo. Cada operación de Redis tiene un tiempo máximo de 300 ms.
- **Respuestas de quien organiza** (Ruling 16): pasan por la revisión previa, pero si el asistente no la revisó no se encola la inquietud del miembro; la mesa puede moderarla a mano.
- **Retención del texto de nivel 2** (Ruling 15): al publicarse o rechazarse, la revisión pierde el texto y los argumentos (quedan causa, estado y fechas; la persona ve «Texto eliminado»). Vencidos y no publicables conservan el texto para que la persona lo reformule, y el programador de cada hora lo borra 30 días después de resolverse.
- **Registros:** los errores del asistente se registran solo por su nombre (y el código de Prisma), nunca con la pila ni el mensaje, que pueden repetir texto de miembros. La firma de una revisión se audita con quién firmó (`actorId`), sin texto ni autor.
- **El examen** (`apps/api/src/asistente/examen/casos.json`): casos inventados de manipulación, odio, amenazas, datos personales, insultos, crítica política contra todos los lados y textos neutros, con modismos nicaragüenses. Se corre con `ASISTENTE_ACTIVO=true pnpm --filter @decide/api asistente:examen` y hay que aprobarlo completo para encender el asistente, y otra vez antes de cada cambio de instrucciones o de modelo.

### Consecuencias
- **Límite conocido: el examen requiere la clave de Carlos y se corre a mano.** No corre en las pruebas automáticas; estas solo comprueban que los casos estén bien formados. Mientras no apruebe, el asistente sigue apagado.
  - El examen se corre desde una copia del código fuente con las dependencias de desarrollo instaladas (usa `tsx`), no desde la imagen de producción, que no las trae.
- La caché de Redis guarda durante 10 minutos, bajo una clave que es un hash del texto, solo el nivel, la causa y si se revisó: nunca el texto, la explicación ni la sugerencia. Por eso, en la web, un acierto de nivel 1 o 2 se vuelve a pedir para mostrar la explicación y la sugerencia; la guardia del servidor sí usa el acierto.
- Los formularios con revisión previa llevan la acción del servidor en `action` (como en 3A): si alguien envía antes de que cargue el JavaScript, el texto va por POST y lo revisa la guardia; nunca por GET en la URL.
- La relación de la moderación con quien moderó es `Restrict`, como en 3A: borrar un perfil con moderaciones sigue bloqueado.
- Una revisión que queda «publicando» porque el servidor se cayó a mitad no se recupera sola todavía.
- Un tema que se abre solo al vencer el plazo de una inquietud no se vuelve a revisar: copia una inquietud que ya pasó por la revisión.
- Siguen 3B-2 (acompañar) y 3B-3 (acuerdos).

---

## ADR-026: Asistente de IA, acompañar (2026-11-07)
**Fecha:** 2026-11-07
**Estado:** Aceptado

### Contexto
El plan 3B-2 pone al asistente al lado de cada persona: un panel de preguntas, «Desde tu última visita» y una tarjeta para crecer la comunidad. Carlos pidió que toda complejidad esté automatizada y que el asistente nunca actúe por su cuenta. Todo pasa por la puerta única de ADR-025.

### Decisión
- **Modelo rápido para el panel.** El panel y las dos tarjetas usan el modelo rápido (Haiku) con prioridad interactiva y un tiempo máximo de 20 s en el panel. La respuesta llega por la herramienta «responder», que se valida (`esRespuestaPanel`); sin una salida válida, la persona ve un mensaje de reintento.
- **Referencias `rN` y `gN` en lugar de rutas.** Al asistente nunca van rutas, ids ni uuids. La guía de la plataforma cita sus páginas como `gN` (`RUTAS_DE_LA_GUIA`, por ejemplo `g7` es `/admin/invite`) y `aMaterial` cambia cada plazo y cada resultado por una `rN`. La ruta del enlace la pone siempre el servidor: una referencia que no existe se descarta, y el texto del enlace de la guía es el de la guía, no el del modelo.
- **El panel no ve nombres ni votos.** Las reglas del panel: no dice quién escribió, apoyó o votó algo ni quién está en un grupo (`motivo: 'privacidad'`), no da opinión política ni recomienda votar (`imparcial`) y rechaza lo que no es de la plataforma (`fuera_de_alcance`). No actúa en nombre de la persona: dice dónde hacer clic. La conversación va en turnos numerados y sangrados, para que un mensaje no se haga pasar por otro turno.
- **Búsqueda solo en los grupos legibles.** `ContextoPersonaService.gruposLegibles` devuelve los grupos de los que la persona es miembro y sus grupos de trabajo que no son bifurcación (la misma regla que `GroupAccessService.nivel`). La búsqueda, el material y las tarjetas se limitan a ellos: una bifurcación solo la leen sus miembros porque su nombre y su foro delatarían el voto.
- **Plazos solo de lo propio.** Las votaciones abiertas salen únicamente de los grupos de los que la persona es miembro y que no están en pausa; los plazos de inquietudes, de sus comunidades.
- **Límite diario.** Regla `asistente.preguntas_por_dia` (global). Se cuenta en Redis con un hash del perfil y el día UTC (plazo de 26 h); si Redis falla o tarda más de 300 ms, se permite.
- **«Desde tu última visita».** Una visita nueva empieza si pasaron más de 12 h desde la última; la primera visita mira 7 días atrás. `alDiaDesde` significa «visto hasta aquí»: una visita nueva lo adelanta a la última visita, salvo que la persona haya cerrado la tarjeta después (manda lo más nuevo), y nunca es más vieja que 7 días (un perfil anterior sin ventana cuenta como 7 días atrás). Cerrar la tarjeta pone `alDiaDesde` en este momento, en lugar de ocultarla para siempre: la tarjeta solo se muestra si hay novedades desde ahí, así que vuelve sola cuando pasa algo nuevo. Quien entra seguido sigue viendo novedades, porque la ventana avanza con cada visita nueva. Es un resumen breve (una a tres frases) de lo que pasó en las comunidades de la persona. La caché usa una clave que incluye el hash de la lista de novedades, y sin duplicar lo que está «abierta» y lo que «cierra».
- **Tarjeta de crecer.** Se muestra a quien es miembro de una comunidad territorial (de origen o de acogida) con menos de 20 miembros; la meta es 7 para activarla y 20 después. Cerrarla la oculta 7 días y se guarda por persona en la base de datos (`AvisoCerrado`), no en el navegador; solo se cierra la tarjeta de la propia comunidad territorial. La caché incluye el número de miembros, así el texto no se queda viejo. Si el asistente no responde, un texto fijo de reserva (`textoSinAsistente`) lo cubre, con un mensaje de invitación que la persona puede copiar y que el asistente no envía.
- **Sin tarjetas con el asistente apagado.** Con el asistente apagado (sin `ASISTENTE_ACTIVO` o sin clave), las tarjetas no se muestran (`mostrar: false`) y el panel responde «apagado». La plataforma funciona igual que en 3A.
- **Cuentas sin verificar** (ruling de las tareas 4 y 5): las tarjetas usan `JwtAuthGuard` y comprueban el estado en el controlador. Una cuenta que no es de ciudadana verificada recibe `mostrar: false` y cerrar es un 204 sin efecto, para que la portada nunca falle por una tarjeta.
- **Web.** La tarjeta «al día» va en la portada y la de crecer en la página de la comunidad, ambas en `Suspense`, así que la página no espera al asistente. Los enlaces del panel pasan por `esRutaInterna`: solo rutas internas de la plataforma. La web de 3B-2 se verifica con `tsc`, porque no tiene pruebas automáticas (como en 3B-1).
- **El examen del panel** (`casos-panel.json`): 28 casos inventados de privacidad (incluido un nombre dentro del material), imparcialidad (a favor y en contra de cualquier lado), manipulación (en la pregunta, escondida en el material, un turno falso del «Asistente» o un enlace inyectado), guía (con críticas legítimas al gobierno y a la oposición, que no deben rechazarse) y fuera de alcance. El evaluador también falla si un enlace no es de la guía ni del material del caso. `correr-examen.ts` corre las dos partes (moderación y panel, con `PanelService.responderConMaterial`) y termina con código 1 si falla un solo caso. Hay que aprobarlo completo para encender el asistente, y otra vez antes de cambiar instrucciones o modelo.
- **Un solo interruptor.** `ASISTENTE_ACTIVO` enciende todo el asistente a la vez: la moderación previa, el panel y las tarjetas. El examen cubre la moderación y el panel juntos, y el asistente se enciende solo después de que ambas partes aprueben completas.
- **Variables de entorno:** ninguna nueva (`.env.example` no cambia). Las opciones nuevas viven en las reglas de la colmena.

### Consecuencias
- **Límite conocido: el examen del panel requiere la clave de Carlos y se corre a mano**, igual que el de 3B-1. Las pruebas automáticas solo comprueban que los casos estén bien formados y que el evaluador funcione.
- Una pregunta cuesta una llamada al modelo rápido; el límite diario y el tope mensual de ADR-025 acotan el gasto.
- El panel no recuerda conversaciones entre visitas: la web manda los turnos de la sesión.
- Sigue 3B-3 (acuerdos).

---

## ADR-027: Asistente de IA, acuerdos (2026-11-07)
**Fecha:** 2026-11-07
**Estado:** Aceptado

### Contexto
El plan 3B-3 usa al asistente para ayudar a encontrar acuerdos: juntar inquietudes parecidas, describir el mapa de opiniones, proponer borradores de soluciones y sembrar las preguntas iniciales. Carlos pidió que el asistente nunca decida, que todo lo suyo vaya marcado y que la complejidad esté automatizada. Todo pasa por la puerta única de ADR-025.

### Decisión
- **Una sola tabla de sugerencias, resuelta al leer.** Las sugerencias del asistente (grupos de inquietudes, aviso de umbral, presentación, mapa, borradores y comentario de comisión) viven en una tabla única, con el tipo, el objeto, el grupo de acceso, el contenido y la base (`base = { at, inquietudes?, frases?, opiniones? }`). El acceso se decide por el objeto al leer, nunca por la fila: el endpoint vuelve a comprobarlo con `GroupAccessService` o `ForumsService.canOrganize`. Los ids de contenido viajan como referencias cortas (`i1`, `f1`…) que el servidor traduce de vuelta; las referencias inventadas se descartan.
- **Siempre marcado, nunca decide.** Todo texto suyo lleva «Sugerencia del asistente» y las inquietudes y temas suyos tienen `origen: 'asistente'`. Solo sugiere; la persona da el clic. Un tema sin autor que pasa a propuesta no siembra «el tema como primera solución» (`Solucion.authorProfileId` sigue siendo obligatorio; `Proposal.authorProfileId` es opcional para no crear un usuario falso): los miembros y los borradores aportan las soluciones, y sin ninguna el debate termina `sin_soluciones` como cualquier otro.
- **Presentación neutral encima del original.** La presentación del asistente no reemplaza el texto del autor: se muestra arriba y el original queda debajo. No se altera contenido de miembros.
- **Visibilidad del mapa.** Con el debate abierto, el mapa solo lo ve quien participa y votó al menos 3 frases (para no anclar votos, regla de 3A-2); al terminar, lo puede ver cualquier lector. Se genera con 20 votos de miembros actuales como mínimo y con las cifras de 3A: grupos de 3 o más personas, tamaños redondeados de 5 en 5 con mínimo 5 y porcentajes por frase solo con 5 o más votantes.
- **Borradores adoptables.** Los borradores se basan en frases puente y solo se generan si hay al menos una. La persona puede adoptar uno y editarlo antes de publicarlo; la solución nace con origen `asistente` y la web la marca «A partir de una sugerencia del asistente» (no «Sugerencia del asistente», porque la persona pudo reescribirla). Auditoría sin texto: `solucion.created` con `metadata.desdeBorrador: true` y `asistente.sugerencia_guardada` con tipo y objeto.
- **Las doce preguntas iniciales, sin autor y con marca.** Se siembran una sola vez, en «Exilio y diáspora» (el nivel general), y solo cuando el asistente está encendido y ese nivel está activo. Son doce inquietudes (no once como decía el diseño: Carlos añadió la 12.ª al revisar el artículo publicado), sin autor, con `origen: 'asistente'` y la marca «Sugerencia del asistente»; necesitan el apoyo de los miembros para avanzar como cualquier otra. Se auditan como `asistente.semillas_sembradas`. Si una semilla está mal, el costo es borrarla.
- **Título de 200 caracteres para las semillas.** El título de `Inquietud` pasa a `VarChar(200)` porque una de las preguntas iniciales mide unos 190 caracteres; el DTO para personas sigue en 140. Inconsistencia menor aceptada.
- **Ronda horaria con tope de 20 pedidos y prioridad nocturna.** «Cada noche» es una ronda que corre cada hora y deja pasar un mínimo de 20 horas (agrupar) y 24 horas (mapa) entre generaciones, con un máximo de 20 pedidos por ronda. Todas las tareas usan prioridad `nocturna`: con el asistente apagado o sin margen de gasto, `pedir()` devuelve null y no se guarda nada. Modelo `rapido` para el aviso de umbral y el comentario de comisión; `capaz` para agrupar, presentación, mapa y borradores. Agrupar mira como máximo las 80 inquietudes más nuevas de la comunidad.
- **Cifras y acceso.** El número de apoyos de una inquietud se envía sin redondear al aviso de umbral (ya es público). Las marcas puente/divide de grupos con 3 o 4 votantes viajan sin porcentajes. El análisis público sigue mostrando porcentajes de grupos con menos de 5 votantes (comportamiento de 3A-2); se revisa en 3C. «Tema visible» es `hidden: false`.
- **El examen de acuerdos** (`casos-acuerdos.json`, 17 casos inventados): inyección en el material, neutralidad (críticas al gobierno, a la oposición y a ambos), nombres metidos en el material (un nombre falso que no puede salir), referencias inventadas y pocas frases puente (los borradores no inventan acuerdos). `evaluarCasoAcuerdos` revisa que cada referencia exista y que no aparezca nada prohibido. `correr-examen.ts` corre las tres partes (moderación, panel y acuerdos, con `AsistenteService.pedir` real, modelo capaz y prioridad nocturna) y termina con código 1 si falla un solo caso.
- **Variables de entorno:** ninguna nueva.

### Consecuencias
- **Límite conocido: el examen de acuerdos requiere la clave de Carlos y se corre a mano en el servidor**, igual que los de 3B-1 y 3B-2. Las pruebas automáticas solo comprueban que los casos estén bien formados y que el evaluador funcione. Hasta aprobarlo, el asistente sigue apagado.
- Un debate sin frases puente no recibe borradores; las inquietudes viejas fuera de las 80 más nuevas no entran en las sugerencias de grupos; la hora de las rondas no es fija.
- Sigue 3C.

---

## ADR-028: Elecciones, elegir (2026-11-07)
**Fecha:** 2026-11-07
**Estado:** Aceptado

### Contexto
El plan 3C-1 reemplaza a los fundadores por personas elegidas: administrador, coordinador general, secretario, observadores y coordinadores de comunidad. Carlos pidió que la complejidad esté automatizada, que el voto sea secreto y que la plataforma nunca se quede sin mesa. El diseño es el spec `2026-11-07-plan-3c-elecciones-design.md`; aquí se recoge lo que quedó en el código, incluidos los cambios que salieron de las revisiones.

### Decisión
- **Cargos y ámbitos.** Administrador, coordinador general y secretario (1 puesto cada uno) y observadores (`observadores.numero`, 7) se eligen entre toda la plataforma (cuentas `verified_citizen`); su período es `cargos.periodo_mesa_meses` (12). Los coordinadores son 2 por comunidad activa, los elige la gente verificada de esa comunidad y duran `cargos.periodo_coordinadores_meses` (6).
- **Tabla `Cargo` sincronizada con `BoardSeat`.** `Cargo` (tipo, grupo, persona, elección, `desde`, `hasta`, `enFunciones`, `terminadoAt`) es el historial de quién ocupa qué. Al tomar posesión, quien gana un cargo de la mesa pasa también a `BoardSeat` (`source: 'eleccion'`, upsert por rol) en la misma transacción; los permisos de la mesa siguen leyendo `BoardSeat`. Los asientos fundadores no tienen fila `Cargo`: su estado «en funciones» se deduce de `BoardSeat` con `source: 'fundador'`. Costo: dos fuentes para la mesa hasta que todos los puestos sean elegidos.
- **Índice parcial.** `elecciones_abierta_por_cargo` (único por `groupId` y `cargo` mientras la fase sea `candidaturas` o `votacion`) impide dos elecciones abiertas del mismo cargo y ámbito; la creación atrapa el P2002. Se escribió a mano en la migración (`20261114120000_elecciones_cargos`) y `migrate diff` debe seguir mostrándolo como única diferencia.
- **Disparadores fijos, nunca una persona.** Un programador convoca: la primera jornada (mesa y observadores juntos, con `eleccion.minimo_primera` = 12 cuentas verificadas), la activación de una comunidad (`comunidad.minimo_activacion` = 7, para sus 2 coordinadores) y, después, una sola convocatoria por cargo y ámbito que junta la renovación y las vacantes (ver abajo). Plazos: `eleccion.plazo_candidaturas_dias` (7) y `eleccion.plazo_votacion_dias` (7). Con menos candidaturas vivas que puestos, el plazo de candidaturas se alarga 7 días una sola vez.
- **Reglas fijadas en la convocatoria.** La participación mínima (`quorumPct`, de `votacion.quorum_porcentaje`) y el período (`periodoMeses`) se guardan en la elección al convocarla (migración `20261115120000_eleccion_reglas_fijas`); un cambio de regla rige desde la siguiente convocatoria. Se conectaron todas las reglas «sin conectar» menos `revocacion.fraccion`, que es de 3C-2.
- **Una sola convocatoria por cargo y ámbito (renovación y vacantes juntas).** Un cargo vigente «sale» si está «en funciones» o si su período termina dentro de los próximos 21 días; los demás «siguen». La elección pide `puestos = plenos − los que siguen` (plenos: 1 en cada rol de la mesa, `observadores.numero`, 2 coordinadores), así que cubre a la vez a quien sale y las vacantes; con 0 puestos o menos nunca se convoca. Se convoca cuando hay puestos y además: alguien entra en la ventana de 21 días (su renovación aún no se ofreció), o pasaron 30 días desde la última elección contada de ese cargo y ámbito (vacantes o personas en funciones), o nunca se contó ninguna. Una elección fallida nunca retrasa la renovación de quien sale, y quien quedó en funciones se vuelve a ofrecer a los 30 días, no en cada ronda. Motivo «renovacion» si alguien sale; si solo hay vacantes, «reintento». La mesa y los observadores que tocan en la misma ronda van en una sola jornada. Costo: elecciones más pequeñas y frecuentes si los mandatos se desfasan.
- **Candidatura = ficha moderada.** Una ficha tiene presentación (hasta 600 caracteres), hasta 3 compromisos (140 cada uno) y comunidades; sin fotos (iniciales en un hexágono) y con orden al azar estable por persona. Pasa por la revisión previa de ADR-025 con un tipo nuevo `candidatura` (un tipo más en la moderación). La persona puede retirarla y editarla mientras dure el plazo de candidaturas; al editar vuelve a la revisión.
- **Un cargo a la vez.** Una candidatura viva en cualquier elección abierta bloquea presentarse a otra (más estricto que «misma jornada»; costo: no se puede probar suerte en dos elecciones solapadas). Quien tiene otro cargo vigente no se presenta a uno distinto. Las incompatibilidades se bloquean al presentarse y se vuelven a aplicar al contar, con la misma regla (`incompatibilidad.ts`): cargo vigente distinto o asiento elegido de otro rol. Un asiento fundador solo deja presentarse a un cargo de la mesa: es incompatible con ser coordinador y con ser observador. Un fundador elegido a otro rol de la mesa libera su asiento fundador; ese puesto queda vacante y lo cubre la convocatoria de los 30 días. Así la mesa nunca baja de 2 asientos ocupados. Costo: los fundadores no observan en la primera jornada.
- **Ocultar una ficha: 2 de 3.** La mesa oculta una ficha con 2 de 3 firmas (`BoardAction` de tipo `ocultar_candidatura`, con causa cerrada); la persona ve la causa y puede editar su ficha mientras dure el plazo de candidaturas. Editarla la vuelve a mostrar (borra «oculta» y la causa) y cancela las propuestas pendientes de ocultarla, que juzgaban el texto anterior. Así un solo miembro de la mesa no puede ocultar rivales. Por conflicto de interés, quien tiene una candidatura viva en una elección abierta no propone ni firma ocultar fichas; si eso deja menos de 2 firmantes, la ficha no se oculta (la revisión previa sigue actuando). Cada firma se registra y se resuelve en una transacción con la acción bloqueada (`FOR UPDATE`, como en los cambios de regla): dos firmas finales a la vez no ejecutan dos veces, y una propuesta cancelada por una edición ya no se aplica. La ocultación toma la elección en `FOR SHARE` y el conteo en `FOR UPDATE`, así que una ficha ocultada justo antes del conteo queda excluida. Costo: ocultar tarda hasta que firme el segundo; con muchos candidatos en la mesa, puede no haber quien oculte.
- **Papeleta y quién queda elegido.** La papeleta es la de 3A-3: una abstención o un orden de las candidaturas que la persona acepta; quien queda fuera, queda rechazado; se cambia hasta el cierre. Queda elegido quien aparece en más de la mitad de las papeletas no abstenidas (`estaAprobada`), y el orden entre las aprobadas lo da Schulze recalculado solo entre ellas (sub-matriz), no el Schulze global; las matrices completas se guardan para auditoría. Costo: el orden puede diferir del Schulze global en casos raros. Las abstenciones cuentan para la participación mínima.
- **Desempate con semilla.** Un empate exacto que no cabe entero en los puestos se resuelve con `selectMembers` del sorteo verificable y una semilla pública guardada en la elección.
- **«En funciones» y nunca sin mesa.** Un puesto sin elegir o sin participación mínima deja a quien lo ocupaba «en funciones»: sigue en el cargo hasta que se cubra. Al tomar posesión solo terminan cargos «salientes» de ese tipo y ámbito (en funciones, o cuyo período termina dentro de los 21 días siguientes al conteo), nunca uno con mandato por delante, y como mucho tantos como electas: primero los «en funciones» y después los de `hasta` más próximo. Si hay vacantes, las electas las ocupan antes de reemplazar a nadie (nunca se pasa de los puestos plenos). Así una elección que cubre vacantes suma personas: con 5 de 7 observadores, 2 electas dejan 7. Los salientes que no se reemplazaron quedan «en funciones».
- **El voto es secreto.** Ninguna respuesta de la API dice quién votó qué. No se audita cada voto (como en decisiones): el total queda en `eleccion.contada`, porque una auditoría por voto con hora filtraría la participación exacta en vivo. Durante la votación solo se muestra la participación redondeada de 5 en 5; después del conteo, el resultado y las matrices son públicos con cifras exactas («11 de 21 papeletas»), sin redondeo.
- **Coordinadores y moderación.** `ForumsService.canModerate` acepta a la mesa y a un coordinador vigente de la comunidad; en subgrupos y comisiones cuenta el coordinador de la comunidad de la que cuelgan. Las bifurcaciones no heredan coordinadores (están reservadas, 3A-4b): ahí modera solo la mesa, y pausar una bifurcación también es solo de la mesa, aunque se haga desde la comunidad madre. Las apelaciones y la segunda firma siguen siendo solo de la mesa.
- **Papeleta de elecciones en la web.** Es un componente nuevo (tocar en orden, «Rechazo a todas», «Me abstengo») y no se generalizó el de decisiones, para no cambiar su comportamiento. Costo: dos componentes de papeleta. «Quiénes nos representan» (`/representantes`) es una página pública, también para visitantes; las elecciones (`/elecciones`) son para cuentas verificadas.
- **El asistente no interviene.** Este plan no añade ninguna tarea de IA: el asistente no resume ni compara candidaturas ni recomienda a nadie; solo explica cómo funciona (guía de la plataforma).
- **Variables de entorno:** ninguna nueva.

### Consecuencias
- Tres migraciones (`elecciones_cargos`, `eleccion_reglas_fijas`, `ocultar_candidatura`), la primera con el índice parcial hecho a mano.
- Los fundadores no pueden ser coordinadores ni observadores mientras ocupen la mesa fundadora; si un fundador gana otro rol de la mesa, la mesa queda con 2 asientos hasta la convocatoria de los 30 días.
- La auditoría no muestra la hora de cada voto, solo el total contado.
- Menores anotados: los cargos vencidos siguen vigentes «en funciones» hasta el relevo (es lo diseñado); el coordinador no necesita ser miembro del grupo para moderar; la web no se verificó en un navegador real.
- Sigue 3C-2: revocación, renuncia, vacantes, mesa incompleta, reactivación de cuentas, página de observadores, elecciones en «Desde tu última visita» y moderación posterior de fichas.

---

## Decisiones pendientes

| ID | Pregunta | Prioridad |
|---|---|---|
| ADR-014 | ¿Implementar commit-reveal para sortition (participantes aportan entropía)? | Media — Iteración 9 |
| ADR-015 | ¿Dominio de producción definitivo? Requerido para configurar TLS, CORS y COOKIE_DOMAIN | Alta — antes del primer deploy |
