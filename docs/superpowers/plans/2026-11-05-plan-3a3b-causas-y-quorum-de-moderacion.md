# Plan 3A-3b — Causas cerradas y quórum de la mesa para ocultar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cumplir dos decisiones de Carlos Robleto del 2026-11-05, que van en el mismo PR #7:
- **Lista cerrada de causas:** toda moderación usa una causa de una lista fija.
- **Quórum de la mesa:** ocultar una **solución** o una **propuesta formal** (tema con `kind = 'propuesta'`) requiere el quórum de la mesa, es decir, 2 miembros distintos (`VOTOS_PARA_RESOLVER = 2` de `BoardService`).

**Architecture:**
- La moderación del plan 2 (`ForumsService.hide / appeal / resolveAppeal`) suma una causa obligatoria y dos estados nuevos para las ocultaciones que esperan una segunda firma.
- Un programador horario vence las solicitudes que nadie confirma.
- La web cambia el motivo libre por una lista de causas y suma, en «Mesa», la cola «Ocultaciones por confirmar».

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, vitest 3, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-11-04-plan-3a-ciclo-comunitario-design.md` (§10: el contenido oculto no sale por ningún camino) y ADR-017 (moderación con motivo y apelación). Decisiones de Carlos en el chat del 2026-11-05: «usa lista cerrada de causas, agrega el requisito de quorum minimo para ocultar una solucion o propuesta. en este mismo PR».

## Global Constraints

- **Causas** (`ModeracionCausa`), con sus etiquetas para mostrar:
  - `datos_personales` → «Datos que identifican o ponen en riesgo a una persona»
  - `insultos_amenazas` → «Insultos, amenazas o acoso»
  - `spam` → «Correo basura o publicidad ajena al tema»
  - `ilegal_violencia` → «Contenido ilegal o que incita a la violencia»
  - `suplantacion` → «Suplantación de una persona u organización»

  Las causas **urgentes** son `datos_personales` e `ilegal_violencia`.
- **Detalle:** `ModerateDto` pide `causa` (obligatoria, de la lista). El texto libre `reason` pasa a ser un detalle **opcional** de 0 a 500 caracteres, recortado.
  - Las moderaciones viejas tienen `causa = null` y se muestran con su `reason`.
  - La ocultación vinculada (`LINKED_TOPIC_REASON`) copia la causa de la inquietud de origen.
- **Quórum, solo para `solucion` y para `tema` con `kind = 'propuesta'`.** El resto (respuestas, frases, inquietudes, temas no formales) sigue con una sola persona de la mesa.
  - **Causa urgente:** se oculta **ya**, con `status = 'provisional'` y `venceAt = now + 48 h`. Si nadie la confirma a tiempo, el contenido se restaura solo.
  - **Otra causa:** se registra una solicitud con `status = 'pendiente'` y `venceAt = now + 7 días`. El contenido **sigue visible** hasta que otra persona de la mesa la confirme.
  - **Segunda firma:** la da otra persona de la mesa (`BoardService.roleOf` distinto de null, perfil distinto de quien solicitó).
    - Confirmar: `pendiente` → se oculta y pasa a `oculto`; `provisional` → `oculto`.
    - Rechazar: `pendiente` → `rechazado`; `provisional` → se restaura y pasa a `rechazado`.
  - Solo puede haber una solicitud `pendiente` o `provisional` por contenido; si ya hay una, responde 409.
  - La apelación de la persona autora solo existe sobre `oculto`, igual que hoy.
  - Una ocultación provisional **solo pausa**: el tema oculto no avanza en ningún paso de su decisión (`bloquearTema` exige `hidden = false`) y nadie vota ni objeta; su votación del plan 2 pierde el título, pero no se cancela. La decisión activa (y la votación del plan 2) se cancela solo cuando la ocultación queda en firme (`oculto`): ocultación directa o segunda firma. Si la provisional se rechaza o vence, el tema vuelve y el ciclo sigue en la próxima pasada del programador (los plazos vencidos se procesan entonces). Si luego se restaura una ocultación en firme, la decisión no se reabre (regla de 3A-3).
  - Si un contenido ya tuvo una provisional rechazada o vencida (`fueProvisional`), una nueva solicitud urgente sobre él queda `pendiente` y el contenido sigue visible.
- **Privacidad:**
  - Mientras está `pendiente`, nadie fuera de la mesa sabe que hay una solicitud.
  - La cola de confirmación muestra el texto original solo a la mesa, como la cola de apelaciones.
  - La auditoría lleva `{ moderationId, causa }`, sin texto. La de una solicitud `pendiente` (`moderation.requested`) va como `moderation:<id>` sin metadatos: no dice qué contenido ni qué causa.
- Mensajes en español. Tildes solo con Edit/Write y verificadas en UTF-8 estricto. Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca se hace commit de `apps/web/next-env.d.ts` ni de `.superpowers/`.

## Review Focus

1. **Una sola persona de la mesa no puede ocultar sola una solución o propuesta con causa no urgente.** Tampoco con una urgente más allá de 48 h, ni confirmando su propia solicitud.
2. Una solicitud `pendiente` **no oculta nada** y no se ve fuera de la mesa.
3. **Vencimiento:** que el vencimiento corra dos veces a la vez no restaura dos veces ni pisa una confirmación hecha justo antes. Todo pasa por un `updateMany` condicionado al estado.
4. Una solución ocultada provisionalmente **sigue siendo candidata** al fijarse las candidatas, y el conteo **espera** (se salta la pasada, sin escribir ni auditar) mientras alguna candidata tenga una provisional abierta. Si la ocultación se confirma, no gana; si se rechaza o vence, cuenta como cualquier otra.
5. Las moderaciones anteriores, sin causa, siguen mostrándose y apelándose.

---

### Task 1: API — causas, estados nuevos y segunda firma

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261106140000_causas_y_quorum_moderacion/migration.sql`
- Modify: `packages/shared/src/types/forum.types.ts`; create `packages/shared/src/constants/moderacion.ts` (exportado desde `constants/index.ts`)
- Modify: `apps/api/src/forums/forums.service.ts`, `forums.controller.ts`, `dto/moderate.dto.ts`, `forums.module.ts` (+ spec)
- Create: `apps/api/src/forums/moderacion.scheduler.ts`, `dto/confirmar-moderacion.dto.ts`

