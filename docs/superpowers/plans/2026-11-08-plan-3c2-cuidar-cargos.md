# Plan 3C-2: cuidar los cargos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revocación, renuncia y vacantes con elección anticipada; la mesa incompleta sigue revisando; las cuentas suspendidas pueden pedir la reactivación; los observadores tienen su página «Observar» con observaciones públicas; y las elecciones aparecen en «Desde tu última visita».

**Architecture:**
- Todo cuelga del módulo `elecciones` de 3C-1. Hay un solo punto que abre elecciones anticipadas: `ConvocatoriaService.anticipada`. Lo usan la revocación, la renuncia y la suspensión.
- El nuevo período de una anticipada termina cuando terminaba el mandato que se cubre. Se guarda en `Eleccion.mandatoHasta`, y `PosesionService` lo respeta.
- La reactivación usa las acciones de la mesa (2 de 3) con dos tipos nuevos. Una cuenta suspendida no recibe sesión. Recibe un token de propósito único, `reactivacion`, que solo sirve para ver su caso y pedir la reactivación.
- Mesa incompleta: `BoardService.puedeFirmarRevision` amplía las dos revisiones de 2 firmas con dos suplentes provisionales: los 2 observadores mejor colocados en su elección.

**Tech Stack:** NestJS 10, Prisma 6 y Postgres, Next.js 15 / React 19, `@decide/shared`, vitest con Prisma simulado. Igual que 3C-1.

**Spec:** `docs/superpowers/specs/2026-11-07-plan-3c-elecciones-design.md`. Cubre §5 («Observar» y «Desde tu última visita»), §6, §7, §8, §9 (`revocacion.fraccion`), §10 y §13 (las pruebas marcadas 3C-2).

## Global Constraints

- **Revocación:**
  - **Umbral:** la regla `revocacion.fraccion` (33 %, colmena, `groupId=null`), sobre el electorado del cargo. Queda **conectada** (`conectada=true`).
  - **Valores fijados al abrir:** el electorado (`electoradoN`), la fracción y el umbral, `ceil(N·fracción/100)`, con mínimo 1.
  - **Plazos y límites:** 14 días para reunir los apoyos. Un solo pedido abierto por cargo. Quien pide la revocación de un cargo no puede pedirla otra vez antes de 60 días.
  - **Motivo:** hasta 600 caracteres, con moderación previa (`tipo: 'revocacion'`).
- **Apoyos de una revocación:**
  - Se cuentan, pero nunca se publica quién apoyó ni quién pidió la revocación: ninguna respuesta de la API lleva sus `profileId` ni sus nombres.
  - Apoyar o quitar el apoyo no se audita.
  - Quien pide la revocación cuenta como el primer apoyo.
  - Solo cuentan los apoyos de personas que siguen en el electorado.
- **Elección anticipada:**
  - 1 puesto, `motivo: 'anticipada'`, sin jornada, con los plazos normales de candidaturas y votación.
  - `mandatoHasta` es el `hasta` del cargo que se cubre; vale `null` para un asiento fundador.
  - No se abre si ya hay una elección abierta para ese `(groupId, cargo)`.
  - No se abre si el mandato termina en 45 días o menos **(regla mía)**: en ese caso llega antes la renovación.
- **Quien es revocado** sigue «en funciones» (`Cargo.enFunciones=true`) hasta el resultado y puede volver a presentarse.
- **Renuncia, suspensión y vacante:**
  - **Renuncia:** el cargo termina en el acto (`terminadoAt`, `finCausa='renuncia'`), queda vacante y se abre la anticipada.
  - **Suspensión:** termina todos los cargos de esa persona (`finCausa='suspension'`) y borra todos sus `BoardSeat`, también los fundadores. Se abre una anticipada por cada cargo terminado. Para un asiento fundador sin `Cargo`, la anticipada se abre con `mandatoHasta=null`.
  - Los fundadores no tienen botón de renuncia **(regla mía)**: dejan el asiento en la primera jornada.
- **Mesa incompleta:**
  - Con 2 miembros verificados en la mesa, todo sigue igual: hacen falta las 2 firmas.
  - Con menos de 2, los 2 observadores con mejor puesto en `ordenFinal` de la elección que les dio el cargo pueden firmar, y solo en dos sitios: las revisiones de textos (`RevisionesService`) y la confirmación de moderación (`ForumsService.confirmar` y su lista).
  - Los suplentes no firman acciones de la mesa, no resuelven apelaciones y no organizan.
- **Reactivación:**
  - Una cuenta suspendida que entra con su contraseña correcta recibe un 403 `{codigo:'cuenta_suspendida', message:'Tu cuenta está suspendida.', reactivacionToken}`.
  - El token es un JWT con `proposito:'reactivacion'` que dura 30 minutos. `JwtStrategy` lo rechaza como sesión.
  - **Texto:** hasta 1000 caracteres; lo lee solo la mesa, sin moderación.
  - **Límites:** un solo pedido pendiente a la vez. Tras un rechazo, la persona puede volver a pedir a los 30 días.
  - **Resolución:** la mesa resuelve con `reactivate_user` (aprobar) o `rechazar_reactivacion` (con su `reason`, que la persona ve), las dos con 2 de 3.
  - **Al reactivar:** la cuenta vuelve al estado anterior a la suspensión (`params.estadoPrevio` de la acción `suspend_user`; si falta, `pending_verification`). Si queda `verified_citizen`, se resincronizan sus comunidades. No recupera ningún cargo.
