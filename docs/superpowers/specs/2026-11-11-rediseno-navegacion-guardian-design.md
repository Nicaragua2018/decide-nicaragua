# Rediseño visual: navegación en tres bloques, Guardián y portada centrada

**Fecha:** 2026-11-11 · **Estado:** aprobado por Carlos Robleto (diseño visual en Claude Design, versión 14).
**Referencia visual:** https://claude.ai/artifact/HfhPvnfRdoZ4q6h2UG9ExA (privado; pedir acceso a Carlos). Pantallas: «Portada pública», «Inicio (escritorio)», «Las 12 preguntas + Guardián», «Navegación: 3 bloques», «Inicio (móvil)», «Guardián: la mascota». Pulsar ▶ en cada una para ver las animaciones. **Copia en el repositorio:** `docs/superpowers/specs/2026-11-11-rediseno-guardian-pantallas/*.dc.html` (HTML estático con los mismos estilos, iconos y animaciones; se abre en cualquier navegador; las rutas `/_blob/...` del video y del símbolo de OpenCivic no cargan fuera del lienzo). Ante cualquier duda de disposición, iconos o medidas, manda ese HTML.

## 1. Intención y porqué

Nicaragua Decide se ve hoy como una herramienta genérica: barra con trece enlaces en fila, fuente del sistema, tarjetas sin personalidad, y un botón «Pregúntale al asistente» sin cara. Carlos quiere que la plataforma se vea de la familia de OpenCivic Solutions (opencivicsolutions.org) y que, sobre todo, sea fácil de usar para gente que no es técnica: **organizarse, debatir y decidir en comunidad** debe estar a un clic, sin perderse entre pestañas.

Tres cambios lo consiguen:

1. **Navegación en tres bloques** (Participar · Comunidad · Transparencia) en una barra azul, con lo personal dentro del avatar.
2. **Guardián**, un guardabarranco (ave nacional) dibujado en vector y semianimado, como cara del asistente. Sustituye en la interfaz a la abeja Honey y al vocabulario de «colmena», que son de OpenCivic y no de esta comunidad. La **sacuanjoche** (flor nacional) sustituye al hexágono como símbolo.
3. **Portada pública centrada**: texto en el centro y el video debajo, igual que en el celular, con el estilo nuevo.

## 2. Objetivos, no objetivos, anti-objetivos

**Objetivos**
- La app con sesión iniciada (`apps/web/app/(app)/**`) y la portada pública (`apps/web/app/page.tsx` + `apps/web/app/portada/**`) adoptan la identidad descrita en §4: paleta, tipografías, radios, botones píldora, sacuanjoche, Guardián.
- La barra pasa de 13 enlaces a 3 bloques desplegables + menú del avatar + botón de Guardián (§5).
- Inicio (`/dashboard`) se convierte en la «mesa de la comunidad» (§6).
- Inquietudes (`/inquietudes`) adopta el diseño de pestañas y tarjetas (§7).
- El asistente se llama Guardián en todo lo que ve la persona (§8).
- Pequeñas animaciones en navegación, botones y página de inicio, todas desactivables con `prefers-reduced-motion` (§9).
- Funciona en celular desde 320 px de ancho, con barra inferior y botón flotante de Guardián (§10).
- Se corrige de paso el formulario de inquietud nueva que no se vacía tras publicar (§7.4).

**No objetivos** (quedan para después)
- Las páginas públicas `/explore`, `/representantes` y `/newsletter` (estilos `.ln-*` y `.ex-*`) y `/login`: no se rediseñan en este proyecto. Solo heredan los tokens globales que cambien (deben seguir viéndose bien, no mejorar).
- Rehacer el video de la portada con Guardián en vez de Honey. El video `public/portada/colmena.*` se queda tal cual (Carlos lo aceptó).
- Cambiar nada del API (`apps/api`), de los acuerdos de neutralidad, del examen del asistente, ni de los textos que genera el asistente.
- Permisos: quién ve cada enlace no cambia (§5.3).
- Modo oscuro.

**Anti-objetivos** (sería un fracaso aunque «funcione»)
- Que una persona verificada deje de encontrar algo que hoy encuentra en la barra.
- Que Guardián o las animaciones molesten: nada parpadea, nada se mueve sin parar junto al texto que se lee, nada bloquea el contenido en celular.
- Que la página tarde más en cargar por fuentes o imágenes pesadas (Guardián y la sacuanjoche son SVG en línea; nada de PNG/JPG nuevos).
- Que se rompa `/explore` o el flujo de verificación.

## 3. Restricciones

