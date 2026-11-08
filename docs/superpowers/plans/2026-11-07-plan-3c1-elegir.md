# Plan 3C-1: elegir a quienes nos representan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elecciones automáticas de la mesa, los observadores y los coordinadores de comunidad, con candidaturas, la papeleta de 3A-3, conteo por mayoría y Schulze, toma del cargo automática, permisos de los coordinadores y las páginas «Elecciones» y «Quiénes nos representan».

**Architecture:**
- Un módulo nuevo `elecciones` en la API con tres piezas:
  - un conteo puro y determinista (`conteo.ts`);
  - un servicio que convoca, avanza fases, cuenta y da posesión;
  - un programador horario como los de 3A.
- Los mandatos viven en una tabla `Cargo`. Para la mesa, `BoardSeat` sigue siendo la fuente de permisos y se actualiza al tomar el cargo.
- La web reutiliza la papeleta de 3A-3 y el estilo de la maqueta aprobada.

**Tech Stack:** NestJS 10, Prisma 6 y Postgres, Next.js 15 / React 19, `@decide/shared`, vitest con Prisma simulado.

**Spec:** `docs/superpowers/specs/2026-11-07-plan-3c-elecciones-design.md`. Parte 3C-1 de §12. Maqueta aprobada: https://claude.ai/artifact/1FJQnPZyKNVn2Bu2Erd3dg

## Global Constraints

- **Papeleta:** la de 3A-3. Una papeleta es una abstención o un orden de candidaturas aceptadas; quien queda fuera, queda rechazado. Se puede cambiar hasta el cierre.
- **Quién queda elegido:**
  - quien aparece en **más de la mitad de las papeletas no abstenidas** (`estaAprobada` de `decisiones/decision-tally.ts`);
  - en orden Schulze, hasta llenar los puestos;
  - un empate exacto se resuelve con `selectMembers` de `sortition/sortition-algorithm.ts` y una semilla pública guardada.
- **Participación mínima:** `votacion.quorum_porcentaje` del ámbito (20). Las abstenciones cuentan.
- **Cargos y reglas:**

  | Cargo | Puestos | Electorado | Período |
  |---|---|---|---|
  | Administrador, coordinador general, secretario | 1 cada uno | Toda la plataforma (cuentas `verified_citizen`) | `cargos.periodo_mesa_meses` (12) |
  | Observadores | `observadores.numero` (7) | Toda la plataforma | `cargos.periodo_mesa_meses` |
  | Coordinadores | 2 por comunidad activa | Personas verificadas de esa comunidad | `cargos.periodo_coordinadores_meses` (6) |

  - Plazos: `eleccion.plazo_candidaturas_dias` (7) y `eleccion.plazo_votacion_dias` (7).
  - Primera jornada de la mesa: `eleccion.minimo_primera` (12). Activación de una comunidad: `comunidad.minimo_activacion` (7).
- **Disparadores de la convocatoria:**
  - primera jornada (mesa y observadores, juntos);
  - activación de una comunidad;
  - renovación **21 días antes** de que termine el período;
  - reintento **30 días** después de un puesto sin elegir.
- **Sin hueco:**
  - con pocas candidaturas, el plazo se alarga 7 días una sola vez;
  - un puesto sin elegir deja a quien lo ocupaba «en funciones»;
  - la plataforma nunca queda sin mesa.
- **Un cargo a la vez:** nadie se presenta a un cargo distinto del que ocupa, ni a dos cargos de la misma jornada. Quien observa no ocupa otro cargo.
- **El voto es secreto:**
  - ninguna respuesta de la API dice quién votó qué;
  - la auditoría registra `eleccion.voto_emitido` sin contenido;
  - durante la votación solo se muestra la participación redondeada de 5 en 5;
  - las matrices, solo después del conteo.
- **Fichas:** iguales para todas las candidaturas, con presentación (≤ 600), hasta 3 compromisos (≤ 140 cada uno) y comunidades. Sin fotos: iniciales en un hexágono. Orden al azar estable por persona. Pasan por la moderación previa de 3B.
- **El asistente** no resume ni compara candidaturas: este plan no añade ninguna tarea de IA.
- **Reglas:** se conectan todas las «sin conectar» menos `revocacion.fraccion` (3C-2). Un cambio de regla rige desde la siguiente convocatoria.
- **Migraciones:**
  - se generan con `prisma migrate diff` en una carpeta con nombre puesto a mano;
  - nunca `migrate dev` ni `prisma format`;
  - se conservan los índices parciales hechos a mano.
