# Chat por comunidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sala de chat de texto por comunidad, solo para sus miembros verificados, donde Guardián responde únicamente cuando lo llaman.

**Architecture:** Módulo NestJS nuevo `apps/api/src/chat` (servicio, controlador, limpieza programada) que reutiliza `GroupAccessService` para permisos, `ForumsService` para moderar (destino nuevo `mensaje`) y `PanelService`/`AsistenteService` para Guardián. La web añade la pestaña «Chat» en `/groups/[id]` con un componente cliente que consulta cada 10 s mediante server actions. Sin WebSocket.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL, Redis, Next.js 15 (server actions), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-chat-por-comunidad-design.md`

## Global Constraints

- Solo leen y escriben miembros con `GroupMembership` en la comunidad y cuenta `verified_citizen`. Ni la mesa ni los observadores leen por su cargo.
- Solo comunidades de tipo `territorial_origin`, `territorial_residence` y `custom`. Un grupo `trabajo` responde 404 («Esta comunidad no tiene chat.»).
- Texto plano de 1 a 1000 caracteres tras `trim`. Nunca se interpreta HTML ni Markdown.
- La IA recibe solo el texto del mensaje que llama a Guardián, siempre a través de `AsistenteService.pedir` (que aplica `limpiarTexto` y `neutralizarEtiquetas`). Ningún otro mensaje de la sala entra en `material`.
- La auditoría nunca lleva texto de mensajes ni metadatos con contenido.
- Mensajes de error y de interfaz en español, tuteo, sin jerga. El nombre es «Nicaragua Decide» y el asistente «Guardián».
- No se registra el texto de los mensajes en logs.
- No commitear `apps/web/next-env.d.ts` ni `.superpowers/`.
- Antes de cada commit: `pnpm --filter @decide/shared build`, `pnpm --filter @decide/api typecheck`, pruebas del paquete tocado.

## Review Focus

- Una persona con membresía pero cuenta `suspended` o `pending_verification` intenta leer la sala: debe recibir 403 (Task 2).
- Un mensaje que contiene `@Guardián` en medio del texto, no al inicio, y sin `llamarGuardian`: no debe llamar a la IA (Task 4).
- Dos consultas periódicas simultáneas con el mismo cursor: no deben duplicar mensajes en pantalla (Task 6, fusión por `id`).
- La limpieza corre mientras hay una apelación abierta sobre un mensaje oculto: ese mensaje no se borra (Task 5).
- Un enlace `javascript:` o `data:` escrito en un mensaje: se muestra como texto, no como enlace (Task 6).

---

### Task 1: Datos, tipos compartidos y regla

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261125120000_chat_por_comunidad/migration.sql`
- Create: `packages/shared/src/constants/chat.ts`; Modify: `packages/shared/src/constants/index.ts`, `packages/shared/src/constants/rules.ts`
- Test: `packages/shared/src/constants/chat.test.ts` (o el directorio de pruebas que ya use `shared`; si no tiene pruebas, en `apps/api/src/chat/chat-tipos.spec.ts`)

**Interfaces — Produces:**

```ts
// packages/shared/src/constants/chat.ts
export const CHAT_MAX = 1000;
export const CHAT_PAGINA = 50;
export const CHAT_INTERVALO_MS = 10_000;
export type ChatTipoValue = 'miembro' | 'pregunta_guardian' | 'guardian' | 'sistema';
export type ChatMensajeVista = {
  id: string;
  tipo: ChatTipoValue;
  autor: string | null;        // displayName; null en guardian/sistema; «Miembro que ya no está» si no hay perfil
  iniciales: string | null;
  texto: string | null;        // null si eliminado u oculto
  estado: 'visible' | 'eliminado' | 'oculto';
  enlaces: { texto: string; ruta: string }[]; // solo en tipo guardian
  respondeA: string | null;
  esMio: boolean;
  avisos: number | null;       // solo para quien puede moderar
  createdAt: string;
};
export type ChatPagina = { mensajes: ChatMensajeVista[]; hayAnteriores: boolean; puedoModerar: boolean; esperandoGuardian: boolean };
export type ChatNovedades = { groupId: string; nuevos: boolean }[];
/** true si el texto empieza llamando a Guardián: «@Guardián», «@guardian», con o sin tilde, sin distinguir mayúsculas. */
export function llamaAGuardian(texto: string): boolean;
/** Parte un texto en trozos de texto y enlaces http(s). Nunca devuelve otros esquemas como enlace. */
export function partirEnlaces(texto: string): { tipo: 'texto' | 'enlace'; valor: string }[];
```