- **Observadores:**
  - **Quiénes:** quienes tienen un `Cargo` de tipo `observador` vigente (`terminadoAt=null`) y una cuenta `verified_citizen`.
  - **Qué ven, solo de lectura:**
    - la auditoría (`AuditEventSummary`, sin IP ni hash);
    - las estadísticas de verificación por nombre visible;
    - las matrices de `Eleccion`, `Decision` y `ElectionResult`, y las semillas de `SortitionDraw`;
    - el gasto del asistente por mes (`UsoAsistente`).
  - **Qué nunca ven:** correos, nombres reales, IP ni el contenido de un voto.
  - **Observación pública:** hasta 1000 caracteres, sobre un evento de auditoría, con moderación previa (`tipo: 'observacion'`). Se publica con el nombre visible en «Quiénes nos representan».
- **«Desde tu última visita»:**
  - Dos clases nuevas:
    - `eleccion_candidaturas`: «Se abrieron las candidaturas para …»;
    - `eleccion_votar`: «Vota antes del …»;
  - Solo aparecen las elecciones en cuyo electorado está la persona.
  - La tarjeta sigue sin mostrarse con el asistente apagado (corrección de 3B, no se toca).
- **Migraciones:**
  - una sola, `20261118120000_cuidar_cargos`, generada con `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`, más el índice parcial escrito a mano;
  - nunca `migrate dev` ni `prisma format`;
  - se conservan los índices parciales existentes, en especial `elecciones_abierta_por_cargo`.
- **Verificación:**
  - `pnpm --filter @decide/shared build`
  - `pnpm --filter @decide/api typecheck`
  - `cd apps/api && npx vitest run`
  - `cd apps/web && npx tsc --noEmit`
  - nunca `next build`.
- **No se suben** `apps/web/next-env.d.ts` ni `.superpowers`. No se usa `git stash`.
- **Textos de pantalla** en español sencillo, como en 3C-1. Los mensajes de error de la API, también en español.

## Review Focus

1. **Revocar con una elección ya abierta** para ese cargo (una renovación, por ejemplo) → 409, «Ya hay una elección abierta para este cargo». Nunca dos elecciones abiertas. *(Prueba en Task 3.)*
2. **Una persona deja el electorado** (suspendida o fuera de la comunidad) después de apoyar → su apoyo deja de contar. El umbral no cambia, porque se fijó al abrir. *(Task 3.)*
3. **La única persona de la mesa queda suspendida** → aparecen los 2 suplentes. Un observador suspendido nunca es suplente. *(Task 4.)*
4. **Doble clic en «Renunciar»** → la segunda vez da 409 y no abre otra elección. *(Task 2.)*
5. **El token de reactivación usado como sesión,** o después de que la cuenta ya fue reactivada → 401 o 409. *(Task 5.)*

---

### Task 1: Esquema, migración y tipos compartidos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261118120000_cuidar_cargos/migration.sql`
- Modify: `packages/shared/src/constants/elecciones.ts`, `packages/shared/src/constants/rules.ts` (l.71), `packages/shared/src/types/board.types.ts`, `packages/shared/src/constants/asistente.ts` (`TipoTexto`, `TIPOS_TEXTO`, `ItemAlDia.clase`)
- Test: `packages/shared/src/constants/rules.spec.ts` (o el spec de reglas existente)

**Interfaces:**
- Produces (Prisma):
  - **Enums:**
    - `EleccionMotivo` añade `anticipada`;
    - `enum CargoFin { mandato renuncia revocacion suspension }`;
    - `BoardActionType` añade `reactivate_user` y `rechazar_reactivacion`;
    - `enum RevocacionEstado { abierta lograda vencida }`;
    - `enum ReactivacionEstado { pendiente aprobada rechazada }`.
  - **`Eleccion`:** `mandatoHasta DateTime? @db.Timestamptz`.
  - **`Cargo`:** `finCausa CargoFin?`.
  - **`model Revocacion`** (`@@map("revocaciones")`):
    - `id`, `cargoId` (→ `Cargo`), `solicitanteProfileId`, `motivo String @db.VarChar(600)`, `estado RevocacionEstado @default(abierta)`;
    - `electoradoN Int`, `fraccion Int`, `umbral Int`;
    - `venceAt`, `logradaAt?`, `eleccionId?` (la anticipada que abrió), `createdAt`;
    - `apoyos RevocacionApoyo[]`; `@@index([solicitanteProfileId, cargoId])`.
  - **`model RevocacionApoyo`** (`revocacion_apoyos`): `id`, `revocacionId`, `profileId`, `createdAt`, `@@unique([revocacionId, profileId])`.
  - **`model SolicitudReactivacion`** (`solicitudes_reactivacion`): `id`, `userId`, `texto String @db.VarChar(1000)`, `estado ReactivacionEstado @default(pendiente)`, `motivoRechazo String? @db.VarChar(500)`, `createdAt`, `resueltaAt?`, `@@index([userId, createdAt])`.
  - **`model ObservacionPublica`** (`observaciones_publicas`): `id`, `autorProfileId`, `auditEventId String @db.Uuid`, `texto String @db.VarChar(1000)`, `createdAt`, `@@index([createdAt])`.
  - **Índices parciales hechos a mano:**
    - `CREATE UNIQUE INDEX revocaciones_abierta_por_cargo ON revocaciones (cargo_id) WHERE estado = 'abierta';` (los nombres de columna siguen la convención `@map` del esquema);
    - `CREATE UNIQUE INDEX reactivacion_pendiente_por_usuario ON solicitudes_reactivacion (user_id) WHERE estado = 'pendiente';`.