**Interfaces:**
- Produces (Prisma):
  - `enum ModeracionCausa { datos_personales insultos_amenazas spam ilegal_violencia suplantacion }`
  - `ModerationStatus` suma `pendiente`, `provisional` y `rechazado`.
  - `ModerationAction` suma `causa ModeracionCausa?`, `confirmadorProfileId String? @db.Uuid` (columna simple) y `venceAt DateTime? @db.Timestamptz`, con `@@index([status, venceAt])`.
- Produces (shared):
  - `MODERACION_CAUSAS: readonly { value: ModeracionCausaValue; label: string; urgente: boolean }[]`
  - `type ModeracionCausaValue`
  - `ModerationAppeal` suma `causa: ModeracionCausaValue | null`.
  - nuevo `ModeracionPorConfirmar { id; target; targetId; causa; detalle: string; originalText; estado: 'pendiente' | 'provisional'; venceAt; createdAt }`.
- Produces (API):
  - `hide` devuelve `{ id, estado: 'oculto' | 'provisional' | 'pendiente' }`.
  - `GET /api/forums/moderation/por-confirmar`, solo para la mesa.
  - `POST /api/forums/moderation/:id/confirmar` con `{ aprobar: boolean }`.
  - `ForumsService.processModerationDeadlines(now): Promise<number>`.
  - `hiddenReason` (donde ya se arma para temas, respuestas, inquietudes, frases y soluciones) pasa a ser la etiqueta de la causa, más `: detalle` si lo hay. Si no hay causa, se usa `reason`.

- [ ] **Step 1:** Escribe las pruebas:
  - el DTO exige una causa de la lista y acepta un detalle vacío;
  - una solución con causa `spam` queda `pendiente`, sin cambiar `hidden`, con `venceAt = +7 d`;
  - con causa `datos_personales` queda `provisional`, con `hidden = true` y `venceAt = +48 h`;
  - un tema `kind = 'propuesta'` sigue la misma regla, y un tema `kind = 'tema'` o una frase se ocultan directo (`oculto`);
  - una segunda solicitud sobre el mismo contenido da 409;
  - confirmar la propia solicitud da 403, y quien no es de la mesa también da 403;
  - confirmar `pendiente` oculta y pasa a `oculto`;
  - rechazar `provisional` restaura y pasa a `rechazado`;
  - confirmar o rechazar algo que ya no está `pendiente` ni `provisional` da 409;
  - el vencimiento restaura `provisional` y cierra `pendiente`, y si `count = 0` no audita;
  - apelar una `pendiente` da 409;
  - `hiddenReason` usa la etiqueta;
  - la ocultación vinculada copia la causa;
  - la cola por confirmar no incluye nada de una persona sin cargo.
