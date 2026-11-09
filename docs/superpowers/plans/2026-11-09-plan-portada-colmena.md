# Portada colmena: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** reemplazar la portada de nicaraguadecide.org por la versión «Bandera suave». Lleva un video Remotion de unos 35 s en la columna derecha, seis partes con contenido nuevo y un endpoint público con las últimas decisiones del espacio general.

**Arquitectura:**
- **Video:** se produce fuera del monorepo, en `video/portada/`, un proyecto Remotion independiente que no es un paquete del workspace. Así la imagen Docker de la web no lo instala. Lo renderizado (MP4, WebM y la imagen fija) se copia a `apps/web/public/portada/`.
- **Textos del video:** viven en un solo archivo de la web, que el video importa por ruta relativa.
- **API:** expone `GET /api/publico/decisiones`, sin sesión, en un controlador nuevo.
- **Portada:** es un Server Component con revalidación de 300 s, y sus estilos van aparte (CSS Module), para no tocar las clases `ln-*` que usa `/explore`.

**Tecnología:**
- Next.js 15.1.7 y React 19;
- NestJS 10, Prisma y Vitest en la API;
- Remotion 4 (la última 4.0.x estable, fijada sin `^`);
- `next/font/google` (Fraunces e Inter).

**Spec:** `docs/superpowers/specs/2026-11-09-portada-colmena-design.md`. Léelo entero: §4 y §6 contienen los textos exactos.

## Restricciones globales

**Paleta y tipografía**
- Paleta exacta:

  | Uso | Color |
  |---|---|
  | Blanco | `#FFFFFF` |
  | Azul pastel | `#CFE3F7` |
  | Amarillo pastel | `#FCE9A8` |
  | Gris platinado | `#E5E4E2` |
  | Texto | `#1B2A4A` |
  | Texto secundario | `#3D4A63` |
  | Azul bandera | `#0067C6` |

- Títulos en Fraunces 600 y cuerpo en Inter 400/600.

**Textos**
- La descripción va al pie de la letra: «Confianza, comunicación y coordinación entre afines. Sin manipulación y sin el ruido de las redes.»
- El botón dice «Únete a la colmena →» y lleva a `/login`. En la barra va «Entrar», que también lleva a `/login`.
- Palabras prohibidas en la portada: Condorcet, Schulze, sortición, semilla, append-only. Además, «auditable» no puede aparecer más de una vez.
- Todo en español.

**Video**
- `apps/web/public/portada/colmena.mp4` y `colmena.webm` pesan **≤ 4 MB** cada uno. Por defecto son 1080×1080; si no caben, se permite 720×720.
- Duración de 33 a 37 s, a 30 fps.
- Empieza solo, sin sonido y en bucle, con botones accesibles de sonido y de pausa. Con `prefers-reduced-motion` se muestra solo `colmena-final.webp`.

**Créditos e IA**
- Toda foto o pista de terceros figura en `video/portada/CREDITOS.md` y en el pie de la portada, con autor, licencia y enlace.
- Donde aparezca `renacer.jpg`, aparece también el aviso «imagen ilustrativa creada con IA».

**Decisiones públicas**
- Solo del grupo con slug `general` (`GENERAL_GROUP_SLUG`).
- Solo cerradas, con estado `aprobada` o `rechazada`.
- Sin cifras, sin votantes y sin ids.
- Como máximo 6.

**Archivos y Git**
- No tocar `globals.css` (salvo lo que sea imprescindible), `/explore`, `/login` ni `(app)/*`.
- No commitear `.superpowers/` ni `apps/web/next-env.d.ts`. No usar `git stash`.
- Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Puntos a vigilar en la revisión