- Produces (shared):
  - `EleccionMotivoValue` incluye `'anticipada'`, y `CargoFinValue`.
  - Constantes: `REVOCACION_PLAZO_DIAS = 14`, `REVOCACION_ESPERA_DIAS = 60`, `REACTIVACION_ESPERA_DIAS = 30`, `ANTICIPADA_MINIMO_DIAS = 45`, `MOTIVO_REVOCACION_MAX = 600`, `TEXTO_REACTIVACION_MAX = 1000`, `OBSERVACION_MAX = 1000`.
  - Tipos de vista (los rellenan las Tasks 2 a 7):
    - `MiCargoVista {id; tipo; comunidad; desde; hasta; enFunciones; puedeRenunciar}`;
    - `RevocacionVista {id; cargoId; tipo; persona; comunidad; motivo; apoyos; umbral; venceAt; apoyaste; puedoApoyar}`;
    - `RevocacionResumen {apoyos; umbral; venceAt}`;
    - `ObservacionVista {id; autor; iniciales; texto; evento: {action; createdAt}; createdAt}`;
    - `CasoSuspension {motivo; suspendidaAt; solicitud: {estado; motivoRechazo; createdAt} | null; puedePedirDesde: string | null}`.
  - `RepresentantesVista`: cada entrada de `mesa`, `observadores` y `comunidades[].coordinadores` añade `cargoId: string | null` y `revocacion: RevocacionResumen | null`. La vista añade `observaciones: ObservacionVista[]`.
  - `TipoTexto` añade `'revocacion'` y `'observacion'`.
  - `ItemAlDia.clase` añade `'eleccion_candidaturas'` y `'eleccion_votar'`.
  - `BoardActionTypeValue` añade los 2 tipos nuevos.
  - `revocacion.fraccion` pasa a `conectada=true`.

- [ ] **Step 1: Write the failing test.** Prueba `revocacion.fraccion está conectada`: `expect(ruleDefinition('revocacion.fraccion')?.conectada).toBe(true)` y su valor por defecto es 33. Si el spec ya afirma lo contrario (`false`), se cambia esa afirmación.
- [ ] **Step 2: Run it.** `pnpm --filter @decide/shared test` (o `npx vitest run` en `packages/shared`). Expected: FAIL.
- [ ] **Step 3:** Hacer los cambios de shared y del esquema. Generar el SQL con `migrate diff` y añadir a mano los 2 índices parciales. Aplicarlo con `npx prisma migrate deploy && npx prisma generate`.
- [ ] **Step 4: Verify.**
  - `pnpm --filter @decide/shared build && pnpm --filter @decide/api typecheck` → sin errores.
  - `npx vitest run` en `apps/api` → todo verde.
  - El test de Step 1 → PASS.
  - `grep -c elecciones_abierta_por_cargo` sobre las migraciones sigue dando ≥ 1.
- [ ] **Step 5: Commit.** `feat(elecciones): esquema de revocación, reactivación y observaciones (3C-2)`

### Task 2: Elección anticipada y renuncia

