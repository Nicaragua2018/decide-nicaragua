# Plan 3A-3 — Soluciones, papeleta y resultado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que de cada debate salgan soluciones propuestas por los miembros y que la comunidad las vote con la papeleta que decidió Carlos. Con una sola solución se vota «Apruebo / No apruebo / Me abstengo». Con varias, cada persona ordena solo las que acepta, o elige «Rechazo todas» o «Me abstengo». El resultado se calcula solo al vencer el plazo y queda público, con sus cifras y matrices.

**Architecture:**
- Tablas `soluciones`, `decisiones`, `decision_papeletas` y `objeciones_modo`.
- Un módulo puro, `decision-tally.ts`, calcula quórum, aprobación y ganadoras. Reutiliza `runSchulze` del módulo de votación.
- El nuevo `DecisionesModule` expone soluciones, modo y objeción, y papeleta. Un programador horario mueve las fases: debate → modo → objeción → votación → contada.
- La propuesta formal del plan 2 pasa a este flujo y se retira «Abrir votación». Las votaciones del plan 2 que ya existan siguen contándose como antes.
- La moderación se extiende al tipo `solucion`. La web suma la sección «Soluciones y decisión» en la página del tema.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, vitest 3, Next.js 15. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-04-plan-3a-ciclo-comunitario-design.md` (§5, §9 y §10). Entregas anteriores: ADR-017 (foros), ADR-018 (inquietudes y reglas) y ADR-019 (frases).

**Alcance (decisión del controlador, 2026-11-05):** la antigua parte 3A-3 se divide en tres:
- **3A-3 (este plan):** soluciones, papeleta y resultado.
- **3A-4:** comisiones y bifurcaciones. Usan las papeletas guardadas aquí.
- **3A-5:** cambio de reglas por votación.

## Global Constraints

- Solo los miembros del grupo del tema ven soluciones y decisiones, proponen, objetan o votan. Un tema oculto no devuelve nada de esto, y su texto no sale por ningún camino (regla del plan 2).
- **Solución:** título de 10 a 140 caracteres y descripción de 1 a 2000, ambos recortados antes de validar. `origen` es `persona` o `asistente` (spec §9); en 3A siempre es `persona`.
  - Se propone o se junta solo mientras el tema esté `open`, no oculto y **sin fila en `decisiones`**. Esa es la fase de debate.
- **Plazos y reglas locales**, leídos con `RulesService.getInt(key, groupId)`:
  - `debate.plazo_dias`: fin del debate al «Llevar a decisión»;
  - `debate.plazo_objecion_modo_dias`;
  - `debate.fraccion_objecion_modo`: porcentaje entero, 33 por defecto;
  - `votacion.plazo_dias`;
  - `votacion.quorum_porcentaje`.
- **Fases** (`DecisionFase`): `modo` → `objecion` → `votacion` → `contada`, o `cancelada`. Cada cambio de fase usa un `updateMany` condicionado a la fase anterior, dentro de una transacción, para que nunca ocurra dos veces.
- **Papeleta:** `{ abstencion: boolean, orden: string[] }`.
  - `orden` no repite ids y solo contiene ids de `decisiones.candidatas`.
  - Con `abstencion: true`, `orden` debe ir vacío.
  - «Rechazo todas» y «No apruebo» se guardan como `abstencion: false` con `orden: []`. «Apruebo» se guarda como `orden: [id]`.
  - Una papeleta por persona y decisión. Se puede cambiar mientras `fase = 'votacion'` y `now < votacionEndsAt`.
- **Conteo:**
  - solo cuentan las papeletas y los miembros **actuales** del grupo (la suspensión quita la membresía);
  - el resultado se calcula **una sola vez** y se congela en la fila de `decisiones`;
  - antes del conteo no se muestra ninguna cifra de papeletas ni de objeciones.
- **Privacidad:** nunca se devuelve la papeleta ni la objeción de otra persona. Votar y objetar **no** se auditan (mismo criterio que los apoyos y los votos de frases, ADR-018/019). Sí se auditan, sin texto ni nombres en `metadata`:
  - `solucion.created`
  - `solucion.merged`
  - `decision.mode_proposed`
  - `decision.vote_opened`
  - `decision.counted`
  - `decision.cancelled`
- Mensajes en español. Textos con tildes escritos solo con las herramientas Edit/Write y verificados en UTF-8 estricto. Commits con la línea final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No se hace commit de `apps/web/next-env.d.ts` ni de `.superpowers/`.

## Review Focus

1. **Persona suspendida o que dejó la comunidad antes del conteo:** su papeleta no cuenta y tampoco entra en el denominador del quórum.
2. **Tema ocultado durante la objeción o la votación:** la decisión pasa a `cancelada` y nunca se cuenta. Al restaurar el tema, la decisión no se reabre.
3. **Papeleta manipulada:** ids de otro tema, ids de soluciones juntadas o creadas después de abrir la votación, ids duplicados, o `abstencion` con `orden` no vacío. Todo eso da 400 y no guarda nada.
4. **El programador corre dos veces a la vez:** cada transición y el conteo ocurren una sola vez.
5. **Debate que termina sin soluciones visibles:** la decisión queda `contada` con resultado `sin_soluciones`, sin colgarse. Una solución ocultada después del conteo aparece como «Solución oculta por moderación» en el resultado y en `GET /api/public/consensos`.

---

### Task 1: Base de datos y tipos compartidos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261106120000_soluciones_y_papeleta/migration.sql`
- Create: `packages/shared/src/types/decision.types.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/types/forum.types.ts`

