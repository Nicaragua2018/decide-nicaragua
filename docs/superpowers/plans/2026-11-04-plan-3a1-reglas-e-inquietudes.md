# Plan 3A-1 — Reglas en dos niveles e inquietudes con agenda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquier miembro plantee inquietudes en sus comunidades y los demás las apoyen. Que, al llegar al umbral, quien organiza la agenda tenga un plazo para abrir un debate (con una o varias inquietudes) o responder en público, y que si no responde el debate se abra solo. Que existan las reglas en dos niveles (colmena y locales), con valores por defecto, límites y una página «Reglas».

**Architecture:**
- Módulo nuevo `rules`: definiciones fijas en `@decide/shared` y tabla `rule_values` para los valores que la comunidad cambie más adelante (3A-3 agrega el cambio por votación).
- Módulo nuevo `inquietudes`: inquietudes, apoyos, umbral, plazo, agenda y un temporizador horario que abre los debates vencidos.
- Los debates se crean en el foro por defecto con el `DeliberationService` existente. El permiso «organizar la agenda» es `ForumsService.canOrganize`, que hoy equivale a `canModerate`; en 3C se le suman los coordinadores.
- La moderación del plan 2 se extiende al tipo `inquietud`.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, vitest 3, Next.js 15, pnpm 9 + Turborepo. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-04-plan-3a-ciclo-comunitario-design.md` (§2, §3, §8, §9, §10). Este plan cubre §3 y la parte de lectura de §8; el cambio de reglas por votación va en 3A-3, el debate con frases en 3A-2 y la votación de soluciones, bifurcaciones y comisiones en 3A-3.

## Global Constraints

- Solo los miembros del grupo plantean, apoyan o ven inquietudes. Las membresías existen solo para `verified_citizen` (plan 1).
- Nunca se devuelve **quién** apoyó una inquietud. Solo `supportCount` y `supportedByMe`.
- Inquietud: título de 10–140 caracteres, explicación de hasta 2000. Respuesta pública de 50–2000.
- Umbral: `max(inquietud.apoyo_minimo_personas, ⌈inquietud.apoyo_minimo_porcentaje % × miembros del grupo⌉)`, con los valores locales vigentes (por defecto 3 y 10).
- Plazo: `inquietud.plazo_respuesta_dias` (7 por defecto, límite de colmena 1–30). Empieza al cruzar el umbral por primera vez y no se reinicia.
- Estados: `abierta` → `en_plazo` → `en_debate` | `respondida` | `abierta_por_la_comunidad`. Una inquietud `respondida` sigue aceptando apoyos pero no vuelve a entrar en plazo.
- Etiqueta del debate abierto solo: «Abierto por la comunidad: no hubo respuesta en el plazo».
- Organizar la agenda (abrir debate, juntar, responder): `ForumsService.canOrganize(profileId, groupId)`, igual a `canModerate` hasta 3C.
- Una inquietud oculta no suma apoyos, no entra en plazo, no se abre sola y su texto no sale por ningún camino (regla del plan 2).
- Auditoría de toda acción nueva, con solo ids y estados en `metadata`; nunca títulos ni textos.
- Mensajes en español. Textos con tildes escritos solo con las herramientas Edit/Write y verificados en UTF-8 estricto.
- Commits con la línea final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Apoyos manipulados: apoyar dos veces, apoyar una inquietud oculta, apoyar sin ser miembro, o apoyarla después de que fue suspendida la cuenta.
2. Revelar quién apoyó, por la lista, el detalle, la auditoría o la agenda.
3. El temporizador y una acción manual abriendo la misma inquietud a la vez y creando **dos** debates.
4. Juntar inquietudes de comunidades distintas en un solo debate, o juntar una ya en debate o respondida.
5. Umbral en comunidades grandes o vacías: la comunidad general con muchos miembros, o un grupo cuyo número de miembros baja después de cruzar el umbral (el plazo sigue).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `apps/api/prisma/schema.prisma` + migración `inquietudes_y_reglas` | `RuleValue`, `Inquietud`, `InquietudApoyo`, enum `InquietudStatus`, `ModerationTarget.inquietud`, `Proposal.abiertoPorComunidad` |
| `packages/shared/src/constants/rules.ts` (nuevo) | `RULE_DEFINITIONS`, tipos de regla |
| `packages/shared/src/types/inquietud.types.ts` (nuevo) | Tipos de inquietudes y agenda |
| `apps/api/src/rules/*` (nuevo) | `RulesService` (leer valores) y `RulesController` |
| `apps/api/src/inquietudes/*` (nuevo) | Servicio, controlador, DTOs y temporizador |
| `apps/api/src/deliberation/deliberation.service.ts` | `createTopicInDefaultForum` público; detalle con `abiertoPorComunidad` e inquietudes de origen |
| `apps/api/src/forums/forums.service.ts` | `canOrganize`; moderación de `inquietud` |
| `apps/web/...` | «Inquietudes», agenda, «Reglas», etiqueta en el tema, menú |

---

### Task 1: Base de datos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261104120000_inquietudes_y_reglas/migration.sql`

**Interfaces:**
- Produces:
  - `RuleValue { id, key String @db.VarChar(80), groupId String? (FK groups, onDelete Cascade), value String @db.VarChar(40), updatedAt }`, `@@map("rule_values")`; la unicidad va en SQL con dos índices parciales: `(key) WHERE "groupId" IS NULL` y `(key, "groupId") WHERE "groupId" IS NOT NULL`.
  - `enum InquietudStatus { abierta en_plazo en_debate respondida abierta_por_la_comunidad }`.
  - `Inquietud { id, groupId (FK, Cascade), authorProfileId (FK Profile), title VarChar(140), body VarChar(2000), status InquietudStatus @default(abierta), hidden Boolean @default(false), thresholdReachedAt DateTime?, deadlineAt DateTime?, response VarChar(2000)?, respondedByProfileId String?, respondedAt DateTime?, proposalId String? (FK Proposal, onDelete SetNull), createdAt, updatedAt }`, `@@index([groupId, status])`, `@@index([status, deadlineAt])`, `@@map("inquietudes")`.
  - `InquietudApoyo { id, inquietudId (FK Cascade), profileId (FK Profile, Cascade), createdAt }`, `@@unique([inquietudId, profileId])`, `@@map("inquietud_apoyos")`.
  - `ModerationTarget` suma el valor `inquietud`.
  - `Proposal.abiertoPorComunidad Boolean @default(false)` y la relación inversa `Proposal.inquietudes Inquietud[]`.
  - Las relaciones inversas que Prisma exija en `Group` y `Profile`.

- [ ] **Step 1: Esquema.** Agregar lo de Interfaces a `schema.prisma`.
- [ ] **Step 2: Generar el SQL sin TTY.** Run: `cd apps/api && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261104120000_inquietudes_y_reglas/migration.sql`. Para leer `DATABASE_URL` de `apps/api/.env` sin imprimirlo: `set -a; . ./.env; set +a`. Expected: solo `CREATE TYPE`/`ALTER TYPE`/`CREATE TABLE`/`ALTER TABLE` de lo nuevo, nada de `newsletter_subscriptions`.
- [ ] **Step 3: Índices parciales.** Agregar al final del archivo, a mano:

```sql
CREATE UNIQUE INDEX "rule_values_colmena_key" ON "rule_values" ("key") WHERE "groupId" IS NULL;
CREATE UNIQUE INDEX "rule_values_local_key" ON "rule_values" ("key", "groupId") WHERE "groupId" IS NOT NULL;
```

- [ ] **Step 4: Aplicar y verificar.** Run: `cd apps/api && npx prisma migrate deploy && npx prisma migrate status && npx prisma generate && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: `Database schema is up to date!` y 283 pruebas pasan.
- [ ] **Step 5: Commit** «Base de datos: reglas e inquietudes».

---

### Task 2: Tipos compartidos y definiciones de reglas

**Files:**
- Create: `packages/shared/src/constants/rules.ts`, `packages/shared/src/types/inquietud.types.ts`
- Modify: `packages/shared/src/constants/index.ts`, `packages/shared/src/index.ts`, `packages/shared/src/types/deliberation.types.ts`, `packages/shared/src/types/forum.types.ts`
- Test: `apps/api/src/rules/rule-definitions.spec.ts`

**Interfaces:**
- Produces:
  - `type RuleLevel = 'colmena' | 'local'`.
  - `interface RuleDefinition { key: string; level: RuleLevel; label: string; type: 'int' | 'choice'; default: string; min?: number; max?: number; options?: string[]; unit?: 'personas' | 'porcentaje' | 'dias' | 'meses' }`.
  - `RULE_DEFINITIONS: readonly RuleDefinition[]` y `ruleDefinition(key: string): RuleDefinition` (lanza un error si la clave no existe).
  - `interface RuleView { key; level; label; type; unit?; value: string; default: string; min?: number; max?: number; options?: string[]; isDefault: boolean }`.
  - `InquietudStatusValue = 'abierta' | 'en_plazo' | 'en_debate' | 'respondida' | 'abierta_por_la_comunidad'`.
  - `InquietudSummary { id; groupId; title; status; hidden; supportCount; supportedByMe; threshold; deadlineAt: string | null; proposalId: string | null; authorDisplayName; createdAt }`.
  - `InquietudDetail extends InquietudSummary { body; response: string | null; respondedAt: string | null; canOrganize: boolean; isAuthor: boolean; hiddenReason: string | null; moderationId: string | null }`.
  - `ProposalDetail` suma `abiertoPorComunidad: boolean` y `inquietudes: { id: string; title: string }[]`.
  - `ModerationAppeal.target` y `ModerateDto` aceptan `'inquietud'`.

Valores de `RULE_DEFINITIONS` (clave, nivel, defecto, límites, unidad), copiados del spec:

| key | nivel | defecto | min–max | unidad |
|---|---|---|---|---|
| `inquietud.apoyo_minimo_personas` | local | 3 | 2–50 | personas |
| `inquietud.apoyo_minimo_porcentaje` | local | 10 | 1–50 | porcentaje |
| `inquietud.plazo_respuesta_dias` | local | 7 | 1–30 | dias |
| `debate.plazo_dias` | local | 7 | 3–60 | dias |
| `debate.plazo_objecion_modo_dias` | local | 3 | 1–14 | dias |
| `debate.fraccion_objecion_modo` | local | 33 | 10–50 | porcentaje |
| `debate.minimo_para_grupos` | local | 7 | 5–50 | personas |
| `votacion.plazo_dias` | local | 7 | 3–30 | dias |
| `votacion.quorum_porcentaje` | local | 20 | 10–100 | porcentaje |
| `bifurcacion.plazo_dias` | local | 14 | 7–60 | dias |
| `bifurcacion.minimo_personas` | local | 7 | 3–100 | personas |
| `comision.puestos_min` | local | 3 | 1–20 | personas |
| `comision.puestos_max` | local | 7 | 1–50 | personas |
| `comision.plazo_convocatoria_dias` | local | 7 | 3–30 | dias |
| `comision.informe_cada_dias` | local | 30 | 7–90 | dias |
| `comision.forma` | local (choice) | `sorteo` | opciones `sorteo`, `preferencias` | — |
| `reglas.participacion_minima` | colmena | 30 | 10–100 | porcentaje |
| `observadores.numero` | colmena | 7 | 3–15 | personas |
| `comunidad.minimo_activacion` | colmena | 7 | 3–50 | personas |
| `eleccion.minimo_primera` | colmena | 12 | 5–100 | personas |
| `invitaciones.pendientes_max` | colmena | 5 | 1–20 | personas |
| `revocacion.fraccion` | colmena | 33 | 10–50 | porcentaje |
| `cargos.periodo_mesa_meses` | colmena | 12 | 6–24 | meses |
| `cargos.periodo_coordinadores_meses` | colmena | 6 | 3–12 | meses |
| `eleccion.plazo_candidaturas_dias` | colmena | 7 | 3–30 | dias |
| `eleccion.plazo_votacion_dias` | colmena | 7 | 3–30 | dias |

Las etiquetas (`label`) son frases cortas en español, por ejemplo «Apoyo mínimo para que una inquietud pida respuesta (personas)». Las reglas de colmena todavía no las lee ningún código: solo se muestran. 3C las conecta.

- [ ] **Step 1: Prueba que falla.** En `rule-definitions.spec.ts`:
  - `it('cada regla tiene un valor por defecto dentro de sus límites')`;
  - `it('las claves son únicas')`;
  - `it('ruleDefinition lanza error con una clave desconocida')`;
  - `it('comision.forma es choice con sorteo por defecto')`.
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/rules`. Expected: FAIL (no existe el módulo).
- [ ] **Step 3:** Escribir los archivos de Interfaces y exportarlos. Agregar los campos nuevos de `ProposalDetail` con valores neutros (`abiertoPorComunidad: proposal.abiertoPorComunidad`, `inquietudes: []`) en `deliberation.service.ts`, para que compile.
- [ ] **Step 4:** Run: `pnpm --filter @decide/shared build && cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** «Tipos de inquietudes y definiciones de reglas».

---

### Task 3: Servicio de reglas

**Files:**
- Create: `apps/api/src/rules/rules.service.ts`, `rules.controller.ts`, `rules.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/forums/public.controller.ts`
- Test: `apps/api/src/rules/rules.service.spec.ts`

**Interfaces:**
- Consumes: `RULE_DEFINITIONS`, `ruleDefinition`, `RuleView` (Task 2); `RuleValue` (Task 1).
- Produces:
  - `RulesService.getInt(key: string, groupId: string | null): Promise<number>`: valor local si existe (solo para reglas `local` con `groupId`), si no el valor de colmena guardado, si no el defecto. Lanza un error si la regla no es `int`.
  - `RulesService.getChoice(key: string, groupId: string | null): Promise<string>`: igual, para `choice`.
  - `RulesService.list(groupId: string | null): Promise<RuleView[]>`: todas las de colmena y, si hay `groupId`, también las locales con su valor efectivo.
  - `GET /api/rules?groupId=<uuid>`: con sesión; si viene `groupId`, exige membresía.
  - `GET /api/public/reglas`: sin sesión, solo las de colmena.
  - `RulesModule` exporta `RulesService`.

- [ ] **Step 1: Pruebas que fallan:**
  - `getInt('inquietud.plazo_respuesta_dias', 'g1')` devuelve 7 sin filas guardadas;
  - con una fila local `'10'` devuelve 10;
  - para una regla `colmena` ignora una fila local con el mismo key;
  - un valor guardado fuera de límites devuelve el defecto (defensa);
  - `list(null)` no incluye reglas locales;
  - `list('g1')` marca `isDefault: false` en la que tiene fila;
  - `getInt` sobre `comision.forma` lanza un error.
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/rules`. Expected: FAIL.
- [ ] **Step 3: Implementar** las firmas de Interfaces. El controlador usa `JwtAuthGuard`, como `forums.controller.ts`, y la membresía con `prisma.groupMembership.findUnique`. La ruta pública va en el `PublicController` existente; inyectar `RulesService` e importar `RulesModule` en `ForumsModule`.
- [ ] **Step 4:** Run: `cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** «Reglas en dos niveles: lectura y página pública».

---

### Task 4: Inquietudes y apoyos

**Files:**
- Create: `apps/api/src/inquietudes/inquietudes.service.ts`, `inquietudes.controller.ts`, `inquietudes.module.ts`, `dto/create-inquietud.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/inquietudes/inquietudes.service.spec.ts`

**Interfaces:**
- Consumes: `RulesService.getInt`; `AuditService.log`; tipos de Task 2.
- Produces:
  - `InquietudesService.create(profileId, { groupId, title, body }, ip): Promise<{ id: string }>`: exige membresía.
  - `InquietudesService.list(profileId, groupId): Promise<InquietudSummary[]>`: exige membresía; ordena por `supportCount` desc y luego `createdAt` asc.
  - `InquietudesService.get(profileId, id): Promise<InquietudDetail>`.
  - `InquietudesService.support(profileId, id, ip): Promise<void>` y `unsupport(profileId, id, ip): Promise<void>`.
  - `InquietudesService.threshold(groupId): Promise<number>`, la fórmula de Global Constraints.
  - `InquietudesService.evaluateThreshold(id): Promise<void>`: si está `abierta`, no oculta y `apoyos >= threshold`, pasa a `en_plazo` con `thresholdReachedAt = now` y `deadlineAt = now + plazo_respuesta_dias`. Usa `updateMany` condicionado a `status: 'abierta'`. Es idempotente.
  - Endpoints con `JwtAuthGuard`: `POST /api/inquietudes`, `GET /api/inquietudes?groupId=`, `GET /api/inquietudes/:id`, `POST /api/inquietudes/:id/apoyo`, `DELETE /api/inquietudes/:id/apoyo`. `ParseUUIDPipe` en los ids.
  - `canOrganize` en el detalle viene de `ForumsService.canOrganize` (Task 5). En esta tarea es `false` provisional.

- [ ] **Step 1: Pruebas que fallan:**
  - un no miembro no crea ni lista (`ForbiddenException`);
  - el título de 9 caracteres lo rechaza el DTO (prueba de validación con `class-validator`, como en otras specs si existen; si no, en el servicio);
  - `support` dos veces deja un solo apoyo: el segundo llamado es idempotente y no lanza error;
  - `support` sobre una oculta → `BadRequestException('Esta inquietud está oculta por moderación.')`;
  - `unsupport` sin apoyo previo no lanza error;
  - `threshold` con 5 miembros = 3, con 100 = 10 y con 101 = 11;
  - al llegar al umbral pasa a `en_plazo` con `deadlineAt` a 7 días (±1 s);
  - `evaluateThreshold` sobre una `respondida` no la mueve;
  - la lista y el detalle **no** contienen ids de perfiles de quienes apoyaron (`JSON.stringify` sin el id del perfil que apoyó);
  - el detalle de una oculta tiene `title: 'Inquietud oculta por moderación'`, `body: ''` y `hiddenReason`, como en el plan 2.
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/inquietudes`. Expected: FAIL.
- [ ] **Step 3: Implementar.** `support` y `unsupport` usan `upsert`/`deleteMany` y después `evaluateThreshold`. Auditoría: `inquietud.created`, `inquietud.supported`, `inquietud.unsupported` y `inquietud.threshold_reached`, con metadata `{ groupId }` o `{ inquietudId }`. Para `supported`/`unsupported` el registro **no** lleva `actorId`, porque si no, el registro revelaría quién apoyó.
- [ ] **Step 4:** Run: `cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** «Inquietudes: plantear, apoyar y umbral con plazo».

---

### Task 5: Agenda: abrir debate, juntar, responder y apertura automática

**Files:**
- Create: `apps/api/src/inquietudes/dto/open-debate.dto.ts`, `dto/respond.dto.ts`, `apps/api/src/inquietudes/inquietudes.scheduler.ts`
- Modify: `apps/api/src/inquietudes/inquietudes.service.ts`, `inquietudes.controller.ts`, `inquietudes.module.ts`; `apps/api/src/forums/forums.service.ts`; `apps/api/src/deliberation/deliberation.service.ts`
- Test: `apps/api/src/inquietudes/inquietudes.service.spec.ts`, `apps/api/src/deliberation/deliberation.service.spec.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `ForumsService.canOrganize(profileId: string, groupId: string): Promise<boolean>`, que devuelve `canModerate`.
  - `DeliberationService.createTopicInDefaultForum(tx: Prisma.TransactionClient, { groupId, authorProfileId, title, body, abiertoPorComunidad }): Promise<{ id: string }>`: usa el foro por defecto (y lo crea si falta, con el manejo de P2002 existente). Crea el tema con `kind: 'tema'` y `status: 'open'`.
  - `InquietudesService.openDebate(profileId, { groupId, inquietudIds: string[] (1–10), title, body }, ip): Promise<{ proposalId: string }>`:
    - exige `canOrganize`;
    - todas las inquietudes deben ser del mismo `groupId`, no ocultas y estar en `abierta` o `en_plazo`;
    - en una transacción crea el tema (autor: quien organiza) y pasa cada inquietud a `en_debate` con `proposalId`, con un `updateMany` condicionado a esos estados;
    - si el conteo no coincide → `ConflictException('Alguna inquietud ya cambió de estado.')`.
  - `InquietudesService.respond(profileId, id, text, ip)`: exige `canOrganize`; la inquietud debe estar `abierta` o `en_plazo` y no oculta; pasa a `respondida` con `response`, `respondedAt` y `respondedByProfileId`.
  - `InquietudesService.processDeadlines(now: Date): Promise<number>`:
    - toma las de `en_plazo` con `deadlineAt <= now` y no ocultas;
    - por cada una, en una transacción, cambia el estado a `abierta_por_la_comunidad` con un `updateMany` condicionado a `status: 'en_plazo'`; solo si el conteo es 1 crea el tema con `abiertoPorComunidad: true`, autor = autor de la inquietud, y el título y la explicación de la inquietud;
    - devuelve cuántas abrió.
  - `InquietudesService.agenda(profileId): Promise<InquietudSummary[]>`: las `en_plazo` (y las `abierta` con apoyo) de los grupos donde `canOrganize` es verdadero, ordenadas por `deadlineAt` asc. Con la regla actual, la mesa ve todas las comunidades.
  - Endpoints: `POST /api/inquietudes/debates`, `POST /api/inquietudes/:id/respuesta`, `GET /api/inquietudes/agenda`. Declarar `agenda` y `debates` **antes** de `:id`.
  - `InquietudesScheduler` (`OnApplicationBootstrap`/`OnModuleDestroy`): `setInterval` de 1 hora que llama a `processDeadlines(new Date())`, más una llamada al arrancar. No se activa si `NODE_ENV === 'test'`. Atrapa y registra los errores con `Logger` sin texto de las inquietudes.
  - `getProposalById` llena `inquietudes` con `{ id, title }` de las no ocultas vinculadas (si el tema está oculto, `[]`, siguiendo el redactor del plan 2).
  - `InquietudDetail.canOrganize` real.

- [ ] **Step 1: Pruebas que fallan:**
  - un miembro común no abre debate ni responde (`ForbiddenException`);
  - juntar inquietudes de dos grupos → `BadRequestException('Todas las inquietudes deben ser de la misma comunidad.')`;
  - juntar una `respondida` → `BadRequestException`;
  - el conteo de `updateMany` menor que el pedido → `ConflictException`, sin crear tema (el `create` corre dentro de la transacción simulada; verificar que la transacción lanza);
  - `respond` con 49 caracteres lo rechaza el DTO; con 50 pasa;
  - `processDeadlines` abre solo las vencidas y no las ocultas, y si `updateMany` devuelve 0 (otra instancia ya la abrió) **no** crea tema;
  - el tema automático tiene `abiertoPorComunidad: true` y el título de la inquietud;
  - el detalle del tema lista sus inquietudes de origen;
  - `createTopicInDefaultForum` usa el foro por defecto existente (en `deliberation.service.spec.ts`).
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/inquietudes src/deliberation`. Expected: FAIL.
- [ ] **Step 3: Implementar.** Auditoría: `inquietud.debate_opened` `{ proposalId, count }`, `inquietud.responded` `{ inquietudId }` y `inquietud.opened_by_community` `{ inquietudId, proposalId }`. Para evitar ciclos, `InquietudesModule` importa `ForumsModule`, `DeliberationModule`, `RulesModule` y `AuditModule`; `DeliberationModule` exporta `DeliberationService`.
- [ ] **Step 4:** Run: `cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** «Agenda: abrir debates, juntar, responder y apertura automática».

---

### Task 6: Moderación de inquietudes

**Files:**
- Modify: `apps/api/src/forums/forums.service.ts`, `apps/api/src/forums/dto/moderate.dto.ts`, `apps/api/src/inquietudes/inquietudes.service.ts`
- Test: `apps/api/src/forums/forums.service.spec.ts`

**Interfaces:**
- Consumes: el `hide`/`appeal`/`listAppeals`/`resolveAppeal` del plan 2; Task 4.
- Produces:
  - `ModerateDto.target` acepta `'inquietud'`;
  - `hide` resuelve el `groupId` de la inquietud, exige `canModerate`, la marca `hidden: true` en la transacción y registra la `ModerationAction`;
  - `appeal`: el autor de la inquietud, que siga siendo miembro;
  - `resolveAppeal(restore)`: la vuelve visible y llama a `InquietudesService.evaluateThreshold` después de la transacción;
  - `textOf('inquietud')`: título + explicación, solo para la cola de la mesa;
  - el detalle de la inquietud da `moderationId` solo al autor, mientras la acción esté `oculto` (misma regla del plan 2).

- [ ] **Step 1: Pruebas que fallan:**
  - ocultar una inquietud la marca oculta y registra el motivo;
  - ocultar dos veces → `ConflictException('Este contenido ya está oculto.')`;
  - un no autor no apela;
  - restaurar la deja visible;
  - una inquietud oculta en `en_plazo` no la abre `processDeadlines` (ya cubierto en Task 5, verificar que sigue).
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/forums src/inquietudes`. Expected: FAIL.
- [ ] **Step 3: Implementar.** Para evitar el ciclo `ForumsModule` ↔ `InquietudesModule`, `resolveAppeal` no llama a `InquietudesService`: tras restaurar una inquietud, deja su estado y su umbral para el siguiente `evaluateThreshold`. Agregar una llamada a `evaluateThreshold` dentro de `InquietudesService.get` y `list` (barata y idempotente).
- [ ] **Step 4:** Run: `cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** «Moderación de inquietudes».

---

### Task 7: Web

**Files:**
- Create: `apps/web/app/(app)/inquietudes/page.tsx`, `inquietudes/NewInquietudForm.tsx`, `inquietudes/SupportButton.tsx`, `inquietudes/[id]/page.tsx`, `inquietudes/[id]/OrganizerActions.tsx`, `inquietudes/agenda/page.tsx`, `inquietudes/agenda/OpenDebateForm.tsx`, `apps/web/app/(app)/reglas/page.tsx`
- Modify: `apps/web/lib/actions.ts`, `apps/web/components/NavBar.tsx`, `apps/web/app/(app)/proposals/[id]/page.tsx`

**Interfaces:**
- Consumes: endpoints de las Tasks 3–6.
- Produces:
  - Server actions `createInquietud`, `supportInquietud(id)`, `unsupportInquietud(id)`, `openDebate` (formulario con `inquietudIds[]`), `respondInquietud`, `appealModeration` (ya existe), `hideContent` con `target='inquietud'`.
  - **«Inquietudes»** (`/inquietudes?groupId=`): selector de mis comunidades (de `GET /api/forums` o `GET /api/groups/mine`, el que ya exista); lista con título, estado, «N apoyos de M necesarios», plazo si está `en_plazo`, botón Apoyar/Quitar apoyo y formulario para plantear una inquietud. Subtítulo: «Plantea lo que preocupa a tu comunidad. Cuando una inquietud reúne suficiente apoyo, quien organiza la agenda debe abrir un debate o responder en público.»
  - **Detalle** (`/inquietudes/[id]`): texto, estado, respuesta pública si la hay, enlace «Ver el debate» si tiene `proposalId`, aviso de oculta con apelación (`AppealForm` existente), y `OrganizerActions` si `canOrganize` (Responder y Ocultar).
  - **Agenda** (`/inquietudes/agenda`): solo si `GET /api/inquietudes/agenda` responde 200. Lista ordenada por plazo, con casillas para elegir una o varias inquietudes de la **misma** comunidad y `OpenDebateForm` (título y planteamiento del debate).
  - **Reglas** (`/reglas`): tabla de las reglas de colmena y, por cada una de mis comunidades, sus reglas locales, con el valor, «por defecto» o «ajustada», los límites y la unidad. Texto: «Las reglas las decide la comunidad. Pronto podrás proponer cambios desde aquí.»
  - En el tema (`proposals/[id]`): la etiqueta «Abierto por la comunidad: no hubo respuesta en el plazo» si `abiertoPorComunidad`, y el bloque «Nace de estas inquietudes» con enlaces.
  - **NavBar:** «Inquietudes» (para `verified_citizen`) después de «Foros», y «Reglas».

- [ ] **Step 1: Implementar** las pantallas con los componentes y clases existentes (como `foros/` y `admin/mesa/`). Fechas formateadas en el servidor para evitar diferencias de hora.
- [ ] **Step 2: Verificar.** Run: `pnpm --filter @decide/shared build && cd apps/web && npx tsc --noEmit`. Expected: sin errores. UTF-8 estricto en todos los archivos tocados. No subir `apps/web/next-env.d.ts`.
- [ ] **Step 3: Commit** «Web: inquietudes, agenda y reglas».

---

### Task 8: Documentación

**Files:** `docs/DECISIONS.md` (ADR-018), `docs/ROADMAP.md`

- [ ] **Step 1:** ADR-018 «Ciclo de la comunidad: inquietudes, agenda y reglas en dos niveles» (2026-11-04), con contexto, decisión y consecuencias, resumiendo:
  - la garantía de respuesta y la apertura automática;
  - `canOrganize` = mesa hasta 3C;
  - las reglas de colmena y locales, con límites;
  - el cambio de reglas por votación en 3A-3;
  - el agente en 3B;
  - que el registro no guarda quién apoyó.
- [ ] **Step 2:** ROADMAP: sección «Primeros 200 — Plan 3A-1 (reglas e inquietudes): COMPLETO».
- [ ] **Step 3: Commit** «Docs: ADR-018 sobre inquietudes y reglas».

---

## Próximas entregas de 3A

- **3A-2:** debate con frases al estilo Pol.is (frases, votos sin ver resultados, grupos de opinión, frases puente y frases que dividen).
- **3A-3:** votación de soluciones (Apruebo / No apruebo / Me abstengo; ordenar solo las aceptadas), modo excluyente o compatible con objeción, quórum, bifurcaciones, comisiones, cambio de reglas por votación y reemplazo de la votación del plan 2.