**Files:**
- Modify: `apps/api/src/elecciones/convocatoria.service.ts`, `posesion.service.ts`, `elecciones.service.ts`, `elecciones.controller.ts`
- Test: `convocatoria.service.spec.ts`, `posesion.service.spec.ts`, `elecciones.service.spec.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `ConvocatoriaService.anticipada(p: { groupId: string; cargo: CargoTipoValue; mandatoHasta: Date | null }, now: Date, db?: Prisma.TransactionClient): Promise<string | null>`. Devuelve el id de la elección abierta, o `null` si no la abrió (ya había una abierta, P2002, o `mandatoHasta` está a ≤ 45 días). Reutiliza `crearUna` con `puestos=1`, `motivo='anticipada'`, `jornadaId=null` y las reglas fijas de siempre. Además guarda `mandatoHasta` y audita `eleccion.convocada` con `motivo: 'anticipada'`.
  - `PosesionService` (en `darPosesion`): `hasta = e.mandatoHasta ?? sumarMeses(now, e.periodoMeses ?? regla)`.
  - `EleccionesService.misCargos(profileId): Promise<MiCargoVista[]>`, con los cargos vigentes. `puedeRenunciar` es verdadero si el cargo existe y no está `enFunciones`.
  - `EleccionesService.renunciar(profileId, cargoId, now): Promise<void>`:
    - en una transacción: `cargo.updateMany({where:{id, profileId, terminadoAt:null}, data:{terminadoAt:now, finCausa:'renuncia', enFunciones:false}})`; si cuenta 0 → 409 `Este cargo ya terminó.`;
    - si el cargo es de la mesa, borra el `BoardSeat` de ese rol cuando su `profileId` coincide;
    - después del commit, `anticipada({groupId, cargo:tipo, mandatoHasta: cargo.hasta}, now)` y la auditoría `cargo.renuncia` (`metadata: {tipo, groupId}`).
  - Rutas:
    - `GET /elecciones/mis-cargos`;
    - `POST /elecciones/cargos/:cargoId/renuncia` (204).
  - `contarVencidas`, `convocatorias` y `dejarEnFunciones` tratan `motivo='anticipada'` como cualquier otra elección.

- [ ] **Step 1: Write the failing tests.**
  - `anticipada abre 1 puesto con mandatoHasta`: `crearUna` (o `eleccion.create`) recibe `puestos: 1`, `motivo: 'anticipada'`, `jornadaId: null` y `mandatoHasta`.
  - `anticipada devuelve null si ya hay una abierta`: P2002 simulado → `null`.
  - `anticipada no abre a 45 días o menos del fin`: `mandatoHasta = now + 45 días` → `null`, sin crear nada.
  - `darPosesion usa mandatoHasta`: elección con `mandatoHasta` fijo → `cargo.create` recibe `hasta` igual a esa fecha.
  - `renunciar termina el cargo, libera el asiento y abre la anticipada`.
  - `renunciar dos veces da 409 y no abre otra`.
  - `renunciar un cargo ajeno da 409`: `updateMany` cuenta 0.
- [ ] **Step 2: Run.** `cd apps/api && npx vitest run src/elecciones` → FAIL.
- [ ] **Step 3: Implement** según los Interfaces.
- [ ] **Step 4: Run.** Las pruebas de `src/elecciones` → PASS. Toda la suite → verde.
- [ ] **Step 5: Commit.** `feat(elecciones): renuncia y elección anticipada con el mandato que faltaba (3C-2)`

### Task 3: Revocación

**Files:**
- Create: `apps/api/src/elecciones/revocacion.service.ts`, `revocacion.service.spec.ts`, `dto/revocacion.dto.ts`
- Modify: `elecciones.controller.ts`, `elecciones.module.ts`, `elecciones.scheduler.ts` (`pasos()`), `elecciones.service.ts` (`representantes()`)

**Interfaces:**
- Consumes: `anticipada` (Task 2); `filtroElectorado`, `enElectorado` y `electorado` (3C-1); `GuardiaService.antesDePublicar` con `tipo:'revocacion'`, con su publicador registrado como en las candidaturas (`Publicadores.registrar('revocacion', fn)`); `RulesService.getInt('revocacion.fraccion', null)`.
- Produces: `RevocacionService` con:
  - `pedir(profileId, cargoId, motivo, now, opts?: {pedirRevision?: boolean}): Promise<{id: string} | {revision} | {enRevision: true}>`. Checks y respuestas:
    - el cargo no existe → 404;
    - el cargo terminó o está `enFunciones` → 409 `Este cargo ya está en elección.`;
    - hay una elección abierta para `(groupId, cargo)` → 409 `Ya hay una elección abierta para este cargo.`;
    - quien pide no está en el electorado → 403;
    - ya pidió la revocación de ese cargo hace menos de 60 días → 409 con la fecha desde la que puede volver a pedir;
    - ya hay un pedido abierto (P2002 del índice parcial) → 409 `Ya hay un pedido abierto para este cargo.`;
    - si todo pasa, crea el pedido con los valores fijados y el primer apoyo. Audita `revocacion.abierta` **sin `actorId`**, con `metadata {tipo, groupId, umbral}`.
  - `apoyar(profileId, revocacionId, now): Promise<RevocacionVista>` y `quitarApoyo(...)`. Las dos cumplen esto:
    - en una transacción con `FOR UPDATE` sobre la revocación;
    - solo el electorado; solo con `estado='abierta'` y `venceAt > now`;
    - no se auditan.
    - Al llegar a `umbral` (contando solo los apoyos de quienes siguen en el electorado): `estado='lograda'`, `logradaAt`, `Cargo.enFunciones=true`. Después del commit llama a `anticipada({groupId, cargo:tipo, mandatoHasta: cargo.hasta})`, guarda `eleccionId` y audita `revocacion.lograda` (`metadata {tipo, groupId, umbral, apoyos}`).
  - `listar(profileId, now): Promise<RevocacionVista[]>`: los pedidos abiertos de los cargos en cuyo electorado está la persona.
  - `resumenPorCargo(): Promise<Map<string, RevocacionResumen>>`, para `representantes()`.
  - `vencer(now): Promise<number>`: pasa a `vencida` los pedidos con `venceAt <= now`. Va en `pasos()` del programador.
- Rutas:
  - `GET /elecciones/revocaciones`;
  - `POST /elecciones/cargos/:cargoId/revocacion` (`{motivo, pedirRevision?}`; responde 202 cuando el texto queda en revisión, como las candidaturas);
  - `PUT /elecciones/revocaciones/:id/apoyo`;
  - `DELETE /elecciones/revocaciones/:id/apoyo`.
- `representantes()` rellena `cargoId` y `revocacion` (Task 1).

- [ ] **Step 1: Write the failing tests** (en `revocacion.service.spec.ts`):
  - `pedir fija electorado, fracción y umbral`: electorado de 10, fracción 33 → `umbral: 4`, `venceAt = now + 14 días`, y se crea el primer apoyo.
  - `pedir con una elección abierta da 409` (Review Focus 1).
  - `pedir otra vez antes de 60 días da 409`.
  - `fuera del electorado no puede pedir ni apoyar` → 403.
  - `al llegar al umbral se abre la anticipada con lo que faltaba del mandato`: `anticipada` recibe `mandatoHasta: cargo.hasta`, el cargo queda `enFunciones: true` y el pedido `lograda`.
  - `un apoyo de quien salió del electorado no cuenta` (Review Focus 2).
  - `ninguna respuesta expone quién apoyó ni quién pidió`: `JSON.stringify` de las respuestas de `listar` y `apoyar` no contiene los `profileId` del solicitante ni de quienes apoyaron.
  - `apoyar no audita`: `audit.log` no se llama con ninguna `action` que empiece por `revocacion.apoyo`.
  - `vencer cierra los pedidos vencidos`.
- [ ] **Step 2: Run.** `npx vitest run src/elecciones/revocacion.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Las pruebas de la Task → PASS. Toda la suite → verde.
- [ ] **Step 5: Commit.** `feat(elecciones): revocación con apoyos anónimos y elección anticipada (3C-2)`