**Interfaces:**
- Produces (Prisma):
  - `enum Origen { persona asistente }`
  - `enum DecisionFase { modo objecion votacion contada cancelada }`
  - `enum DecisionModo { excluyentes compatibles }`
  - `enum DecisionResultado { aprobada ninguna empate sin_quorum sin_soluciones }`
  - `solucion` se agrega a `ModerationTarget`.
- Produces (modelos Prisma):
  - `Solucion` (`soluciones`): `id`; `proposalId` (cascade); `authorProfileId` (relación con `Profile`); `title VarChar(140)`; `description VarChar(2000)`; `origen Origen @default(persona)`; `hidden Boolean @default(false)`; `mergedIntoId String? @db.Uuid` (columna simple); `createdAt`; `@@index([proposalId])`.
  - `Decision` (`decisiones`):
    - `id`; `proposalId @unique` (cascade); `fase DecisionFase`; `modo DecisionModo?`; `modoPropuesto DecisionModo?`;
    - `objecionEndsAt?`; `votacionStartsAt?`; `votacionEndsAt?`;
    - `candidatas String[] @db.Uuid` (orden congelado al abrir la votación);
    - `resultado DecisionResultado?`; `ganadoras String[] @db.Uuid`; `aprobaciones Int[]` (por índice de `candidatas`);
    - `pairwiseMatrix Json?`; `schulzeMatrix Json?`; `papeletasTotal Int?`; `abstenciones Int?`; `miembros Int?`;
    - `contadaAt?`; `createdAt`; `updatedAt`; `@@index([fase])`.
  - `DecisionPapeleta` (`decision_papeletas`): `id`; `decisionId` (cascade); `profileId` (relación con `Profile`, cascade); `abstencion Boolean`; `orden String[] @db.Uuid`; `updatedAt`; `@@unique([decisionId, profileId])`.
  - `ObjecionModo` (`objeciones_modo`): `id`; `decisionId` (cascade); `profileId` (cascade); `createdAt`; `@@unique([decisionId, profileId])`.
  - Las relaciones inversas van en `Proposal` (`soluciones Solucion[]`, `decision Decision?`) y en `Profile`.
