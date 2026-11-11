# Rediseño: navegación en 3 bloques, Guardián, sacuanjoche y portada centrada — Plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Nicaragua Decide la identidad de OpenCivic (azul cívico, Poppins/Inter, sacuanjoche), una barra de tres bloques con Guardián como cara del asistente, un Inicio que es la mesa de la comunidad, Inquietudes rediseñada y una portada centrada, en escritorio y celular.

**Architecture:** Next.js 15 App Router. Los tokens viven en `apps/web/app/globals.css`; los estilos nuevos van en archivos CSS globales por área (`navegacion.css`, `guardian.css`, `inicio.css`, `inquietudes.css`) importados desde `app/layout.tsx`; la portada sigue con CSS Modules. La lógica que decide qué se muestra (bloques visibles, paso que toca, agrupación de comunidades) se extrae a funciones puras en `apps/web/lib/` y se prueba con vitest; los componentes se verifican con `typecheck`, `lint`, `build` y una lista manual. El estado «panel de Guardián abierto» lo comparte un contexto React entre la barra, el botón flotante y el panel.

**Tech Stack:** Next.js 15.1, React 19, TypeScript, CSS plano, `next/font/google`, vitest 3 (nuevo en `apps/web`, solo desarrollo).

**Spec:** `docs/superpowers/specs/2026-11-11-rediseno-navegacion-guardian-design.md`. Pantallas de referencia: `docs/superpowers/specs/2026-11-11-rediseno-guardian-pantallas/*.dc.html` (abrir en el navegador).

## Global Constraints

- Sin dependencias nuevas de ejecución. Iconos: SVG en línea con `stroke="currentColor"`, grosor 2. Única dependencia nueva, de desarrollo: `vitest` (`^3.0.5`, la misma versión que `apps/api`).
- Fuentes solo por `next/font/google`: Poppins 500/600/700 → `--font-display`; Inter 400/500/600 → `--font-sans`. Nada de `<link>` a Google Fonts.
- Colores (§4.1 del spec): `--primary #0a3880`, `--primary-hover #072a60`, `--primary-light #e9eef7`, `--accent #f2b00a`, `--accent-light #fff8e1`, `--text #0f172a`, `--text-soft #1b2a4a`, `--text-muted #475569`, `--border rgba(15,23,42,0.08)`, `--bg #f4f6fa`, `--bg-white #ffffff`, `--radius 16px`, `--radius-sm 10px`, `--radius-pill 999px`, `--shadow 0 1px 3px rgba(15,23,42,0.06)`, `--shadow-hover 0 16px 32px rgba(10,56,128,0.14)`. El amarillo nunca es color de texto sobre blanco.
- Toda animación y transición se anula con `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }` (una sola vez, en `globals.css`).
- Accesibilidad: lo que hace algo es `<a>` o `<button>` con etiqueta; foco visible (`outline: 3px solid var(--accent); outline-offset: 2px` sobre azul, `var(--primary)` sobre claro); menús con `aria-expanded`, `aria-haspopup="menu"`, cierre con Escape y clic fuera; zonas táctiles ≥ 44 px; nada se desborda a 320 px.
- Textos en español con «tú». Las palabras «Honey», «abeja» y «colmena» no aparecen en ningún archivo `.tsx` de `apps/web` salvo `app/portada/VideoColmena.tsx`, `app/portada/textos-video.ts` y `app/portada/creditos.ts` (describen el video). `Hexagono` desaparece de la portada.
- Quién ve cada enlace no cambia: `status === 'verified_citizen'` y `esObservador` deciden exactamente lo que deciden hoy en `components/NavBar.tsx`.
- No se toca `apps/api`, `packages/shared`, `apps/web/next-env.d.ts` ni `.superpowers/`. Las páginas `/explore`, `/representantes`, `/newsletter` y `/login` no se rediseñan: deben seguir compilando y viéndose correctas con los tokens nuevos.
- Verificación de cada tarea: `pnpm --filter @decide/web typecheck`, `pnpm --filter @decide/web lint`, `pnpm --filter @decide/web build` (desde la raíz del repo) y, cuando la tarea tiene pruebas, `pnpm --filter @decide/web test`. Commits en español, en imperativo, con el ámbito entre paréntesis como en el historial (`feat(web): …`).

## Review Focus

1. **Persona sin verificar** (`status !== 'verified_citizen'`): no debe ver el bloque Participar ni Elecciones/Mesa, pero sí Mis comunidades, Reglas, Verificaciones y Auditoría; en celular la barra inferior muestra solo los bloques con opciones. Prueba: Tarea 2, `bloquesDeNavegacion` con status `pending_verification`.
2. **Asistente apagado** (`estado.activo === false` o la llamada falla): no aparece «Pregúntale a Guardián» en la barra, ni el botón flotante, ni el panel; la barra sigue completa. Prueba: Tarea 3 (manual, variando `activo`), y Tarea 2 no depende de ello.
3. **Fallo de un endpoint en Inicio** (`/api/groups/:id`, `/api/inquietudes`, `/api/elecciones` responden error): la página se muestra igual, con la cifra ausente, sin inventar ceros. Prueba: Tarea 6, `pasoQueToca` con cifras `null`.
4. **Nombres largos** (comunidad «Estados Unidos · Florida» o más larga) a 320 px: la etiqueta, las pestañas y las filas del mapa se parten en dos líneas sin desbordar. Prueba: lista manual de Tareas 4, 6 y 7.
5. **Formulario que vuelve con «quedó en revisión»** (202): el texto se vacía igual que al publicar y el aviso queda visible y enfocado. Prueba: Tarea 7, lista manual y la comprobación por código del `useEffect`.

---

### Task 1: Base visual — tokens, fuentes, sacuanjoche, Guardián y vitest