- **Verificación:**
  - `pnpm --filter @decide/shared build`
  - `pnpm --filter @decide/api typecheck`
  - `cd apps/api && npx vitest run`
  - `cd apps/web && npx tsc --noEmit`
- **Archivos que no se tocan:** no se hace commit de `apps/web/next-env.d.ts` ni de `.superpowers/`.

## Review Focus

1. **Alguien que se va de la comunidad durante la votación:** su papeleta no cuenta en la elección de coordinadores de esa comunidad. Al contar solo valen las papeletas del electorado actual. *(Tarea 4)*
2. **Una candidatura cuya persona fue suspendida o cuya ficha se ocultó antes del conteo:** no puede quedar elegida; sigue en las matrices, como las soluciones ocultas de 3A-3. *(Tarea 4)*
3. **Dos ejecuciones del programador a la vez, o un reinicio a mitad:** nunca hay dos elecciones abiertas para el mismo cargo y ámbito, y nunca se da posesión dos veces. *(Tareas 3 y 4)*
4. **Ninguna candidatura después de la prórroga:** la elección se cierra sin votación, quien ocupaba el cargo sigue «en funciones» y se programa el reintento a 30 días. *(Tarea 3)*
5. **La primera jornada deja un cargo de la mesa sin elegir:** el asiento fundador sigue, marcado «en funciones», y `assignFounderSeat` queda bloqueado en cuanto hay un asiento elegido. *(Tarea 4)*

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `apps/api/prisma/schema.prisma` + migración `20261114120000_elecciones_cargos` | `Eleccion`, `Candidatura`, `PapeletaEleccion` y `Cargo`, con sus enums e índice parcial |
| `packages/shared/src/constants/elecciones.ts` | Tipos y vistas compartidas |
| `packages/shared/src/constants/rules.ts` | Conectar las 7 reglas |
| `apps/api/src/elecciones/conteo.ts` | Conteo puro: mayoría, orden Schulze por puestos y desempate |
| `apps/api/src/elecciones/convocatoria.service.ts` | Disparadores, fases y prórroga |
| `apps/api/src/elecciones/posesion.service.ts` | Contar una elección y dar posesión |
| `apps/api/src/elecciones/elecciones.service.ts` | Candidaturas, papeleta, vistas y «Quiénes nos representan» |
| `apps/api/src/elecciones/elecciones.controller.ts`, `elecciones.scheduler.ts`, `elecciones.module.ts` | HTTP y ronda horaria |
| `apps/api/src/forums/forums.service.ts` | Permisos de los coordinadores |
| `apps/web/app/(app)/elecciones/**`, `apps/web/app/representantes/page.tsx`, `apps/web/components/elecciones/*` | Páginas |
| `docs/DECISIONS.md` (ADR-028), `docs/ROADMAP.md`, `apps/api/src/asistente/guia-de-la-plataforma.md` | Documentación |

---

### Task 1: Datos, reglas conectadas y tipos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `packages/shared/src/constants/rules.ts`, `packages/shared/src/constants/index.ts`
- Create: `apps/api/prisma/migrations/20261114120000_elecciones_cargos/migration.sql`, `packages/shared/src/constants/elecciones.ts`
- Test: `packages/shared` (la prueba de reglas que exista) y `apps/api/src/rules/*.spec.ts` si comprueban `conectada`