- Produces (`@decide/shared`, `decision.types.ts`):
  ```ts
  export type DecisionFaseValue = 'modo' | 'objecion' | 'votacion' | 'contada' | 'cancelada';
  export type DecisionModoValue = 'excluyentes' | 'compatibles';
  export type DecisionResultadoValue = 'aprobada' | 'ninguna' | 'empate' | 'sin_quorum' | 'sin_soluciones';
  export interface SolucionItem {
    id: string; title: string; description: string; origen: 'persona' | 'asistente';
    hidden: boolean; mergedIntoTitle: string | null; isAuthor: boolean; createdAt: string;
  }
  export interface PapeletaValue { abstencion: boolean; orden: string[] }
  export interface DecisionResultadoView {
    resultado: DecisionResultadoValue;
    ganadoras: string[];                              // ids de solución
    aprobaciones: { solucionId: string; incluyen: number }[];
    papeletasTotal: number; abstenciones: number; validas: number; miembros: number;
    pairwiseMatrix: number[][]; schulzeMatrix: number[][];
    contadaAt: string;
  }
  export interface DecisionView {
    fase: DecisionFaseValue;
    modo: DecisionModoValue | null; modoPropuesto: DecisionModoValue | null;
    objecionEndsAt: string | null; votacionEndsAt: string | null;
    candidatas: { id: string; title: string; description: string; hidden: boolean }[];
    miPapeleta: PapeletaValue | null;
    yoObjete: boolean; puedoObjetar: boolean;
    resultado: DecisionResultadoView | null;
  }
  export interface DecisionTemaResponse {
    debateEndsAt: string | null;           // = proposal.deliberationEndsAt
    puedeProponer: boolean;                 // fase de debate y miembro
    canOrganize: boolean;
    soluciones: SolucionItem[];
    decision: DecisionView | null;
  }
  ```
  A `PublicConsensus` se le agrega `approvedSolutions: string[]` (títulos). `ModerationAppeal['target']` suma `'solucion'`.

- [ ] **Step 1:** Edita `schema.prisma` con los enums y modelos de arriba, sin ejecutar `prisma format`.
- [ ] **Step 2:** Genera la migración. Carga `apps/api/.env` con `set -a; . ./.env; set +a`, sin imprimirlo. Ejecuta `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261106120000_soluciones_y_papeleta/migration.sql` y luego `npx prisma migrate deploy && npx prisma generate`. Expected: «All migrations have been successfully applied». Si la base no responde, arranca Docker Desktop y el contenedor `p200_pgproxy`.
- [ ] **Step 3:** Agrega los tipos compartidos y exporta `decision.types.js` desde `index.ts`. Suma `approvedSolutions: []` en `ForumsService.publicConsensus`, para que compile; el valor real llega en la Task 5.
- [ ] **Step 4:** Ejecuta `pnpm --filter @decide/shared build && pnpm --filter @decide/api typecheck && cd apps/api && npx vitest run`. Expected: todo en verde (416 pruebas).
- [ ] **Step 5:** Commit: `BD: soluciones, decisiones y papeletas`.

---

### Task 2: Cálculo puro del resultado

**Files:**
- Create: `apps/api/src/decisiones/decision-tally.ts`
- Test: `apps/api/src/decisiones/decision-tally.spec.ts`

**Interfaces:**
- Consumes: `runSchulze(ballots: BallotInput[], candidates: string[])` de `../voting/schulze`.
- Produces:
  ```ts
  export interface PapeletaInput { abstencion: boolean; orden: string[] }
  export interface TallyInput {
    candidatas: string[]; modo: 'excluyentes' | 'compatibles';
    papeletas: PapeletaInput[]; miembros: number; quorumPct: number;
  }
  export interface TallyOutput {
    resultado: 'aprobada' | 'ninguna' | 'empate' | 'sin_quorum';
    ganadoras: string[]; aprobaciones: number[];
    papeletasTotal: number; abstenciones: number; validas: number;
    pairwiseMatrix: number[][]; schulzeMatrix: number[][];
  }
  export function tallyDecision(input: TallyInput): TallyOutput;
  ```

**Algoritmo** (spec §5):
1. Calcula `papeletasTotal = papeletas.length` y `abstenciones = número con abstencion`. Las papeletas válidas son las que no son abstención.
2. `aprobaciones[i]` = número de papeletas válidas cuyo `orden` incluye `candidatas[i]`.
3. Schulze sobre las papeletas válidas: cada `orden` se convierte en `{candidateId, rank: índice+1}`. Las candidatas omitidas quedan empatadas al final, que es lo que ya hace `buildPairwiseMatrix`. Las matrices se calculan siempre, también sin quórum.
4. **Quórum:** hay quórum si `miembros > 0` y `papeletasTotal * 100 >= quorumPct * miembros`. Si no lo hay: `resultado = 'sin_quorum'` y `ganadoras = []`.
5. **Aprobada** quiere decir `validas > 0 && aprobaciones[i] * 2 > validas`.
6. **Compatibles:** las ganadoras son todas las aprobadas, en el orden de `candidatas`. Hay `'aprobada'` si existe al menos una; si no, `'ninguna'`.
7. **Excluyentes:** con `W` = ganadoras de Schulze y `A` = las de `W` que están aprobadas:
   - `A` vacío → `'ninguna'`;
   - `A` con un elemento → `'aprobada'` con ese elemento;
   - `A` con dos o más → `'empate'` sin ganadoras.
   - Un empate de Schulze entre una aprobada y una no aprobada lo gana la aprobada (Ruling R1).