- Next.js 15 (App Router) + React, CSS global en `apps/web/app/globals.css` con clases de utilidad propias (sin Tailwind). La portada usa CSS Modules (`portada.module.css`, `secciones.module.css`). Mantener ese reparto: clases globales para la app, módulos para la portada.
- Fuentes por `next/font/google` (como ya hace `app/layout.tsx` y `portada/fuentes.ts`). Nada de `<link>` a Google Fonts en el HTML.
- Sin dependencias nuevas de UI (ni librerías de iconos ni de animación). Iconos: SVG en línea con `stroke="currentColor"`.
- Accesibilidad: todo lo que hace algo es `<a>` o `<button>`, con etiqueta visible o `aria-label`; foco visible; contraste AA (texto sobre azul `#0a3880` en blanco; «Decide» en azul sobre blanco; nunca amarillo sobre blanco como texto). Los menús desplegables se abren con clic/Enter, se cierran con Escape y al pulsar fuera, y se navegan con Tab.
- `prefers-reduced-motion: reduce` apaga todas las animaciones y transiciones (ya hay un bloque así para la portada; extenderlo a todo).
- Textos en español, tono cercano («tú»), sin anglicismos. Las palabras «colmena», «Honey» y «abeja» desaparecen de la interfaz (salvo dentro del video y en los créditos del pie, que describen el video).
- No se toca `apps/web/next-env.d.ts` ni `.superpowers/`.
- Verificación mínima antes de cada PR: `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web build`. No hay pruebas automáticas del frontend; cada tarea del plan incluye una lista de comprobación manual en el navegador (escritorio y 390 px).

## 4. Identidad visual (decidido por Carlos)

### 4.1 Tokens

Sustituir los valores de `:root` en `globals.css` (mismos nombres de variable para no reescribir todo el CSS) y añadir los nuevos:

| Variable | Valor | Uso |
|---|---|---|
| `--primary` | `#0a3880` | azul cívico: barra, botones principales, enlaces, títulos activos |
| `--primary-hover` | `#072a60` | hover de lo azul |
| `--primary-light` | `#e9eef7` | fondos suaves azulados (filas activas, burbujas de la persona) |
| `--accent` (nuevo) | `#f2b00a` | amarillo miel: botón de Guardián, rayita de la barra, acentos. Nunca como color de texto sobre blanco |
| `--accent-light` (nuevo) | `#fff8e1` | fondo de la tarjeta de Guardián y avisos suaves |
| `--text` | `#0f172a` | tinta |
| `--text-soft` (nuevo) | `#1b2a4a` | texto secundario oscuro |
| `--text-muted` | `#475569` | texto apagado (antes `#6B7280`, demasiado claro) |
| `--border` | `rgba(15,23,42,0.08)` | bordes de tarjetas |
| `--bg` | `#f4f6fa` | niebla: fondo de página y de bloques suaves |
| `--bg-white` | `#ffffff` | tarjetas |
| `--radius` | `16px` | tarjetas y cajas |
| `--radius-sm` (nuevo) | `10px` | campos, filas, iconos cuadrados |
| `--radius-pill` (nuevo) | `999px` | botones, pestañas, etiquetas |
| `--shadow` | `0 1px 3px rgba(15,23,42,0.06)` | reposo |
| `--shadow-hover` (nuevo) | `0 16px 32px rgba(10,56,128,0.14)` | tarjetas al pasar |
| `--font` | `var(--font-sans)` | Inter |
| `--font-display` (nuevo) | `var(--font-display)` | Poppins |

Los colores de estado (`--success`, `--danger`, `--warning` y sus `-light`) se mantienen.

### 4.2 Tipografías

En `app/layout.tsx`: cargar **Poppins** (500, 600, 700) como `--font-display` e **Inter** (400, 500, 600) como `--font-sans`, con `display: 'swap'`. Poppins para títulos, nombre de la marca, etiquetas en mayúsculas pequeñas y botones; Inter para todo lo demás. Las fuentes actuales (Cormorant Garamond y DM Sans) siguen cargándose solo si `/explore`, `/representantes` o `/newsletter` las necesitan por `--font-serif`; si el constructor comprueba que basta con `Georgia` de reserva, puede dejar de cargarlas (su decisión, debe quedar anotada en el PR). La portada deja de usar Fraunces: `portada/fuentes.ts` pasa a exponer Poppins e Inter con las mismas variables `--pt-serif` → renombrar a `--pt-display` y `--pt-sans`.

### 4.3 Sacuanjoche (símbolo)