**Interfaces:**
- Produces (Prisma):
  - Enums:
    - `CargoTipo { administrador coordinador_general secretario observador coordinador }`
    - `EleccionFase { candidaturas votacion contada }`
    - `EleccionMotivo { primera renovacion reintento }`
  - `model Eleccion`:
    - campos: `id`, `groupId` (ámbito: el nivel general o una comunidad), `cargo CargoTipo`, `puestos Int`, `motivo EleccionMotivo`, `jornadaId String? @db.Uuid`, `fase EleccionFase @default(candidaturas)`, `candidaturasEndsAt`, `votacionEndsAt`, `prorrogada Boolean @default(false)`, `miembros Int?`, `papeletasTotal Int?`, `abstenciones Int?`, `aprobaciones Int[] @default([])`, `candidatasOrden String[] @db.Uuid @default([])` (orden de las matrices), `pairwiseMatrix Json?`, `schulzeMatrix Json?`, `ordenFinal String[] @db.Uuid @default([])`, `electas String[] @db.Uuid @default([])`, `semilla String?`, `sinQuorum Boolean @default(false)`, `contadaAt DateTime?`, `createdAt`, `updatedAt`;
    - `@@index([fase])`, `@@index([groupId, cargo])`, `@@map("elecciones")`;
    - índice parcial a mano en el SQL: `elecciones_abierta_por_cargo` UNIQUE (`groupId`, `cargo`) WHERE `fase` IN ('candidaturas','votacion'), con el comentario en el schema igual que los demás índices parciales.
  - `model Candidatura`:
    - campos: `id`, `eleccionId` (Cascade), `profileId`, `presentacion VarChar(600)`, `compromisos String[]`, `oculta Boolean @default(false)`, `retiradaAt DateTime?`, `createdAt`, `updatedAt`;
    - `@@unique([eleccionId, profileId])`, `@@map("candidaturas")`.
  - `model PapeletaEleccion`:
    - campos: `id`, `eleccionId` (Cascade), `profileId`, `abstencion Boolean`, `orden String[] @db.Uuid` (ids de candidatura), `updatedAt`;
    - `@@unique([eleccionId, profileId])`, `@@map("papeletas_eleccion")`.
  - `model Cargo`:
    - campos: `id`, `tipo CargoTipo`, `groupId`, `profileId`, `eleccionId String?`, `desde DateTime`, `hasta DateTime`, `enFunciones Boolean @default(false)`, `terminadoAt DateTime?`, `createdAt`;
    - `@@index([groupId, tipo])`, `@@index([profileId])`, `@@map("cargos")`.
    - Un cargo está **vigente** si `terminadoAt` es null.
- Produces (shared, `constants/elecciones.ts`):
  - `type CargoTipoValue`, `type EleccionFaseValue`;
  - `CARGO_ETIQUETA: Record<CargoTipoValue, string>` = { administrador: 'Administración', coordinador_general: 'Coordinación general', secretario: 'Secretaría', observador: 'Observadores', coordinador: 'Coordinación de la comunidad' };
  - `PRESENTACION_MAX = 600`, `COMPROMISOS_MAX = 3`, `COMPROMISO_MAX = 140`;
  - Vistas:
    - `CandidaturaVista = { id; nombre: string; iniciales: string; comunidades: string; presentacion: string; compromisos: string[]; esMia: boolean }`
    - `EleccionResumen = { id; cargo; ambito: { id; nombre }; puestos; fase; motivo; candidaturasEndsAt; votacionEndsAt; jornadaId: string | null; puedoPresentarme: boolean; yaVote: boolean; participacionAprox: number | null }`
    - `EleccionDetalle = EleccionResumen & { candidaturas: CandidaturaVista[]; miPapeleta: { abstencion: boolean; orden: string[] } | null; resultado: ResultadoEleccionVista | null }`
    - `ResultadoEleccionVista = { electas: { candidaturaId; nombre; iniciales; lugar: number }[]; vacantes: number; sinQuorum: boolean; papeletasTotal; abstenciones; miembros; filas: { candidaturaId; nombre; aprobacionesPct: number; electa: boolean }[]; duelos: { gana: string; pierde: string; aFavor: number; enContra: number }[]; candidatasOrden: string[]; pairwiseMatrix: number[][]; schulzeMatrix: number[][]; semilla: string | null }`
    - `RepresentantesVista = { mesa: { tipo; nombre; iniciales; desde; hasta; enFunciones; fundador: boolean }[]; observadores: { nombre; iniciales; desde; hasta }[]; comunidades: { id; nombre; activa: boolean; coordinadores: { nombre; iniciales; desde; hasta; enFunciones }[]; eleccionAbierta: boolean }[] }`
- Reglas:
  - las 7 reglas (`observadores.numero`, `comunidad.minimo_activacion`, `eleccion.minimo_primera`, `cargos.periodo_mesa_meses`, `cargos.periodo_coordinadores_meses`, `eleccion.plazo_candidaturas_dias`, `eleccion.plazo_votacion_dias`) quedan con `conectada: true`;
  - `revocacion.fraccion` sigue `SIN_CONECTAR`.

- [ ] **Step 1: Write failing tests**
  - `las reglas de elecciones están conectadas y revocacion.fraccion no`, en el spec de reglas de shared, o donde ya se pruebe `conectada`.
  - Si las pruebas actuales de cambio de reglas comprueban que esas 7 no se pueden proponer, se actualizan.