- [ ] **Step 1:** Escribe `decision-tally.spec.ts` con estas pruebas, todas con `quorumPct: 20` salvo que se indique otra cosa:
  - `dejar fuera es rechazar`: candidatas `[a, b]`, compatibles, 3 papeletas `[a]`, `[a]`, `[b]` y 10 miembros. Da `aprobaciones = [2, 1]`, `ganadoras = [a]` y `'aprobada'`.
  - `la preferida no aprobada no gana`: excluyentes `[a, b]` con 5 papeletas `[a, b]`, `[a, b]`, `[b]`, `[]`, `[]`. Schulze prefiere `a` (2 contra 1), pero `a` está en 2 de 5 papeletas y no está aprobada; `b` está en 3 de 5 y sí lo está. Da `'ninguna'` y `ganadoras = []`.
  - `rechazo todas cuenta como válida`: `[a]` compatibles con papeletas `[a]`, `[]`, `[]`. Da `'ninguna'` y `validas = 3`.
  - `la abstención cuenta para el quórum pero no para aprobar`: `[a]` con 10 miembros y papeletas `[a]` y `{abstencion}`. Hay quórum (2 de 10 = 20 %), `validas = 1` y `'aprobada'`. Con 11 miembros da `'sin_quorum'`.
  - `compatibles aprueba varias`: `[a, b]` con `[a, b]`, `[b, a]`, `[a]`. Da `ganadoras = [a, b]`.
  - `excluyentes elige la preferida aprobada`: el mismo caso en excluyentes da `ganadoras = [a]`.
  - `empate entre aprobadas`: excluyentes `[a, b]` con `[a, b]`, `[b, a]`. Da `'empate'` y `ganadoras = []`.
  - `empate con una no aprobada lo gana la aprobada` (R1): excluyentes `[a, b]` con `[a]` y `[b, a]`. Schulze empata 1 contra 1, `a` está en 2 de 2 papeletas y `b` en 1 de 2. Da `'aprobada'` y `ganadoras = [a]`.
  - `sin miembros no hay quórum`: `miembros: 0` da `'sin_quorum'`.
  - `las matrices se publican también sin quórum`: `pairwiseMatrix` tiene tamaño n×n.
- [ ] **Step 2:** Ejecuta `cd apps/api && npx vitest run src/decisiones/decision-tally.spec.ts`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementa `tallyDecision` según el algoritmo.
- [ ] **Step 4:** Ejecuta la misma prueba. Expected: PASS.
- [ ] **Step 5:** Commit: `API: cálculo puro del resultado de soluciones`.

---

### Task 3: Soluciones, «Llevar a decisión» y moderación de soluciones

**Files:**
- Create: `apps/api/src/decisiones/decisiones.module.ts`, `decisiones.service.ts`, `decisiones.controller.ts`, `dto/create-solucion.dto.ts`, `dto/merge-solucion.dto.ts`
- Test: `apps/api/src/decisiones/decisiones.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/forums/forums.service.ts` (+ spec), `apps/api/src/forums/dto/moderate.dto.ts`

**Interfaces:**
- Consumes: `ForumsService.canOrganize(profileId, groupId)`, `RulesService.getInt`, `AuditService.log`.
- Produces (`DecisionesService`):
  - `createSolucion(profileId, proposalId, dto: { title; description }, ip): Promise<{ id: string }>`
  - `mergeSolucion(profileId, solucionId, intoId, ip): Promise<void>`
  - `getTema(profileId, proposalId): Promise<DecisionTemaResponse>`. En esta tarea `decision` sale de la fila si existe, pero sin `resultado` ni `miPapeleta` (llegan en la Task 5).
- Produces (HTTP, `@Controller('decisiones')` con `JwtAuthGuard`, misma forma que `FrasesController`):
  - `GET temas/:proposalId`
  - `POST temas/:proposalId/soluciones`
  - `POST soluciones/:id/juntar` con `{ intoId }`
