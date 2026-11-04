# Plan 3A-2 — Debate con frases al estilo Pol.is

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en cada tema abierto los miembros escriban frases cortas y marquen de acuerdo, en desacuerdo o paso, viendo el resultado de cada frase solo después de votarla. Que el sistema calcule, sin IA, los grupos de opinión, las frases puente y las frases que dividen, protegiendo siempre la identidad de cada persona.

**Architecture:**
- Tablas `frases` y `frase_votos`.
- El cálculo de grupos vive en un módulo puro y determinista, `opinion-groups.ts`, sin dependencias nuevas: matriz persona × frase, PCA a 2 dimensiones por iteración de potencias, k-means con semilla derivada del id del tema, k elegido por silueta, y luego frases puente y frases que dividen.
- `FrasesService` expone escribir, votar, la siguiente frase, la lista y el análisis.
- La moderación del plan 2 se extiende al tipo `frase`.
- La web suma la sección «Frases» en la página del tema.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, vitest 3, Next.js 15. Sin dependencias nuevas (se usa `crypto` de Node para la semilla).

**Spec:** `docs/superpowers/specs/2026-11-04-plan-3a-ciclo-comunitario-design.md` (§4 y §10; las reglas, en §8). La entrega anterior está en `docs/superpowers/plans/2026-11-04-plan-3a1-reglas-e-inquietudes.md` y en ADR-018.

## Global Constraints

- Solo los miembros del grupo del tema escriben, votan o ven frases. El tema debe estar `open` y no oculto para escribir o votar. Si el tema está oculto, no se devuelve ninguna frase.
- Frase: de 10 a 140 caracteres. Voto: `de_acuerdo`, `en_desacuerdo` o `paso`. Hay un voto por persona y frase, y se puede cambiar mientras el tema siga abierto.
- **Independencia:** el resultado de una frase solo se muestra a quien ya la votó. La siguiente frase por votar es, entre las no votadas por la persona y no ocultas, una de las que tienen **menos** votos; si hay empate, se elige al azar.
- **Cálculo:**
  - matriz con +1 (de acuerdo), −1 (en desacuerdo) y 0 (paso o sin voto);
  - entran al mapa solo quienes votaron al menos 3 frases (`MAPA_MIN_VOTOS = 3`);
  - PCA a 2 dimensiones y k-means con k de 2 a 4 (k ≤ ⌊n/3⌋), elegido por mayor silueta;
  - semilla = los primeros 8 hex de `sha256(proposalId)`, para que el cálculo sea reproducible.
- **Frase puente:** acuerdo ≥ 60 % en **cada** grupo, con al menos 3 personas de cada grupo que la votaron. **Frase que divide:** acuerdo ≥ 60 % en un grupo y ≤ 40 % en otro, ambos con al menos 3 votantes de esa frase. Acuerdo = de acuerdo ÷ (de acuerdo + en desacuerdo + paso).
- **Privacidad:**
  - el análisis solo existe si hay al menos `debate.minimo_para_grupos` personas en el mapa (regla local, 7 por defecto);
  - nunca se devuelve quién está en qué grupo, ni coordenadas de personas, ni el voto de nadie;
  - los porcentajes se redondean al múltiplo de 5 más cercano;
  - un grupo con menos de 3 personas no se muestra ni cuenta para puentes ni para frases que dividen;
  - el análisis solo incluye frases que **quien consulta ya votó**, más el número de puentes que aún no ve.