Prisma (nombres exactos):

```prisma
enum ChatTipo { miembro pregunta_guardian guardian sistema }

model ChatMessage {
  id              String    @id @default(uuid()) @db.Uuid
  groupId         String    @db.Uuid
  group           Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  authorProfileId String?   @db.Uuid
  author          Profile?  @relation("ChatAutor", fields: [authorProfileId], references: [id], onDelete: SetNull)
  kind            ChatTipo  @default(miembro)
  body            String?   @db.VarChar(1000)
  /// Solo en mensajes de Guardián: [{ texto, ruta }] ya resueltos por el servidor.
  enlaces         Json?
  hidden          Boolean   @default(false)
  deletedAt       DateTime? @db.Timestamptz
  replyToId       String?   @db.Uuid
  createdAt       DateTime  @default(now()) @db.Timestamptz
  avisos          ChatAviso[]
  @@index([groupId, createdAt])
  @@index([createdAt])
  @@map("chat_messages")
}

model ChatLectura {
  groupId    String   @db.Uuid
  profileId  String   @db.Uuid
  lastReadAt DateTime @db.Timestamptz
  @@id([groupId, profileId])
  @@map("chat_lecturas")
}

model ChatAviso {
  messageId String      @db.Uuid
  message   ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  profileId String      @db.Uuid
  createdAt DateTime    @default(now()) @db.Timestamptz
  @@id([messageId, profileId])
  @@map("chat_avisos")
}
```

`ModerationTarget` gana el valor `mensaje`. Regla nueva al final de las de `colmena`:
`int('chat.conservacion_dias', 'colmena', 'Días que se conservan los mensajes del chat (días)', 90, 30, 365, 'dias')`.

- [ ] **Step 1: Pruebas de `llamaAGuardian` y `partirEnlaces`**

```ts
it.each(['@Guardián ¿cómo invito?', '@guardian hola', '  @GUARDIAN: ayuda', '@Guardian,'])('llama: %s', (t) => expect(llamaAGuardian(t)).toBe(true));
it.each(['hola @Guardián', 'guardian ayuda', '@guardianes', ''])('no llama: %s', (t) => expect(llamaAGuardian(t)).toBe(false));
it('solo http(s) es enlace', () => {
  expect(partirEnlaces('mira https://a.org/x. y javascript:alert(1)')).toEqual([
    { tipo: 'texto', valor: 'mira ' }, { tipo: 'enlace', valor: 'https://a.org/x' }, { tipo: 'texto', valor: '. y javascript:alert(1)' },
  ]);
});
```

- [ ] **Step 2:** Ejecutar y ver que fallan (función no definida).
- [ ] **Step 3:** Implementar `chat.ts`. `partirEnlaces`: expresión `https?:\/\/[^\s<>"']+`, quitando del final `.,;:!?)` sueltos.
- [ ] **Step 4:** Esquema Prisma + migración SQL escrita a mano en el estilo de las existentes (`ALTER TYPE "ModerationTarget" ADD VALUE 'mensaje';` en su propia migración si Postgres lo exige fuera de transacción: seguir lo que hizo `20261120120000_moderacion_mesa_elecciones`). `npx prisma generate`.
- [ ] **Step 5:** Añadir la regla; ajustar cualquier prueba que cuente las reglas. Ejecutar `pnpm --filter @decide/shared build` y las pruebas del API de `rules`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(chat): datos, tipos y regla de conservación`.

### Task 2: Servicio y API de la sala

**Files:**
- Create: `apps/api/src/chat/chat.service.ts`, `chat.controller.ts`, `chat.module.ts`, `dto/publicar.dto.ts`; Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/chat/chat.service.spec.ts`

**Interfaces — Consumes:** `GroupAccessService.isParticipant`, `GroupAccessService.rastro`, `ForumsService.canModerate(profileId, groupId)`, `AuditService.log`.

**Produces:**