1. **API caída o inalcanzable durante `next build`** (Docker no tiene API al compilar). La portada debe compilar y mostrar «Aquí verás los primeros acuerdos de la colmena». Se prueba en la tarea 5, paso 5, compilando sin API.
2. **Tema ocultado por moderación, o solo con el debate ocultado.** No debe aparecer nunca en la lista pública. Lo prueba la tarea 1: `excluye temas ocultos`.
3. **No existe el grupo general** (base nueva sin semilla). El endpoint devuelve `[]` y no da 500. Lo prueba la tarea 1: `sin grupo general devuelve vacío`.
4. **Navegador que bloquea el autoplay** o persona que prefiere menos movimiento. Se ve la imagen fija y nunca un hueco negro. Se revisa a mano en la tarea 4, paso 5.
5. **Pantalla de 320 px de ancho.** Sin scroll horizontal, y el video no se monta sobre el título. Se revisa a mano en la tarea 4, paso 5, y en la tarea 5, paso 6.

---

### Tarea 1: endpoint público de decisiones del espacio general

**Archivos:**
- Crear: `apps/api/src/decisiones/decisiones-publicas.controller.ts`
- Modificar: `apps/api/src/decisiones/decisiones.service.ts` (método nuevo)
- Modificar: `apps/api/src/decisiones/decisiones.module.ts` (registrar el controlador)
- Modificar: `packages/shared/src/types/decision.types.ts` y exportarlo desde el índice de `shared`
- Pruebas: `apps/api/src/decisiones/decisiones-publicas.spec.ts`

**Interfaces:**
- Produce el tipo compartido:

  ```ts
  export interface DecisionPublicaItem {
    title: string;
    estado: 'aprobada' | 'rechazada';
    fecha: string;
  }
  ```

  La fecha va en ISO.
- `DecisionesService.getPublicasGenerales(limite = 6): Promise<DecisionPublicaItem[]>`
- Ruta: `GET /api/publico/decisiones` → `DecisionPublicaItem[]`. Va **sin** `JwtAuthGuard` y con `@Throttle({ default: { limit: 60, ttl: 60_000 } })`.

**Clasificación.** Es la misma que usa `getResumen` para las listas de aprobadas y rechazadas, pero acotada:
- Solo entran temas con `groupId` = el id del grupo con slug `GENERAL_GROUP_SLUG`, `hidden: false` y `electionId: null`.
- Es **aprobada** si la decisión está en fase `contada` con `resultado === 'aprobada'` (fecha = `contadaAt ?? updatedAt`), o si el tema está `closed` y su `conclusion` no es nula (fecha = `closedAt ?? updatedAt`).
- Es **rechazada** si está en fase `contada` con un `resultado` que es clave de `DETALLE_RECHAZO`.
- Todo lo demás se excluye: en curso, canceladas, modo y objeción.
- Se ordena por fecha descendente y se corta en `limite`.

- [ ] **Paso 1: escribir las pruebas que fallan**, al estilo de `decisiones.service.spec.ts` (Prisma simulado con `vi.fn`):
  - `solo el grupo general`: `findFirst`/`findUnique` del grupo se llama con `slug: 'general'`, y `proposal.findMany` filtra por `groupId: 'g-general'`.
  - `clasifica aprobadas y rechazadas`: entran una contada aprobada, una contada `sin_quorum` (u otra clave real de `DETALLE_RECHAZO`) y un consenso de debate cerrado. Salen exactamente tres elementos, con sus estados.
  - `excluye en curso y canceladas`: las fases `votacion`, `objecion`, `modo` y `cancelada` dan `[]`.
  - `excluye temas ocultos`: el `where` de `findMany` incluye `hidden: false`. Un tema `hidden: true` devuelto por el mock tampoco sale.
  - `sin cifras ni ids`: `Object.keys(item).sort()` es igual a `['estado','fecha','title']`.
  - `ordena y limita a 6`: con 8 cerradas, salen 6 ordenadas por fecha descendente.
  - `sin grupo general devuelve vacío`: si el grupo es `null`, el resultado es `[]` y no se llama a `findMany`.
  - En el controlador: `GET publico/decisiones` no tiene metadata de `JwtAuthGuard`. Se comprueba con `Reflect.getMetadata('__guards__', DecisionesPublicasController)` indefinido.