### Task 4: Suspensión de un cargo y mesa incompleta

**Files:**
- Modify: `apps/api/src/board/board.service.ts` (`execute` para `suspend_user`; métodos nuevos), `apps/api/src/asistente/revisiones.service.ts` (`exigirMesa`, `mesaSuficiente`), `apps/api/src/forums/forums.service.ts` (`confirmar` l.~533 y la lista «por confirmar» l.~608)
- Test: `board.service.spec.ts`, `revisiones.service.spec.ts`, `forums.service.spec.ts`

**Interfaces:**
- Consumes: `ConvocatoriaService.anticipada` (Task 2). Para evitar un ciclo de módulos, `BoardService` no la importa: expone un gancho `alSuspender` que `EleccionesModule` registra en `onModuleInit` (el mismo patrón que `Publicadores`).
- Produces:
  - **`suspend_user`** (dentro de la transacción de la votación):
    - guarda `params.estadoPrevio` (el estado de la cuenta antes de suspenderla) en la acción;
    - termina todos los `Cargo` vigentes de su perfil (`terminadoAt`, `finCausa:'suspension'`, `enFunciones:false`);
    - borra todos sus `BoardSeat`.
    - En `despues[]`, por cada cargo terminado, llama a `alSuspender({groupId, cargo, mandatoHasta: hasta})`. Por cada asiento fundador borrado sin `Cargo`, la llama con `mandatoHasta: null`.
  - `BoardService.suplentesProvisionales(now): Promise<string[]>`:
    - devuelve `[]` si hay 2 o más miembros de la mesa con cuenta `verified_citizen`;
    - si no, devuelve hasta 2 `profileId` de observadores vigentes y verificados, ordenados por la posición de su candidatura en el `ordenFinal` de la `Eleccion` de su cargo (menor = mejor; desempate por `Cargo.desde` y luego por `id`).
  - `BoardService.puedeFirmarRevision(profileId, now?): Promise<boolean>`: `roleOf(profileId) !== null` o el perfil está en `suplentesProvisionales`.
  - `BoardService.firmantesDisponibles(now?): Promise<number>`: miembros verificados de la mesa más suplentes.
  - `RevisionesService`:
    - `exigirMesa` usa `puedeFirmarRevision`;
    - `mesaSuficiente` es `firmantesDisponibles() >= 2`.
  - `ForumsService`: la confirmación de moderación y la lista «por confirmar» usan `puedeFirmarRevision`. Las apelaciones siguen con `esMesa`.

- [ ] **Step 1: Write the failing tests.**
  - `suspender termina los cargos, borra los asientos y guarda el estado previo`.
  - `suspender a alguien de la mesa abre la anticipada`: `alSuspender` se llama con `mandatoHasta` del cargo. Para un asiento fundador, con `null`.
  - `con 2 en la mesa no hay suplentes` → `[]`.
  - `con 1 en la mesa firman los 2 observadores mejor colocados`.
  - `un observador suspendido nunca es suplente` (Review Focus 3).
  - `un suplente firma una revisión de texto pero no una acción de la mesa`: `RevisionesService.firmar` funciona y `BoardService.proposeAction` → 403.
  - `un suplente confirma una moderación pero no resuelve apelaciones`.