```ts
type Quien = { userId: string; profileId: string; status: AccountStatus };
class ChatService {
  /** 404 si el grupo no existe o es `trabajo`; 403 si no es verified_citizen o no es miembro. */
  async requerirSala(groupId: string, q: Quien): Promise<void>;
  /** Los 50 más recientes; `antes` = id del más antiguo ya cargado; `despues` = id del más nuevo ya cargado (solo posteriores, hasta 200). Marca la lectura. */
  async listar(groupId: string, q: Quien, cursor?: { antes?: string; despues?: string }): Promise<ChatPagina>;
  /** Publica. Devuelve el mensaje y, si llama a Guardián, deja la respuesta en marcha (Task 4). */
  async publicar(groupId: string, q: Quien, texto: string, llamarGuardian: boolean, ip: string): Promise<ChatMensajeVista>;
  async borrarPropio(messageId: string, q: Quien, ip: string): Promise<void>;   // 403 si no es su autor; body → null, deletedAt → now
  async avisar(messageId: string, q: Quien): Promise<void>;                     // idempotente
  async novedades(q: Quien): Promise<ChatNovedades>;                            // una consulta para todas sus comunidades con sala
}
```

Rutas (todas con `JwtAuthGuard`, `user.profileId` requerido):
`GET /chat/novedades` · `GET /chat/:groupId?antes=&despues=` · `POST /chat/:groupId` (`{ texto, llamarGuardian? }`, `@Throttle` 10/min) · `DELETE /chat/mensajes/:id` · `POST /chat/mensajes/:id/avisar` (`@Throttle` 10/min).

Vista: `estado` es `eliminado` si `deletedAt`, `oculto` si `hidden`; en ambos `texto: null`. `avisos` solo se rellena si `puedoModerar`. `esperandoGuardian` es true si la persona tiene una `pregunta_guardian` de los últimos 30 s sin mensaje que la responda.

Auditoría: `chat.message_added` y `chat.message_deleted`, `resource: group:<groupId>`, con `rastro`, sin metadatos.

- [ ] **Step 1: Pruebas** (Prisma simulado con `vi.fn()` como en `group-access.service.spec.ts`):
  - `requerirSala`: grupo `trabajo` → `NotFoundException`; sin membresía → `ForbiddenException`; con membresía y `status: 'suspended'` → `ForbiddenException`; con membresía y `pending_verification` → `ForbiddenException`; miembro verificado → pasa.
  - la mesa sin membresía → `ForbiddenException` (no se consulta `canModerate` para leer).
  - `publicar`: texto `'   '` → `BadRequestException`; 1001 caracteres → `BadRequestException`; válido → `chatMessage.create` con `kind: 'miembro'` y `body` recortado.
  - `publicar` audita con `action: 'chat.message_added'` y el objeto de auditoría no contiene la clave `metadata` ni el texto.
  - `listar` sin cursor pide `take: 51` ordenado `createdAt desc`, devuelve 50 en orden ascendente y `hayAnteriores: true`; hace `chatLectura.upsert`.
  - `listar` con `despues` solo trae posteriores a ese mensaje.
  - mensaje `hidden` → `texto: null, estado: 'oculto'`; `deletedAt` → `estado: 'eliminado'`.
  - `borrarPropio` de otro autor → `ForbiddenException`; propio → `update` con `body: null`.
  - `avisar` dos veces no falla (`upsert`).
  - `novedades`: `nuevos: true` solo donde existe un mensaje ajeno posterior a `lastReadAt` (o sin lectura previa y hay mensajes).
- [ ] **Step 2:** Ejecutar `cd apps/api && npx vitest run src/chat`. Expected: FAIL.
- [ ] **Step 3:** Implementar servicio, DTO (`@IsString`, `@MaxLength(1000)`, `@Transform` trim, `@IsOptional() @IsBoolean() llamarGuardian`), controlador y módulo. `publicar` con `llamarGuardian` o `llamaAGuardian(texto)` guarda `kind: 'pregunta_guardian'` y llama a `this.guardian?.responder(...)` sin esperar (inyección opcional hasta Task 4).
- [ ] **Step 4:** Ejecutar pruebas y `pnpm --filter @decide/api typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(chat): sala por comunidad en el API`.

### Task 3: Moderar mensajes

**Files:**
- Modify: `apps/api/src/forums/forums.service.ts`, `apps/api/src/forums/dto/moderate.dto.ts` (el que contiene `ModerateDto`), tipos de moderación en `packages/shared` donde se enumeren los destinos
- Test: `apps/api/src/forums/forums.service.spec.ts`