- Produces (`ForumsService`):
  - `formalize` usa `debate.plazo_dias` en lugar de `DELIBERATION_DAYS`. Dentro de la misma transacción, si el tema no tiene soluciones visibles y sin juntar, crea una con el título del tema (cortado a 140) y el cuerpo (cortado a 2000), con autor = el autor del tema.
  - Moderación del tipo `solucion`: se suma a `ModTarget`, `checkTarget`, `authorOf` (grupo vía `proposal.groupId`), `textOf` (`title\n\ndescription`), al `IsIn` del DTO de moderación y a la rama de ocultar y restaurar (`solucion.hidden`).

Reglas:
- `getTema` exige ser miembro. Si el tema está oculto, responde con `BadRequestException('Este tema está oculto por moderación.')`.
  - Las soluciones ocultas se listan con `title: 'Solución oculta por moderación'`, `description: ''` y `hidden: true`, salvo para quien tiene `canOrganize`, que ve el texto (igual que en frases, 3A-2).
  - Las juntadas llevan `mergedIntoTitle` con el título de la de destino, o el texto de oculta si la de destino está oculta.
- `mergeSolucion` exige `canOrganize`, el mismo tema, la fase de debate, y que ambas soluciones sean distintas, visibles y no estén ya juntadas. Usa un `updateMany` condicionado a `mergedIntoId: null`.

- [ ] **Step 1:** Escribe las pruebas, con mocks de prisma como en `frases.service.spec.ts`:
  - `createSolucion` valida que sea miembro, que el tema esté abierto y no oculto, y que no haya decisión. Si hay una fila en `decisiones`, responde 400 con «Las soluciones ya quedaron fijas.».
  - Los DTO rechazan títulos de 9 y de 141 caracteres, y aceptan el recorte de espacios.
  - `mergeSolucion` responde 403 sin `canOrganize`, 400 entre temas distintos, 400 si la de destino ya está juntada y 400 consigo misma.
  - `getTema` enmascara el texto de las ocultas para un miembro y no para quien organiza.
  - `formalize` siembra la solución cuando no hay ninguna, no la siembra cuando ya hay una, y usa `debate.plazo_dias`.
  - Moderación: `hide({ target: 'solucion' })` oculta la solución y `textOf` devuelve su texto en la cola de apelaciones.