- Una frase oculta no se ofrece para votar, no aparece en listas ni en el análisis, y su texto no sale por ningún camino (regla del plan 2).
- Votar frases **no** se audita, por la misma razón que los apoyos (ADR-018). Escribir una frase sí: `frase.created` con `{ proposalId }`.
- Mensajes en español. Textos con tildes escritos solo con las herramientas Edit/Write y verificados en UTF-8 estricto. Commits con la línea final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Ver el resultado de una frase sin haberla votado, por la lista, el análisis, el error de un voto o el orden de la siguiente frase.
2. Deducir quién está en qué grupo o cómo votó alguien, con grupos pequeños, temas con pocos participantes o respuestas que cambian tras un solo voto nuevo.
3. Votar o escribir en un tema cerrado, oculto o de otra comunidad, o votar una frase oculta.
4. Un cálculo que no es reproducible (dos llamadas con los mismos datos dan grupos distintos) o que falla con matrices degeneradas: todos votan igual, una sola frase o todo «paso».
5. Una frase oculta que sigue contando en los puentes o apareciendo como «siguiente».

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `apps/api/prisma/schema.prisma` + migración `frases` | `Frase`, `FraseVoto`, enum `FraseVotoValor`, `ModerationTarget.frase` |
| `packages/shared/src/types/frase.types.ts` (nuevo) | Tipos de frases y análisis |
| `apps/api/src/frases/opinion-groups.ts` (nuevo) | Cálculo puro de grupos, puentes y frases que dividen |
| `apps/api/src/frases/*` (nuevo) | Servicio, controlador, DTOs y módulo |
| `apps/api/src/forums/forums.service.ts` | Moderación de `frase` |
| `apps/web/app/(app)/proposals/[id]/Frases*.tsx` | Sección «Frases» del tema |

---

### Task 1: Base de datos

**Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261105120000_frases/migration.sql`

**Interfaces:**
- Produces:
  - `enum FraseVotoValor { de_acuerdo en_desacuerdo paso }`;
  - `Frase { id, proposalId (FK Proposal, Cascade), authorProfileId (FK Profile), text VarChar(140), hidden Boolean @default(false), createdAt }`, con `@@index([proposalId])` y `@@map("frases")`;
  - `FraseVoto { id, fraseId (FK Frase, Cascade), profileId (FK Profile, Cascade), value FraseVotoValor, createdAt, updatedAt }`, con `@@unique([fraseId, profileId])`, `@@index([profileId])` y `@@map("frase_votos")`;
  - `ModerationTarget` suma el valor `frase`;
  - las relaciones inversas que Prisma exija.

- [ ] **Step 1:** Editar el esquema sin reformatear el archivo entero: no correr `prisma format`, solo agregar los bloques.
- [ ] **Step 2:** Generar el SQL con `prisma migrate diff`, como en 3A-1 (cargando `apps/api/.env` sin imprimirlo), en la carpeta `20261105120000_frases`. Expected: solo los objetos nuevos y el `ALTER TYPE ... ADD VALUE 'frase'`.
- [ ] **Step 3:** Run: `cd apps/api && npx prisma migrate deploy && npx prisma migrate status && npx prisma generate && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: al día, y 359 pruebas pasan.
- [ ] **Step 4: Commit** «Base de datos: frases y sus votos».

---

### Task 2: Tipos compartidos

**Files:** crear `packages/shared/src/types/frase.types.ts`; modificar `packages/shared/src/index.ts`, `packages/shared/src/types/forum.types.ts` (`ModerationAppeal.target` acepta `'frase'`) y `apps/api/src/forums/dto/moderate.dto.ts` (acepta `'frase'`).

**Interfaces:**
- Produces:
  - `type FraseVotoValue = 'de_acuerdo' | 'en_desacuerdo' | 'paso'`;
  - `interface FraseResultado { deAcuerdo: number; enDesacuerdo: number; paso: number; total: number; acuerdoPct: number }` (porcentaje redondeado a múltiplos de 5);
  - `interface FraseParaVotar { id: string; text: string }`;
  - `interface FraseItem { id; text; hidden: boolean; isAuthor: boolean; myVote: FraseVotoValue | null; resultado: FraseResultado | null; hiddenReason: string | null; moderationId: string | null }`. `resultado` solo existe si `myVote !== null`;
  - `interface FrasesResponse { items: FraseItem[]; pendientes: number }`, donde `pendientes` es cuántas frases visibles aún no votó la persona;
  - `interface GrupoOpinion { id: number; size: number; }`;
  - `interface FraseAnalisis { fraseId: string; text: string; acuerdoPorGrupo: { grupo: number; acuerdoPct: number }[] }`;
  - `type OpinionAnalysisResponse = { available: false; participants: number; needed: number } | { available: true; participants: number; grupos: GrupoOpinion[]; puentes: FraseAnalisis[]; divisivas: FraseAnalisis[]; puentesSinVer: number }`.

