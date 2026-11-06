# Plan 3A-4b — Comisiones y bifurcaciones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que lo que la comunidad aprueba tenga quién lo lleve a cabo, y que una minoría pueda impulsar su solución sin salir de la colmena. Todo con el mínimo de pasos manuales.
- **Comisiones:** voluntarios, sorteo verificable o votación por preferencias, informes y renovación.
- **Bifurcaciones:** «iniciativas de un grupo» formadas solo por quienes votaron esa solución, sin revelar nunca quiénes son.

**Architecture:**
- Ambas son grupos de trabajo (`Group` hijo, `type = 'trabajo'`, ADR-022) con `trabajoTipo = 'comision'` o `'bifurcacion'`.
- Tablas nuevas: voluntarios, informes, apoyos de renovación y los datos del sorteo o la elección de cada comisión.
- `GruposService` crece, separado en archivos por responsabilidad. Su programador horario suma pasadas nuevas.
- El cálculo de una elección con varios puestos es un módulo puro: Schulze repetido.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, vitest 3, Next.js 15. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-05-plan-3a4-grupos-de-trabajo-design.md` (§4, §5, §8, §10) y spec 3A §6 y §7. Base: ADR-020 (papeletas guardadas), ADR-021 (causas de moderación) y ADR-022 (grupos de trabajo).

## Global Constraints

### Comisión

- **Nacimiento automático** (R1). El programador revisa cada decisión `contada` con resultado `aprobada`.
  - Por cada solución ganadora que no tenga comisión, crea un grupo de trabajo `comision` en `convocando`:
    - **ámbito:** el grupo de la decisión, o su ámbito si la decisión fue de un subgrupo;
    - **nombre:** «Comisión: {título de la solución}», cortado a 80;
    - **propósito/tarea:** la descripción de la solución, cortada a 1000;
    - **puestos:** `comision.puestos_min`;
    - **forma:** `comision.forma`;
    - **convocatoria:** cierra en `now + comision.plazo_convocatoria_dias`;
    - **origen:** `origenSolucionId` (único).
  - Quien organiza (`canOrganize` y miembro del ámbito) puede, mientras convoca, ajustar la tarea (20 a 2000 caracteres) y los puestos (entre `comision.puestos_min` y `comision.puestos_max`).
- **Voluntarios.** Cualquier miembro actual del ámbito se ofrece, con su experiencia relacionada (0 a 500 caracteres, recortada) o sin ella, y puede retirarse mientras convoca.
  - Si la comisión es de una bifurcación, solo pueden ofrecerse miembros de esa bifurcación.
  - El formulario advierte: «No escribas datos que te identifiquen fuera de la comunidad».
- **Al cerrar la convocatoria** (automático, una sola vez, con la fila bloqueada y `updateMany` condicionado):
  - **Menos voluntarios que puestos y sin ampliación previa:** se amplía 7 días, una sola vez (R2).
  - **0 voluntarios tras ampliar:** pasa a `archivado`.
  - **Con forma `sorteo`:**
    - si hay más voluntarios que puestos, se usan `sortPool` + `generateSeed` + `selectMembers` de `sortition-algorithm.ts`, y se guardan `seleccionSemilla`, `seleccionPool` (los profileIds ordenados) y `seleccionAlgoritmo = ALGORITHM_VERSION`;
    - si hay tantos o menos, entran todos sin sorteo.
    - Los elegidos pasan a ser miembros y el grupo, `activo` con foro por defecto.
  - **Con forma `preferencias`:**
    - si hay más voluntarios que puestos, se abre una elección: `eleccionEndsAt = now + votacion.plazo_dias`, con estado `eligiendo` (valor nuevo de `TrabajoEstado`);
    - si no, entran todos.
- **Elección por preferencias.** Votan los miembros actuales del ámbito, ordenando a los voluntarios que aceptan.
  - Al vencer, un cálculo puro `elegirPuestos(papeletas, candidatos, puestos)` hace Schulze repetido: gana el primero, se quita y se repite hasta llenar los puestos.
  - Un empate se desempata por orden lexicográfico de profileId, documentado y verificable.
  - Se guardan las matrices de cada ronda y nunca se muestra la papeleta de nadie.
- **Informes:**
  - Solo los miembros de una comisión `activa` publican un informe (20 a 2000 caracteres) o el informe final (20 a 5000).
  - `proximoInformeAt = activadaAt + comision.informe_cada_dias`, y se recalcula como `informeAt + comision.informe_cada_dias` con cada informe.
  - La página muestra «Próximo informe antes del {fecha}» y, desde 3 días antes, el aviso «Toca informar pronto» (R3).
  - **Atraso:** si `now > proximoInformeAt + comision.informe_cada_dias`, se faltó a dos informes.
- **Renovación.** Con la comisión atrasada, cualquier miembro actual del ámbito apoya la renovación (un apoyo por persona).
  - Cuando los apoyos de miembros actuales llegan a `ceil(debate.fraccion_objecion_modo × P / 100)`, con P = participantes del debate original que siguen siendo miembros, la comisión pasa a `cerrado` y nace una comisión nueva para la misma solución con convocatoria nueva.
  - Para eso, `origenSolucionId` deja de ser único entre comisiones `cerrado`; ver Task 1.
- **Informe final.** Lo publica un miembro y la comisión pasa a `cerrado`. El informe final aparece en `GET /api/public/consensos`, sin nombres, junto a la solución de origen (`informeFinal: string | null` en `PublicConsensus`).

### Bifurcación

- **Cuándo.** Una solución `S` de una decisión `contada` puede bifurcarse si:
  - `resultado = 'sin_quorum'`, o
  - el modo es `excluyentes` y `S` no está en `ganadoras`.

  Las decisiones de grupos de trabajo no se bifurcan.
- **Elegibles.** Son quienes, en su papeleta de esa decisión, tienen `S` en `orden` (si había una sola candidata, `orden = [S]` es «Apruebo») y siguen siendo miembros del ámbito.
  - El sistema lo comprueba con `DecisionPapeleta` y **nunca** lo revela: a quien no es elegible le responde 403 «Solo quienes apoyaron esta solución pueden sumarse.».
- **Iniciar y sumarse.**
  - Cualquier elegible inicia la bifurcación de `S` (una por solución; `origenSolucionId` único entre bifurcaciones) durante `bifurcacion.plazo_dias` desde `contadaAt`.
  - Nace en `convocando` con `convocatoriaEndsAt = contadaAt + bifurcacion.plazo_dias`, y se activa al llegar a `bifurcacion.minimo_personas` (misma lógica que el subgrupo).
  - Si vence sin el mínimo, pasa a `archivado`.
- **Privacidad** (R4):
  - Solo sus miembros la leen; el ámbito no lee su foro.
  - Fuera se ve «Iniciativa de un grupo», el nombre de la solución y cuántos son, nunca quiénes.
  - Sumarse o salir **no** se audita.
  - `miembrosNombres` siempre va vacío.
- **Pausa.** Quien organiza la pausa con una causa de `MODERACION_CAUSAS` y un detalle opcional; queda en `pausado` y no se participa.
  - Un miembro apela una sola vez, con un texto de 10 a 1000 caracteres; la mesa resuelve: reanudar (`activo`) o mantener.
- **Volver a la colmena.** Cualquier miembro lleva la solución de origen `S` a su ámbito como inquietud en plazo (el mismo camino que `llevar`, con `origenSolucionId = S`, una vez). También puede llevar las ganadoras de sus propias votaciones, como un subgrupo.
- **Comisión propia.** Un miembro pide una comisión para la bifurcación. Nace como en R1, con tarea = la solución de origen, `origenGrupoId` = la bifurcación y voluntarios limitados a sus miembros.

### Común

- Auditoría sin texto ni nombres en `metadata`:
  - `comision.created`, `comision.volunteered`, `comision.withdrew`, `comision.selected` (con `{ grupoId, forma }`), `comision.extended`, `comision.report_published`, `comision.renewal_supported`, `comision.renewed`, `comision.closed`;
  - `bifurcacion.started`, `bifurcacion.activated`, `bifurcacion.paused`, `bifurcacion.appealed`, `bifurcacion.resumed`, `bifurcacion.carried_back`.

  `bifurcacion.started` lleva `{ grupoId }` y su actor **no** se registra; iniciar delataría el voto.
- Ofrecerse como voluntario se audita, porque es público dentro del ámbito.
- Mensajes en español. Tildes solo con Edit/Write y verificadas en UTF-8 estricto. Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca se hace commit de `apps/web/next-env.d.ts` ni de `.superpowers/`.

## Review Focus

1. **Nadie puede deducir cómo votó otra persona.**
   - No hay lista de miembros de una bifurcación en ninguna respuesta, auditoría, foro visible al ámbito, ni en `GET /api/grupos` o `/decisiones`.
   - La respuesta a quien no es elegible no distingue entre «votó otra cosa» y «no votó».
   - La elección por preferencias no expone papeletas.
2. **Una sola vez:**
   - una comisión por solución aprobada, aunque el programador corra dos veces a la vez;
   - una bifurcación por solución;
   - una selección por convocatoria;
   - una renovación por atraso.
3. **El sorteo es verificable:** con la semilla y el pool guardados, `verifySelection` reproduce a los elegidos.
4. **Quien se mudó o fue suspendido:** no se ofrece, no apoya renovaciones y no cuenta en el umbral de renovación.
5. **Una comisión archivada o cerrada, o una bifurcación pausada:** no acepta escrituras (`requireParticipant` ya exige `activo`). Los informes solo se publican en `activo`.

---

### Task 1: Base de datos y tipos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migración `20261108120000_comisiones_y_bifurcaciones`
- Modify: `packages/shared/src/types/group.types.ts`, `forum.types.ts` (`PublicConsensus.informeFinal`)

**Interfaces:**
- **Prisma:**
  - `TrabajoEstado` suma `eligiendo`.
  - `Group` suma:
    - `origenSolucionId String? @db.Uuid`
    - `origenGrupoId String? @db.Uuid`
    - `tarea String? @db.VarChar(2000)`
    - `puestos Int?`
    - `forma String? @db.VarChar(20)`
    - `ampliada Boolean @default(false)`
    - `eleccionEndsAt DateTime? @db.Timestamptz`
    - `seleccionSemilla String?`
    - `seleccionPool Json?`
    - `seleccionAlgoritmo String?`
    - `eleccionResultado Json?`
    - `activadaAt DateTime? @db.Timestamptz`
    - `proximoInformeAt DateTime? @db.Timestamptz`
    - `pausaCausa ModeracionCausa?`
    - `pausaDetalle String? @db.VarChar(500)`
    - `pausaApelacion String? @db.VarChar(1000)`
    - `pausaApeladaAt DateTime? @db.Timestamptz`
  - Índice parcial único en SQL, para una sola comisión viva por solución: `UNIQUE ("origenSolucionId") WHERE "trabajoTipo" = 'comision' AND "trabajoEstado" NOT IN ('cerrado','archivado')`.
  - Índice parcial único en SQL, para una sola bifurcación por solución: `UNIQUE ("origenSolucionId") WHERE "trabajoTipo" = 'bifurcacion'`.
  - Ninguno de los dos índices lo conoce Prisma; ponlo en un comentario del esquema.
  - Modelos nuevos:
    - `ComisionVoluntario` (`comision_voluntarios`): `grupoId` (cascade), `profileId` (cascade), `experiencia VarChar(500)`, `createdAt`, `@@unique([grupoId, profileId])`.
    - `ComisionInforme` (`comision_informes`): `grupoId` (cascade), `autorProfileId` (columna simple), `texto VarChar(5000)`, `final Boolean`, `hidden Boolean @default(false)`, `createdAt`.
    - `ComisionRenovacionApoyo` (`comision_renovacion_apoyos`): `grupoId` (cascade), `profileId` (cascade), `createdAt`, `@@unique([grupoId, profileId])`.
    - `ComisionPapeleta` (`comision_papeletas`): `grupoId` (cascade), `profileId` (cascade), `orden String[] @db.Uuid` (profileIds de voluntarios), `@@unique([grupoId, profileId])`.
- **Shared:** `GrupoTrabajoDetail` suma `comision: ComisionView | null` y `bifurcacion: BifurcacionView | null`, con:
  ```ts
  export interface ComisionView {
    tarea: string; puestos: number; forma: 'sorteo' | 'preferencias';
    voluntarios: { nombre: string; experiencia: string; soyYo: boolean }[];  // nombres visibles en el ámbito
    yoVoluntario: boolean; ampliada: boolean;
    seleccion: { semilla: string; pool: string[]; algoritmo: string } | null;
    eleccionEndsAt: string | null; miPapeleta: string[] | null;
    informes: { texto: string; final: boolean; createdAt: string; oculto: boolean }[];
    proximoInformeAt: string | null; atrasada: boolean; yoApoyoRenovar: boolean; puedoApoyarRenovar: boolean;
    puedoAjustar: boolean; puedoInformar: boolean;
    origen: { proposalId: string; solucionTitulo: string } | null;
  }
  export interface BifurcacionView {
    solucionTitulo: string; proposalId: string;
    pausa: { causa: string; detalle: string; apelada: boolean } | null;
    puedoApelar: boolean; puedoPausar: boolean; puedoPedirComision: boolean; yaLlevada: boolean;
  }
  ```
  A `TrabajoEstadoValue` se le suma `'eligiendo'`.

- [ ] **Step 1:** Edita el esquema, genera la migración con `migrate diff` y agrega a mano al final los dos índices parciales. Verifica que no borre índices hechos a mano. Aplica con `migrate deploy` y genera el cliente.
- [ ] **Step 2:** Agrega los tipos. Ejecuta `pnpm --filter @decide/shared build && pnpm --filter @decide/api typecheck && cd apps/api && npx vitest run && (cd ../web && npx tsc --noEmit)`. Expected: todo pasa (687).
- [ ] **Step 3:** Commit: `BD: comisiones y bifurcaciones`.

---

### Task 2: Cálculo puro de puestos por preferencias

**Files:** Create `apps/api/src/grupos/elegir-puestos.ts` (+ spec)

**Interfaces:**
- Produces:
  ```ts
  export function elegirPuestos(
    papeletas: string[][], candidatos: string[], puestos: number,
  ): { elegidos: string[]; rondas: { pairwiseMatrix: number[][]; schulzeMatrix: number[][]; candidatos: string[] }[] };
  ```

**Algoritmo:**
- Mientras falten puestos y queden candidatos:
  1. Ejecuta `runSchulze` con las papeletas, quitando de cada `orden` a los ya elegidos; las omitidas quedan empatadas al final.
  2. De los ganadores, toma el menor por orden lexicográfico (desempate determinista) y guarda la ronda.
- Si hay tantos o menos candidatos que puestos, los elige a todos sin rondas.

- [ ] **Step 1:** Escribe las pruebas:
  - 3 candidatos y 2 puestos con un ganador claro y un segundo claro;
  - empate resuelto por orden lexicográfico;
  - ninguna papeleta: elige por orden lexicográfico;
  - con candidatos ≤ puestos, todos sin rondas;
  - es determinista.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Expected: PASS. Commit: `API: elegir varios puestos por preferencias (Schulze repetido)`.

---

### Task 3: Comisiones — nacimiento, voluntarios, selección y elección

**Files:**
- Create: `apps/api/src/grupos/comisiones.service.ts` (+ spec), DTOs (`ajustar-comision.dto.ts`, `voluntario.dto.ts`, `papeleta-comision.dto.ts`)
- Modify: `grupos.module.ts`, `grupos.controller.ts`, `grupos.scheduler.ts`, `grupos.service.ts` (`construirDetalle` suma `comision`)

**Interfaces (HTTP):**
- `POST /api/grupos/:id/voluntario` con `{ experiencia? }`
- `DELETE /api/grupos/:id/voluntario`
- `PATCH /api/grupos/:id/comision` con `{ tarea?, puestos? }`
- `PUT /api/grupos/:id/comision/papeleta` con `{ orden: string[] }`
- `GET /api/grupos/:id/comision/verificar` → `{ ok: boolean; elegidos: string[] }` (`verifySelection`)

**Pasadas del programador** (cada una con su transacción, fila bloqueada, `updateMany` condicionado y auditoría solo si `count = 1`):
- **crear comisiones** de soluciones ganadoras sin comisión viva (P2002 sobre el índice parcial → se ignora);
- **cerrar convocatorias** vencidas: ampliar, archivar, seleccionar o pasar a elegir;
- **cerrar elecciones** vencidas con `elegirPuestos`, guardando `eleccionResultado` con elegidos y rondas.

Al activar, `activadaAt = now` y `proximoInformeAt = now + comision.informe_cada_dias`.

- [ ] **Step 1:** Escribe las pruebas, que cubren Global Constraints «Comisión» hasta la elección, más Review Focus 2, 3 y 4:
  - una comisión por ganadora, aunque haya dos pasadas a la vez;
  - el voluntario fuera del ámbito recibe 403, y el de una bifurcación debe ser miembro de ella;
  - se amplía una sola vez;
  - con 0 voluntarios se archiva;
  - el sorteo verificable reproduce a los elegidos;
  - con preferencias abre la elección y al cerrar elige con `elegirPuestos`;
  - nunca se devuelve la papeleta de otra persona;
  - el ajuste es solo de quien organiza y respeta los límites.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta la suite completa y los typechecks. Expected: todo pasa. Commit: `API: comisiones con voluntarios, sorteo verificable o preferencias`.

---

### Task 4: Comisiones — informes, renovación, cierre y consenso público

**Files:** Modify `comisiones.service.ts` (+ spec), `grupos.controller.ts`, `apps/api/src/forums/forums.service.ts` (`publicConsensus`)

**Interfaces (HTTP):**
- `POST /api/grupos/:id/informes` con `{ texto, final }`
- `POST /api/grupos/:id/renovacion` (apoyar)
- `DELETE /api/grupos/:id/renovacion` (retirar el apoyo)

**Reglas:**
- **Informes:** los publica un participante de una comisión `activa`.
  - Un informe final cierra la comisión con un `updateMany` condicionado a `activo`.
  - Los informes se moderan: `ComisionInforme.hidden`; agrega el tipo `informe` a la moderación, con su propia rama, sin quórum.
- **Renovación:**
  - Solo con la comisión atrasada.
  - La apoyan los miembros actuales del ámbito.
  - Se evalúa al apoyar: si alcanza el umbral, en una transacción con la fila bloqueada, la comisión pasa a `cerrado` y se crea la nueva comisión para la misma solución.
- **`publicConsensus`:** agrega `informeFinal` desde la comisión `cerrado` con informe final no oculto de la solución ganadora del tema; si hay varias, la más reciente.

- [ ] **Step 1:** Escribe las pruebas:
  - publicar en `activo`, y 409 si no está activa;
  - el final cierra la comisión;
  - el cálculo del atraso;
  - el umbral de renovación cuenta solo a miembros actuales;
  - una sola renovación aunque haya dos apoyos a la vez;
  - el informe oculto no sale en `publicConsensus`.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta la suite completa y los typechecks. Expected: todo pasa. Commit: `API: informes, renovación y cierre de comisiones`.

---

### Task 5: Bifurcaciones

**Files:**
- Create: `apps/api/src/grupos/bifurcaciones.service.ts` (+ spec)
- Modify: `grupos.controller.ts`, `grupos.scheduler.ts`, `grupos.service.ts` (`entrar`/`salir` según tipo; `construirDetalle` suma `bifurcacion`; `GET /api/grupos` muestra «Iniciativa de un grupo»), `apps/api/src/groups/group-access.service.ts` (`nivel`: una bifurcación **no** la lee el ámbito), `forums/forums.service.ts` (cola de la mesa para apelaciones de pausa) y `decisiones.service.ts` (`getResumen` y `getTema`)

**Interfaces (HTTP):**
- `GET /api/decisiones/temas/:proposalId` suma a cada candidata perdedora `bifurcable: boolean` y `puedoIniciarBifurcacion: boolean`. Este último solo es true para quien es elegible; para cualquier otra persona da false sin decir por qué.
- `POST /api/grupos/bifurcaciones` con `{ solucionId }` → `{ id }`
- `POST /api/grupos/:id/entrar` y `/salir` sirven también para bifurcaciones, con la elegibilidad.
- `POST /api/grupos/:id/pausa` con `{ causa, detalle? }` (quien organiza)
- `POST /api/grupos/:id/pausa/apelacion` con `{ texto }`
- `POST /api/grupos/:id/pausa/resolver` con `{ reanudar: boolean }` (mesa)
- `POST /api/grupos/:id/comision` (pedir la comisión propia)
- `POST /api/grupos/:id/llevar` acepta, en una bifurcación, `{ solucionId: S }`, que es la de origen.

- [ ] **Step 1:** Escribe las pruebas, que cubren Global Constraints «Bifurcación» y Review Focus 1:
  - solo inicia o se suma quien tenía `S` en su orden;
  - el 403 es idéntico para quien votó otra cosa y para quien no votó;
  - una bifurcación por solución;
  - nace con el mínimo y se archiva al vencer;
  - ninguna respuesta (detalle, lista, resumen, auditoría, `getTema`) contiene el profileId ni el nombre de otro miembro; búscalo en el JSON;
  - el ámbito no lee el foro (403);
  - pausar, apelar una vez y resolver;
  - volver a la colmena una vez;
  - la comisión propia limita a los voluntarios.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta la suite completa y los typechecks. Expected: todo pasa. Commit: `API: bifurcaciones que nunca revelan quiénes las forman`.

---

### Task 6: Web

**Files:**
- Modify: `apps/web/app/(app)/grupos/[id]/page.tsx` (secciones por tipo), `grupos/page.tsx`, `GrupoCard.tsx`
- Create: componentes cliente en `grupos/[id]/`
- Modify: `apps/web/lib/actions.ts`, `apps/web/app/(app)/proposals/[id]/ResultadoDecision.tsx` (botón «Impulsar esta solución como iniciativa de un grupo» solo si `puedoIniciarBifurcacion`), `decisiones/page.tsx` y `admin/mesa/page.tsx` (apelaciones de pausa)

**Textos:**
- **Comisión que convoca:**
  - «Esta comisión llevará a cabo: {tarea}»
  - «Puestos: {n} · Forma: sorteo / votación por preferencias»
  - Botón «Me ofrezco» con el campo «Tu experiencia relacionada (opcional)», el aviso «No escribas datos que te identifiquen fuera de la comunidad» y «Retirarme».
  - Lista de voluntarios con su experiencia.
  - Quien organiza ve «Ajustar tarea y puestos».
- **Elección:** papeleta para ordenar a los voluntarios que aceptas, con «Las que no marques cuentan como no elegidas» y «Guardar mi papeleta».
- **Comisión activa:**
  - miembros, informes con fecha, «Próximo informe antes del {fecha}» y el aviso «Toca informar pronto» los últimos 3 días;
  - para los miembros, el formulario «Publicar informe» con la casilla «Es el informe final»;
  - si está atrasada, «Esta comisión no ha informado a tiempo» y el botón «Apoyo renovarla» o «Retirar mi apoyo»;
  - sorteo: «Ver cómo se hizo el sorteo», con la semilla y el pool, y «Verificar».
- **Bifurcación:**
  - título «Iniciativa de un grupo: {solución}» y «{n} personas»;
  - para miembros: foro, «Volver a la colmena: llevar la solución a la comunidad» y «Pedir una comisión»;
  - si está pausada: causa, detalle y «Apelar» una vez;
  - quien organiza ve «Pausar» con la lista de causas.
- **«Decisiones»:** las iniciativas aparecen en «Grupos de trabajo» como «Iniciativa de un grupo · {n} personas»; las comisiones, con su último informe.

- [ ] **Step 1:** Implementa. Ejecuta `cd apps/web && npx tsc --noEmit`. Expected: sin errores. Verifica UTF-8.
- [ ] **Step 2:** Commit: `Web: comisiones e iniciativas de un grupo`.

---

### Task 7: Documentación

- [ ] ADR-023, «Comisiones y bifurcaciones», con R1 a R4; ROADMAP. Verifica UTF-8 y haz commit: `Docs: ADR-023 y hoja de ruta de 3A-4b`.

## Rulings del plan

- **R1:** la comisión nace sola al aprobarse una solución, con la tarea, los puestos y la forma por defecto. Quien organiza solo ajusta si quiere. Así se cumple el principio de Carlos («toda complejidad automatizada»). Costo si está mal: exigir que alguien la cree.
- **R2:** si faltan voluntarios, se amplía la convocatoria 7 días una sola vez, automáticamente. Después se forma con quienes haya, o se archiva si no hay nadie. El spec pedía que lo decidiera quien organiza; se automatiza por el mismo principio. Costo si está mal: volver a la decisión manual.
- **R3:** no existe un sistema de notificaciones. El «aviso 3 días antes» es un aviso en la página de la comisión. Las notificaciones reales llegarán con el agente (3B) o con el correo. Costo si está mal: ninguno; se suma después.
- **R4:** el ámbito no lee el foro de una bifurcación. Los nombres de quienes escriben revelarían quiénes votaron esa solución, y el spec manda no revelarlo nunca (§5), lo que prevalece sobre la lectura general de §2. Costo si está mal: abrir la lectura.