- [ ] **Step 2:** Ejecuta `npx vitest run src/decisiones src/forums`. Expected: FAIL.
- [ ] **Step 3:** Implementa el servicio, el controlador, los DTO y el módulo, e importa `DecisionesModule` en `AppModule`. Agrega `RulesService` al constructor de `ForumsService` y actualiza su spec.
- [ ] **Step 4:** Ejecuta `npx vitest run && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `API: soluciones, llevar a decisión y moderación de soluciones`.

---

### Task 4: Fases: modo, objeción y apertura de la votación

**Files:**
- Modify: `apps/api/src/decisiones/decisiones.service.ts`, `decisiones.controller.ts`, `decisiones.module.ts` (+ spec)
- Create: `apps/api/src/decisiones/decisiones.scheduler.ts`, `dto/propose-modo.dto.ts`, `dto/objecion.dto.ts`
- Modify: `apps/api/src/forums/forums.service.ts`, `forums.controller.ts` (+ spec), `packages/shared/src/constants/communities.ts`

**Interfaces:**
- Produces (`DecisionesService`):
  - `processDeadlines(now: Date): Promise<number>`: devuelve cuántas transiciones hizo.
  - `proposeModo(profileId, proposalId, modo: DecisionModoValue, ip): Promise<void>`
  - `setObjecion(profileId, proposalId, objeto: boolean): Promise<{ yoObjete: boolean }>`
  - `participantes(proposalId, groupId): Promise<Set<string>>` (privado)
- Produces (HTTP):
  - `POST temas/:proposalId/modo` con `{ modo }`
  - `PUT temas/:proposalId/objecion` con `{ objeto }`
- Produces: `DecisionesScheduler`, copia de `InquietudesScheduler`. Corre cada hora, tiene la bandera `running`, se apaga en pruebas y llama a `processDeadlines(new Date())`.

**`processDeadlines`** hace tres pasadas. Cada una lee los candidatos y luego procesa cada uno con `try/catch` y en su propia transacción:
1. **Fin del debate.** Temas `kind = 'propuesta'`, `status = 'open'`, `hidden = false`, `deliberationEndsAt <= now` y sin decisión. Se cuentan las soluciones visibles y sin juntar, ordenadas por `createdAt`. El `create` choca con `proposalId @unique` si otra ejecución ganó; esa excepción P2002 se ignora fuera de la transacción.
   - Con 0 soluciones se crea la decisión con `fase: 'contada'`, `resultado: 'sin_soluciones'`, `contadaAt: now` y la auditoría `decision.counted`.
   - Con 1 solución se crea con `fase: 'votacion'`, `modo: 'compatibles'`, `candidatas: [id]` y `votacionStartsAt`/`votacionEndsAt` (`votacion.plazo_dias`), con la auditoría `decision.vote_opened`.
   - Con 2 o más se crea con `fase: 'modo'`, a la espera de quien organiza.
2. **Fin de la objeción.** Decisiones en `fase: 'objecion'` con `objecionEndsAt <= now`.
   - `P` = participantes que siguen siendo miembros; `O` = objeciones de miembros actuales; `f` = `debate.fraccion_objecion_modo`.
   - Si `O > 0 && O * 100 >= f * P`, `modo` pasa a ser el contrario de `modoPropuesto`; si no, `modo = modoPropuesto`.
   - Las candidatas son las soluciones visibles y sin juntar en ese momento. Se pasa a `votacion` con un `updateMany` condicionado a `fase: 'objecion'` y se audita `decision.vote_opened`.
3. **Fin de la votación.** Decisiones en `fase: 'votacion'` con `votacionEndsAt <= now`. Llama a `contar(decisionId, now)`. En esta tarea es un método vacío que devuelve `false`; lo completa la Task 5.

Reglas:
- `proposeModo` exige `canOrganize`, `fase: 'modo'` y que el tema no esté oculto. Pasa a `objecion` con `modoPropuesto` y `objecionEndsAt = now + debate.plazo_objecion_modo_dias`, mediante un `updateMany` condicionado. Audita `decision.mode_proposed` con `{ proposalId, modo }`.
- `setObjecion` exige `fase: 'objecion'`, `now < objecionEndsAt`, ser miembro y estar en `participantes`. Si no participa, responde 403: «Solo quienes participaron en el debate pueden objetar el modo.». `objeto: true` hace un upsert y `false` borra. No se audita.
- **Participantes:** miembros actuales que en ese tema comentaron, señalaron, escribieron una frase, votaron una frase o propusieron una solución.
- **`ForumsService`:**
  - Se eliminan `openVote`, su ruta `POST topics/:id/open-vote` y las constantes `DELIBERATION_DAYS` y `VOTING_DAYS` de shared, si nadie más las usa (verifícalo con grep).
  - `hideTopicTx` también hace `tx.decision.updateMany({ where: { proposalId, fase: { in: ['modo', 'objecion', 'votacion'] } }, data: { fase: 'cancelada' } })` y audita `decision.cancelled` si `count > 0`.
  - `closeWithConsensus`: si el tema tiene `electionId`, mantiene la comprobación del plan 2. Si no, y es `kind = 'propuesta'`, exige una decisión en `contada` o `cancelada`. Si no la hay, responde 400: «Una propuesta formal se cierra cuando su votación ya fue contada.».

- [ ] **Step 1:** Escribe las pruebas:
  - fin de debate con 0, 1 y 2 soluciones (incluida una oculta que no cuenta);
  - P2002 ignorado;
  - `proposeModo` sin permiso da 403 y fuera de fase da 400;
  - objeción de alguien que no participó da 403;
  - un tercio de objeciones cambia el modo y una menos no lo cambia (P = 6, f = 33: 2 objeciones lo cambian y 1 no);
  - los participantes que ya no son miembros no cuentan;
  - la transición con `count = 0` no audita;
  - ocultar el tema cancela la decisión activa;
  - `closeWithConsensus` en una propuesta nueva sin decisión contada da 400;
  - `POST open-vote` ya no existe en el controlador.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** Ejecuta `npx vitest run && pnpm --filter @decide/api typecheck && pnpm --filter @decide/shared build`. Expected: PASS.
- [ ] **Step 5:** Commit: `API: fases de la decisión, modo y objeción`.

---

### Task 5: Papeleta, conteo y resultado público

**Files:**
- Modify: `apps/api/src/decisiones/decisiones.service.ts`, `decisiones.controller.ts` (+ spec)
- Create: `apps/api/src/decisiones/dto/papeleta.dto.ts`
- Modify: `apps/api/src/forums/forums.service.ts` (+ spec), en `publicConsensus`

**Interfaces:**
- Consumes: `tallyDecision` (Task 2).
- Produces:
  - `castPapeleta(profileId, proposalId, p: PapeletaValue): Promise<PapeletaValue>`
  - `contar(decisionId, now): Promise<boolean>`
  - `getTema` devuelve además `miPapeleta`, `yoObjete`, `puedoObjetar` y `resultado`.
- Produces (HTTP): `PUT temas/:proposalId/papeleta` con `{ abstencion, orden }`. El DTO usa `IsBoolean`, `IsArray`, `ArrayMaxSize(50)` e `IsUUID('4', { each: true })`.

Reglas:
- `castPapeleta` exige ser miembro, que el tema no esté oculto, `fase: 'votacion'` y `now < votacionEndsAt`.
  - Responde 400 si hay ids repetidos, si algún id no está en `candidatas` o si `abstencion` va con un `orden` no vacío.
  - Guarda con upsert y no audita.
- `contar` lee solo las papeletas de miembros actuales y `miembros` = número de membresías actuales del grupo. Toma `quorumPct` de `votacion.quorum_porcentaje`.
  - Usa como modo `decision.modo`, y `compatibles` si hay una sola candidata.
  - Guarda todo con un `updateMany` condicionado a `fase: 'votacion'`. Si `count = 0`, devuelve `false` sin auditar.
  - Audita `decision.counted` con `{ proposalId, resultado }`.
- **`resultado` en `getTema`:** solo existe en `contada`. Las ganadoras y aprobaciones de soluciones ocultas se muestran con el título enmascarado; la máscara se aplica en `candidatas`.
- **`publicConsensus`:** `approvedSolutions` son los títulos de `ganadoras` de la decisión contada del tema, con el texto de oculta si la solución está oculta. Se mantiene `winningOption` para los temas del plan 2.

- [ ] **Step 1:** Escribe las pruebas:
  - «Apruebo», «No apruebo» y «Me abstengo» con una sola candidata;
  - orden parcial con varias;
  - id de otro tema da 400; id duplicado da 400; abstención con orden da 400;
  - fuera de fase da 400; con el plazo vencido da 400;
  - quien no es miembro recibe 403;
  - `contar` ignora la papeleta de quien ya no es miembro;
  - `contar` ejecutado dos veces audita una sola vez;
  - `getTema` nunca incluye la papeleta de otra persona (busca en el JSON el id de otro perfil);
  - el consenso público muestra las ganadoras y enmascara las ocultas.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** Ejecuta `npx vitest run && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `API: papeleta de soluciones y conteo automático`.