- [ ] **Step 2: Run and confirm fail**
  - Run: `pnpm --filter @decide/shared test` o `cd apps/api && npx vitest run src/rules`, según dónde viva la prueba.
  - Expected: FAIL.
- [ ] **Step 3: Implement**
  - Esquema, migración (diff + índice parcial a mano, `migrate deploy && generate`), tipos shared y reglas.
- [ ] **Step 4: Full verification**
  - Run: los cuatro comandos de verificación.
  - Expected: todo verde.
- [ ] **Step 5: Commit**: `feat(elecciones): datos de elecciones y cargos, reglas conectadas (3C-1)`

### Task 2: El conteo puro

**Files:**
- Create: `apps/api/src/elecciones/conteo.ts`, `apps/api/src/elecciones/conteo.spec.ts`

**Interfaces:**
- Consumes: `runSchulze`, `buildPairwiseMatrix`, `computeStrongestPaths` (`voting/schulze.ts`), `hayQuorum` y `estaAprobada` (`decisiones/decision-tally.ts`), `selectMembers` (`sortition/sortition-algorithm.ts`).
- Produces:
  - `ordenSchulze(schulzeMatrix: number[][], candidatas: string[]): string[][]`:
    - devuelve niveles: el nivel 0 son las ganadoras de Schulze entre todas;
    - se quitan y se repite con las restantes;
    - cada nivel puede tener empates.
  - `contarEleccion(input: { candidatas: string[]; puestos: number; papeletas: { abstencion: boolean; orden: string[] }[]; miembros: number; quorumPct: number; excluidas?: string[]; semilla: string }): ConteoEleccion`, donde `ConteoEleccion = { sinQuorum: boolean; electas: string[]; ordenFinal: string[]; aprobaciones: number[]; papeletasTotal; abstenciones; validas; pairwiseMatrix; schulzeMatrix; desempateUsado: boolean }`.

Algoritmo de `contarEleccion`:
1. Sin quórum → `sinQuorum: true` y ninguna electa (las matrices igual se calculan).
2. Aprobadas = no excluidas con `estaAprobada`.
3. Se recorren los niveles de `ordenSchulze` filtrados a las aprobadas.
   - Si un nivel cabe entero en los puestos restantes, entra entero.
   - Si no, se eligen las que faltan con `selectMembers(nivelOrdenadoPorId, faltan, semilla)` y `desempateUsado = true`.
4. `ordenFinal` = las aprobadas en ese mismo orden (con el desempate aplicado) seguidas de las no aprobadas en orden Schulze.

- [ ] **Step 1: Write failing tests** (`conteo.spec.ts`):
  - `un puesto: gana la preferida de Schulze si está en más de la mitad`;
  - `nadie elegido si nadie está en más de la mitad de las no abstenidas`;
  - `las abstenciones cuentan para la participación pero no para la mitad`;
  - `sin participación mínima no hay electas pero sí matrices`;
  - `siete puestos: los siete primeros aprobados en orden Schulze`;
  - `dos puestos con empate exacto en el segundo: el desempate es reproducible con la misma semilla y cambia con otra`;
  - `una excluida no queda elegida aunque gane, y sigue en las matrices`;
  - `menos aprobadas que puestos deja vacantes (electas.length < puestos)`;
  - `ordenSchulze devuelve niveles con empates`.
- [ ] **Step 2: Run and confirm fail**
  - Run: `cd apps/api && npx vitest run src/elecciones/conteo.spec.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement** `conteo.ts`, sin Nest ni Prisma.
- [ ] **Step 4: Run tests**
  - Run: el mismo comando.
  - Expected: PASS.
- [ ] **Step 5: Commit**: `feat(elecciones): conteo por mayoría y Schulze con varios puestos (3C-1)`

### Task 3: Convocatoria automática y fases

**Files:**
- Create: `apps/api/src/elecciones/convocatoria.service.ts`, `convocatoria.service.spec.ts`, `elecciones.scheduler.ts`, `elecciones.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `RulesService.getInt(key, groupId)`, `esNivelGeneral` (`rules/ambito-reglas.ts`), `AuditService`, los modelos de la Tarea 1.
- Produces:
  - `ConvocatoriaService.convocar(now: Date): Promise<number>`: elecciones creadas.
  - `ConvocatoriaService.avanzar(now: Date): Promise<number>`: fases movidas.
  - `ConvocatoriaService.electorado(eleccion: { groupId: string; cargo: CargoTipoValue }): Promise<string[]>`: profileIds. Para la mesa y los observadores, perfiles con usuario `verified_citizen`; para coordinadores, `verified_citizen` y miembro actual del grupo.
  - `ConvocatoriaService.dejarEnFunciones(eleccion: { groupId; cargo; puestos }, now): Promise<void>`: marca `enFunciones: true` en los cargos vigentes de ese tipo y ámbito que vencen. La Tarea 4 la reutiliza.
  - `elecciones.scheduler.ts`: cada hora ejecuta `convocar` y después `avanzar`, cada uno en su propio try/catch, igual que `decisiones.scheduler.ts`. La Tarea 4 añade el conteo a esta misma ronda.