- [ ] **Paso 2:** correr `pnpm --filter @decide/api exec vitest run src/decisiones/decisiones-publicas.spec.ts`. Esperado: FALLA (el método no existe).
- [ ] **Paso 3:** implementar el tipo, el método, el controlador `@Controller('publico')` con `@Get('decisiones')` y registrarlo en el módulo.
- [ ] **Paso 4:** volver a correr la prueba (esperado: PASA) y después `pnpm --filter @decide/api test` (esperado: toda la suite verde).
- [ ] **Paso 5:** commit `feat(api): decisiones públicas del espacio general para la portada`.

### Tarea 2: proyecto del video, archivos de origen y créditos

**Archivos:**
- Crear `video/portada/`, que **no** es paquete del workspace:
  - `package.json` con los scripts `"studio": "remotion studio"` y `"render": "node render.mjs"`. Se instala con `pnpm install --ignore-workspace` y lleva su propio `pnpm-lock.yaml`;
  - `remotion.config.ts`, `tsconfig.json` y `README.md` (cómo instalar, ver y renderizar);
  - `assets/` con: `honey.png` (Honey sin fondo, transparente), `renacer.jpg`, `ometepe.jpg`, `momotombo.jpg`, `guardabarranco.jpg`, `granada.jpg`, `gueguense.jpg`, `sacuanjoche.jpg` y `musica.mp3`;
  - `CREDITOS.md`.
- Crear `apps/web/app/portada/creditos.ts`.
- Crear `apps/web/app/portada/textos-video.ts`.
- Modificar el `.gitignore` de la raíz: añadir `video/portada/node_modules` y `video/portada/out`.

**Interfaces:**
- Produce `export const ESCENAS: readonly { id: 'dispersos'|'ruido'|'renace'|'multiplica'|'republica'; texto: string }[]`, con los cinco textos de la tabla de §5 del spec, al pie de la letra y en ese orden.
- Produce `export const CREDITOS: readonly { obra: string; autor: string; licencia: string; url: string }[]`, con una entrada por cada foto de Commons, la música y el aviso de Renacer (`autor: 'Renacer'`, `licencia: 'imagen ilustrativa creada con IA'`).

**Pasos:**
- [ ] **Paso 1: Honey.** Copiar `C:\Users\administrador\Desktop\OpenCivic Solutions\Marca\HONEY\honey-avatar-original.jpg`, quitarle el fondo blanco y guardarla como `assets/honey.png`, con bordes limpios y sin halo blanco. Revisarla abriéndola sobre un fondo de color.
- [ ] **Paso 2: fotos.** Descargarlas de Wikimedia Commons por su API, con el User-Agent `OpenCivicPortada/1.0`, reintentando con pausa si devuelve la página de error. Están en `.superpowers/brainstorm/12536-1794173114/content/` del worktree como referencia, pero hay que tomar el autor y la licencia de la ficha de cada archivo en Commons.
  - **Sacuanjoche:** buscar una *Plumeria alba* blanca con centro amarillo, con licencia CC0, CC BY o CC BY‑SA. Abrir la imagen y confirmar que es blanca y amarilla.
  - Reducir cada foto a 800 px de lado como máximo.
- [ ] **Paso 3: música.** Una pista instrumental suave de 35 s o más, con licencia que permita el uso sin pago (CC0, CC BY o la licencia de Pixabay). Anotarla en los créditos.
- [ ] **Paso 4:** escribir `CREDITOS.md`, `creditos.ts` y `textos-video.ts`, e instalar Remotion. Antes de instalar, confirmar en https://www.remotion.dev/license que una organización sin fines de lucro, o de 3 empleados o menos, puede usarlo gratis. Si no es así, **parar y avisar**.
- [ ] **Paso 5: verificar.**
  - `pnpm --filter @decide/web typecheck` pasa;
  - `cd video/portada && pnpm install --ignore-workspace && npx remotion versions` muestra una sola versión de Remotion;
  - `git status` no muestra `node_modules`.