---

### Task 6: Web — sección «Soluciones y decisión»

**Files:**
- Create in `apps/web/app/(app)/proposals/[id]/`: `SolucionesSection.tsx` (servidor), `NuevaSolucionForm.tsx`, `JuntarSolucion.tsx`, `ModoPanel.tsx`, `Papeleta.tsx`, `ResultadoDecision.tsx` (cliente donde haga falta)
- Modify: `page.tsx`, `TopicActions.tsx`, `apps/web/lib/actions.ts`, y la página pública que muestra los consensos (búscala con `grep -rn "public/consensos" apps/web`)

**Interfaces:**
- Consumes: `DecisionTemaResponse` vía `serverFetch('/api/decisiones/temas/:id')`.
- Produces: acciones de servidor `createSolucion`, `mergeSolucion`, `proposeModo`, `setObjecion` y `castPapeleta`, con el patrón `isUuid` + `actionFetch` de `createFrase`.

Textos y comportamiento:
- **Fase de debate:**
  - lista de soluciones, con la marca «Se juntó con «…»» en las juntadas;
  - formulario «Proponer una solución» (título y descripción) que conserva el texto si hay error, como `NuevaFraseForm`;
  - si hay `debateEndsAt`: «Las soluciones quedan fijas el {fecha}»;
  - `JuntarSolucion` solo para quien organiza.