**Interfaces — Consumes:** `ChatMessage` (Task 1). **Produces:** `POST /forums/moderation/hide` acepta `target: 'mensaje'`.

Añadir `'mensaje'` a `ModTarget` y una rama en **cada** función que hoy tiene rama para `'informe'`: `hide` (resuelve `groupId` desde `chatMessage`; 404 si no existe o está eliminado), `aplicarOcultacion` (`hidden: true`), `aplicarRestauracion` (`hidden: false`), `estaOculto`, `authorOf` (`authorProfileId`; null en mensajes de Guardián y del sistema), `textOf` (`body ?? ''`), `requiereQuorumTx` (false), `esDeIniciativa`/`consultarIniciativa` (false). Estados, segunda firma y apelación: los que ya rigen, sin variantes.

- [ ] **Step 1: Pruebas:** coordinador de la comunidad oculta un `mensaje` → `chatMessage.update({ hidden: true })` y se crea `ModerationAction` con `target: 'mensaje'`; miembro sin cargo → 403; mensaje eliminado → 404; `resolveAppeal(restore: true)` → `hidden: false`.
- [ ] **Step 2:** Ejecutar y ver fallar.
- [ ] **Step 3:** Implementar las ramas.
- [ ] **Step 4:** `npx vitest run src/forums`. Expected: PASS (las existentes siguen pasando).
- [ ] **Step 5:** Commit `feat(chat): moderación de mensajes con el mecanismo de los foros`.

### Task 4: Guardián en la sala

**Files:**
- Create: `apps/api/src/chat/chat-guardian.service.ts`; Modify: `apps/api/src/asistente/panel.service.ts`, `asistente.module.ts` (exportar lo necesario), `chat.module.ts`, `chat.service.ts`
- Test: `apps/api/src/chat/chat-guardian.service.spec.ts`, `apps/api/src/asistente/panel.service.spec.ts`

**Interfaces — Produces:**

```ts
// panel.service.ts: se hace público el contador y se añade una entrada para la sala
async dentroDelLimite(profileId: string, maximo: number): Promise<boolean>;   // antes private
export const TAREA_SALA: string;                                               // instrucciones de la sala
async responderEnSala(user: Quien, pregunta: string): Promise<
  | { tipo: 'respuesta'; texto: string; enlaces: { texto: string; ruta: string }[] }
  | { tipo: 'apagado' | 'descansa' | 'limite' | 'fallo' }>;

class ChatGuardianService {
  /** Nunca lanza. Crea un ChatMessage `guardian` (respuesta) o `sistema` (aviso) con replyToId = pregunta. */
  async responder(groupId: string, preguntaId: string, q: Quien, texto: string): Promise<void>;
}
```

`responderEnSala`: mismos pasos que `preguntar` (activo → margen → límite diario con la misma clave Redis → `contexto.estado` + `contexto.buscar` → `aMaterial`), con `tarea: TAREA_SALA`, `material` = material + `\n\nPregunta en la sala:\n` + pregunta, mismo esquema `ESQUEMA_PANEL` con respuesta recortada a 1000. El orden importa: si está apagado o sin margen **no** se cuenta la pregunta.

`TAREA_SALA` parte de `TAREA_PANEL` y cambia el encabezado («te llaman desde la sala de chat de una comunidad; tu respuesta la leerá toda la sala») y la regla de fuera de alcance por estas dos:
- Si lo que piden se puede hacer en Nicaragua Decide, di dónde y cómo, con su referencia gN.
- Si se sale de lo que hace Nicaragua Decide (editar un documento entre varios, compartir carpetas o archivos, videollamadas, diseño, tareas en equipo), dilo con claridad y sugiere el tipo de herramienta y hasta tres opciones conocidas, prefiriendo las libres y las que cuidan la privacidad, sin presentar una opción de pago como única. Aclara que son herramientas ajenas a Nicaragua Decide. No escribas direcciones web.
- Lo demás (recetas, tareas escolares, poemas…) sigue fuera de alcance.

Avisos del sistema (texto exacto): `apagado`/`descansa` → «Guardián no está disponible ahora.»; `limite` → «Llegaste a tu límite de preguntas a Guardián por hoy.»; `fallo` → «Guardián no pudo responder. Inténtalo más tarde.»