- [ ] **Step 2: Run** las pruebas de `board`, `asistente/revisiones` y `forums` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Las pruebas → PASS. Toda la suite → verde.
- [ ] **Step 5: Commit.** `feat(mesa): la suspensión deja el cargo vacante y la revisión sigue con suplentes (3C-2)`

### Task 5: Reactivación de cuentas (API)

**Files:**
- Create: `apps/api/src/auth/reactivacion.service.ts`, `reactivacion.service.spec.ts`, `apps/api/src/auth/dto/reactivacion.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts` (`login` l.~229), `auth.controller.ts`, `strategies/jwt.strategy.ts`, `apps/api/src/board/board.service.ts` (`proposeAction`, `execute`), `board.controller.ts`

**Interfaces:**
- Consumes: Task 1; `GroupsService.syncMemberships(userId, birthDepartment, currentCountry, currentRegion)`.
- Produces:
  - **`login`:** para `status==='suspended'` (con la contraseña correcta) lanza `ForbiddenException({codigo:'cuenta_suspendida', message:'Tu cuenta está suspendida.', reactivacionToken})`. No crea refresh token ni cookies. Los demás estados no cambian.
  - `ReactivacionService.firmarToken(userId): string`: JWT `{sub, proposito:'reactivacion'}`, 30 minutos, con el secreto de acceso.
  - `ReactivacionService.verificarToken(token): string` (devuelve el `userId`): 401 si es inválido, si no tiene ese propósito o si la cuenta ya no está `suspended`.
  - `JwtStrategy.validate` rechaza cualquier payload con `proposito`.
  - `ReactivacionService.caso(token, now): Promise<CasoSuspension>`:
    - `motivo` y `suspendidaAt` salen de la última `BoardAction` `suspend_user` ejecutada sobre ese usuario (`reason`, `resolvedAt`);
    - `puedePedirDesde` es `resueltaAt + 30 días` del último rechazo, si aún no llegó; si no, `null`.
  - `ReactivacionService.pedir(token, texto, now): Promise<CasoSuspension>`:
    - 409 si ya hay una pendiente;
    - 409 si está dentro de la espera de 30 días.
    - Audita `reactivacion.pedida` (`resource: user:<id>`, sin el texto).
  - Rutas sin `JwtAuthGuard`, con el throttle del login:
    - `POST /auth/reactivacion/caso` `{token}`;
    - `POST /auth/reactivacion` `{token, texto}`.
  - **Mesa:** `GET /board/reactivaciones` (`BoardGuard`) devuelve las pendientes `{id, userId, nombre, motivoSuspension, texto, createdAt}`, con el nombre visible y nunca el correo.
  - **`proposeAction`:**
    - `reactivate_user` y `rechazar_reactivacion` requieren `params.solicitudId` de una solicitud pendiente cuyo `userId` sea `targetUserId`;
    - para `rechazar_reactivacion`, `reason` es el motivo que verá la persona.
  - **`execute`:**
    - `reactivate_user`: la cuenta vuelve a `estadoPrevio` (si falta, `pending_verification`). Si queda `verified_citizen`, en `despues[]` se llama a `syncMemberships`. La solicitud pasa a `aprobada`. Si la cuenta ya no está `suspended`, devuelve false.
    - `rechazar_reactivacion`: la solicitud pasa a `rechazada` con `motivoRechazo = reason`.

- [ ] **Step 1: Write the failing tests.**
  - `login de una cuenta suspendida da 403 con el token de reactivación y sin sesión`.
  - `el token de reactivación no sirve como sesión` (Review Focus 5): `JwtStrategy.validate({sub, proposito:'reactivacion'})` lanza un error.
  - `caso muestra el motivo de la suspensión`.
  - `pedir dos veces da 409`.
  - `tras un rechazo hay que esperar 30 días`.
  - `reactivar devuelve el estado previo y resincroniza las comunidades, sin cargos`.
  - `sin estado previo, reactiva a pending_verification`.
  - `rechazar guarda el motivo que ve la persona`.
  - `el token de una cuenta ya reactivada da 401` (Review Focus 5).
  - `users.service` sigue sin reactivar a un suspendido (la prueba que ya existe).
- [ ] **Step 2: Run** las pruebas de `src/auth` y `src/board` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Las pruebas → PASS. Toda la suite → verde.
- [ ] **Step 5: Commit.** `feat(cuentas): pedir la reactivación y que la mesa la resuelva con 2 de 3 (3C-2)`

### Task 6: «Observar» y observaciones públicas (API)

**Files:**
- Create: `apps/api/src/elecciones/observar.service.ts`, `observar.service.spec.ts`, `observar.controller.ts`, `observador.guard.ts`, `dto/observacion.dto.ts`
- Modify: `elecciones.module.ts`, `elecciones.service.ts` (`representantes()` añade `observaciones`)