Flor de cinco pétalos y centro amarillo. Sustituye al hexágono en el logo, en los iconos de comunidad y en el fondo decorativo. Es un componente React `Sacuanjoche` (en `apps/web/components/marca/`) con tres variantes:

- `logo` (viewBox 34): cuadrado azul `#0a3880` con esquinas `rx=10`, pétalos blancos, centro `#f2b00a`.
  Pétalo: `M0 0C-3.2-2.2-5-6.4-3.6-9.8C-2.6-12.6 1.2-13.2 3-10.8C5-8 3.4-3.2 0 0Z`, repetido con `rotate(0|72|144|216|288)` dentro de `translate(17 17)`; centro `circle r=3.2`.
- `icono` (viewBox 24): pétalos del color que se le pase, centro del color de contraste. Pétalo: `M0 0C-2.6-1.7-4-5-2.9-7.8C-2.1-10 .9-10.5 2.3-8.6C3.9-6.4 2.6-2.5 0 0Z` en `translate(12 12)`; centro `circle r=2.2`.
- `contorno` (viewBox 24): mismos pétalos sin relleno, `stroke` gris `#94a3b8` de 1.8, centro relleno gris `r=1.6`. Para comunidades aún sin miembros.

El archivo `public/logo-nicaragua-decide.svg` se reemplaza por la variante `logo` (mismo nombre de archivo, para que la imagen de redes y el pie sigan funcionando). `portada/Hexagono.tsx` y los dibujos de celda desaparecen; los pasos de «Cómo funciona» llevan un cuadrado numerado (§11.3).

### 4.4 Guardián (mascota)

Guardabarranco en vector, componente React `Guardian` (en `apps/web/components/guardian/`), con `tamano` en px (28 en la barra, 32 en tarjetas, 38 en la cabecera del panel, 44 en el botón flotante). SVG `viewBox="0 0 64 64"`, `overflow: visible`:

```html
<g class="gd-body">
  <g class="gd-tail">
    <path d="M34 50 L46 60" stroke="#1F6FB2" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M31 52 L40 61" stroke="#1F6FB2" stroke-width="3" stroke-linecap="round" fill="none"/>
    <ellipse cx="47.5" cy="61" rx="3.4" ry="2.3" fill="#27B5A5" transform="rotate(40 47.5 61)"/>
    <ellipse cx="41.5" cy="62" rx="3" ry="2" fill="#27B5A5" transform="rotate(48 41.5 62)"/>
  </g>
  <ellipse cx="30" cy="40" rx="15" ry="13" fill="#E58A2D"/>
  <path d="M17 36 C13 43 16 51 25 51 C22 45 22 39 27 33 Z" fill="#1F6FB2"/>
  <circle cx="30" cy="22" r="14" fill="#27B5A5"/>
  <path d="M17 19 Q30 3 43 19 Q30 13 17 19 Z" fill="#1E9A8C"/>
  <path d="M16 22 Q30 16 44 22 Q30 30 16 22 Z" fill="#0F172A"/>
  <g class="gd-eyes">
    <circle cx="24" cy="22" r="4.6" fill="#ffffff"/><circle cx="36" cy="22" r="4.6" fill="#ffffff"/>
    <circle cx="24.8" cy="22.5" r="2.6" fill="#0F172A"/><circle cx="36.8" cy="22.5" r="2.6" fill="#0F172A"/>
    <circle cx="25.8" cy="21.4" r="0.9" fill="#ffffff"/><circle cx="37.8" cy="21.4" r="0.9" fill="#ffffff"/>
  </g>
  <circle cx="19.5" cy="28" r="2" fill="#F2B00A" opacity="0.7"/><circle cx="40.5" cy="28" r="2" fill="#F2B00A" opacity="0.7"/>
  <path d="M27 28.5 L30 33.5 L33 28.5 Z" fill="#1E293B"/>
</g>
```

Animación (CSS global, `transform-box: fill-box`): el cuerpo se mece (`gd-bob`, 2.6 s, ±1.5 px), la cola oscila (`gd-tail`, 2.6 s, −6°…+6°, origen arriba-izquierda), los ojos parpadean (`gd-blink`, cada 4.5 s, `scaleY(.1)` entre 90 % y 94 %), y al pasar el ratón por el elemento con clase `gd-btn` da un saltito (`gd-hop`, 0.5 s, −5 px). Las animaciones se quedan quietas con `prefers-reduced-motion`.

Se mantiene `public/` libre de imágenes de Honey. El icono del botón flotante en celular lleva un anillo amarillo que late (`ring`, 2.2 s, borde `rgba(242,176,10,.7)` que crece y se desvanece).