- [ ] **Paso 6:** commit `chore(video): proyecto Remotion de la portada, fotos y créditos`.

### Tarea 3: las cinco escenas del video y el render

**Archivos:**
- Crear `video/portada/src/index.ts` (`registerRoot`) y `src/Root.tsx` con la composición `Colmena`: 1080×1080, 30 fps, `durationInFrames` = 1050.
- Crear una escena por archivo: `src/escenas/Dispersos.tsx`, `Ruido.tsx`, `Renace.tsx`, `Multiplica.tsx` y `Republica.tsx`.
- Crear `src/Honey.tsx` (vuelo) y `src/Panal.tsx` (geometría hexagonal compartida).
- Crear `video/portada/render.mjs`.
- Crear en la web `apps/web/public/portada/colmena.mp4`, `colmena.webm` y `colmena-final.webp`.

**Interfaces:**
- Consume `ESCENAS` (importado por ruta relativa: `../../../apps/web/app/portada/textos-video`) y los archivos de `assets/`.
- Produce los tres archivos de `public/portada/` con esos nombres exactos. Las tareas 4 y 5 los usan.

**Guion** (spec §5):
- Las duraciones aproximadas son 6, 7, 6, 9 y 7 s, con transiciones suaves.
- Fondo blanco con la paleta global. Los textos en Fraunces e Inter, que se cargan con `@remotion/google-fonts`. Los textos entran animados y ocupan el tercio superior; las imágenes nunca los tapan.
- **Escena 1:** `renacer.jpg` partida en piezas grises que se alejan.
- **Escena 2:** foto borrosa, gris, con bocadillos «¡Traición!», «#fake», «¿Y quién paga?» y «🔥🔥🔥» que aparecen y la tapan.
- **Escena 3:** dos piezas, ya a color, se unen y forman una celda hexagonal.
- **Escena 4:** Honey vuela, trae piezas y el panal se llena celda a celda con las fotos.
- **Escena 5:** el panal completo con Renacer en el centro y borde amarillo, más una celda con la bandera dibujada (franjas `#0067C6`/blanco/`#0067C6`).
- En los cuadros donde se ve Renacer, va en pequeño «Imagen ilustrativa creada con IA».
- **Honey:** solo hay una pose. Se anima con trayectoria curva, balanceo vertical de ±8 px, rotación de ±4° y escala. No se inventan poses.
- **Música:** suena con desvanecido al entrar y al salir.

**Pasos:**
- [ ] **Paso 1:** `render.mjs` renderiza:
  - el MP4 (codec `h264`, `crf` ajustable y audio AAC);
  - el WebM (`vp9`);
  - la imagen fija, con `renderStill` del último cuadro (1049), en WebP.

  Escribe todo en `apps/web/public/portada/`. Si un archivo pasa de 4 MB, sube el `crf` y vuelve a intentar hasta 3 veces. Si aun así no cabe, renderiza a 720×720 con `scale: 2/3`.
- [ ] **Paso 2:** construir las escenas y revisarlas en `pnpm studio`, con una captura por escena (`npx remotion still src/index.ts Colmena out/escena-N.png --frame=<medio de cada escena>`). Abrir las 5 capturas y confirmar que ningún texto queda tapado y que Honey se ve sin fondo blanco.
- [ ] **Paso 3:** `pnpm render`.
- [ ] **Paso 4: verificar.**
  - `npx remotion ffprobe -v error -show_entries format=duration -of csv=p=0 ../../apps/web/public/portada/colmena.mp4` da un valor entre 33 y 37;
  - `ls -l apps/web/public/portada` muestra los dos videos de 4 MB o menos (4 194 304 bytes) y el WebP;
  - el MP4 trae pista de audio (`ffprobe -show_streams` lista `codec_type=audio`).
- [ ] **Paso 5:** commit `feat(video): video de la portada colmena (35 s, sin voz)`, que incluye los renders en `public/portada/`.

### Tarea 4: primera pantalla (barra, título, video y botón)