- **`modo`:** quien organiza elige «Excluyentes: solo una puede llevarse a cabo» o «Compatibles: pueden aprobarse varias». Los demás ven «Esperando que se proponga cómo decidir».
- **`objecion`:** «Se propone decidir como {modo}». Si `puedoObjetar`, botón «Me opongo», o «Retirar mi objeción». Debajo: «Si se opone al menos un tercio de quienes participaron, se usa el otro modo».
- **`votacion`:**
  - con una sola candidata, tres botones: «Apruebo», «No apruebo» y «Me abstengo»;
  - con varias: casillas «La acepto», flechas ↑/↓ para ordenar las aceptadas y el texto «Las que no marques cuentan como rechazadas»; botones «Guardar mi papeleta», «Rechazo todas» y «Me abstengo»;
  - aviso «Puedes cambiar tu papeleta hasta el {fecha}» y la papeleta propia marcada.
- **`contada`:** el resultado en palabras:
  - «Aprobada: …»;
  - «Ninguna solución obtuvo más de la mitad»;
  - «Empate: sin decisión»;
  - «Sin decisión: no se alcanzó la participación mínima»;
  - «No se propusieron soluciones».
  - Debajo, cada solución con «la incluyó el X % de las papeletas válidas (n de m)», las abstenciones, el total de papeletas y un `<details>` «Ver matrices (para verificar)» con las dos matrices en tabla.
- **`cancelada`:** «Decisión cancelada porque el tema se ocultó».
- **`TopicActions`:** se quita «Abrir votación». «Convertir en propuesta formal» pasa a «Llevar a decisión», con la explicación «Fija un plazo de debate; al terminar, la comunidad vota las soluciones».
- **Página pública de consensos:** lista «Soluciones aprobadas» cuando `approvedSolutions` no está vacío.

- [ ] **Step 1:** Implementa los componentes y las acciones.
- [ ] **Step 2:** Ejecuta `cd apps/web && npx tsc --noEmit`. Expected: sin errores. `next build` se omite por EPERM en Windows.
- [ ] **Step 3:** Verifica en UTF-8 estricto cada archivo con tildes: `python -c "open(P,'rb').read().decode('utf-8')"`.
- [ ] **Step 4:** Commit: `Web: soluciones, papeleta y resultado de la decisión`.

---

### Task 7: Documentación

**Files:**
- Modify: `docs/DECISIONS.md` (ADR-020), `docs/ROADMAP.md`

- [ ] **Step 1:** Escribe ADR-020, «Soluciones y papeleta». Debe cubrir:
  - la papeleta de Carlos;
  - la aprobación por más de la mitad;
  - Schulze solo entre aprobadas (R1);
  - la objeción del modo por un tercio;
  - el quórum con abstenciones;
  - el resultado congelado en el conteo, sin cifras antes;
  - que no se auditan papeletas ni objeciones;
  - el reemplazo de la propuesta formal y la convivencia con las votaciones del plan 2;
  - la división en 3A-4 y 3A-5.
- [ ] **Step 2:** En ROADMAP, agrega la sección «Primeros 200 — Plan 3A-3 (soluciones y papeleta): COMPLETO», con viñetas como las de 3A-2.
- [ ] **Step 3:** Verifica UTF-8 y haz commit: `Docs: ADR-020 y hoja de ruta de 3A-3`.

## Rulings del plan

- **R1:** si Schulze empata una solución aprobada con otra no aprobada, gana la aprobada, porque solo una aprobada puede ganar (§5). Si se empatan dos aprobadas, es «Empate». Costo si está mal: cambiar una línea del cálculo y su prueba.
- **R2:** las papeletas y las objeciones no se auditan, y no se muestra ninguna cifra antes del conteo. Así se sigue el criterio de privacidad de ADR-018/019. Costo si está mal: agregar la auditoría más tarde.
- **R3:** «Llevar a decisión» siembra el propio tema como solución cuando no hay ninguna. Así una propuesta formal sigue siendo un debate con una sola solución (§5, «Reemplazo del plan 2»). Costo si está mal: quitar la siembra.
- **R4:** la votación se abre y se cuenta sola, por el programador horario; quien organiza solo propone el modo. Costo si está mal: agregar un botón manual.