- [ ] **Step 1:** Escribir los tipos y exportarlos. Hasta la Task 5, `forums.service.ts` debe rechazar el valor `'frase'` en `checkTarget` con `BadRequestException('Tipo de contenido no válido.')`: no se agrega el valor a `ModTarget` todavía.
- [ ] **Step 2:** Run: `pnpm --filter @decide/shared build && cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 3: Commit** «Tipos de frases y del mapa de opiniones».

---

### Task 3: Cálculo de grupos de opinión (módulo puro)

**Files:** crear `apps/api/src/frases/opinion-groups.ts` y `apps/api/src/frases/opinion-groups.spec.ts`

**Interfaces:**
- Produces:
  - `interface VoteRow { profileId: string; fraseId: string; value: -1 | 0 | 1 }`;
  - `interface OpinionResult { participants: number; grupos: { id: number; size: number; members: string[] }[]; frases: { fraseId: string; porGrupo: { grupo: number; votantes: number; deAcuerdo: number; total: number }[] }[] }`. Los miembros (`members`) quedan **dentro del servicio**; el servicio nunca los devuelve;
  - `analyzeOpinions(rows: VoteRow[], seedHex: string, opts?: { minVotos?: number; maxK?: number }): OpinionResult`;
  - `seedFromId(id: string): string`: los primeros 8 hex de `sha256(id)`;
  - `isPuente(f, grupos, minVotantes = 3, umbral = 0.6): boolean`;
  - `isDivisiva(f, grupos, minVotantes = 3, alto = 0.6, bajo = 0.4): boolean`.
- Algoritmo:
  - PCA: centrar las columnas, calcular la covarianza y obtener 2 vectores propios por iteración de potencias con deflación (100 iteraciones, vector inicial a partir de la semilla). Si la varianza es 0, todos los puntos quedan en 0.
  - k-means: inicialización k-means++ con un PRNG mulberry32 sembrado con la semilla y 50 iteraciones.
  - Silueta: la media de la silueta de cada punto. Si n < 6, o todas las siluetas dan 0 o menos, se usa un solo grupo.
  - Los grupos se numeran por tamaño descendente y, si empatan, por el centroide en el primer eje.

- [ ] **Step 1: Pruebas que fallan:**
  - el mismo input y la misma semilla dan exactamente el mismo resultado (`toEqual` en dos llamadas);
  - con dos bandos claros (6 personas de acuerdo con A y B y en desacuerdo con C y D, y 6 al revés) se forman 2 grupos de 6;
  - una frase con 90 % de acuerdo en ambos bandos es puente, y una con acuerdo de un solo bando es divisiva;
  - las personas con menos de 3 votos no entran (`participants` las excluye);
  - una matriz degenerada (todos votan igual, o todo es «paso», o una sola frase) no lanza error y devuelve 1 grupo;
  - con 5 participantes devuelve 1 grupo;
  - `seedFromId('x')` tiene 8 caracteres hex y es estable.
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/frases/opinion-groups`. Expected: FAIL.
- [ ] **Step 3: Implementar** las firmas de Interfaces con el algoritmo descrito.
- [ ] **Step 4:** Run: la misma prueba. Expected: PASS.
- [ ] **Step 5: Commit** «Cálculo de grupos de opinión, frases puente y frases que dividen».

---

### Task 4: Servicio y endpoints de frases

**Files:**
- Crear `apps/api/src/frases/frases.service.ts`, `frases.controller.ts`, `frases.module.ts`, `dto/create-frase.dto.ts` y `dto/vote-frase.dto.ts`.
- Modificar `apps/api/src/app.module.ts`.
- Test: `apps/api/src/frases/frases.service.spec.ts`.

**Interfaces:**
- Consumes: `analyzeOpinions`, `seedFromId`, `isPuente`, `isDivisiva` (Task 3); `RulesService.getInt('debate.minimo_para_grupos', groupId)`; tipos de la Task 2.
- Produces (endpoints bajo `JwtAuthGuard`, con `ParseUUIDPipe` en los ids):
  - `POST /api/frases/temas/:proposalId` `{ text }` → `{ id }`: `create(profileId, proposalId, text, ip)`;
  - `GET /api/frases/temas/:proposalId` → `FrasesResponse`: `list`;
  - `GET /api/frases/temas/:proposalId/siguiente` → `FraseParaVotar | null`: `next`;
  - `GET /api/frases/temas/:proposalId/mapa` → `OpinionAnalysisResponse`: `analysis`;
  - `PUT /api/frases/:fraseId/voto` `{ value }` → `FraseResultado`: `vote(profileId, fraseId, value)`. Devuelve el resultado de esa frase, porque quien acaba de votar ya puede verlo.