**Archivos:**
- Crear `apps/web/app/portada/fuentes.ts`: Fraunces (600) e Inter (400 y 600) con `next/font/google`, expuestas como variables CSS `--pt-serif` y `--pt-sans`.
- Crear `apps/web/app/portada/portada.module.css`: todos los estilos nuevos de la portada.
- Crear `apps/web/app/portada/VideoColmena.tsx` (`'use client'`).
- Crear `apps/web/app/portada/Hero.tsx` y `apps/web/app/portada/Barra.tsx`.
- Modificar `apps/web/app/page.tsx`: monta `Barra` y `Hero`. Las secciones viejas siguen ahí hasta la tarea 5.

**Interfaces:**
- Consume `ESCENAS` (tarea 2) y los archivos de `/portada/` (tarea 3).
- Produce `VideoColmena(): JSX.Element`, `Hero(): JSX.Element` y `Barra(): JSX.Element`, todos sin props.

**Comportamiento:**
- **`VideoColmena`:**
  - `<video autoPlay muted loop playsInline preload="metadata" poster="/portada/colmena-final.webp">`, con `<source>` WebM primero y MP4 después;
  - botones «Activar sonido»/«Silenciar» y «Pausar»/«Reproducir», con `aria-pressed` y foco visible;
  - con `matchMedia('(prefers-reduced-motion: reduce)')` muestra solo el `<img src="/portada/colmena-final.webp">`, con un `alt` que describe el panal;
  - debajo, `<ol className="sr-only">` con los cinco `ESCENAS[i].texto`;
  - relación 1:1 con `aspect-ratio`, sin saltos de diseño.
- **`Hero`:**
  - el `h1` lleva «Nicaragua» y, debajo, «decide.» en `#0067C6`; cada palabra sube y aparece en 0,6 s, con 0,3 s de retraso;
  - la descripción exacta y el botón `Link href="/login"` «Únete a la colmena →»;
  - las franjas azul pastel de 18 px arriba y abajo;
  - computadora (≥ 900 px): grid `1.1fr 1fr` con el video a la derecha y el título a unos 64 px;
  - celular: título (unos 46 px), descripción, video y botón.
- **`Barra`:** logo `/logo-nicaragua-decide.svg` y nombre, «Contacto» (`#contacto`), `ShareButton variant="nav"` y «Entrar» (`/login`). Sin «Registrarme».
- **Animaciones:** todas se desactivan con `prefers-reduced-motion`.

**Pasos:**
- [ ] **Paso 1:** crear los componentes y montarlos en `page.tsx`, en lugar de la barra y el hero viejos.
- [ ] **Paso 2:** `pnpm --filter @decide/web typecheck` y `pnpm --filter @decide/web lint`. Esperado: sin errores.
- [ ] **Paso 3:** `pnpm --filter @decide/web build`. Esperado: compila.
- [ ] **Paso 4:** levantar `pnpm --filter @decide/web dev` y ejecutar `curl -s localhost:3000 | grep -c "Únete a la colmena"` (≥ 1), `grep -c "Entrar"` (≥ 1) y `grep -c "colmena-final.webp"` (≥ 1).
- [ ] **Paso 5: revisión visual.** Con el navegador o una captura de Chrome sin interfaz (`chrome --headless --screenshot --window-size=W,H`), revisar 1280×800, 390×844 y 320×640:
  - el video no toca el título;
  - no hay scroll horizontal;
  - la imagen fija se ve si el video no arranca.

  Guardar las capturas en el workspace del plan y abrirlas.
- [ ] **Paso 6:** commit `feat(web): primera pantalla de la portada colmena con video`.

### Tarea 5: las seis partes del contenido, decisiones públicas, metadatos y limpieza