Reglas de `convocar(now)`:
- **Primera jornada:** no hay ningún `Cargo` de mesa vigente con `eleccionId` ni elección de mesa abierta, y las personas verificadas son al menos `eleccion.minimo_primera`.
  - Crea 4 elecciones con el mismo `jornadaId`: administrador, coordinador_general y secretario con 1 puesto, y observador con `observadores.numero` puestos.
  - `groupId` es el nivel general, `motivo: 'primera'`, `candidaturasEndsAt = now + plazo_candidaturas`, `votacionEndsAt = candidaturasEndsAt + plazo_votacion`.
- **Activación:** una comunidad `territorial_origin` o `territorial_residence` con `activadaAt` null y al menos `comunidad.minimo_activacion` personas verificadas.
  - Pone `activadaAt = now` y crea la elección de coordinadores (2 puestos, `motivo: 'primera'`).
- **Renovación:** un cargo vigente con `hasta - now <= 21 días` y sin elección abierta de ese cargo y ámbito.
  - Crea la elección `motivo: 'renovacion'`. Mesa y observadores en una jornada si vencen juntos.
- **Reintento:** una elección contada con `electas.length < puestos` y `contadaAt + 30 días <= now`, sin elección abierta ni otra posterior de ese cargo y ámbito.
  - Crea `motivo: 'reintento'` con los puestos que faltan.
- **Concurrencia:** cada creación captura P2002 del índice parcial y sigue: así nunca hay dos abiertas.
- **Auditoría:** `eleccion.convocada` con `{ cargo, motivo, groupId }`.

Reglas de `avanzar(now)`:
- **Al terminar las candidaturas:**
  - con menos candidaturas vivas (no retiradas ni ocultas) que puestos y `prorrogada: false`, suma 7 días a ambos plazos y pone `prorrogada: true` (auditoría `eleccion.prorrogada`);
  - con 0 candidaturas vivas tras la prórroga, pasa a contada sin papeletas (`electas: []`, `contadaAt: now`) y llama a `PosesionService.cerrarDesierta`;
  - si no, pasa a `votacion`.
- **Cada transición** usa `updateMany` con la fase anterior en el `where` (idempotente).

- [ ] **Step 1: Write failing tests**, en `convocatoria.service.spec.ts`:
  - `convoca la primera jornada con 4 elecciones al llegar a 12 verificados y no antes`;
  - `no convoca la primera jornada si ya hay una mesa elegida`;
  - `activa una comunidad al llegar a 7 y abre su elección de coordinadores`;
  - `convoca la renovación 21 días antes del fin del período`;
  - `convoca el reintento 30 días después con los puestos que faltan`;
  - `un P2002 del índice parcial no rompe la ronda ni duplica`;
  - `prorroga 7 días una sola vez con pocas candidaturas`;
  - `sin candidaturas tras la prórroga cierra sin votación y deja en funciones`;
  - `pasa a votación al terminar las candidaturas`;
  - `el electorado de coordinadores son los verificados actuales de la comunidad`;
  - `usa los valores de las reglas, no constantes` (reglas simuladas con otros valores).