## 5. La barra (NavBar)

Componente `apps/web/components/NavBar.tsx` reescrito. Fondo `--primary` (azul), 72 px de alto, pegada arriba (`position: sticky`), sombra `0 2px 14px rgba(10,56,128,.28)`. De izquierda a derecha:

### 5.1 Marca

Píldora blanca (`padding 5px 18px 5px 5px`, 44 px de alto) con el logo sacuanjoche (34 px) y «Nicaragua **Decide**» en Poppins 600, 20 px: «Nicaragua» en tinta, «Decide» en azul. Enlaza a `/dashboard`. Al pasar el ratón se eleva 1 px con sombra. En celular (< 600 px) se oculta el texto y queda solo el logo dentro de la píldora (el texto sigue para lectores de pantalla).

### 5.2 Tres bloques desplegables

Tres botones `<button aria-expanded aria-haspopup="menu">` en Poppins 500, 15 px, texto blanco, píldora transparente; el bloque de la página actual lleva fondo `rgba(255,255,255,.16)`. Al pasar el ratón, fondo `rgba(255,255,255,.14)` y una rayita amarilla de 2 px que se despliega de izquierda a derecha bajo el texto (0.25 s). Cada botón abre un menú blanco (`--radius`, sombra `0 12px 32px rgba(10,56,128,.14)`) que entra con una animación corta (0.35 s, baja 10 px y aparece); cada opción tiene título (15 px, 600) y una línea de ayuda (12 px, apagada) y se desplaza 4 px a la derecha al pasar el ratón.

| Bloque | Opción | Ruta | Línea de ayuda | Quién la ve |
|---|---|---|---|---|
| Participar | Inquietudes | `/inquietudes` | Las preguntas que la comunidad apoya | verificados |
| | Foros | `/foros` | Debates abiertos por tema | verificados |
| | Decisiones | `/decisiones` | Votaciones, consensos y resultados | verificados |
| | Grupos de trabajo | `/grupos` | Comisiones que llevan una decisión a la práctica | verificados |
| Comunidad | Mis comunidades | `/dashboard` | Exilio y diáspora, origen y acogida | todos |
| | Elecciones | `/elecciones` | Campañas, candidaturas y sorteos | verificados |
| | Mesa | `/admin/mesa` | Lo que toca ahora para que la comunidad arranque | verificados (como hoy) |
| | Observar | `/observar` | Aparece solo si tienes el cargo | `esObservador` |
| Transparencia | Reglas | `/reglas` | Cómo funciona la plataforma, en claro | todos |
| | Verificaciones | `/verificaciones` | Quién está verificado y cómo | todos |
| | Auditoría | `/audit` | Registro público de cada acción | todos |

Un bloque sin ninguna opción visible (por ejemplo «Participar» para alguien aún no verificado) no se muestra.

### 5.3 Botón de Guardián y avatar

- **«Pregúntale a Guardián»**: píldora amarilla (`--accent`, texto tinta, Poppins 600 14 px, 44 px de alto) con Guardián (28 px) dentro de un círculo blanco a la izquierda. Vive en la barra, no flotando. Solo aparece si el asistente está activo (`estado.activo`, como hoy); abre el panel de §8. En celular se sustituye por el botón flotante (§10).
- **Avatar**: círculo de 44 px con las iniciales, borde `rgba(255,255,255,.6)`, fondo `rgba(255,255,255,.14)`, texto blanco; al pasar el ratón crece un 6 % y el borde se vuelve amarillo. Es un `<button aria-haspopup="menu">` que abre un menú oscuro (`--text` de fondo, texto blanco) con: nombre completo, **Mi perfil** (`/me`), **Administración** (`/admin/users`, etiqueta amarilla «admin», visible para quien hoy ve «Admin») y **Salir** (misma acción que hoy: `POST /api/auth/logout` y volver a `/login`).

Los enlaces y condiciones de visibilidad son exactamente los de hoy (`status === 'verified_citizen'`, `esObservador`); el componente sigue recibiendo las mismas props. Carlos decidió además que Inicio (`/dashboard`) hace de «mesa» para la persona, y que «Mesa» de administración vive en Comunidad.

## 6. Inicio: la mesa de la comunidad (`/dashboard`)

Sustituye al panel actual (saludo + tubería de cinco pasos + rejilla de grupos). La página de verificación pendiente (quien aún no está verificado) conserva su contenido pero con el estilo nuevo.