**Files:**
- Modify: `apps/web/app/globals.css:7-26` (tokens), `:45-53` (navbar: borrar, se rehace en Tarea 3), `:56-69` (`.btn` píldora), `:72-76` (`.card`), líneas del bloque `.asistente-*` y `.sugerencia-asistente` (se rehacen en Tarea 5; dejar).
- Modify: `apps/web/app/layout.tsx` (fuentes e importaciones de CSS).
- Create: `apps/web/app/navegacion.css`, `apps/web/app/guardian.css`, `apps/web/app/inicio.css`, `apps/web/app/inquietudes.css` (vacíos salvo un comentario de cabecera; se llenan en sus tareas).
- Create: `apps/web/components/marca/Sacuanjoche.tsx`, `apps/web/components/guardian/Guardian.tsx`.
- Replace: `apps/web/public/logo-nicaragua-decide.svg`.
- Create: `apps/web/vitest.config.ts`; Modify: `apps/web/package.json` (script `test` y devDependency).

**Interfaces:**
- Produces: `Sacuanjoche({ variante: 'logo' | 'icono' | 'contorno'; tamano?: number; color?: string; centro?: string; className?: string })` → `<svg aria-hidden>`; `variante="logo"` usa viewBox 34 y colores fijos; `icono` usa `color` para los pétalos y `centro` para el centro (por defecto `#0a3880` / `#f2b00a`); `contorno` usa `#94a3b8`.
- Produces: `Guardian({ tamano?: number; className?: string })` → `<svg class="gd" aria-hidden>` con los grupos `gd-body`, `gd-tail`, `gd-eyes` del §4.4 del spec; `tamano` por defecto 32.
- Produces: clases CSS globales `.gd`, `.gd-btn` (quien la lleve hace saltar a Guardián al pasar el ratón), `.gd-ring` (anillo que late), `.fade-up` + `.d1`…`.d7` (retardos de .05 s a .65 s), `.flor-float`/`.flor-float-2`, `.btn` en píldora con elevación, `.card-enlace`.
- Produces: variables `--font-display`, `--font-sans` disponibles en todo el `<html>`.

- [ ] **Step 1: Instalar vitest en `apps/web` y escribir una prueba de humo**