- [ ] **Step 1: Pruebas:**
  - `responderEnSala`: el `material` pasado a `asistente.pedir` contiene la pregunta y **no** contiene el texto de otros mensajes de la sala (el servicio no consulta `chatMessage`).
  - apagado → `{ tipo: 'apagado' }` y `redis.contar` no se llama; límite superado → `{ tipo: 'limite' }` y `asistente.pedir` no se llama; `pedir` devuelve null → `{ tipo: 'fallo' }`.
  - `motivo: 'privacidad'` → texto `NEGATIVA_PRIVACIDAD`.
  - `ChatGuardianService.responder`: respuesta → `chatMessage.create` con `kind: 'guardian'`, `authorProfileId: null`, `replyToId`, `enlaces`; `limite` → `kind: 'sistema'` con el texto exacto; si `responderEnSala` lanza → crea el aviso de fallo y no propaga.
  - `ChatService.publicar`: con texto `'hola @Guardián'` y `llamarGuardian: false` → `kind: 'miembro'` y `guardian.responder` no se llama; con `'@guardian ¿cómo invito?'` → `pregunta_guardian` y se llama una vez con ese texto.
- [ ] **Step 2:** Ejecutar y ver fallar.
- [ ] **Step 3:** Implementar. `ChatService.publicar` lanza `void this.guardian.responder(...)` después de crear el mensaje.
- [ ] **Step 4:** `npx vitest run src/chat src/asistente`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(chat): Guardián responde en la sala cuando lo llaman`.

### Task 5: Conservación

**Files:**
- Create: `apps/api/src/chat/chat.scheduler.ts`; Modify: `chat.service.ts`, `chat.module.ts`
- Test: `apps/api/src/chat/chat.service.spec.ts`

**Produces:** `ChatService.limpiar(ahora: Date): Promise<number>` — borra (`deleteMany`) los `ChatMessage` con `createdAt` anterior a `ahora − chat.conservacion_dias`, excepto los que tengan una `ModerationAction` con `target: 'mensaje'` y `status` en `apelado`, `pendiente` o `provisional`. Borra también las `ChatLectura` de grupos sin mensajes no hace falta: se dejan. `ChatScheduler` igual que `ModeracionScheduler`, cada 6 horas.

- [ ] **Step 1: Pruebas:** con la regla en 90, el `where` usa la fecha de hace 90 días; con la regla en 30, la de hace 30; los ids con apelación abierta van en `id: { notIn: [...] }`; devuelve `count`.
- [ ] **Step 2–4:** Fallar, implementar, pasar.
- [ ] **Step 5:** Commit `feat(chat): los mensajes se borran al vencer el plazo`.

### Task 6: Pestaña «Chat» en la web

**Files:**
- Modify: `apps/web/app/(app)/groups/[id]/page.tsx`, `apps/web/lib/actions.ts`, `apps/web/app/globals.css` (o la hoja donde viven `.card`, `.btn`)
- Create: `apps/web/components/chat/SalaChat.tsx` (cliente), `apps/web/components/chat/MensajeChat.tsx`, `apps/web/lib/chat.ts`
- Test: `apps/web/lib/chat.test.ts`

**Interfaces — Consumes:** rutas de Task 2, `partirEnlaces`, `CHAT_INTERVALO_MS`, `CHAT_MAX`.

**Produces:**

```ts
// lib/actions.ts ('use server')
export async function leerChat(groupId: string, cursor?: { antes?: string; despues?: string }): Promise<ChatPagina | { error: string }>;
export async function enviarChat(groupId: string, texto: string, llamarGuardian: boolean): Promise<ChatMensajeVista | { error: string }>;
export async function borrarMensajeChat(id: string): Promise<ActionResult>;
export async function avisarMensajeChat(id: string): Promise<ActionResult>;
// lib/chat.ts
export function fusionar(actuales: ChatMensajeVista[], nuevos: ChatMensajeVista[]): ChatMensajeVista[]; // sin duplicados por id, orden por createdAt asc; un id repetido se reemplaza por la versión nueva
```

Comportamiento de `SalaChat`:
- Recibe la primera página del servidor. Consulta `leerChat(groupId, { despues: últimoId })` cada `CHAT_INTERVALO_MS` solo si `document.visibilityState === 'visible'`; al volver a ser visible consulta de inmediato. Cada 6ª consulta vuelve a pedir la página reciente completa para recoger mensajes ocultados o eliminados.
- Baja al final al llegar mensajes solo si la persona ya estaba al final.
- Caja de texto con contador `n/1000`, Enter envía y Mayús+Enter salta de línea; botón «Enviar» y botón «Preguntar a Guardián» (envía con `llamarGuardian: true`). El mensaje propio aparece al instante con la respuesta de la acción.
- Mientras `esperandoGuardian`, muestra «Guardián está escribiendo…».
- Cada mensaje: iniciales, nombre, hora local, texto con `partirEnlaces` (enlaces `target="_blank" rel="noopener noreferrer nofollow"`). Guardián se firma «Guardián · asistente de IA» con su marca (`MarcaAsistente`) y sus enlaces internos como `<Link>`. Los del sistema, en texto atenuado y centrado.
- Acciones por mensaje: «Eliminar» (propio), «Avisar a la coordinación» (ajeno), «Ocultar» (si `puedoModerar`; lleva al mismo formulario de causa que usan los foros) y «N avisos» si `avisos > 0`.
- «Ver anteriores» si `hayAnteriores`. Sala vacía: «Aún no hay mensajes. Escribe el primero.»
- Accesible: lista con `role="log"` y `aria-live="polite"`; todo usable con teclado; a 320 px sin desplazamiento horizontal.
- Si la lectura devuelve 403 o 404, la pestaña muestra el mensaje del API y no la caja de texto.

En `page.tsx`: `Tab` gana `'chat'` como **primera** pestaña visible para comunidades con sala; no altera el contenido de las otras tres.

- [ ] **Step 1: Pruebas de `fusionar`:** sin duplicados cuando llegan dos lotes con el mismo mensaje; un mensaje que vuelve como `oculto` reemplaza al visible; orden ascendente.
- [ ] **Step 2–4:** Fallar, implementar, `npx vitest run` y `npx tsc --noEmit` en `apps/web`. Expected: PASS.
- [ ] **Step 5:** Comprobación manual con `pnpm dev` (API + web con la base local): escribir, llamar a Guardián con el asistente apagado (debe salir el aviso), borrar, ver en 390 px. Anotar en el PR lo que se comprobó y lo que no.
- [ ] **Step 6:** Commit `feat(chat): pestaña Chat en la página de la comunidad`.

### Task 7: Avisos de mensajes nuevos, guía de Guardián y documentación

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx` (tarjetas de «Mis comunidades»), `apps/api/src/asistente/contexto-persona.service.ts` (`RUTAS_DE_LA_GUIA`: no añade ruta nueva porque la sala depende del id; ver abajo), `apps/api/src/asistente/guia-de-la-plataforma.md`, `apps/web/app/(app)/reglas/page.tsx` si lista ayudas por regla, `docs/DECISIONS.md`, `docs/ROADMAP.md`
- Test: `apps/web/lib/inicio.test.ts` si la lógica de las tarjetas vive en `inicio.ts`; prueba del examen de la guía si existe para `guia-de-la-plataforma.md`