1. **Bienvenida** sobre fondo `--bg`, con dos o tres sacuanjoches tenues (opacidad .08, azul y amarillo) que flotan despacio en el fondo (14 s y 18 s, suben 1 px y giran 14°). Etiqueta en píldora con la comunidad principal de la persona (su grupo `custom` si tiene, si no el primero), título Poppins 700 «Hola, {nombre}. …» y una frase que resume el momento, y tres cifras grandes: **miembros verificados** de esa comunidad, **preguntas abiertas** (inquietudes no ocultas de esa comunidad) y **elecciones** en curso. Las cifras salen de los endpoints que ya existen (`/api/groups/:id` da `memberCount`; `/api/inquietudes?groupId=`; `/api/elecciones`). Si alguna llamada falla, la cifra se omite, no se inventa.
2. **«Lo que toca ahora»**: cuatro tarjetas en una fila de cuatro en escritorio (≥ 1100 px), 2×2 en tamaños medios y una columna en celular, con número de paso, icono de línea de 22 px en un cuadrado de 44 px con fondo amarillo suave (`rgba(242,176,10,.16)`), título, texto y un enlace con flecha que se desplaza al pasar el ratón; la tarjeta se eleva 4 px con `--shadow-hover` y borde azul (clase `card-enlace`, §9). La tarjeta del paso que toca va en azul con texto blanco. Contenido fijo (iconos: trazos tipo Lucide dibujados a mano, `stroke="currentColor"`, grosor 2):
   - Paso 1 · **Sumar a los primeros miembros** · «Invita a quienes confías; cada persona verificada fortalece la comunidad.» → **Invitar** (`/admin/invite` si lo ve; si no, `/me`). Icono: persona (cabeza y hombros).
   - Paso 2 · **Las primeras preguntas** · «Apoya las que te importan; las más apoyadas se debaten.» → **Ver y apoyar** (`/inquietudes`). Icono: círculo con signo de interrogación.
   - Paso 3 · **El camino a la elección** · «Cuando la comunidad llegue al mínimo, se eligen coordinadores.» → **Preparar campaña** (`/elecciones`). Icono: círculo con marca de verificación.
   - Paso 4 · **El mapa de la comunidad** · «Dónde están los miembros: origen y acogida.» → **Ver comunidades** (ancla a la sección 4 de esta misma página). Icono: sacuanjoche en contorno con punto central.
   Qué paso «toca» lo decide el constructor con una regla sencilla a partir de las cifras (por ejemplo: sin inquietudes → paso 2; comunidad sin activar → paso 1), anotada en el código.
3. **Guardián: «Desde tu última visita»** y 4. **Mapa** van juntos debajo de los pasos, en una rejilla de doce columnas: Guardián ocupa cinco a la izquierda y el mapa siete a la derecha (en celular, uno debajo del otro, Guardián primero). La tarjeta de Guardián es la actual de `AlDiaSeccion`/`AlDiaCard` (mismos datos de `/api/asistente/al-dia`) con fondo `--accent-light`, Guardián de 32 px arriba a la izquierda, etiqueta pequeña en mayúsculas «Desde tu última visita» y el resumen e ítems de hoy. Si `mostrar` es falso, en su lugar va una tarjeta corta con Guardián y «Todavía no hay novedades. Cuando la comunidad se mueva, te lo cuento aquí.» `CrecerSeccion`, si existe en el panel, se integra como una tarjeta más dentro de la columna de Guardián.
4. **Mapa de la comunidad**: dos columnas, **Territorio de origen** y **Lugar de acogida**, con una fila por grupo de la persona de tipo `territorial_origin` / `territorial_residence` (de `/api/groups`), icono sacuanjoche relleno si el grupo tiene miembros y de contorno si no, nombre y «N miembros» cuando el detalle del grupo lo dé. Cada fila enlaza a `/groups/:id` y se desplaza 4 px al pasar el ratón. Los grupos `custom` y `trabajo` se listan debajo con el título **Mis comunidades**.

Todo lo que entra en la página lo hace con `fade-up` escalonado (0.6 s, 16 px, retardos de 0.05 s en 0.05 s). Orden en celular (pantalla «Inicio (móvil)»): etiqueta de comunidad, saludo, cifras en fila de tres, las cuatro tarjetas apiladas, Guardián, mapa, y abajo la barra inferior fija con el botón flotante de Guardián encima.

## 7. Inquietudes (`/inquietudes`)

7.1 **Cabecera**: migas «Inicio › Participar › Inquietudes», título Poppins «Las primeras preguntas» (si la comunidad tiene menos de 20) o «Inquietudes», subtítulo actual, y a la derecha el botón azul **Nueva inquietud** que lleva (desplazamiento suave) al formulario del final. Se mantiene el enlace «Agenda →» para quien lo ve hoy.