**Interfaces:**
- Consumes: `AuditService.getEvents(dto)` y `getEventById(id)`; `GuardiaService.antesDePublicar` con `tipo:'observacion'` y su publicador registrado.
- Produces:
  - `ObservadorGuard` (después de `JwtAuthGuard`): 403 `Esta sección es solo para los observadores.` si el perfil no tiene un cargo de observador vigente o la cuenta no está `verified_citizen`. La relee de la base de datos.
  - Rutas `@Controller('observar')`:
    - `GET /observar/eventos`: los mismos filtros que `/audit/events`; devuelve `AuditEventSummary[]` con paginación;
    - `GET /observar/verificaciones`: `{nombre, invitador: number, segunda: number}[]` desde `VerificationReference`, agrupado por quien confirma, ordenado de más a menos, con el nombre visible;
    - `GET /observar/matrices`: `{elecciones, decisiones, votaciones, sorteos}`, cada una con id, título o cargo, fecha, matrices y semilla. Salen de `Eleccion` (fase `contada`), `Decision`, `ElectionResult` y `SortitionDraw` (estado completed), las 50 más recientes de cada una. Sin papeletas ni ningún `profileId` de votante;
    - `GET /observar/gastos`: `{mes, usd}[]` desde `UsoAsistente`;
    - `POST /observar/observaciones` `{auditEventId, texto, pedirRevision?}`: el evento debe existir (404 si no). Pasa por la guardia y, al publicarse, crea la `ObservacionPublica` y audita `observacion.publicada`.
  - `representantes()` añade `observaciones` (las 20 más recientes, con autor, iniciales y el `action` y la fecha del evento).

- [ ] **Step 1: Write the failing tests.**
  - `solo un observador vigente entra`: un ciudadano sin cargo → 403; un observador con el cargo terminado → 403.
  - `las matrices no exponen papeletas ni votantes`: la consulta de `Eleccion` no incluye `papeletas`, y la respuesta no contiene ningún `profileId` de los simulados.
  - `las estadísticas de verificación cuentan por quien confirma`.
  - `una observación sobre un evento que no existe da 404`.
  - `una observación publicada aparece en representantes con el nombre visible`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Las pruebas → PASS. Toda la suite → verde.
- [ ] **Step 5: Commit.** `feat(observadores): página Observar de solo lectura y observaciones públicas (3C-2)`

### Task 7: Las elecciones en «Desde tu última visita»

**Files:**
- Modify: `apps/api/src/asistente/al-dia.service.ts` (`armarItems`, `ETIQUETA`), `apps/web/components/AlDiaCard.tsx` (`ETIQUETA`)
- Test: `apps/api/src/asistente/al-dia.service.spec.ts`

**Interfaces:**
- Consumes: la función pura `filtroElectorado` de `elecciones/convocatoria.service.ts` (no el módulo, para evitar el ciclo).
- Produces, dentro de la ventana `desde`..`ahora` y respetando `MAX_ITEMS`:
  - `eleccion_candidaturas`, para cada `Eleccion` creada en la ventana y en fase `candidaturas`, si la persona está en su electorado:
    - título `Se abrieron las candidaturas para <CARGO_ETIQUETA>` (más ` · <comunidad>` si es de coordinadores);
    - `ruta: /elecciones/<id>`, `fecha: candidaturasEndsAt`.
  - `eleccion_votar`, para cada `Eleccion` en `votacion` con `votacionEndsAt > ahora`, si la persona está en el electorado y no tiene papeleta:
    - título `Vota antes del <fecha corta es-NI>`;
    - `ruta: /elecciones/<id>`, `fecha: votacionEndsAt`.
  - La etiqueta de las dos clases es «Elecciones».
  - El resumen del asistente no cambia, y la tarjeta sigue oculta con el asistente apagado.

- [ ] **Step 1: Write the failing tests.**
  - `aparece «Se abrieron las candidaturas» para quien está en el electorado`.
  - `no aparece la elección de coordinadores de otra comunidad`.
  - `«Vota antes del…» desaparece al votar`.
  - `con el asistente apagado no hay tarjeta` (la prueba que ya existe sigue pasando).