- [ ] **Step 1:** En `/dashboard`, llamar a `GET /api/chat/novedades` junto a las demás lecturas; cada comunidad con `nuevos: true` muestra la pastilla «Mensajes nuevos» que enlaza a `/groups/<id>?tab=chat`, y todas un enlace «Chat». Si la llamada falla, la página se muestra sin pastillas.
- [ ] **Step 2:** Guía de la plataforma: un párrafo «Chat de tu comunidad» (qué es, que es para conversar y no para decidir, que los mensajes se borran al vencer el plazo de la regla, cómo llamar a Guardián, que no hay mensajes privados ni archivos). Se llega desde «Mis comunidades» (referencia `g1`).
- [ ] **Step 3:** `DECISIONS.md`: ADR nuevo con las tres decisiones aprobadas por Carlos el 2026-11-25 (conservación 90 días votable; sin revisión previa de IA en el chat; texto sin cifrar en el servidor) y la regla de que Guardián solo recibe el mensaje que lo llama. `ROADMAP.md`: marcar el chat y anotar en «después» fotos/voz/archivos, avisos y el proyecto de trabajo colaborativo.
- [ ] **Step 4:** Suite completa: `pnpm --filter @decide/shared build && pnpm --filter @decide/api typecheck && (cd apps/api && npx vitest run) && (cd apps/web && npx vitest run && npx tsc --noEmit)`. Expected: todo pasa.
- [ ] **Step 5:** Commit `feat(chat): avisos de mensajes nuevos, guía y documentación`.