- [ ] **Step 2: Run and confirm fail**
  - Run: `cd apps/api && npx vitest run src/elecciones/convocatoria.service.spec.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run tests**
  - Run: la suite completa de la API.
  - Expected: PASS.
- [ ] **Step 5: Commit**: `feat(elecciones): convocatoria automática y fases (3C-1)`

### Task 4: Contar y tomar el cargo

**Files:**
- Create: `apps/api/src/elecciones/posesion.service.ts`, `posesion.service.spec.ts`
- Modify: `apps/api/src/board/board.service.ts` (`assignFounderSeat`), `elecciones.module.ts`, `elecciones.scheduler.ts`

**Interfaces:**
- Consumes:
  - `contarEleccion` (Tarea 2), `ConvocatoriaService.electorado` (Tarea 3);
  - `RulesService.getInt('votacion.quorum_porcentaje', groupId)`, los períodos y `generateSeed` (`sortition-algorithm.ts`).
- Produces:
  - `PosesionService.contarVencidas(now: Date): Promise<number>`;
  - `PosesionService.contar(eleccionId: string, now: Date): Promise<boolean>`: idempotente; el `updateMany` exige `fase: 'votacion'`.
  - `elecciones.scheduler.ts` añade `contarVencidas(now)` después de `avanzar`, en su propio try/catch.

Al contar:
- **Papeletas:**
  - solo valen las de profileIds del electorado actual;
  - en `orden` se quitan las candidaturas retiradas.
- **`excluidas`:** candidaturas `oculta: true` o cuya persona ya no es `verified_citizen`.
- **`semilla`:** una por elección, `generateSeed()`, guardada en `semilla`.
- **Qué se guarda:** todo lo de `ConteoEleccion`, más `miembros`, `fase: 'contada'` y `contadaAt`, en una transacción con el `updateMany` de guarda.
- **Posesión, por cada electa:**
  - termina (`terminadoAt: now`) el cargo vigente del mismo tipo y ámbito que ocupa ese puesto;
  - en mesa, el único;
  - en observadores y coordinadores, los vigentes cuya renovación es esta elección, todos los de ese tipo y ámbito con `hasta <= votacionEndsAt + 1 día`, o con `enFunciones`;
  - crea `Cargo { tipo, groupId, profileId, eleccionId, desde: now, hasta: now + período }`.
- **Mesa:** `boardSeat.upsert({ where: { role }, update: { profileId, source: 'eleccion', since: now }, create: {…} })`.
- **Puestos sin cubrir:**
  - los cargos vigentes que vencen quedan con `enFunciones: true` (`ConvocatoriaService.dejarEnFunciones`); no se terminan;
  - en mesa, el `BoardSeat` no cambia.
- **Auditoría:** `eleccion.contada` con `{ electas: n, vacantes }` y `cargo.posesion` con `{ tipo, groupId }` (sin profileId en metadata pública; el actor no aplica).
- **`assignFounderSeat`:** ya bloquea con un asiento `source: 'eleccion'`. Se añade una prueba de que sigue bloqueado tras la primera posesión.

- [ ] **Step 1: Write failing tests**, en `posesion.service.spec.ts`:
  - `cuenta solo las papeletas del electorado actual`;
  - `una candidatura oculta o de una cuenta suspendida no queda elegida`;
  - `da posesión: termina el cargo anterior, crea el nuevo y actualiza el asiento de la mesa`;
  - `un puesto sin elegir deja al anterior en funciones y no cambia el asiento`;
  - `contar dos veces la misma elección no da posesión dos veces`;
  - `primera jornada con administrador sin elegir: el fundador sigue en funciones`;
  - `guarda la semilla y las matrices; desempate reproducible`;
  - `sin participación mínima: nadie elegido, todos en funciones`;
  - `la auditoría no lleva el contenido de ningún voto`.
- [ ] **Step 2: Run and confirm fail**
  - Run: `cd apps/api && npx vitest run src/elecciones/posesion.service.spec.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run tests**
  - Run: la suite completa de la API.
  - Expected: PASS.
- [ ] **Step 5: Commit**: `feat(elecciones): conteo y toma del cargo (3C-1)`

### Task 5: Candidaturas, papeleta y vistas (API)

**Files:**
- Create: `apps/api/src/elecciones/elecciones.service.ts`, `elecciones.service.spec.ts`, `elecciones.controller.ts`, `dto/candidatura.dto.ts`, `dto/papeleta-eleccion.dto.ts`
- Modify:
  - `elecciones.module.ts`;
  - la moderación previa: el tipo de contenido `candidatura` en `asistente/guardia.service.ts`, los tipos de `TextoEnRevision` y un publicador en `asistente/publicadores.ts`, siguiendo el patrón de `solucion`.