- [ ] **Step 2: Run** `npx vitest run src/asistente/al-dia.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Las pruebas → PASS. Toda la suite → verde. `cd apps/web && npx tsc --noEmit` → sin errores.
- [ ] **Step 5: Commit.** `feat(asistente): las elecciones en «Desde tu última visita» (3C-2)`

### Task 8: Web — revocación, renuncia y observaciones en «Quiénes nos representan»

**Files:**
- Modify: `apps/web/app/representantes/page.tsx`, `apps/web/app/(app)/elecciones/page.tsx`, `apps/web/lib/actions.ts`
- Create: `apps/web/app/(app)/elecciones/revocaciones/page.tsx`, `apps/web/app/(app)/elecciones/revocaciones/ApoyoBoton.tsx`, `apps/web/app/(app)/elecciones/revocaciones/PedirRevocacionForm.tsx`, `apps/web/app/(app)/elecciones/MisCargos.tsx`

**Interfaces:**
- Consumes: las rutas de las Tasks 2, 3 y 6; `serverFetch`; el patrón `actionFetch`, `parseError` y `respuestaDeRevision` de `lib/actions.ts`; `RevisarAntesDePublicar` para el 202 y el 422 del motivo.
- Produces:
  - **Server actions:**
    - `pedirRevocacion(cargoId, _prev, formData)`;
    - `apoyarRevocacion(id, apoyar: boolean)`;
    - `renunciarCargo(cargoId)`.
  - **«Quiénes nos representan»:**
    - cada cargo con un pedido abierto muestra «Pedido de revocación: N de M apoyos · cierra el …», con una barra;
    - el enlace «Pedir la revocación de un cargo» lleva a `/elecciones/revocaciones`;
    - una sección «Observaciones públicas»: autor con hexágono, fecha, evento y texto.
  - **`/elecciones/revocaciones`:**
    - los pedidos abiertos, con el motivo, el progreso y el botón «Apoyar» / «Quitar mi apoyo»;
    - el formulario para pedir: elegir el cargo de una lista y escribir el motivo, con el contador de 600 caracteres;
    - el texto «Si un tercio de quienes votan por un cargo lo pide, se repite la elección de ese cargo. Nadie ve quién apoyó.» El tercio sale de la regla, no está fijo en el texto.
  - **«Mis cargos»** en `/elecciones`: el cargo, el mandato y el botón «Renunciar», con confirmación de dos pasos: «¿Seguro? Se abrirá una elección para cubrir tu puesto.».

- [ ] **Step 1:** Implementar. Seguir el estilo de la maqueta aprobada: tarjetas `#FFFFFF` con borde `#E4DCC6`, barra dorada `#F2B00A`, hexágonos de iniciales y botones de 44 px como mínimo.
- [ ] **Step 2: Verify.** `cd apps/web && npx tsc --noEmit` → sin errores.
- [ ] **Step 3: Commit.** `feat(web): revocación, renuncia y observaciones públicas (3C-2)`

### Task 9: Web — reactivación, mesa, «Observar» y documentación

**Files:**
- Modify: `apps/web/app/login/page.tsx`, `apps/web/middleware.ts` (`PUBLIC_EXACT` añade `/reactivacion`), `apps/web/app/(app)/admin/mesa/page.tsx`, `apps/web/components/NavBar.tsx`, `apps/web/lib/actions.ts`, `docs/DECISIONS.md` (ADR-029), `docs/ROADMAP.md`, la guía de uso (sección «Las elecciones»: añadir «Cuidar los cargos»)
- Create: `apps/web/app/reactivacion/page.tsx` (cliente), `apps/web/app/(app)/admin/mesa/ReactivacionesList.tsx`, `apps/web/app/(app)/observar/page.tsx` y sus componentes de solo lectura, `apps/web/app/(app)/observar/ObservacionForm.tsx`

**Interfaces:**
- Consumes: las rutas de las Tasks 5 y 6; `proposeBoardAction` y `voteBoardAction`.
- Produces:
  - **Login:** con un 403 y `codigo==='cuenta_suspendida'`, guarda el token en `sessionStorage` (envuelto en try/catch) y lleva a `/reactivacion`. El resto de los errores se muestra como hoy.
  - **`/reactivacion`:**
    - muestra el motivo de la suspensión y el estado del pedido (pendiente, rechazado con su motivo y la fecha desde la que puede volver a pedir);
    - formulario de 1000 caracteres y botón «Pedir la reactivación»;
    - sin token o con el token vencido: «Vuelve a entrar con tu contraseña para ver tu caso.».
  - **Mesa (`/admin/mesa`):** la sección «Pedidos de reactivación», con el nombre, el motivo de la suspensión y el texto. Tiene dos botones: «Proponer reactivar» (crea `reactivate_user`) y «Proponer rechazar» (pide el motivo y crea `rechazar_reactivacion`). Las firmas se dan en la lista de acciones que ya existe.
  - **`/observar`** (solo observadores; si la API responde 403, la página dice que es solo para observadores):
    - pestañas Auditoría, Verificaciones, Matrices y Gastos;
    - en cada evento de la auditoría, «Dejar una observación pública» abre `ObservacionForm`, de 1000 caracteres, con `RevisarAntesDePublicar`.
  - **NavBar:** el enlace «Observar» solo se muestra si `GET /api/elecciones/mis-cargos` incluye un cargo `observador`. El layout lo pasa como prop; si la llamada falla, no se muestra.
  - **ADR-029:** recoge las decisiones de este plan marcadas «(regla mía)» y en Global Constraints:
    - 45 días;
    - no hay renuncia de fundadores;
    - la suspensión borra el asiento fundador;
    - quién pide la revocación es anónimo;
    - suplentes solo para las 2 revisiones;
    - token de reactivación;
    - estado previo o `pending_verification`.

- [ ] **Step 1:** Implementar, con el estilo de la maqueta aprobada.
- [ ] **Step 2: Verify.** `cd apps/web && npx tsc --noEmit` → sin errores. En la API, `npx vitest run` → verde.
- [ ] **Step 3: Commit.** `feat(web): reactivación, pedidos en la mesa y página Observar; ADR-029 (3C-2)`