- Reglas del servicio:
  - **Acceso:** el tema debe existir y la persona ser miembro de su grupo. Si no es miembro → `ForbiddenException('Solo los miembros de esta comunidad pueden participar.')`. Si el tema está oculto, `list` devuelve `{ items: [], pendientes: 0 }`, `next` devuelve `null`, `analysis` devuelve `{ available: false, participants: 0, needed }` y las escrituras dan `BadRequestException('Este tema está oculto por moderación.')`.
  - **Escrituras:** el tema debe estar `open`; si no → `BadRequestException('Este tema ya no acepta frases.')`. Votar una frase oculta → `BadRequestException('Esta frase está oculta por moderación.')`.
  - `next`: elige entre las frases no ocultas y no votadas por la persona, con el menor número de votos, y desempata con `Math.random()`.
  - `analysis`: llama a `analyzeOpinions` con los votos de las frases no ocultas.
    - Con `participants < minimo_para_grupos` → `{ available: false, participants, needed }`.
    - Si no, toma los grupos con `size >= 3`, calcula los puentes y las frases que dividen sobre ellos y **filtra** a las frases que la persona ya votó. `puentesSinVer` cuenta los puentes no votados por ella.
    - Los porcentajes se redondean a múltiplos de 5. Los `members` nunca salen.
  - Votar no se audita.

- [ ] **Step 1: Pruebas que fallan:**
  - un no miembro no escribe, no lista y no vota;
  - un texto de 9 caracteres lo rechaza el DTO, con mensaje en español;
  - en un tema `closed` no se escribe ni se vota;
  - en un tema oculto, `list` y `next` vienen vacíos;
  - votar una frase oculta da `BadRequestException`;
  - `list` devuelve `resultado: null` para las frases no votadas y con valores para las votadas;
  - `next` nunca devuelve una frase ya votada ni una oculta, y prefiere la de menos votos;
  - `vote` dos veces actualiza en lugar de duplicar (`upsert`) y devuelve el resultado;
  - con 6 participantes y el mínimo en 7 → `available: false, needed: 7`;
  - con datos de dos bandos de 6 y 6 → `available: true` y 2 grupos, sin ningún `profileId` en `JSON.stringify(respuesta)`;
  - un puente que la persona no votó no aparece y suma a `puentesSinVer`;
  - `audit.log` no se llama al votar.
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/frases`. Expected: FAIL.
- [ ] **Step 3: Implementar.** `FrasesModule` importa `RulesModule` y `AuditModule`.
- [ ] **Step 4:** Run: `cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** «Frases: escribir, votar sin ver antes y mapa de opiniones».

---

### Task 5: Moderación de frases y pendientes de 3A-1

**Files:** `apps/api/src/forums/forums.service.ts` y su spec; `apps/api/src/frases/frases.service.ts`; `apps/api/src/deliberation/deliberation.service.ts` y su spec; `apps/web/app/(app)/inquietudes/[id]/page.tsx`

**Interfaces:**
- Produces:
  - `ModTarget` suma `'frase'`, con ramas explícitas en `hide` (resuelve el `groupId` por el tema de la frase), `authorOf`, `textOf` y `resolveAppeal`. `appeal` exige autor y miembro;
  - `FraseItem` llena `hiddenReason` y `moderationId` (solo para el autor y mientras la acción esté `oculto`). Para los demás, una frase oculta **no aparece** en la lista;
  - pendientes de 3A-1:
    - `DeliberationService.hiddenInfo` devuelve `moderationId: null` cuando el motivo es la ocultación vinculada (`'Oculto junto con la inquietud de origen.'`);
    - en el detalle de inquietud, quien organiza pero no es miembro no ve «Volver a las inquietudes», «Ver el debate» ni el botón de apoyo.

- [ ] **Step 1: Pruebas que fallan:**
  - ocultar una frase la marca oculta y registra el motivo;
  - ocultarla dos veces da `ConflictException`;
  - `'frase'` con el id de un comentario da `NotFound('Frase no encontrada')` sin tocar el comentario;
  - un no autor no apela;
  - restaurar la deja visible;
  - el autor ve su frase oculta con motivo y los demás no la ven;
  - `hiddenInfo` de la ocultación vinculada da `moderationId: null`.