- [ ] **Step 2:** Ejecuta `cd apps/api && npx vitest run src/forums`. Expected: FAIL.
- [ ] **Step 3:** Implementa:
  - la migración, con `ALTER TYPE ... ADD VALUE` para cada valor nuevo; si `migrate diff` agrupa mal los enums, escríbela a mano;
  - el servicio, usando `updateMany` condicionado al estado en confirmar, rechazar y vencer;
  - el controlador;
  - `ModeracionScheduler`, copia del de inquietudes, que llama a `processModerationDeadlines(new Date())`.

  Aplica la migración con `npx prisma migrate deploy && npx prisma generate`, cargando `.env` sin imprimirlo.
- [ ] **Step 4:** Ejecuta `pnpm --filter @decide/shared build && pnpm --filter @decide/api typecheck && cd apps/api && npx vitest run`. Expected: todo pasa.
- [ ] **Step 5:** Commit: `API: causas cerradas y segunda firma de la mesa para ocultar soluciones y propuestas`.

---

### Task 2: Web — lista de causas, ocultar soluciones y cola de confirmación

**Files:**
- Modify: cada formulario de moderación, que se encuentra con `grep -rn "reason" apps/web/app --include=*.tsx`, más `apps/web/lib/actions.ts`
- Modify: `apps/web/app/(app)/proposals/[id]/SolucionesSection.tsx`
- Modify: `apps/web/app/(app)/admin/mesa/page.tsx`; create `apps/web/app/(app)/admin/mesa/PorConfirmarList.tsx`

**Comportamiento:**
- **Formularios de moderación:**
  - un `<select>` «Causa» con `MODERACION_CAUSAS`, obligatorio;
  - un campo «Detalle (opcional)» de hasta 500 caracteres;
  - el aviso «No escribas aquí datos de la persona».
- **Respuesta tras enviar**, según el estado que devuelve la API:
  - `oculto`: «Contenido ocultado.»
  - `provisional`: «Ocultado de forma provisional: otra persona de la mesa debe confirmarlo en 48 horas o vuelve a mostrarse.»
  - `pendiente`: «Solicitud registrada: el contenido sigue visible hasta que otra persona de la mesa la confirme (7 días).»
- **Soluciones:** quien organiza ve «Ocultar» en cada solución visible, con el mismo formulario.
- **«Mesa» → «Ocultaciones por confirmar»:**
  - por cada solicitud: tipo, causa, detalle, texto original, estado y vence el {fecha};
  - botones «Confirmar» y «Rechazar»;
  - si fue tu propia solicitud, en lugar de los botones aparece «Esperando a otra persona de la mesa».
  - La API no dice quién solicitó. Para saberlo, agrega `esMia: boolean` en `ModeracionPorConfirmar`; esta tarea puede tocar el tipo y el servicio para eso.
- **Contenido oculto:** sigue mostrando `hiddenReason` como hoy, que ahora trae la etiqueta de la causa.

- [ ] **Step 1:** Implementa.
- [ ] **Step 2:** Ejecuta `cd apps/web && npx tsc --noEmit` (y el typecheck de la API si tocaste el servicio). Expected: sin errores.
- [ ] **Step 3:** Verifica UTF-8 y haz commit: `Web: causas de moderación y ocultaciones por confirmar`.

---

### Task 3: Página «Decisiones» (pedido de Carlos, 2026-11-05)

Carlos lo pidió así: «quiero que toda complejidad este automatizada y que sea sencillo proponer, debatir y votar, para luego ver los concensos logrados, los rechazados y los resultados de las votaciones … por territorios de origen y acogida y de forma general como exilio y diaspora».

**Files:**
- Modify: `apps/api/src/decisiones/decisiones.service.ts`, `decisiones.controller.ts` (+ spec); `packages/shared/src/types/decision.types.ts`
- Create: `apps/web/app/(app)/decisiones/page.tsx`
- Modify: `apps/web/components/NavBar.tsx`