7.2 **Pestañas de comunidad**: una píldora por grupo (`role="tablist"`), con sacuanjoche pequeña y el número de inquietudes; la activa en azul con texto blanco (el centro de la flor en blanco), el resto blancas con borde; al pasar el ratón suben 2 px.

7.3 **Tarjetas**: una columna (no rejilla) con, en cada una: botón de apoyo a la izquierda (círculo de 44 px con flecha arriba y el número; al pasar el ratón crece 6 % y se vuelve azul; si ya apoyé, azul fijo), título enlazado, etiqueta de estado (`INQUIETUD_STATUS_LABEL`), etiqueta **«Sembrada por Guardián»** cuando `origen === 'asistente'` (sustituye a `MarcaAsistente` = «Sugerencia del asistente» en esta página), «N apoyos de M necesarios» y el plazo si lo hay. `SupportButton` conserva su lógica; cambia solo su aspecto.

7.4 **Formulario** (`NewInquietudForm`): tarjeta al final con «Plantear una inquietud en {comunidad}». **Corrección:** tras publicar con éxito, el formulario queda vacío y se enfoca el aviso de éxito. (Hoy los campos conservan el texto anterior; el mismo defecto puede existir en `foros/[id]/NewTopicForm.tsx` y en `RevisarAntesDePublicar.tsx` / `useFormConRevision`, que el constructor debe revisar y corregir a la vez.)

## 8. Guardián en el panel del asistente (`AsistentePanel`)

- El botón de la barra (§5.3) abre el panel; en celular lo abre el botón flotante (§10). Desaparece el botón fijo actual `asistente-boton` en escritorio.
- Panel lateral derecho de 380 px (celular: toda la pantalla), que entra deslizándose desde la derecha (0.3 s). Cabecera azul con Guardián (38 px) en círculo blanco, «Guardián» en Poppins 600 y debajo «te ayuda a usar la plataforma»; botón **Cerrar** (×) blanco.
- Primer mensaje fijo de Guardián: «Hola, soy Guardián. Pregúntame cómo plantear una inquietud, apoyar una pregunta o preparar una elección.» Debajo, tres respuestas rápidas en píldora que al pulsarlas envían esa pregunta: «¿Cómo planteo una inquietud?», «¿Cómo apoyo una pregunta?», «¿Qué es una elección?».
- Burbujas: las de la persona en `--primary-light` a la derecha; las de Guardián blancas con borde, con Guardián de 20 px a la izquierda y la etiqueta pequeña «sugerencia de Guardián» (sustituye a «sugerencia del asistente»). Cada burbuja aparece con `fade-up`.
- Mientras responde: «Guardián está escribiendo» con tres puntos que laten (0.4 s de retardo entre ellos), en vez de «Pensando…».
- Textos de aviso: «Guardián descansa hasta el próximo mes.», «Ahora no pude responder. Intenta de nuevo en un momento.» (sin cambios), «Llegaste a las N preguntas de hoy. Mañana puedes seguir.» (sin cambios). Pie: «Guardián puede equivocarse. No guarda esta conversación.»
- Toda la lógica (límites, generación, Escape, foco al cerrar, rutas internas) se conserva tal cual.
- `SugerenciaAsistente`: la etiqueta `ETIQUETA_SUGERENCIA` pasa a «Sugerencia de Guardián» y la tarjeta lleva Guardián de 20 px junto a la etiqueta; `MarcaAsistente` muestra «Sembrada por Guardián». El API sigue devolviendo `origen: 'asistente'`; solo cambia lo que se muestra.

### 8.1 Hasta dónde llega el nombre (decisión del diseño, con el objetivo de que la experiencia sea amable sin perder transparencia)

Guardián pone la cara solo donde el asistente **ayuda a la persona**: el panel de preguntas, `SugerenciaAsistente` y `MarcaAsistente`, «Desde tu última visita» (`AlDiaCard`), `CrecerCard` y «A partir de una sugerencia del asistente» en `SolucionesSection` (→ «A partir de una sugerencia de Guardián»).

Se sigue diciendo **«el asistente de IA»** (o «el asistente») donde el sistema **controla o rinde cuentas**: la revisión de moderación antes de publicar (`RevisarAntesDePublicar.tsx`, cuyo título «Sugerencia del asistente» pasa a «Revisión del asistente de IA»), «Pedida por el asistente» en la Mesa, «Gasto del asistente (USD)» y «Aún no hay gastos del asistente.» en `/observar`, y en la portada la frase «El asistente de IA ayuda a resumir y ordenar, pero nunca decide.» Razón: quien frena un texto o aparece en una cuenta de gastos no debe disfrazarse de mascota.