**Archivos:**
- Crear en `apps/web/app/portada/`: `ComoFunciona.tsx`, `TuLugar.tsx`, `LoQueDecidimos.tsx`, `PorQueConfiar.tsx`, `QuienesSomos.tsx` (incluye el boletín, el contacto y el pie con créditos) y `decisiones.ts`.
- Modificar `apps/web/app/page.tsx`: monta, en orden, `Barra`, `Hero`, `ComoFunciona`, `TuLugar`, `LoQueDecidimos`, `PorQueConfiar` y `QuienesSomos`. Se eliminan las secciones viejas y los arreglos `howSteps`, `pillars` y `features`.
- Modificar `metadata` en `page.tsx`.
- Crear `apps/web/app/opengraph-image.*`, a partir de `public/portada/colmena-final.webp`. La forma la elige el constructor (archivo estático o `ImageResponse`).

**Interfaces:**
- Consume `DecisionPublicaItem` (tarea 1), `CREDITOS` (tarea 2) y los estilos y fuentes de la tarea 4.
- Produce `leerDecisionesPublicas(): Promise<DecisionPublicaItem[]>` en `decisiones.ts`:
  - hace `fetch(\`${API_URL}/api/publico/decisiones\`, { next: { revalidate: 300 } })`;
  - devuelve `[]` ante cualquier error, respuesta no 200 o JSON inválido;
  - nunca lanza.

**Contenido:** los textos de §6 del spec, al pie de la letra. *Decisión del plan:* los resultados de elecciones que menciona §6.4 no se repiten en la portada; se enlaza a la página pública `/representantes`, que ya los muestra.
- **«Cómo funciona la colmena»:** 5 pasos, cada uno con un hexágono SVG en la paleta.
- **«Tu lugar en la colmena»:** dos comunidades y «Exilio y diáspora», cargos elegidos y revocables, iniciativa propia.
- **«Lo que ya decidimos»:**
  - hasta 6 tarjetas con título, «Aprobada» o «Rechazada» y fecha en formato `es-NI`;
  - si la lista está vacía, «Aquí verás los primeros acuerdos de la colmena»;
  - enlaces «Mirar sin registrarse» (`/explore`) y «Quiénes nos representan» (`/representantes`).
- **«Por qué confiar»:** los 4 puntos.
- **«Quiénes somos»:**
  - reconocimiento a Renacer con `renacer.jpg` (`next/image`) y el pie «Imagen ilustrativa creada con IA»;
  - `NewsletterForm compact`;
  - `id="contacto"` con «Escribirnos» → `mailto:decidenicaragua@gmail.com`;
  - pie con la marca y la lista `CREDITOS` (obra, autor y licencia enlazada).
- **Metadata:** `title: 'Nicaragua decide — una colmena democrática y cooperativa'`; `description` = la descripción exacta del hero.

**Pasos:**
- [ ] **Paso 1:** crear `decisiones.ts` y las secciones, y montarlas.
- [ ] **Paso 2:** `pnpm --filter @decide/web typecheck` y `lint` pasan.
- [ ] **Paso 3:** comprobar las palabras prohibidas con `grep -riE "condorcet|schulze|sortici|semilla|append-only" apps/web/app/page.tsx apps/web/app/portada/`. Esperado: sin resultados.
- [ ] **Paso 4:** con la API local corriendo y alguna decisión del grupo general en la base de prueba (si no hay, crear una con un script de semilla local, sin commitearlo), `curl -s localhost:3000 | grep -c "Aprobada\|Rechazada"` ≥ 1.
- [ ] **Paso 5:** **sin API**, con `API_URL=http://127.0.0.1:9` apuntando a un puerto cerrado, `pnpm --filter @decide/web build` compila, y `next start` muestra «Aquí verás los primeros acuerdos de la colmena».
- [ ] **Paso 6:** capturas a 1280×800, 390×844 y 320×640 de la página completa: sin scroll horizontal y con los créditos visibles en el pie. Abrirlas.
- [ ] **Paso 7:** confirmar que `/explore` se ve igual que antes (captura antes y después) y que `git diff --stat main -- apps/web/app/globals.css apps/web/app/explore apps/web/app/login` está vacío.
- [ ] **Paso 8:** commit `feat(web): contenido nuevo de la portada colmena`.