**Interfaces:**
- Produces (shared):
  ```ts
  export type ComunidadTipo = 'origen' | 'acogida' | 'general';
  export interface DecisionResumenItem {
    proposalId: string; title: string;
    estado: 'aprobada' | 'rechazada' | 'en_curso';
    detalle: string;              // texto llano, ver abajo
    ganadoras: { title: string; incluyenPct: number | null }[];
    fecha: string | null;         // contadaAt/closedAt, o la fecha de cierre de la fase en curso
  }
  export interface ComunidadDecisiones {
    groupId: string; name: string; tipo: ComunidadTipo;
    aprobadas: DecisionResumenItem[]; rechazadas: DecisionResumenItem[]; enCurso: DecisionResumenItem[];
  }
  export interface DecisionesResumenResponse { comunidades: ComunidadDecisiones[] }
  ```
- Produces (API): `GET /api/decisiones/resumen` → `DecisionesResumenResponse` con las comunidades de quien consulta. El orden es: origen (`territorial_origin`), acogida (`territorial_residence`) y general (`custom` con slug `GENERAL_GROUP_SLUG`). Las demás `custom` van al final como `general`.

**Reglas:** se excluyen siempre los temas ocultos. Cada lista trae como máximo 50 elementos, los más recientes primero.

| Lista | Qué entra | `detalle` |
|---|---|---|
| **Aprobadas** | decisiones `contada` con `resultado = 'aprobada'`; temas cerrados con conclusión (consenso) y sin decisión | `«Aprobada por votación»` (`incluyenPct` = `round(100 * incluyen / validas)` de cada ganadora) o `«Consenso del debate»` (sin ganadoras) |
| **Rechazadas o sin decisión** | decisiones `contada` con `ninguna`, `empate`, `sin_quorum` o `sin_soluciones` | `«Ninguna solución obtuvo más de la mitad»`, `«Empate: sin decisión»`, `«Sin decisión: no se alcanzó la participación mínima»`, `«No se propusieron soluciones»` |
| **En curso** | temas `propuesta` abiertos sin decisión o con decisión en `modo`, `objecion` o `votacion` | `«En debate hasta el {fecha}»`, `«Eligiendo cómo decidir»`, `«Objeciones hasta el {fecha}»` o `«Votación abierta hasta el {fecha}»`. La fecha va en `fecha` (ISO); la web la formatea. |

Los títulos de soluciones ocultas se enmascaran como en 3A-3.

**Web:**
- `/decisiones` muestra cada comunidad con su encabezado: «Tu territorio de origen: {name}», «Tu comunidad de acogida: {name}» o «Exilio y diáspora: {name}».
- Debajo van tres bloques: «Aprobadas», «Rechazadas o sin decisión» y «En curso». Cada elemento enlaza a `/proposals/{id}` y muestra las ganadoras con su porcentaje.
- Un bloque vacío dice «Todavía no hay decisiones aquí.».
- En la barra de navegación aparece el enlace «Decisiones».

- [ ] **Step 1:** Escribe las pruebas:
  - las listas se clasifican bien en cada estado;
  - el tema oculto no aparece;
  - la solución oculta aparece enmascarada;
  - el orden es origen, acogida y general;
  - solo salen las comunidades de quien consulta;
  - la decisión cancelada no aparece en ninguna lista.
- [ ] **Step 2:** Ejecuta las pruebas. Expected: FAIL. Implementa la API y la web.
- [ ] **Step 3:** Ejecuta `npx vitest run && pnpm --filter @decide/api typecheck && pnpm --filter @decide/shared build && (cd apps/web && npx tsc --noEmit)`. Expected: todo en verde. Verifica UTF-8 y haz commit: `Página Decisiones: aprobadas, rechazadas y en curso por comunidad`.

---

### Task 4: Documentación

- [ ] ADR-021, «Causas cerradas y segunda firma para ocultar soluciones y propuestas»: las decisiones de arriba y por qué las urgentes se ocultan ya. Agrega una línea en ROADMAP, bajo 3A-3. Verifica UTF-8 y haz commit: `Docs: ADR-021 causas y quórum de moderación`.

## Rulings del plan

- **R1:** «Quórum mínimo» se lee como **2 personas de la mesa**, el mismo umbral que las acciones de 2 de 3 del plan 1. Costo si está mal: cambiar una constante.
- **R2:** con las causas urgentes (datos personales, ilegal o violento) se oculta **ya** y se confirma después. Esperar la segunda firma dejaría expuesta a una persona. Si nadie confirma en 48 h, el contenido vuelve. Costo si está mal: pasar las urgentes a «pendiente».
- **R3:** el quórum aplica a soluciones y a propuestas formales. El resto de la moderación sigue con una persona, porque Carlos lo pidió solo para esas dos.