En `apps/web/package.json` añadir `"test": "vitest run"` en `scripts` y `"vitest": "^3.0.5"` en `devDependencies`; crear `apps/web/vitest.config.ts` con `test: { include: ['lib/**/*.test.ts'], environment: 'node' }`. Ejecutar `pnpm install --filter @decide/web`. Crear `apps/web/lib/humo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
describe('vitest en web', () => { it('corre', () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 2: Ejecutar la prueba**

Run: `pnpm --filter @decide/web test`
Expected: `1 passed`.

- [ ] **Step 3: Tokens y base en `globals.css`**

Sustituir los valores de `:root` por los de Global Constraints (mismos nombres; añadir los nuevos). `--font: var(--font-sans), system-ui, sans-serif`; `--font-display: var(--font-display-poppins), var(--font), sans-serif` (ver paso 4 para el nombre). `.btn`: `border-radius: var(--radius-pill)`, Poppins 600, `transition: transform .2s ease, box-shadow .2s ease, background .2s ease`, `:hover:not(:disabled)` sube 2 px con `0 8px 20px rgba(15,23,42,.16)`, `:active` `translateY(0) scale(.98)`; `.btn-primary` azul; `.btn-ghost` borde `rgba(10,56,128,.35)` y texto azul. `.card`: `border-radius: var(--radius)`, borde `--border`, padding 20 px, **sin** transform. Nueva `.card-enlace` (además de `.card`): `transition` y `:hover` que sube 4 px, `--shadow-hover`, borde `--primary`; `.card-enlace .arrow` se desplaza 4 px. `.page-title` y `h1,h2,h3` en `--font-display`. Añadir al final el bloque de `prefers-reduced-motion` y las animaciones `fade-up`, `flor-float`, `gd-bob`, `gd-tail`, `gd-blink`, `gd-hop`, `ring` con los valores del §4.4 y §9 del spec.

- [ ] **Step 4: Fuentes e importaciones en `app/layout.tsx`**

Cargar `Poppins({ weight: ['500','600','700'], variable: '--font-display-poppins' })` e `Inter({ weight: ['400','500','600'], variable: '--font-sans' })`; mantener `Cormorant_Garamond` (`--font-serif`, la usan `/explore`, `/representantes`, `/newsletter`); quitar `DM_Sans`. Importar `./globals.css`, `./navegacion.css`, `./guardian.css`, `./inicio.css`, `./inquietudes.css` en ese orden. Cambiar `title.default` y `template` a «Nicaragua Decide» (hoy dicen «Nicaragua Decide»).

- [ ] **Step 5: `Sacuanjoche.tsx`, `Guardian.tsx` y el logo**

Componentes de servidor (sin `'use client'`), con los trazados exactos del §4.3 y §4.4 del spec. `logo-nicaragua-decide.svg` = la variante `logo` en SVG puro de 34×34. `Guardian` lleva `style={{ overflow: 'visible' }}` y clases `gd`; en `guardian.css` van `.gd-body/.gd-tail/.gd-eyes { transform-box: fill-box }` y las animaciones.

- [ ] **Step 6: Verificar**

Run: `pnpm --filter @decide/web typecheck && pnpm --filter @decide/web lint && pnpm --filter @decide/web build`
Expected: los tres terminan sin errores. Abrir `/login` y `/explore` en `next dev`: se ven con azul `#0a3880` y sin roturas.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx apps/web/app/*.css apps/web/components/marca apps/web/components/guardian apps/web/public/logo-nicaragua-decide.svg apps/web/vitest.config.ts apps/web/package.json apps/web/lib/humo.test.ts pnpm-lock.yaml
git commit -m "feat(web): tokens de OpenCivic, Poppins/Inter, sacuanjoche y Guardián como base del rediseño"
```

---

### Task 2: Lógica de navegación (funciones puras)

**Files:**
- Create: `apps/web/lib/navegacion.ts`
- Test: `apps/web/lib/navegacion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OpcionNav = { titulo: string; ruta: string; ayuda: string };
  export type BloqueId = 'participar' | 'comunidad' | 'transparencia';
  export type BloqueNav = { id: BloqueId; titulo: string; opciones: OpcionNav[] };
  export function bloquesDeNavegacion(p: { status: string; esObservador: boolean }): BloqueNav[]; // solo bloques con ≥1 opción
  export function bloqueActivo(pathname: string, bloques: BloqueNav[]): BloqueId | null;
  export type OpcionAvatar = { titulo: string; ruta: string; etiqueta?: 'admin' };
  export function opcionesDeAvatar(p: { status: string }): OpcionAvatar[]; // Mi perfil siempre; Administración (/admin/users, etiqueta 'admin') si verified_citizen
  ```
  Títulos, rutas, ayudas y condiciones: tabla del §5.2 del spec, en ese orden. `bloqueActivo` devuelve el bloque cuya opción tiene `pathname === ruta || pathname.startsWith(ruta + '/')`; además, rutas sin opción propia: `/groups/*` y `/elections/*` → `comunidad`; `/proposals/*` → `participar`. Si nada coincide, `null`.

- [ ] **Step 1: Escribir las pruebas**

```ts
import { describe, expect, it } from 'vitest';
import { bloqueActivo, bloquesDeNavegacion, opcionesDeAvatar } from './navegacion';

describe('bloquesDeNavegacion', () => {
  it('persona verificada y observadora ve los tres bloques con las once opciones', () => {
    const b = bloquesDeNavegacion({ status: 'verified_citizen', esObservador: true });
    expect(b.map((x) => x.id)).toEqual(['participar', 'comunidad', 'transparencia']);
    expect(b[0].opciones.map((o) => o.ruta)).toEqual(['/inquietudes', '/foros', '/decisiones', '/grupos']);
    expect(b[1].opciones.map((o) => o.ruta)).toEqual(['/dashboard', '/elecciones', '/admin/mesa', '/observar']);
    expect(b[2].opciones.map((o) => o.ruta)).toEqual(['/reglas', '/verificaciones', '/audit']);
  });
  it('persona sin verificar no ve Participar ni Elecciones ni Mesa ni Observar', () => {
    const b = bloquesDeNavegacion({ status: 'pending_verification', esObservador: false });
    expect(b.map((x) => x.id)).toEqual(['comunidad', 'transparencia']);
    expect(b[0].opciones.map((o) => o.ruta)).toEqual(['/dashboard']);
  });
  it('Observar solo con el cargo', () => {
    const b = bloquesDeNavegacion({ status: 'verified_citizen', esObservador: false });
    expect(b[1].opciones.map((o) => o.ruta)).not.toContain('/observar');
  });
});

describe('bloqueActivo', () => {
  const b = bloquesDeNavegacion({ status: 'verified_citizen', esObservador: true });
  it.each([
    ['/inquietudes/abc', 'participar'], ['/foros/1', 'participar'], ['/proposals/2', 'participar'],
    ['/dashboard', 'comunidad'], ['/groups/9', 'comunidad'], ['/admin/mesa', 'comunidad'],
    ['/audit', 'transparencia'], ['/me', null], ['/admin/users', null],
  ])('%s → %s', (ruta, esperado) => { expect(bloqueActivo(ruta, b)).toBe(esperado); });
});

describe('opcionesDeAvatar', () => {
  it('verificado ve Administración con etiqueta admin', () => {
    expect(opcionesDeAvatar({ status: 'verified_citizen' })).toEqual([
      { titulo: 'Mi perfil', ruta: '/me' },
      { titulo: 'Administración', ruta: '/admin/users', etiqueta: 'admin' },
    ]);
  });
  it('sin verificar solo Mi perfil', () => {
    expect(opcionesDeAvatar({ status: 'pending_verification' })).toEqual([{ titulo: 'Mi perfil', ruta: '/me' }]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `pnpm --filter @decide/web test`
Expected: FAIL, «Cannot find module './navegacion'».

- [ ] **Step 3: Implementar `apps/web/lib/navegacion.ts`**

Tabla de opciones como constante con un campo `requiere: 'verificado' | 'observador' | null`; `bloquesDeNavegacion` filtra y descarta bloques vacíos; `bloqueActivo` con el mapa de prefijos extra indicado en Interfaces.

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `pnpm --filter @decide/web test`
Expected: todas pasan.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/navegacion.ts apps/web/lib/navegacion.test.ts
git commit -m "feat(web): bloques de navegación y menú del avatar como funciones puras"
```

---

### Task 3: Barra azul de escritorio, menús, avatar y contexto de Guardián

**Files:**
- Create: `apps/web/components/asistente/AsistenteContexto.tsx`
- Create: `apps/web/components/nav/NavBar.tsx`, `apps/web/components/nav/MenuBloque.tsx`, `apps/web/components/nav/MenuAvatar.tsx`, `apps/web/components/nav/BotonGuardian.tsx`, `apps/web/components/nav/Marca.tsx`
- Delete: `apps/web/components/NavBar.tsx`
- Modify: `apps/web/app/(app)/layout.tsx`, `apps/web/app/navegacion.css`, `apps/web/components/AsistentePanel.tsx:97-103` (solo el botón fijo; el resto en Tarea 5)

**Interfaces:**
- Consumes: Tarea 1 (`Sacuanjoche`, `Guardian`, clases), Tarea 2 (`bloquesDeNavegacion`, `bloqueActivo`, `opcionesDeAvatar`).
- Produces: `AsistenteProvider({ activo: boolean; topeAlcanzado: boolean; children })` (client) y `useAsistente(): { activo: boolean; topeAlcanzado: boolean; abierto: boolean; abrir(): void; cerrar(): void }`.
- Produces: `NavBar({ displayName: string | null; email: string; status: string; esObservador?: boolean })` (client; mismas props que hoy), que dentro usa `useAsistente()` para decidir si pinta `BotonGuardian`.
- Produces: `Marca({ enlace: string; textoOculto?: boolean })` (píldora blanca con logo y «Nicaragua Decide»), reutilizada por la portada en Tarea 8.
- Produces: clases `.navbar`, `.navbar-marca`, `.nav-bloque`, `.nav-bloque-activo`, `.nav-menu`, `.nav-opcion`, `.nav-avatar`, `.nav-avatar-menu`, `.btn-guardian`.

- [ ] **Step 1: `AsistenteContexto.tsx`**

`createContext` + `useState(false)`; `abrir/cerrar` estables con `useCallback`. En `(app)/layout.tsx` envolver `NavBar`, `main` y `AsistentePanel` en `<AsistenteProvider activo={estado?.activo ?? false} topeAlcanzado={estado?.topeAlcanzado ?? false}>`; `AsistentePanel` pasa a no recibir props y a leer `abierto` del contexto (en este paso solo se cambia el botón fijo de `AsistentePanel.tsx:99-103` por nada: el panel se abre cuando `abierto` es `true`; el resto de ese archivo se rehace en Tarea 5). Renderizar `AsistentePanel` siempre y que él mismo devuelva `null` si `!activo`.

- [ ] **Step 2: `NavBar.tsx` y piezas**

Estructura y medidas del §5 del spec: `<header class="navbar">` azul, 72 px, `position: sticky`. `Marca` a la izquierda. `MenuBloque` por cada bloque de `bloquesDeNavegacion`: `<button aria-expanded aria-haspopup="menu" aria-controls>` + `<div role="menu">` con `<a role="menuitem">` (título + ayuda). Comportamiento: clic alterna; Escape cierra y devuelve el foco al botón; clic fuera cierra (un `useEffect` con `pointerdown` en `document`); flechas ↓/↑ mueven el foco entre opciones; al navegar (clic en opción) se cierra. Solo un menú abierto a la vez (estado `abierto: BloqueId | 'avatar' | null` en `NavBar`). `nav-bloque-activo` según `bloqueActivo(usePathname(), bloques)`. `BotonGuardian`: `<button class="btn btn-guardian gd-btn" onClick={abrir}>` con `Guardian tamano={28}` en círculo blanco y el texto «Pregúntale a Guardián»; solo si `useAsistente().activo`. `MenuAvatar`: botón con iniciales (misma fórmula que hoy) y menú oscuro con nombre, `opcionesDeAvatar` y **Salir** (misma función `handleLogout` que hoy). En `≤ 599 px`, `.navbar .nav-bloque` y `.btn-guardian` se ocultan (`display: none`; la Tarea 4 pone la barra inferior) y la marca oculta su texto.

- [ ] **Step 3: `navegacion.css`**

Valores del §5 y §9: rayita amarilla `::after` con `scaleX`, menú con `animation: menu-in .35s cubic-bezier(.22,.68,0,1.1) both`, opción con `translateX(4px)` al pasar, avatar con borde `rgba(255,255,255,.6)` que pasa a `--accent`, sombra de la barra `0 2px 14px rgba(10,56,128,.28)`, foco visible amarillo sobre azul.

- [ ] **Step 4: Verificar**

Run: `pnpm --filter @decide/web typecheck && pnpm --filter @decide/web lint && pnpm --filter @decide/web build`
Expected: sin errores; `grep -rn "components/NavBar'" apps/web` no devuelve nada. Manual en `next dev` (persona verificada): los tres bloques abren y cierran con ratón, Enter, Escape y clic fuera; Tab recorre marca → bloques → Guardián → avatar; «Salir» lleva a `/login`; con `ASISTENTE_ACTIVO` apagado no aparece Guardián.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/nav apps/web/components/asistente apps/web/components/AsistentePanel.tsx apps/web/app/\(app\)/layout.tsx apps/web/app/navegacion.css
git rm apps/web/components/NavBar.tsx
git commit -m "feat(web): barra azul con tres bloques, menú del avatar y botón de Guardián"
```

---

### Task 4: Celular — barra inferior, hoja de opciones y Guardián flotante

**Files:**
- Create: `apps/web/components/nav/BarraInferior.tsx`, `apps/web/components/nav/HojaBloque.tsx`, `apps/web/components/nav/GuardianFlotante.tsx`
- Modify: `apps/web/components/nav/NavBar.tsx` (renderiza `BarraInferior` y `GuardianFlotante`), `apps/web/app/navegacion.css`, `apps/web/app/guardian.css`

**Interfaces:**
- Consumes: Tarea 2 y 3.
- Produces: `BarraInferior({ bloques: BloqueNav[]; activo: BloqueId | null })`: `<nav aria-label="Secciones">` fija abajo, visible solo `≤ 599 px`, un `<button>` por bloque (icono 22 px + texto 11 px Poppins 500; iconos del §10: burbuja de diálogo / `Sacuanjoche variante="contorno"` / escudo con marca) que abre `HojaBloque`.
- Produces: `HojaBloque({ bloque: BloqueNav; onCerrar(): void })`: `<div role="dialog" aria-modal aria-label={bloque.titulo}>` que sube desde abajo (0.3 s), fondo oscurecido, lista de opciones como en escritorio, botón **Cerrar**; cierra con Escape, con el fondo y al elegir una opción; el foco entra en la hoja y vuelve al botón al cerrar.
- Produces: `GuardianFlotante()`: `<button class="btn-guardian-flotante gd-btn gd-ring" aria-label="Pregúntale a Guardián" onClick={abrir}>` de 56 px, amarillo, `Guardian tamano={44}`, fijo a `right: 16px; bottom: 96px`, visible solo `≤ 599 px` y si `activo`.

- [ ] **Step 1: Implementar los tres componentes y su CSS**

`body` recibe `padding-bottom: 72px` en `≤ 599 px` cuando hay sesión (clase en `(app)/layout.tsx` sobre `main`: `.page-con-barra`). Zonas táctiles ≥ 44 px. `HojaBloque` usa `position: fixed; inset: auto 0 0 0; border-radius: 20px 20px 0 0; max-height: 80vh; overflow: auto`.

- [ ] **Step 2: Verificar**

Run: `pnpm --filter @decide/web typecheck && pnpm --filter @decide/web lint && pnpm --filter @decide/web build`
Expected: sin errores. Manual con el navegador a 390 px y a 320 px: barra inferior con los bloques visibles para esa persona; la hoja abre/cierra; Guardián flotante late y abre el panel; ningún desplazamiento horizontal; con «reducir movimiento» nada se anima.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/nav apps/web/app/navegacion.css apps/web/app/guardian.css apps/web/app/\(app\)/layout.tsx
git commit -m "feat(web): barra inferior, hoja de opciones y Guardián flotante en celular"
```

---

### Task 5: Panel de Guardián y textos (Guardián donde ayuda; «Nicaragua Decide» en vez de «colmena»)

**Files:**
- Modify: `apps/web/components/AsistentePanel.tsx` (reescritura del JSX; lógica intacta), `apps/web/app/guardian.css`, `apps/web/app/globals.css` (borrar el bloque `.asistente-*` y `.marca-asistente`, líneas ~1371-1400, y `.sugerencia-asistente*`, que pasan a `guardian.css`)
- Modify: `apps/web/components/SugerenciaAsistente.tsx:5,21-23,36-37`, `apps/web/components/AlDiaCard.tsx:33,40`, `apps/web/components/CrecerCard.tsx:45`, el texto «A partir de una sugerencia del asistente» (buscar en `apps/web/app/(app)` → `SolucionesSection`), `apps/web/components/RevisarAntesDePublicar.tsx:51,77`
- Modify: `apps/web/app/(app)/reglas/page.tsx:144`, `apps/web/app/(app)/admin/mesa/page.tsx:28`, `apps/web/app/(app)/grupos/[id]/BifurcacionForms.tsx:17`, `apps/web/components/elecciones/Hexagono.tsx` (comentario y forma)

**Interfaces:**
- Consumes: `useAsistente()` (Tarea 3), `Guardian` (Tarea 1).
- Produces: `AsistentePanel()` sin props; clases `.guardian-panel`, `.guardian-cabecera`, `.guardian-burbuja`, `.guardian-burbuja-persona`, `.guardian-escribiendo`, `.guardian-rapidas`.

- [ ] **Step 1: Reescribir el JSX de `AsistentePanel`**

Conservar íntegros `enviar`, `cerrar` (que además llama a `useAsistente().cerrar()`), límites, `generacion`, Escape, foco. Nuevo contenido según §8 del spec: `<aside role="dialog" aria-modal aria-label="Guardián" class="guardian-panel">` (380 px a la derecha; pantalla completa `≤ 599 px`; entra con `slide-in` 0.3 s); cabecera azul con `Guardian tamano={38}` en círculo blanco, «Guardián» y «te ayuda a usar la plataforma», botón Cerrar (×, `aria-label="Cerrar a Guardián"`); primer mensaje fijo «Hola, soy Guardián. Pregúntame cómo plantear una inquietud, apoyar una pregunta o preparar una elección.» con tres píldoras («¿Cómo planteo una inquietud?», «¿Cómo apoyo una pregunta?», «¿Qué es una elección?») que al pulsarlas ponen el texto y llaman a `enviar`; burbujas de Guardián con `Guardian tamano={20}` y etiqueta «sugerencia de Guardián»; «Guardián está escribiendo» con tres puntos (`.guardian-escribiendo span` con retardos 0/.2/.4 s); textos: `TEXTO_DESCANSA = 'Guardián descansa hasta el próximo mes.'`, pie «Guardián puede equivocarse. No guarda esta conversación.», los demás sin cambio. El `textarea` conserva `aria-label="Tu pregunta"` y Enter envía.

- [ ] **Step 2: Textos de Guardián donde ayuda**

`ETIQUETA_SUGERENCIA = 'Sugerencia de Guardián'`; `MarcaAsistente` → «Sembrada por Guardián»; `SugerenciaAsistente` muestra `Guardian tamano={20}` junto a la etiqueta; `AlDiaCard` título «Desde tu última visita» con `Guardian tamano={32}` y la clase `al-dia` sobre fondo `--accent-light`, etiqueta «sugerencia de Guardián»; `CrecerCard:45` «sugerencia de Guardián»; `SolucionesSection` «A partir de una sugerencia de Guardián».

- [ ] **Step 3: Textos donde el sistema controla o rinde cuentas**

`RevisarAntesDePublicar.tsx:51,77`: «Revisión del asistente de IA». No tocar «Pedida por el asistente», «Gasto del asistente (USD)», «Aún no hay gastos del asistente.» ni la frase de la portada.

- [ ] **Step 4: «Colmena» dentro de la app y el hexágono de elecciones**

`reglas/page.tsx:144` «Reglas de todo Nicaragua Decide»; `admin/mesa/page.tsx:28` «Cambiar la regla general «${label}» a ${conSuUnidad}»; `BifurcacionForms.tsx:17` «Llevar la solución a todo Nicaragua Decide». Identificadores (`colmenaRes`, `level === 'colmena'`) no cambian. `components/elecciones/Hexagono.tsx`: misma API y nombre, pero dibuja un círculo (`border-radius: 50%`) con los mismos colores; comentario: «Círculo con iniciales…».

- [ ] **Step 5: Verificar**

Run: `pnpm --filter @decide/web typecheck && pnpm --filter @decide/web lint && pnpm --filter @decide/web build && grep -rn -i "colmena\|honey\|abeja" apps/web/app apps/web/components --include=*.tsx | grep -v "app/portada/"`
Expected: build sin errores; el `grep` solo devuelve identificadores de código en `reglas/page.tsx` (`colmenaRes`, `colmena`, `colmenaRules`, `'colmena'`), ningún texto visible. Manual: el panel abre desde la barra, responde con «sugerencia de Guardián», las píldoras rápidas envían, Escape cierra y el foco vuelve al botón.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/components apps/web/app/guardian.css apps/web/app/globals.css apps/web/app/\(app\)/reglas apps/web/app/\(app\)/admin/mesa/page.tsx apps/web/app/\(app\)/grupos
git commit -m "feat(web): panel de Guardián y nombre del asistente donde ayuda; «Nicaragua Decide» en vez de «colmena»"
```

---

### Task 6: Inicio, la mesa de la comunidad

**Files:**
- Create: `apps/web/lib/inicio.ts`; Test: `apps/web/lib/inicio.test.ts`
- Create: `apps/web/components/inicio/Bienvenida.tsx`, `apps/web/components/inicio/PasosMesa.tsx`, `apps/web/components/inicio/TarjetaGuardian.tsx`, `apps/web/components/inicio/MapaComunidad.tsx`, `apps/web/components/inicio/Cifras.tsx` (server, con `Suspense` en la página)
- Modify: `apps/web/app/(app)/dashboard/page.tsx` (reescritura; conservar la rama de `pending_verification` con el estilo nuevo), `apps/web/components/CrecerSeccion.tsx` (se monta dentro de `TarjetaGuardian`); Delete: `apps/web/components/AlDiaSeccion.tsx`, `apps/web/app/inicio.css`

**Interfaces:**
- Consumes: `GroupSummary`, `GroupDetail` (`/api/groups/:id` → `memberCount`, `activated`), `InquietudSummary[]` (`/api/inquietudes?groupId=`), `EleccionResumen[]` (`/api/elecciones`; ver el tipo en `packages/shared` y contar las que no están en estado final), `serverFetch`, `Sacuanjoche`, `Guardian`, `.card-enlace`, `.fade-up`.
- Produces:
  ```ts
  export type Cifras = { miembros: number | null; preguntas: number | null; elecciones: number | null; activada: boolean | null };
  export function pasoQueToca(c: Cifras): 1 | 2 | 3 | 4; // activada === false → 1; preguntas === 0 → 2; (elecciones ?? 0) === 0 → 3; si no 4
  export function comunidadPrincipal(groups: GroupSummary[]): GroupSummary | null; // primer type 'custom'; si no, groups[0]; [] → null
  export function agruparGrupos(groups: GroupSummary[]): { origen: GroupSummary[]; acogida: GroupSummary[]; otras: GroupSummary[] }; // territorial_origin / territorial_residence / resto, en el orden recibido
  ```

- [ ] **Step 1: Pruebas de `inicio.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { agruparGrupos, comunidadPrincipal, pasoQueToca } from './inicio';
const g = (id: string, type: any) => ({ id, name: id, slug: id, type, description: null });

describe('pasoQueToca', () => {
  it('comunidad sin activar → 1', () => expect(pasoQueToca({ miembros: 1, preguntas: 12, elecciones: 0, activada: false })).toBe(1));
  it('sin preguntas → 2', () => expect(pasoQueToca({ miembros: 25, preguntas: 0, elecciones: 0, activada: true })).toBe(2));
  it('con preguntas y sin elección → 3', () => expect(pasoQueToca({ miembros: 25, preguntas: 12, elecciones: 0, activada: true })).toBe(3));
  it('con elección → 4', () => expect(pasoQueToca({ miembros: 25, preguntas: 12, elecciones: 1, activada: true })).toBe(4));
  it('sin datos (todo null) → 3', () => expect(pasoQueToca({ miembros: null, preguntas: null, elecciones: null, activada: null })).toBe(3));
});
```
(Con datos ausentes: `activada === false` no se cumple, `preguntas === 0` no se cumple, `(elecciones ?? 0) === 0` sí → 3.)

```ts
describe('comunidadPrincipal', () => {
  it('prefiere la custom', () => expect(comunidadPrincipal([g('a', 'territorial_origin'), g('b', 'custom')])?.id).toBe('b'));
  it('si no hay custom, la primera', () => expect(comunidadPrincipal([g('a', 'territorial_origin')])?.id).toBe('a'));
  it('vacío → null', () => expect(comunidadPrincipal([])).toBeNull());
});
describe('agruparGrupos', () => {
  it('reparte por tipo y conserva el orden', () => {
    const r = agruparGrupos([g('m', 'territorial_origin'), g('f', 'territorial_residence'), g('e', 'custom'), g('t', 'trabajo'), g('l', 'territorial_origin')]);
    expect(r.origen.map((x) => x.id)).toEqual(['m', 'l']);
    expect(r.acogida.map((x) => x.id)).toEqual(['f']);
    expect(r.otras.map((x) => x.id)).toEqual(['e', 't']);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar** — Run: `pnpm --filter @decide/web test` · Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar `lib/inicio.ts`** — tres funciones puras según Interfaces.

- [ ] **Step 4: Ejecutar y ver pasar** — Run: `pnpm --filter @decide/web test` · Expected: todas pasan.

- [ ] **Step 5: Página y componentes**

`dashboard/page.tsx`: carga `/api/groups` y `/api/auth/me`; `principal = comunidadPrincipal(groups)`; `<Bienvenida nombre comunidad={principal?.name}>` con `<Suspense fallback={null}><Cifras groupId={principal?.id} /></Suspense>` dentro. `Cifras` hace en paralelo `/api/groups/:id`, `/api/inquietudes?groupId=` (cuenta `!hidden`) y `/api/elecciones`; cada fallo deja `null`; muestra solo las cifras no nulas («miembros verificados», «preguntas abiertas», «elecciones en curso») y pasa `pasoQueToca` a `PasosMesa` (si `Cifras` no puede calcularlo porque no hay comunidad, `PasosMesa` recibe `1`). `PasosMesa({ paso, puedeInvitar })`: las cuatro tarjetas del §6.2 (textos, iconos y enlaces exactos; `puedeInvitar` = `status === 'verified_citizen'`, enlace a `/admin/invite`, si no `/me`), en `<ol>` con `.card.card-enlace`, la que toca con clase `.paso-activo` (azul). `TarjetaGuardian` (server): llama ella misma a `/api/asistente/al-dia` con el mismo `catch` que hoy tiene `AlDiaSeccion`; si `mostrar` es verdadero pinta `<AlDiaCard>`, si no el texto «Todavía no hay novedades. Cuando la comunidad se mueva, te lo cuento aquí.»; debajo monta `<CrecerSeccion />`. Contenedor con `Guardian tamano={32}` y etiqueta «Desde tu última visita». `AlDiaSeccion.tsx` se elimina (su único uso era el panel). `MapaComunidad({ groups })`: `agruparGrupos`, dos columnas «Territorio de origen» / «Lugar de acogida» con filas `.fila-mapa` (`Sacuanjoche variante="icono"` o `"contorno"` según `memberCount > 0`, que se obtiene con `/api/groups/:id` por fila en paralelo, tolerando fallo → sin número), y debajo «Mis comunidades» con `otras`. Rejilla del §6.3: `grid-template-columns: repeat(12, 1fr)`, Guardián `span 5`, mapa `span 7`; una columna `≤ 899 px`. Fondo de bienvenida con tres `Sacuanjoche` en un `<svg>` absoluto (`opacity: .08`, clases `flor-float`/`flor-float-2`, envueltos en `<g transform="translate scale">` para que la animación no se escale). Todo con `fade-up d1…d7`.

- [ ] **Step 6: Verificar**

Run: `pnpm --filter @decide/web typecheck && pnpm --filter @decide/web lint && pnpm --filter @decide/web build`
Expected: sin errores. Manual: con Carlos (verificado, grupo «Exilio y diáspora» con 12 inquietudes) Inicio muestra etiqueta, saludo, tres cifras, cuatro pasos con el paso 3 en azul (o el que marque la regla), Guardián y el mapa; con la API de elecciones caída (apagar el endpoint o simular 500) la página carga sin la cifra; a 320 px nada se desborda; la rama de verificación pendiente sigue mostrando «Tu verificación».

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/inicio.ts apps/web/lib/inicio.test.ts apps/web/components/inicio apps/web/components/CrecerSeccion.tsx
git rm apps/web/components/AlDiaSeccion.tsx
git add apps/web/app/\(app\)/dashboard/page.tsx apps/web/app/inicio.css
git commit -m "feat(web): Inicio como mesa de la comunidad: cifras, cuatro pasos, Guardián y mapa"
```

---

### Task 7: Inquietudes y el formulario que no se vaciaba

**Files:**
- Modify: `apps/web/app/(app)/inquietudes/page.tsx`, `apps/web/app/(app)/inquietudes/SupportButton.tsx`, `apps/web/app/(app)/inquietudes/NewInquietudForm.tsx`, `apps/web/components/RevisarAntesDePublicar.tsx:191-199`, `apps/web/app/(app)/foros/[id]/NewTopicForm.tsx`, `apps/web/app/inquietudes.css`
- Create: `apps/web/app/(app)/inquietudes/TarjetaInquietud.tsx`, `apps/web/app/(app)/inquietudes/PestanasComunidad.tsx`, `apps/web/components/Migas.tsx`

**Interfaces:**
- Consumes: `InquietudSummary`, `GroupSummary`, `INQUIETUD_STATUS_LABEL/BADGE`, `MarcaAsistente` («Sembrada por Guardián», Tarea 5), `Sacuanjoche`, `.card-enlace`.
- Produces: `Migas({ items: { texto: string; ruta?: string }[] })` (`<nav aria-label="Estás en">`), reutilizable; `PestanasComunidad({ groups, selectedId, conteos: Record<string, number | undefined> })`; `TarjetaInquietud({ q: InquietudSummary })`; `SupportButton` con el mismo contrato (`{ id, supported }`) y además `count: number` para pintar el número dentro del círculo.

- [ ] **Step 1: Corregir `useFormConRevision`**

En el `useEffect` de `RevisarAntesDePublicar.tsx:191-199`: tras `recibir(state)`, si el resultado fue `enRevision` (`'enRevision' in state`) **también** se hace `formRef.current?.reset()` (si `reiniciar`), y en ambos casos (éxito o en revisión) se enfoca el aviso: añadir `avisoRef` (`useRef<HTMLElement>`) que `AvisoRevision`/los `<p className="alert">` de éxito reciben vía `tabIndex={-1}` y `ref`, y llamar `avisoRef.current?.focus()`. Devolver `avisoRef` desde el hook para que los formularios lo pongan en su `<p className="alert alert-success">`. Aplicar en `NewInquietudForm` y `NewTopicForm`.

- [ ] **Step 2: Página, pestañas y tarjetas**

Según §7 del spec: `Migas` «Inicio › Participar › Inquietudes»; título «Las primeras preguntas» si `inquietudes.length < 20`, si no «Inquietudes»; botón **Nueva inquietud** (`<a href="#nueva-inquietud" class="btn btn-primary">`, el formulario lleva `id="nueva-inquietud"` y `scroll-behavior: smooth` en `html` dentro de `globals.css`); «Agenda →» como hoy. `PestanasComunidad`: `<div role="tablist">` de `<a role="tab" aria-selected>` en píldora con `Sacuanjoche variante="icono" tamano={12}` (centro blanco en la activa) y el número de inquietudes de la comunidad seleccionada (para las demás no se hace llamada: se omite el número). `TarjetaInquietud`: `.card.card-enlace.inq-tarjeta` en una columna, `SupportButton` a la izquierda (círculo 44 px con flecha ↑ y `count`; `.inq-apoyo-activo` azul fijo si `supported`), título enlazado, etiqueta de estado, «Sembrada por Guardián» si `origen === 'asistente'`, «N apoyos de M necesarios», plazo. Formulario al final en `.card` con título «Plantear una inquietud en {comunidad}».

- [ ] **Step 3: Verificar**

Run: `pnpm --filter @decide/web typecheck && pnpm --filter @decide/web lint && pnpm --filter @decide/web build`
Expected: sin errores. Manual: en «Exilio y diáspora» se ven las 12 tarjetas con sus botones de apoyo (apoyar/quitar funciona); plantear una inquietud vacía el formulario y el foco va al aviso «Tu inquietud fue planteada.»; plantear un texto que el asistente mande a revisión (o simular `{ enRevision: true }`) también vacía el formulario y muestra «Tu texto quedó en revisión»; en un foro, publicar un tema vacía su formulario; a 320 px las pestañas se parten en varias filas sin desbordar.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/inquietudes apps/web/app/\(app\)/foros/\[id\]/NewTopicForm.tsx apps/web/components/RevisarAntesDePublicar.tsx apps/web/components/Migas.tsx apps/web/app/inquietudes.css apps/web/app/globals.css
git commit -m "feat(web): inquietudes con pestañas y tarjetas; el formulario se vacía al publicar o quedar en revisión"
```

---

### Task 8: Portada pública centrada

**Files:**
- Modify: `apps/web/app/page.tsx` (metadatos y quitar `clasesFuentes`), `apps/web/app/portada/Barra.tsx`, `Hero.tsx`, `ComoFunciona.tsx`, `TuLugar.tsx:9`, `LoQueDecidimos.tsx` (texto línea 29 y hexágonos), `PorQueConfiar.tsx` (hexágonos), `QuienesSomos.tsx:33-36,47,66-85`, `portada.module.css`, `secciones.module.css`
- Delete: `apps/web/app/portada/Hexagono.tsx`, `apps/web/app/portada/fuentes.ts`
- Consumes: `Marca` (Tarea 3), `Sacuanjoche`, `ShareButton` (`app/components/ShareButton.tsx`, variante `nav`).

- [ ] **Step 1: Fuentes y tokens de la portada**

`portada.module.css`: `.portada` define `--pt-display: var(--font-display)`, `--pt-sans: var(--font-sans)`, y sus colores pasan a los de la marca: `--pt-azul: #0a3880`, `--pt-azul-hover: #072a60`, `--pt-texto: #0f172a`, `--pt-texto-2: #475569`, `--pt-niebla: #f4f6fa`, `--pt-amarillo: #f2b00a`; eliminar `--pt-azul-pastel`, `--pt-platino`, `--pt-franja` y sus usos. Toda `font-family: var(--pt-serif)` pasa a `var(--pt-display)`. Borrar `fuentes.ts` y su importación en `page.tsx`.

- [ ] **Step 2: Barra y bienvenida**

`Barra.tsx`: `<header class={styles.barra}>` azul con `Marca enlace="/"` a la izquierda y, a la derecha, «Contacto» (`#contacto`, blanco), `ShareButton variant="nav"` (en `portada.module.css` `.barra :global(.ln-share-btn)` pasa a píldora blanca de borde sobre azul) y **Entrar** (píldora amarilla, texto tinta). Conservar la regla de ocultar «Contacto» `≤ 379 px`. `Hero.tsx`: una sola columna centrada en todos los anchos (`grid-template-areas: 'texto' 'accion' 'video'`), sin franjas; etiqueta en píldora «Una comunidad democrática y cooperativa» con `Sacuanjoche variante="icono" tamano={12}`; título 76 px (46 px `≤ 599 px`) con la animación `sube` actual; párrafo actual a 19 px; botones **Únete a la comunidad →** (`/login`, `.boton`) y **Mirar sin registrarse** (`/explore`, `.botonSecundario` borde azul); `VideoColmena` sin cambios, `.videoBloque { max-width: 560px; margin: 28px auto 0 }`. Fondo `--pt-niebla` con cuatro sacuanjoches tenues (`opacity: .07`) en un `<svg>` absoluto como en Inicio.

- [ ] **Step 3: Cómo funciona y el resto**

`ComoFunciona.tsx`: título «Cómo funciona la comunidad», subtítulo «De la inquietud al resultado, en cinco pasos», `<ol class={s.pasos}>` de cinco `.paso` en `.card`-equivalente de módulo (fondo blanco, `--radius`, elevación al pasar) con cuadrado numerado 44 px (`amarillo`: fondo `--pt-amarillo` y número en tinta; `azul`: fondo azul y número blanco) y los textos actuales; cinco columnas `≥ 900 px`, una `≤ 599 px`. Quitar `Hexagono` de `LoQueDecidimos` y `PorQueConfiar` (sustituir por `Sacuanjoche variante="icono" tamano={20}` o por el cuadrado numerado, según sea icono o número) y borrar `Hexagono.tsx`. Textos: `TuLugar.tsx:9` «Tu lugar en la comunidad»; `LoQueDecidimos.tsx:29` «Aquí verás los primeros acuerdos de la comunidad»; `QuienesSomos.tsx` «…forma el primer círculo de la comunidad.» y «Recibe en tu correo las novedades de la comunidad.»; `page.tsx` `TITULO = 'Nicaragua decide — una comunidad democrática y cooperativa'`. Pie (`QuienesSomos.tsx:66-85`): fondo tinta, `Marca` con logo, enlaces actuales y «Impulsado por OpenCivic Solutions» (texto; el símbolo llega después).

- [ ] **Step 4: Verificar**

Run: `pnpm --filter @decide/web typecheck && pnpm --filter @decide/web lint && pnpm --filter @decide/web build && grep -rn -i "colmena\|hexagono" apps/web/app/portada apps/web/app/page.tsx`
Expected: build sin errores; el `grep` solo devuelve `VideoColmena.tsx`, `textos-video.ts`, `creditos.ts` y la importación de `VideoColmena` en `Hero.tsx`. Manual: en escritorio y a 390 px la portada muestra barra azul con marca blanca, texto centrado, botones, video debajo con Sonido/Pausa funcionando, cinco pasos, pie; con «reducir movimiento» se ve la imagen fija y nada se anima; Lighthouse de accesibilidad ≥ 95.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/app/portada apps/web/app/page.tsx
git commit -m "feat(web): portada centrada con barra azul, sacuanjoche y cinco pasos; «comunidad» en vez de «colmena»"
```

---

### Task 9: Revisión final de conjunto

**Files:** ninguno nuevo; correcciones que salgan.

- [ ] **Step 1: Comprobaciones automáticas**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm --filter @decide/web test && grep -rln -i "honey\|abeja" apps/web --include=*.tsx --include=*.ts --exclude-dir=node_modules --exclude-dir=.next`
Expected: todo pasa; el `grep` devuelve solo `apps/web/app/portada/VideoColmena.tsx` y `apps/web/app/portada/creditos.ts`.

- [ ] **Step 2: Lista de aceptación del §13 del spec**

Recorrer los siete puntos en `next dev` a 1360 px y a 390 px con una persona verificada y con una pendiente de verificación; anotar en el PR lo comprobado y lo que no se pudo (por ejemplo, sin Lighthouse).

- [ ] **Step 3: Abrir el PR**

`git push -u origin diseno/rediseno-guardian` y PR contra `main` titulado «Rediseño: navegación en 3 bloques, Guardián, sacuanjoche y portada centrada», con la lista de aceptación y las decisiones tomadas; terminar con la línea de atribución del repositorio. No se une sin el «une la N» de Carlos.
