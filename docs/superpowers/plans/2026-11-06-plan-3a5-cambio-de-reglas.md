# Plan 3A-5 — Cambiar las reglas por votación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cualquier miembro proponga cambiar una regla y que la comunidad lo vote con la papeleta de una sola solución («Apruebo / No apruebo / Me abstengo»). Para que el resultado valga, tiene que votar al menos el 30 % de los miembros. Cuando se aprueba:
- una **regla local** se aplica sola, siempre dentro de los límites de la colmena;
- una **regla de la colmena** pasa a la mesa, que la aplica con 2 de 3.

**Architecture:**
- Un cambio de regla es un tema del foro por defecto del ámbito, creado ya como propuesta formal con una única solución sembrada. Así reutiliza todo el ciclo de 3A-3: debate, votación automática, conteo y resultado público.
- Una tabla nueva, `cambios_regla`, une el tema con la regla y el valor propuesto.
- Una pasada del programador aplica el resultado: lo aplica, lo envía a la mesa o lo rechaza.
- La mesa recibe una acción nueva, `change_rule`, en su flujo de 2 de 3.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, vitest 3, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-11-04-plan-3a-ciclo-comunitario-design.md` §8 («Cambiar una regla»). Base: ADR-018 (reglas en dos niveles), ADR-020 (papeleta) y ADR-021 (moderación).

## Global Constraints

- **Ámbitos:**
  - Una regla **local** se propone y se vota en la comunidad a la que pertenece: origen, acogida o el nivel general «Exilio y diáspora», con su propio valor local.
  - Una regla **de la colmena** se propone y se vota solo en el nivel general (`GENERAL_GROUP_SLUG`).
  - Los grupos de trabajo no cambian reglas: responden 400.
- **Proponer.** Puede hacerlo cualquier miembro actual del ámbito con `{ key, valor }`.
  - **Validación:**
    - la regla existe y su nivel corresponde al ámbito;
    - `valor` está dentro de `min`/`max` (enteros) o de `options` (opciones);
    - `valor` es distinto del valor vigente.
  - Hay **un solo cambio abierto** (`en_votacion` o `pendiente_mesa`) por regla y ámbito. Lo garantiza un índice parcial único; un P2002 se captura fuera de la transacción y responde 409 «Ya hay un cambio en curso para esta regla.».
  - **El tema** se crea en el foro por defecto del ámbito, con:
    - título «Cambiar la regla: {label}», cortado a 200;
    - cuerpo «Se propone cambiar «{label}» de {actual} a {propuesto}.» más el motivo opcional del autor (0 a 1000 caracteres, recortado);
    - `kind = 'propuesta'` y `deliberationEndsAt = now + debate.plazo_dias` (R1);
    - una solución sembrada «Cambiar a {propuesto}{unidad}».

  Después sigue el ciclo normal: una sola solución lleva a votación en modo `compatibles`.
- **Participación mínima.** Al contar un tema de cambio de regla, `quorumPct = max(votacion.quorum_porcentaje del ámbito, reglas.participacion_minima de la colmena)`. Por defecto queda en 30. Sin esa participación, el resultado es `sin_quorum`.
- **Aplicar el resultado** (pasada del programador, una sola vez por cambio, con `updateMany` condicionado a `en_votacion`):
  - **`aprobada` y local:** valida otra vez los límites y hace upsert de `RuleValue(key, groupId = ámbito)`. El estado pasa a `aplicado`.
  - **`aprobada` y colmena:** crea una `BoardAction` con `type = 'change_rule'`, `params = { key, valor, cambioId }`, sin proponente ni persona objetivo. El estado pasa a `pendiente_mesa`.
  - **`sin_quorum`:** el estado pasa a `sin_participacion`.
  - **`ninguna` o `empate`:** el estado pasa a `rechazado`.
  - **Decisión `cancelada`** (tema oculto): el estado pasa a `anulado`.
- **Mesa.** `change_rule` se resuelve con el flujo existente (`voteAction`). Como la acción no tiene proponente, hacen falta 2 aprobaciones de la mesa.
  - **Al ejecutarse:** valida los límites, hace upsert del valor de la colmena (`groupId = null`) y el cambio pasa a `aplicado`.
  - **Al rechazarse:** el cambio pasa a `rechazado_mesa`.
- **Lo que un cambio de regla no genera:** comisiones (no hay nada que llevar a cabo) ni bifurcaciones.
- **Auditoría**, sin texto en `metadata`:
  - `regla.cambio_propuesto` `{ cambioId, key }`
  - `regla.cambio_aplicado`
  - `regla.cambio_enviado_a_mesa`
  - `regla.cambio_rechazado`
- **Historial público.** La página «Reglas» muestra, por regla, el valor vigente, el cambio en curso (con enlace al tema) y los últimos 10 cambios resueltos (estado, de y a, fecha). Para las reglas de la colmena, el historial también está en `GET /api/public/reglas`.
- Mensajes en español. Tildes solo con Edit/Write y verificadas en UTF-8 estricto. Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca se hace commit de `apps/web/next-env.d.ts` ni de `.superpowers/`.

## Review Focus

1. **Límites:** un valor fuera de los límites nunca se guarda, ni al proponer ni al aplicar. Esto incluye el caso de que los límites cambien entre la propuesta y la aplicación.
2. **Una sola vez:** cada cambio se aplica una vez, aunque el programador corra dos veces a la vez, y la mesa nunca aplica un cambio local.
3. **Participación:** un cambio aprobado con menos del 30 % de participación no se aplica.
4. **Sin efectos laterales:** un cambio de regla no crea comisión ni bifurcación.
5. **Permisos:** quien no es miembro, una persona suspendida o un grupo de trabajo no proponen. Una regla de la colmena no se propone fuera del nivel general.

---

### Task 1: Base de datos y tipos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migración `20261110120000_cambios_de_regla`
- Modify: `packages/shared/src/types/` (archivo de reglas o `rules.ts`) y `board.types.ts`

**Interfaces:**
- **Prisma:**
  - `enum CambioReglaEstado { en_votacion pendiente_mesa aplicado rechazado rechazado_mesa sin_participacion anulado }`
  - `CambioRegla` (`cambios_regla`):
    - `id`;
    - `key VarChar(80)`;
    - `nivel String` (`'colmena'|'local'`);
    - `ambitoGroupId` (relación con `Group`, cascade);
    - `valorAnterior VarChar(40)`;
    - `valorPropuesto VarChar(40)`;
    - `proposalId @unique` (cascade);
    - `autorProfileId` (columna simple);
    - `estado CambioReglaEstado @default(en_votacion)`;
    - `boardActionId String? @db.Uuid`;
    - `createdAt`;
    - `resueltoAt DateTime?`.
  - Índice parcial único en SQL: `UNIQUE (key, "ambitoGroupId") WHERE estado IN ('en_votacion','pendiente_mesa')`, con un comentario en el esquema.
  - `BoardActionType` suma `change_rule`.
  - En `BoardAction`, `targetUserId` y `proposedByProfileId` pasan a ser opcionales. Ajusta `listActions` y `execute` para el caso nulo.
- **Shared:**
  ```ts
  export type CambioReglaEstadoValue = 'en_votacion'|'pendiente_mesa'|'aplicado'|'rechazado'|'rechazado_mesa'|'sin_participacion'|'anulado';
  export interface CambioReglaView { id: string; key: string; nivel: 'colmena'|'local'; valorAnterior: string; valorPropuesto: string; estado: CambioReglaEstadoValue; proposalId: string | null; createdAt: string; resueltoAt: string | null }
  ```
  - A `RuleView` se le suman `enCurso: CambioReglaView | null`, `historial: CambioReglaView[]` y `puedoProponer: boolean`.
  - `BoardActionType` suma `change_rule`. `BoardActionSummary.targetDisplayName` ya admite null; `proposedBy` pasa a `string | null`.

- [ ] **Step 1:** Edita el esquema y genera la migración con `migrate diff`. Agrega a mano el índice parcial y verifica que no se borre ningún índice hecho a mano. Aplica con `migrate deploy` y genera el cliente (carga `.env` sin imprimirlo).
- [ ] **Step 2:** Agrega los tipos y los ajustes mínimos para que compile: en `rules.service`, `enCurso: null, historial: [], puedoProponer: false`. Ejecuta todas las verificaciones (`pnpm --filter @decide/shared build`, `pnpm --filter @decide/api typecheck`, `cd apps/api && npx vitest run` con 879 pruebas, y `tsc` de la web). Expected: todo pasa.
- [ ] **Step 3:** Commit: `BD: cambios de regla y acción de la mesa para la colmena`.

---

### Task 2: Proponer un cambio y votarlo

**Files:**
- Create: `apps/api/src/rules/cambios-regla.service.ts` (+ spec), `dto/proponer-cambio.dto.ts`
- Modify: `rules.controller.ts`, `rules.module.ts`, `rules.service.ts` (`list` llena `enCurso`, `historial` y `puedoProponer`)
- Modify: `apps/api/src/decisiones/decisiones.service.ts` (`contar` usa la participación mínima para temas de cambio de regla; `esBifurcable` y `puedoIniciarBifurcacion` dan false para ellos)
- Modify: `apps/api/src/grupos/comisiones.service.ts` (`crearComisiones` los salta)

**Interfaces:**
- `POST /api/rules/cambios` con `{ groupId, key, valor, motivo? }` → `{ id, proposalId }`
- `GET /api/rules?groupId` sigue igual, con los campos nuevos.

**Reglas:**
- **Validaciones:** las de Global Constraints «Proponer», con estos mensajes:
  - fuera de límites: 400 «El valor debe estar entre {min} y {max}.» o «Elige una de las opciones.»;
  - igual al vigente: 400 «Ese ya es el valor vigente.»;
  - colmena fuera del nivel general: 400 «Las reglas de la colmena se cambian en «Exilio y diáspora».»;
  - grupo de trabajo: 400.
- **Creación:** ocurre en una sola transacción, con el tema creado en el foro por defecto. Llama a `DeliberationService.ensureDefaultForum` fuera de la transacción y usa `createTopicInDefaultForum` dentro. Después vienen `kind: 'propuesta'`, `deliberationEndsAt`, la solución sembrada y el `CambioRegla`.

- [ ] **Step 1:** Escribe las pruebas:
  - las validaciones y sus mensajes;
  - un solo cambio abierto (P2002 → 409);
  - el tema nace como propuesta con una solución;
  - `contar` aplica 30 cuando el quórum del ámbito es 20;
  - no se crean comisiones ni bifurcaciones para estos temas;
  - `list` muestra el cambio en curso y el historial.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta la suite completa y los typechecks. Expected: todo pasa. Commit: `API: proponer cambios de regla y votarlos`.

---

### Task 3: Aplicar el resultado y la mesa

**Files:**
- Modify: `cambios-regla.service.ts` (+ spec)
- Create: `apps/api/src/rules/cambios-regla.scheduler.ts`
- Modify: `apps/api/src/board/board.service.ts` (+ spec): `execute` y el rechazo para `change_rule`; `listActions` con nulos

**Reglas:** las de Global Constraints «Aplicar el resultado» y «Mesa».
- Cada cambio se procesa en su propia transacción, con la fila bloqueada y un `updateMany` condicionado.
- La mesa ejecuta `change_rule` validando los límites. Si el valor ya no es válido, rechaza la acción y marca el cambio como `rechazado_mesa`.
- Evita el ciclo de módulos: `BoardModule` no debe importar `RulesModule` si eso crea un ciclo. Valida con `ruleDefinition` de shared y escribe `RuleValue` directo con prisma.

- [ ] **Step 1:** Escribe las pruebas:
  - local aprobado → aplicado y valor guardado;
  - colmena aprobado → `pendiente_mesa` y `BoardAction` creada;
  - la mesa con 2 aprobaciones → aplicado y valor de colmena guardado;
  - la mesa rechaza → `rechazado_mesa`;
  - `sin_quorum` → `sin_participacion`;
  - `ninguna` → `rechazado`;
  - `cancelada` → `anulado`;
  - dos pasadas a la vez aplican una sola vez;
  - un valor fuera de límites al aplicar no se guarda.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta la suite completa y los typechecks. Expected: todo pasa. Commit: `API: los cambios de regla se aplican solos o pasan a la mesa`.

---

### Task 4: Web

**Files:** Modify `apps/web/app/(app)/reglas/page.tsx` (+ componentes cliente), `apps/web/lib/actions.ts` y la página de «Mesa», que muestra `change_rule`.

**Textos:**
- **Por regla:**
  - si `puedoProponer` y no hay cambio en curso, botón «Proponer un cambio»;
  - formulario: campo de valor numérico con sus límites («entre {min} y {max}») o selector de opciones, y el campo «Motivo (opcional)»;
  - al enviar, «Se abrió el debate. La comunidad votará cuando termine.» con enlace al tema.
- **Cambio en curso:** «En votación: de {anterior} a {propuesto}» con enlace al tema, o «Esperando a la mesa (2 de 3)».
- **Historial:** «Aplicado», «Rechazado», «Rechazado por la mesa», «Sin participación suficiente» o «Anulado», con «de {anterior} a {propuesto}» y la fecha.
- **Mesa:** la acción `change_rule` se muestra como «Cambiar la regla de la colmena «{label}» a {valor}», con los botones de aprobar y rechazar que ya existen.

- [ ] **Step 1:** Implementa. Ejecuta `cd apps/web && npx tsc --noEmit`. Expected: sin errores. Verifica UTF-8.
- [ ] **Step 2:** Commit: `Web: proponer cambios de regla y ver su historial`.

---

### Task 5: Documentación

- [ ] ADR-024, «Cambio de reglas por votación», con R1 y R2. Agrega en ROADMAP la sección 3A-5. Verifica UTF-8 y haz commit: `Docs: ADR-024 y hoja de ruta de 3A-5`.

## Rulings del plan

- **R1:** un cambio de regla pasa primero por un debate de `debate.plazo_dias` y después por la votación, como cualquier propuesta formal. El spec dice «se propone y se vota»; el debate deja explicar y objetar antes de votar. Costo si está mal: abrir la votación directamente.
- **R2:** la acción de la mesa la crea el sistema, sin proponente, así que necesita 2 aprobaciones de la mesa. Costo si está mal: contar al primero que apruebe como proponente.
