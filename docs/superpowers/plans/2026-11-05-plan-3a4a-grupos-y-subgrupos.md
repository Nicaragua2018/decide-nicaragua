# Plan 3A-4a — Grupos de trabajo y subgrupos por tema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que dentro de cada comunidad (origen o acogida) y en el nivel general «Exilio y diáspora», cualquier miembro proponga un **subgrupo por tema**.
- El subgrupo nace solo al reunir 5 personas en 14 días, y se entra y se sale libremente.
- Tiene su foro, que el ámbito lee y donde solo participan sus miembros.
- Lo que aprueba internamente pasa a la comunidad como inquietud que ya pide respuesta.

**Architecture:**
- **Modelo:** un grupo de trabajo es un `Group` hijo, con `type = 'trabajo'`, `parentGroupId`, `trabajoTipo`, `trabajoEstado` y fechas. Así se reutilizan los foros, temas, frases, soluciones, decisiones y moderación existentes, con `groupId` = el subgrupo.
- **Acceso:** un `GroupAccessService` decide quién **lee**: los miembros del grupo o, si es de trabajo, los miembros de su ámbito. Quién **participa** sigue siendo la membresía del propio grupo.
- **Servicio:** un `GruposService` con su programador horario gestiona el ciclo de vida.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, vitest 3, Next.js 15. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-05-plan-3a4-grupos-de-trabajo-design.md` (§1–§3, §6–§10). Comisiones y bifurcaciones van en 3A-4b.

## Global Constraints

- **Ámbito:**
  - Un grupo de trabajo cuelga de una comunidad (`territorial_origin` o `territorial_residence`) o del nivel general (`custom` con slug `GENERAL_GROUP_SLUG`).
  - Un grupo de trabajo nunca cuelga de otro grupo de trabajo.
- **Subgrupo:**
  - nombre de 5 a 80 caracteres y propósito de 20 a 1000, ambos recortados;
  - lo propone un miembro del ámbito, que queda como primer miembro;
  - estado `convocando` con `convocatoriaEndsAt = now + subgrupo.plazo_dias`;
  - pasa a `activo` en el mismo momento en que la membresía alcanza `subgrupo.minimo_personas`, una sola vez (fila del grupo bloqueada con `FOR UPDATE` y `updateMany` condicionado al estado);
  - al activarse se crea su foro por defecto;
  - si vence sin el mínimo → `archivado`;
  - si está `activo` con menos de 3 miembros durante 30 días seguidos (`pocosMiembrosDesde`) → `archivado`.
- **Reglas** nuevas en `RULE_DEFINITIONS`, nivel `local`:
  - `subgrupo.minimo_personas`: 5 (de 3 a 50, en personas);
  - `subgrupo.plazo_dias`: 14 (de 7 a 60, en días).

  Se leen con el `groupId` del **ámbito**.
- **Entrada y salida:**
  - entra cualquier miembro actual del ámbito, en `convocando` o `activo`;
  - sale cuando quiera;
  - no se entra a un grupo `archivado` ni `cerrado`.
  - La pertenencia a grupos de trabajo **nunca** toca las membresías de comunidades. `syncMemberships` no borra membresías de `trabajo`; la suspensión, que borra todas, sí las quita.
- **Lectura y participación:**
  - **Leen** un grupo de trabajo, su foro, sus temas, frases, soluciones y resultados los miembros del grupo y los miembros actuales del ámbito.
  - **Participan** (escribir, señalar, votar frases, proponer soluciones, papeletas, objeciones) solo los miembros del grupo.
  - Quien solo lee nunca ve resultados de frases que no votó: no puede votarlas, así que no ve ninguno (regla de ADR-019).
  - Quien solo lee recibe las banderas de participación en `false` (`puedeProponer`, `puedoObjetar`, etc.).
- **Llevar a la comunidad:**
  - Lo puede hacer cualquier miembro del subgrupo, con una solución que esté entre las `ganadoras` de una decisión `contada` y `aprobada` de un tema del subgrupo.
  - Crea en el ámbito una `Inquietud` con estado `en_plazo` y `deadlineAt = now + inquietud.plazo_respuesta_dias` (regla del ámbito).
  - Su contenido: título = título de la solución; cuerpo = «Propuesta del grupo de trabajo {nombre}.\n\n{descripción}», cortado a 2000.
  - Su autor es quien la lleva. Se guarda `origenSolucionId` (único), así que una solución se lleva una sola vez (409 «Esta propuesta ya se llevó a la comunidad.»).
  - No se puede llevar una solución oculta.
- **Listas existentes:**
  - `getMyGroups`, `ForumsService.listMine` y el resumen de «Decisiones» por comunidad **excluyen** los grupos `trabajo`;
  - el resumen suma por ámbito la lista `grupos: GrupoTrabajoItem[]` (§Task 4).
- **Auditoría**, sin texto ni nombres en `metadata`:
  - `grupo.proposed`
  - `grupo.activated`
  - `grupo.archived`
  - `grupo.joined`
  - `grupo.left`
  - `grupo.propuesta_llevada`

  Usan `{ grupoId }`, y en `grupo.propuesta_llevada`, `{ grupoId, inquietudId }`. Entrar y salir de un subgrupo **sí** se audita: es público dentro del ámbito, como la lista de miembros.
- Mensajes en español. Tildes solo con Edit/Write y verificadas en UTF-8 estricto. Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca se hace commit de `apps/web/next-env.d.ts` ni de `.superpowers/`.

## Review Focus

1. **Activación una sola vez:** dos personas se suman a la vez cuando falta una. El grupo se activa una vez, con un solo foro y una sola auditoría.
2. **Lectura desde el ámbito:** un miembro del ámbito que no es del subgrupo **lee** todo, pero cualquier escritura le da 403: tema, comentario, señal, frase, voto de frase, solución, papeleta y objeción. Quien no es del ámbito no lee nada, ni siquiera por id directo.
3. **Mudanza:** al cambiar de comunidad de acogida, se pierde la lectura del subgrupo del ámbito anterior. Su membresía en el subgrupo se mantiene; si quiere, sale.
4. **`syncMemberships` y suspensión:** sincronizar comunidades no borra membresías de subgrupos; suspender sí.
5. **Llevar a la comunidad:**
   - una sola vez por solución;
   - solo con una ganadora real de una decisión contada y aprobada del propio subgrupo;
   - nunca desde un subgrupo archivado (409) ni con una solución oculta.

---

### Task 1: Base de datos, tipos y reglas

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migración `apps/api/prisma/migrations/20261107120000_grupos_de_trabajo/migration.sql` (con `migrate diff` + `migrate deploy`)
- Modify: `packages/shared/src/constants/rules.ts` (+ `rule-definitions.spec.ts`), `packages/shared/src/types/group.types.ts`, `packages/shared/src/index.ts`

**Interfaces:**
- **Prisma, enums:**
  - `GroupType` suma `trabajo`;
  - `enum TrabajoTipo { subgrupo comision bifurcacion }`;
  - `enum TrabajoEstado { convocando activo pausado cerrado archivado }`.
- **Prisma, `Group`:** suma
  - `parentGroupId String? @db.Uuid`, con relación propia `parent`/`hijos` y `onDelete: Cascade`;
  - `trabajoTipo TrabajoTipo?`;
  - `trabajoEstado TrabajoEstado?`;
  - `proposito String? @db.VarChar(1000)`;
  - `convocatoriaEndsAt DateTime? @db.Timestamptz`;
  - `pocosMiembrosDesde DateTime? @db.Timestamptz`;
  - `creadoPorProfileId String? @db.Uuid` (columna simple);
  - `@@index([parentGroupId, trabajoEstado])`.
- **Prisma, `Inquietud`:** suma `origenSolucionId String? @unique @db.Uuid` (columna simple).
- **Shared:**
  ```ts
  export type TrabajoTipoValue = 'subgrupo' | 'comision' | 'bifurcacion';
  export type TrabajoEstadoValue = 'convocando' | 'activo' | 'pausado' | 'cerrado' | 'archivado';
  export interface GrupoTrabajoItem {
    id: string; name: string; proposito: string; tipo: TrabajoTipoValue; estado: TrabajoEstadoValue;
    miembros: number; faltan: number | null; convocatoriaEndsAt: string | null; soyMiembro: boolean;
  }
  export interface GrupoTrabajoDetail extends GrupoTrabajoItem {
    ambito: { id: string; name: string; tipo: 'origen' | 'acogida' | 'general' };
    miembrosNombres: string[];   // displayName; vacío para bifurcaciones (3A-4b)
    forumId: string | null;      // null mientras convoca
    puedoEntrar: boolean; puedoSalir: boolean;
  }
  export interface GruposAmbitoResponse { ambitos: { id: string; name: string; tipo: 'origen' | 'acogida' | 'general'; grupos: GrupoTrabajoItem[] }[] }
  ```
  A `GroupType` (enum de shared) se le suma `trabajo`.
- **Reglas:** se agregan las dos de Global Constraints.

- [ ] **Step 1:** Edita el esquema y genera y aplica la migración. Carga `.env` sin imprimirlo y no ejecutes `prisma format`. Verifica que `migrate diff` no borre los índices hechos a mano (`moderation_actions_abierta_key`, el del foro por defecto y los de `rule_values`); si aparece algún `DROP INDEX` de esos, quítalo.
- [ ] **Step 2:** Agrega los tipos y las reglas. Actualiza `rule-definitions.spec.ts` con las dos reglas nuevas y sus límites.
- [ ] **Step 3:** Ejecuta `pnpm --filter @decide/shared build && pnpm --filter @decide/api typecheck && cd apps/api && npx vitest run`. Expected: todo pasa.
- [ ] **Step 4:** Commit: `BD: grupos de trabajo como grupos hijos`.

---

### Task 2: Acceso de lectura desde el ámbito

**Files:**
- Create: `apps/api/src/groups/group-access.service.ts` (+ spec), exportado por `GroupsModule`
- Modify: `apps/api/src/deliberation/deliberation.service.ts`, `forums/forums.service.ts`, `frases/frases.service.ts`, `decisiones/decisiones.service.ts`, `groups/groups.service.ts` (+ specs), y los módulos que necesiten importar `GroupsModule`

**Interfaces:**
- Produces (`GroupAccessService`):
  - `isParticipant(groupId, profileId): Promise<boolean>`: tiene membresía en ese grupo.
  - `canRead(groupId, profileId): Promise<boolean>`: es participante o, si el grupo es `trabajo`, tiene membresía en su `parentGroupId`.
  - `requireReader(groupId, profileId): Promise<void>`: 403 «Solo los miembros de esta comunidad pueden ver esto.».
  - `requireParticipant(groupId, profileId): Promise<void>`: 403 «Solo los miembros de este grupo pueden participar.» para un grupo `trabajo`; para los demás, el mensaje actual («Solo los miembros de esta comunidad pueden participar.»).

**Cambios:**
- **Lectura** con `requireReader`:
  - `DeliberationService.listGroupProposals` y `getProposalById`;
  - `ForumsService.getForum`;
  - `FrasesService.list`, `analysis` y `next`; `next` devuelve null si no participa;
  - `DecisionesService.getTema`.
- **Escritura:** todo lo demás sigue con `requireParticipant`.
- **Helpers `tema()`** de frases y decisiones: reciben `modo: 'leer' | 'participar'`.
- **Banderas de quien solo lee:** en `getProposalById` y `getTema`, si no participa, vuelven en `false`: `isAuthor`, `userSignal` como null, `puedeProponer`, `puedoObjetar`, `canOrganize`, y `miPapeleta` como null. Agrega a `ProposalDetail` y a `DecisionTemaResponse` el campo `soloLectura: boolean`.
- **Listas propias:** `GroupsService.getMyGroups` y `ForumsService.listMine` excluyen `type = 'trabajo'`. `syncMemberships`/`upsertMembership` no tocan membresías de grupos `trabajo` (verifícalo; el borrado actual filtra por tipo).

- [ ] **Step 1:** Escribe las pruebas:
  - `GroupAccessService`: miembro, miembro del ámbito, ajeno y grupo no trabajo;
  - por servicio: el lector del ámbito lee y recibe 403 al escribir, y el ajeno recibe 403 al leer;
  - `getMyGroups` y `listMine` no muestran grupos de trabajo;
  - `upsertMembership` de acogida no borra la membresía de un subgrupo.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta `npx vitest run && pnpm --filter @decide/api typecheck && pnpm --filter @decide/shared build && (cd apps/web && npx tsc --noEmit)`. Expected: todo pasa.
- [ ] **Step 4:** Commit: `API: el ámbito lee los grupos de trabajo; solo sus miembros participan`.

---

### Task 3: Subgrupos — proponer, entrar, salir, nacer y archivar

**Files:**
- Create: `apps/api/src/grupos/grupos.module.ts`, `grupos.service.ts`, `grupos.controller.ts`, `grupos.scheduler.ts`, `dto/proponer-grupo.dto.ts` (+ spec)
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces (HTTP, `@Controller('grupos')` con `JwtAuthGuard`):
  - `GET /api/grupos` → `GruposAmbitoResponse`, con los ámbitos de quien consulta en orden origen, acogida y general, y todos sus grupos de trabajo salvo los `archivado`;
  - `POST /api/grupos` con `{ ambitoId, name, proposito }` → `{ id }`;
  - `GET /api/grupos/:id` → `GrupoTrabajoDetail`, con `requireReader`;
  - `POST /api/grupos/:id/entrar` y `POST /api/grupos/:id/salir` → `GrupoTrabajoDetail`.
- Produces: `GruposService.processDeadlines(now): Promise<number>` y `GruposScheduler`, copia del de inquietudes, que corre cada hora.

**Reglas:**
- **Slug** del grupo: `trabajo-{uuid}`.
- **Entrar:**
  - bloquea la fila del grupo con `SELECT … FOR UPDATE` dentro de la transacción y crea la membresía (upsert);
  - si el estado es `convocando` y los miembros llegan al mínimo, hace un `updateMany` condicionado a `convocando` que lo pasa a `activo` con `convocatoriaEndsAt: null`, crea el foro por defecto en la misma transacción y audita `grupo.activated`;
  - en un grupo `activo` con `pocosMiembrosDesde`, si vuelve a tener 3 o más miembros, lo pone en null.
- **Salir:**
  - borra la membresía;
  - si queda en `activo` con menos de 3, pone `pocosMiembrosDesde = now` cuando era null;
  - si queda en `convocando` sin miembros, lo archiva.
- **`processDeadlines`:**
  - `convocando` con `convocatoriaEndsAt <= now` → `archivado`;
  - `activo` con `pocosMiembrosDesde <= now − 30 días` → `archivado`;
  - ambos con `updateMany` condicionado y auditoría solo si `count = 1`.
- **Al archivar**, los temas abiertos del grupo pasan a `closed` sin conclusión, y sus decisiones activas a `cancelada`.

- [ ] **Step 1:** Escribe las pruebas, con los valores de Global Constraints:
  - proponer exige ser miembro del ámbito, y el ámbito no puede ser un grupo de trabajo (400);
  - nace con el quinto miembro;
  - dos que entran a la vez activan una sola vez (el mock de `updateMany` devuelve `count 0` la segunda vez);
  - archiva al vencer;
  - archiva tras 30 días con menos de 3;
  - salir;
  - no se entra a un archivado;
  - los DTO validan largos y recortan.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta la suite completa y los typechecks. Expected: todo pasa.
- [ ] **Step 4:** Commit: `API: subgrupos por tema que nacen y se archivan solos`.

---

### Task 4: Llevar a la comunidad y lista en «Decisiones»

**Files:**
- Modify: `apps/api/src/grupos/grupos.service.ts`, `grupos.controller.ts` (+ spec)
- Modify: `apps/api/src/decisiones/decisiones.service.ts` (`getResumen`; + spec), `packages/shared/src/types/decision.types.ts`

**Interfaces:**
- Produces:
  - `POST /api/grupos/:id/llevar` con `{ solucionId }` → `{ inquietudId }`;
  - a `ComunidadDecisiones` se le suma `grupos: GrupoTrabajoItem[]` (no archivados).

**Reglas:**
- **Llevar a la comunidad** sigue lo descrito en Global Constraints. La creación de la inquietud y la marca `origenSolucionId` ocurren en una sola transacción. Un P2002 sobre `origenSolucionId` se captura fuera de la transacción y responde 409.
- **`getResumen`:** sigue listando solo ámbitos (no grupos de trabajo) y suma la lista `grupos` de cada ámbito.

- [ ] **Step 1:** Escribe las pruebas:
  - lleva una ganadora real;
  - una no ganadora da 400;
  - una de otro grupo da 400;
  - la segunda vez da 409;
  - una solución oculta da 400;
  - desde un subgrupo archivado da 409;
  - quien no es miembro del subgrupo recibe 403;
  - la inquietud nace `en_plazo` con el texto exacto;
  - el resumen incluye los grupos del ámbito y no los trata como comunidades.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa.
- [ ] **Step 3:** Ejecuta la suite completa y los typechecks. Expected: todo pasa.
- [ ] **Step 4:** Commit: `API: lo aprobado en un subgrupo pasa a la comunidad`.

---

### Task 5: Web — «Grupos», página del grupo y lista en «Decisiones»

**Files:**
- Create: `apps/web/app/(app)/grupos/page.tsx`, `grupos/ProponerGrupoForm.tsx`, `grupos/[id]/page.tsx`, `grupos/[id]/EntrarSalir.tsx`, `grupos/[id]/LlevarALaComunidad.tsx`
- Modify: `apps/web/components/NavBar.tsx`, `apps/web/lib/actions.ts`, `apps/web/app/(app)/decisiones/page.tsx`, `apps/web/app/(app)/proposals/[id]/page.tsx` (más los componentes que muestran botones de participación) y `SolucionesSection.tsx`

**Comportamiento y textos:**
- **`/grupos`:** por cada ámbito, con encabezados como en «Decisiones», aparece el bloque «Grupos de trabajo».
  - Cada grupo muestra su nombre, su propósito y, si convoca, «Se forma con {mínimo}: faltan {n} · hasta el {fecha}»; si está activo, «{n} miembros».
  - Botón «Unirme» o «Ya eres parte».
  - Al final va el formulario «Proponer un grupo de trabajo» (ámbito, nombre y propósito), con la nota «Nace solo cuando se suman {mínimo} personas».
- **`/grupos/[id]`:**
  - propósito, estado y miembros (nombres);
  - «Unirme» o «Salir del grupo»;
  - enlace «Ir al foro del grupo» cuando está activo;
  - aviso «Puedes leer todo; para participar, únete al grupo» si quien mira no es miembro.
- **Tema de un subgrupo:**
  - si `soloLectura`, se ocultan los formularios y botones de participación y se muestra el mismo aviso con el botón «Unirme»;
  - si la decisión está contada y aprobada y quien mira es miembro, cada ganadora muestra «Llevar a la comunidad» con la explicación «Se presenta como inquietud que la comunidad debe responder».
- **NavBar:** enlace «Grupos».
- **«Decisiones»:** cuarto bloque «Grupos de trabajo» por ámbito, con enlaces a `/grupos/{id}`.

- [ ] **Step 1:** Implementa.
- [ ] **Step 2:** Ejecuta `cd apps/web && npx tsc --noEmit`. Expected: sin errores. Verifica UTF-8.
- [ ] **Step 3:** Commit: `Web: grupos de trabajo y subgrupos`.

---

### Task 6: Documentación

- [ ] ADR-022, «Grupos de trabajo y subgrupos»: las decisiones de Carlos, el diseño como grupo hijo y la lectura desde el ámbito. Agrega la sección en ROADMAP. Verifica UTF-8 y haz commit: `Docs: ADR-022 y hoja de ruta de 3A-4a`.

## Rulings del plan

- **R1:** el grupo de trabajo es un `Group` hijo, para reutilizar sin cambios foros, decisiones, frases y moderación. Costo si está mal: separar el modelo más tarde.
- **R2:** quien organiza dentro de un subgrupo (juntar soluciones, proponer el modo) sigue siendo la mesa, mediante `canOrganize`. Si nadie propone el modo, el plazo automático de 3A-3 lo resuelve. Los coordinadores llegan en 3C. Costo si está mal: dar ese permiso a los miembros del subgrupo.
- **R3:** los subgrupos no tienen inquietudes propias: lo suyo se lleva al ámbito. Costo si está mal: habilitarlas después.
- **R4:** entrar y salir de un subgrupo se audita, porque la lista de miembros es visible en el ámbito. Sumarse a una bifurcación no se auditará (3A-4b).