### 8.2 La palabra «colmena» dentro de la app (decisión del diseño)

Dentro de la app «colmena» nombra el nivel de **toda la plataforma**, por encima de cada comunidad de origen o de acogida. Se sustituye por **«Nicaragua Decide»** o «general», nunca por «comunidad» (que ya nombra a cada grupo):

- `reglas/page.tsx`: «Reglas de toda la colmena» → «Reglas de todo Nicaragua Decide».
- `admin/mesa/page.tsx`: «Cambiar la regla de la colmena…» → «Cambiar la regla general…».
- `grupos/[id]/BifurcacionForms.tsx`: «Volver a la colmena: llevar la solución a la comunidad» → «Llevar la solución a todo Nicaragua Decide».

El constructor busca `colmena` (sin distinguir mayúsculas) en `apps/web` y aplica el mismo criterio a cualquier otro texto visible que aparezca; los identificadores de código y las rutas no cambian.

## 9. Animaciones (lista cerrada)

Todas en `globals.css`, con `cubic-bezier(.22,.68,0,1.1)` para entradas y `ease` para hovers; todas anuladas dentro de `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }`.

| Dónde | Qué |
|---|---|
| Enlaces de la barra | rayita amarilla que se despliega (0.25 s); fondo claro al pasar |
| Menús desplegables | entran bajando 10 px (0.35 s); opciones se desplazan 4 px al pasar |
| Botones píldora (`.btn`) | suben 2 px con sombra al pasar; se hunden (`scale(.98)`) al pulsar |
| Tarjetas que se pulsan (clase nueva `card-enlace`: tarjetas de paso, tarjetas de grupo, tarjetas de inquietud) | suben 4 px, `--shadow-hover`, borde azul; la flecha del enlace se desplaza 4 px. La clase `.card` a secas (formularios, tablas, avisos) **no** se mueve al pasar el ratón |
| Filas del mapa | se desplazan 4 px y fondo `--primary-light` |
| Botón de apoyo | crece 6 % y se vuelve azul |
| Página de inicio y listas | `fade-up` escalonado al cargar |
| Fondo de la bienvenida | sacuanjoches que flotan (14 s / 18 s) |
| Guardián | mece, cola, parpadeo, saltito al pasar; anillo que late en el botón flotante |
| Panel de Guardián | entra deslizándose (0.3 s); burbujas con `fade-up`; puntos de «escribiendo» |
| Portada | las dos palabras del título suben una tras otra (0.7 s, 0.3 s de retardo); resto como arriba |

Nada se anima en bucle junto a texto largo, salvo Guardián (pequeño y en la esquina) y el fondo tenue de la bienvenida.

## 10. Celular (≤ 599 px)

- La barra azul queda arriba con la marca (solo logo) y el avatar; los tres bloques pasan a una **barra inferior fija** blanca con tres botones de icono + texto (Participar · Comunidad · Transparencia, Poppins 500, 11 px) que abren una hoja desde abajo con las mismas opciones de §5.2. El bloque activo va en azul. Iconos de 22 px en línea: Participar = burbuja de diálogo; Comunidad = sacuanjoche en contorno; Transparencia = escudo con marca de verificación.
- **Guardián flotante**: botón redondo de 56 px, amarillo, con Guardián de 44 px y el anillo que late, fijado a 16 px de la derecha y 96 px del fondo (encima de la barra inferior). Solo si el asistente está activo.
- Contenido en una columna; tarjetas de «Lo que toca ahora» apiladas; cifras en fila de tres; nada se desborda a 320 px (`overflow-wrap: anywhere` en títulos largos). Zonas táctiles de 44 px mínimo.
- El panel de Guardián ocupa toda la pantalla en celular, con el botón Cerrar accesible arriba.

## 11. Portada pública (`/`)

11.1 **Barra**: la de §5.1 (marca en píldora blanca sobre azul) con, a la derecha, «Contacto» (enlace blanco a `#contacto`), **Compartir** (el `ShareButton` de siempre, en píldora blanca de borde) y **Entrar** (píldora amarilla a `/login`). En celular se mantiene la regla actual: «Contacto» se oculta por debajo de 380 px.