**Interfaces:**
- Consumes: `ConvocatoriaService.electorado`, `GuardiaService.antesDePublicar/despuesDePublicar`, `AuditService`, las vistas shared de la Tarea 1.
- Produces (todo con JwtAuthGuard salvo lo indicado):
  - `GET /api/elecciones` → `EleccionResumen[]`: abiertas y contadas en los últimos 30 días donde la persona está en el electorado.
  - `GET /api/elecciones/:id` → `EleccionDetalle`. 403 si no está en el electorado.
    - **Fichas:** en orden al azar estable por persona: sha256(`eleccionId + profileId + candidaturaId`).
    - **Ocultas o retiradas:** no se muestran.
    - **Durante la votación:** `participacionAprox = max(5, round5(papeletas))` si hay alguna; null en candidaturas.
    - **Contada:** `resultado` completo.
      - `aprobacionesPct` = round5 de aprobaciones / válidas.
      - Duelos: para cada par consecutivo de `ordenFinal` entre las 4 primeras, sus cifras de `pairwiseMatrix`.
  - `POST /api/elecciones/:id/candidatura` con `{ presentacion, compromisos }` → `{ id }`:
    - solo en `candidaturas` y si está en el electorado;
    - sin otra candidatura viva en la misma jornada;
    - sin un cargo vigente de otro tipo o ámbito;
    - quien observa no se presenta a la mesa;
    - el texto (presentación + compromisos) pasa por `guardia.antesDePublicar({ tipo: 'candidatura', … })`.
  - `DELETE /api/elecciones/:id/candidatura` → 204. Retira (`retiradaAt`), solo antes de la votación.
  - `PUT /api/elecciones/:id/papeleta` con `{ abstencion: boolean; orden: string[] }` → 204.
    - Solo en `votacion` y en el electorado.
    - `orden` sin duplicados, con candidaturas vivas de esa elección; vacío con `abstencion: false` = «Rechazo a todas».
    - Upsert. Auditoría `eleccion.voto_emitido` sin contenido.
  - `GET /api/representantes` **público** (sin guard; nombre visible, nunca correo) → `RepresentantesVista`.
    - Comunidades: solo las territoriales.
    - `fundador: true` si el `BoardSeat` es `source: 'fundador'`.

- [ ] **Step 1: Write failing tests**, en `elecciones.service.spec.ts`:
  - `presentarse fuera de plazo o fuera del electorado da 400/403`;
  - `no se puede presentar a dos cargos de la misma jornada`;
  - `quien ocupa otro cargo no se presenta; a la renovación del suyo sí`;
  - `la candidatura pasa por la revisión previa`;
  - `votar con una candidatura ajena o duplicada da 400`;
  - `«Rechazo a todas» y «Me abstengo» se guardan distinto`;
  - `el detalle en votación da participación redondeada y nunca papeletas ni matrices`;
  - `el orden de las fichas es estable para una persona y distinto entre personas`;
  - `ninguna respuesta incluye profileIds de quien votó`;
  - `representantes es público y no expone correos`.
- [ ] **Step 2: Run and confirm fail**
  - Run: `cd apps/api && npx vitest run src/elecciones`
  - Expected: FAIL.
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run tests**
  - Run: la suite completa de la API.
  - Expected: PASS.
- [ ] **Step 5: Commit**: `feat(elecciones): candidaturas, papeleta y vistas (3C-1)`

### Task 6: Permisos de los coordinadores

**Files:**
- Modify: `apps/api/src/forums/forums.service.ts` (`canModerate`, `canOrganize`), `forums.service.spec.ts`

**Interfaces:**
- Produces: `canModerate(profileId, groupId)` y `canOrganize(profileId, groupId)` devuelven true para la mesa (como hoy) **o** para una persona con un `Cargo` vigente `tipo: 'coordinador'` en ese grupo.
  - Si el grupo es de trabajo, también si lo es de su `parentGroupId`.
  - La persona debe seguir siendo `verified_citizen`.
- `esMesa` no cambia: las apelaciones siguen yendo solo a la mesa.

- [ ] **Step 1: Write failing tests**:
  - `un coordinador modera y organiza su comunidad`;
  - `no modera otra comunidad`;
  - `modera los grupos de trabajo de su comunidad`;
  - `un coordinador terminado o suspendido no modera`;
  - `esMesa sigue siendo falso para un coordinador`.
- [ ] **Step 2: Run and confirm fail**
  - Run: `cd apps/api && npx vitest run src/forums`
  - Expected: FAIL.
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run tests**
  - Run: la suite completa de la API.
  - Expected: PASS.