- [ ] **Step 2:** Run: `cd apps/api && npx vitest run src/forums src/frases src/deliberation`. Expected: FAIL.
- [ ] **Step 3: Implementar.** Para conocer la membresía en la página de inquietudes, usar el detalle existente (`isAuthor`, `canOrganize`) más una bandera nueva, `isMember: boolean`, en `InquietudDetail` (shared y servicio).
- [ ] **Step 4:** Run: `cd apps/api && npx vitest run && cd ../.. && pnpm --filter @decide/api typecheck && pnpm --filter @decide/shared build && cd apps/web && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** «Moderación de frases y ajustes pendientes de 3A-1».

---

### Task 6: Web: sección «Frases» del tema

**Files:**
- Crear `apps/web/app/(app)/proposals/[id]/FrasesSection.tsx` (servidor), `VotarFrase.tsx` (cliente), `NuevaFraseForm.tsx` (cliente) y `MapaOpiniones.tsx` (servidor).
- Modificar `apps/web/lib/actions.ts` y `apps/web/app/(app)/proposals/[id]/page.tsx`.

**Interfaces:**
- Consumes: endpoints de la Task 4; `hideContent` y `AppealForm` existentes (con `target='frase'`).
- Produces:
  - **Server actions:** `createFrase(proposalId)` desde un formulario, y `voteFrase(fraseId, value, proposalId)`, que revalida el tema. Validan los UUID antes de llamar, como en 3A-1.
  - **Sección «Frases»** debajo de los comentarios, solo si el tema no está oculto, con estas partes:
    - Una introducción: «Escribe frases cortas sobre el tema y marca si estás de acuerdo. Verás cómo opinan los demás después de dar tu opinión.»
    - Una tarjeta «Vota esta frase» con la siguiente frase y tres botones: «De acuerdo», «En desacuerdo» y «Paso». Si no hay más: «Ya votaste todas las frases. ¡Gracias!».
    - El formulario «Escribe una frase» (de 10 a 140 caracteres, con contador), solo si el tema está `open`.
    - La lista «Frases que ya votaste», con su barra de acuerdo, desacuerdo y paso en porcentaje, más «Te faltan N frases por votar».
    - El «Mapa de opiniones»:
      - si `available: false`: «El mapa aparece cuando al menos {needed} personas hayan votado 3 frases o más (van {participants}).»;
      - si está disponible: «Se formaron {n} grupos de opinión», con el tamaño de cada uno, las «Frases puente», que explica «En estas frases están de acuerdo personas que en lo demás piensan distinto», las «Frases que dividen», y si `puentesSinVer > 0`: «Hay {puentesSinVer} frases puente más que verás cuando las votes».
    - Para quien puede moderar, «Ocultar» en cada frase, con motivo. Para el autor de una frase oculta, el aviso con su motivo y `AppealForm`.

- [ ] **Step 1: Implementar** con las clases existentes de la página del tema (la barra de consenso sirve de modelo).
- [ ] **Step 2:** Run: `pnpm --filter @decide/shared build && cd apps/web && npx tsc --noEmit`. Expected: sin errores; los archivos en UTF-8 estricto.
- [ ] **Step 3: Commit** «Web: sección Frases y mapa de opiniones».

---

### Task 7: Documentación

**Files:** `docs/DECISIONS.md` (ADR-019), `docs/ROADMAP.md`

- [ ] **Step 1:** ADR-019 «Debate con frases al estilo Pol.is» (2026-11-05), con contexto, decisión y consecuencias:
  - las frases y el voto sin ver los resultados antes;
  - el cálculo sin IA, reproducible y con semilla del tema;
  - los puentes y las frases que dividen;
  - la privacidad: mínimo de 7, grupos de 3 o más, porcentajes redondeados y solo lo ya votado;
  - que el voto de frases no se audita;
  - las frases puente como punto de partida de las soluciones en 3A-3;
  - el resumen con citas del agente, que llega en 3B.
- [ ] **Step 2:** ROADMAP: sección «Primeros 200 — Plan 3A-2 (frases): COMPLETO».
- [ ] **Step 3: Commit** «Docs: ADR-019 sobre las frases».