11.2 **Bienvenida, centrada**: fondo `--bg` con sacuanjoches tenues a ambos lados, todo centrado y en una columna en cualquier ancho: etiqueta en píldora «Una comunidad democrática y cooperativa» con sacuanjoche; título Poppins 700 «Nicaragua» / «decide.» (segunda palabra en azul; 76 px en escritorio, 46 px en celular; las palabras suben una tras otra como hoy); el párrafo actual («Confianza, comunicación y coordinación entre afines. Sin manipulación y sin el ruido de las redes.») a 19 px, máximo 34 em; dos botones: **Únete a la comunidad →** (azul, a `/login`) y **Mirar sin registrarse** (borde azul, a `/explore`); y debajo el **video** (`VideoColmena` sin cambios de lógica) centrado con ancho máximo 560 px, esquinas de 20 px, con sus botones Sonido y Pausa alineados a la derecha. Desaparece la rejilla de dos columnas de escritorio y las franjas azul pastel. Las reglas de `prefers-reduced-motion` y de imagen fija del video se conservan.

11.3 **Cómo funciona**: título «Cómo funciona la comunidad» y, debajo, «De la inquietud al resultado, en cinco pasos». Los cinco pasos actuales (mismos textos) en tarjetas en fila (cinco columnas en escritorio, una en celular), cada una con un cuadrado numerado de 44 px (amarillo con número en tinta en los pasos 1, 3 y 5; azul con número blanco en 2 y 4), título Poppins 600 y texto. `Hexagono.tsx` se elimina.

11.4 **Resto de secciones** (`TuLugar`, `LoQueDecidimos`, `PorQueConfiar`, `QuienesSomos`, `Pie`): mismo contenido y orden, restyled con los tokens (fondos alternando blanco y `--bg`, tarjetas `--radius`, botones píldora, Poppins en títulos). Cualquier hexágono decorativo pasa a sacuanjoche o a un cuadrado numerado.

11.5 **Palabras**: en la portada «colmena» → «comunidad» en todo lo visible y en los metadatos (`TITULO` → «Nicaragua decide — una comunidad democrática y cooperativa»; «Únete a la colmena» → «Únete a la comunidad»; «primer círculo de la colmena» → «primer círculo de la comunidad»; «novedades de la colmena» → «novedades de la comunidad»). Se mantienen sin cambio el `alt` del video y los créditos del pie, porque describen lo que se ve en el video.

11.6 **Pie**: fondo tinta, marca con logo, enlaces de hoy, créditos de hoy y «Impulsado por OpenCivic Solutions» con el símbolo de OpenCivic (SVG en línea, hexágono con abeja estilizada, 22 px; Carlos facilita el archivo desde `Marca/`; mientras, texto solo).

## 12. Lo que queda al constructor

- Organización de los componentes nuevos (`NavBar`, menús, hoja inferior, `Guardian`, `Sacuanjoche`, tarjetas de inicio) y de las clases CSS; cómo partir `globals.css` si crece demasiado.
- La regla que decide qué paso «toca» en Inicio (§6.2) y cómo se agrupan las llamadas al API para no ralentizar la página (usar `Suspense` como ya hace `AlDiaSeccion`).
- Si las fuentes antiguas (Cormorant, DM Sans, Fraunces) se dejan de cargar (§4.2).
- Cómo se cierran los menús al pulsar fuera y cómo se gestiona el foco dentro de ellos (patrón «menu button» de WAI-ARIA, sin librerías).
- El orden de las tareas y los PR. Sugerencia: (1) tokens + fuentes + `Sacuanjoche` + `Guardian`; (2) barra, menús y celular; (3) panel de Guardián y textos; (4) Inicio; (5) Inquietudes + corrección del formulario; (6) portada. Cada PR deja la web funcionando.

## 13. Comprobación de aceptación

Antes de dar por terminado el proyecto, Carlos revisa en producción (o en una vista previa) que:

1. En escritorio y en un celular de 390 px, la barra es azul con la marca en blanco, los tres bloques se abren y cierran con ratón y teclado, y «Salir» sigue funcionando.
2. Una persona verificada llega desde la barra a cada una de las once rutas de la tabla de §5.2 y a Mi perfil y Administración.
3. Guardián se ve en la barra (o flotando en celular), se mueve suavemente, y el panel responde a una pregunta con la etiqueta «sugerencia de Guardián».
4. Inicio muestra las cifras, los cuatro pasos y el mapa; las 12 inquietudes de «Exilio y diáspora» se ven en `/inquietudes` y el formulario queda vacío tras publicar.
5. La portada muestra el texto centrado y el video debajo, con los botones Sonido/Pausa; «colmena» no aparece fuera del video.
6. Con «reducir movimiento» activado en el sistema, nada se anima.
7. `typecheck`, `lint` y `build` pasan.