- [ ] **Step 5: Commit**: `feat(elecciones): los coordinadores organizan y moderan su comunidad (3C-1)`

### Task 7: La web

**Files:**
- Create:
  - `apps/web/app/(app)/elecciones/page.tsx`: lista con línea de tiempo;
  - `apps/web/app/(app)/elecciones/[id]/page.tsx`: ficha, papeleta y resultado según la fase;
  - `apps/web/app/(app)/elecciones/[id]/CandidaturaForm.tsx`;
  - `apps/web/app/representantes/page.tsx`: pública;
  - `apps/web/components/elecciones/LineaDeTiempo.tsx`, `FichaCandidatura.tsx`, `ResultadoEleccion.tsx`, `Hexagono.tsx`.
- Modify:
  - `apps/web/components/NavBar.tsx`: «Elecciones»;
  - el pie o la portada pública: enlace a «Quiénes nos representan»;
  - `apps/web/app/globals.css`;
  - `app/(app)/proposals/[id]/Papeleta.tsx`: si hace falta, recibe props genéricos (ítems y la acción de enviar) para reutilizarla. No cambia su comportamiento en decisiones.

Se sigue la maqueta aprobada:
- **Colores:** tinta `#1B2A4A`, dorado `#F2B00A`, azul `#2E5A99`, crema `#FFFDF7`, dorado pálido `#FCE7B2`.
- **Hexágonos con iniciales**, sin fotos.
- **Línea de tiempo de 4 pasos:** los pasados en azul con ✓, el actual en dorado y el futuro punteado.
- **Cuenta atrás grande:** «Faltan N días para votar», o «para presentarse».
- **Un solo botón** con la acción del momento: «Presentarme», «Votar» o «Ver resultado».
- **Papeleta:** «Toca a las personas que aceptas, en tu orden de preferencia. A quien no toques, lo rechazas.», con «Rechazo a todas», «Me abstengo» y «Enviar mi voto». Debajo, «Tu voto es secreto. Puedes cambiarlo hasta el cierre.» y «Las fichas salen en un orden al azar distinto para cada persona.».
- **Resultado:**
  - un panal dorado con las personas elegidas;
  - «Cómo se decidió» en 3 frases, armadas con las cifras reales;
  - barras de «¿En cuántas papeletas aparece cada persona?» con la línea punteada de la mitad;
  - los duelos;
  - «Para verificar» plegado, con las matrices, la semilla y «Descargar los datos» (JSON del resultado).
- **«Quiénes nos representan»:** la mesa, con la barra de mandato y la marca «Fundador» o «En funciones»; observadores; coordinadores por comunidad, y la frase «“Exilio y diáspora” la organiza la mesa.».
- **Accesibilidad:** botones reales, `aria-pressed` en las fichas de la papeleta y contraste de 4.5:1.
- **Formulario de candidatura:**
  - contadores de 600 y 140;
  - hasta 3 compromisos;
  - reutiliza `RevisarAntesDePublicar` para el aviso del nivel 1 y el bloqueo del nivel 2, como los demás formularios.

- [ ] **Step 1: Implement** contra los tipos shared.
- [ ] **Step 2: Verify**
  - Run: `cd apps/web && npx tsc --noEmit` y la suite de la API.
  - Expected: PASS.
- [ ] **Step 3: Commit**: `feat(web): elecciones, papeleta, resultado y quiénes nos representan (3C-1)`

### Task 8: Documentación

**Files:**
- Modify: `docs/DECISIONS.md` (ADR-028), `docs/ROADMAP.md` (3C-1), `apps/api/src/asistente/guia-de-la-plataforma.md` (sección «Elecciones», en lenguaje sencillo)

**Interfaces:**
- **ADR-028** recoge:
  - las reglas de §2 y §4 del spec tal como quedaron;
  - la tabla `Cargo` y la sincronización con `BoardSeat`;
  - el índice parcial;
  - el desempate con semilla;
  - «en funciones»;
  - las decisiones del ledger.
- **La guía** explica:
  - cómo presentarse y cómo votar;
  - qué significa «en funciones»;
  - que el asistente no recomienda candidaturas.

- [ ] **Step 1:** escribir los documentos.
- [ ] **Step 2:** verificación completa (los cuatro comandos). Expected: verde.
- [ ] **Step 3: Commit**: `docs(elecciones): ADR-028, hoja de ruta y guía (3C-1)`
