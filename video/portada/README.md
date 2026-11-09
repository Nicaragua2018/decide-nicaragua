# Video de la portada (Remotion)

Proyecto aparte del monorepo: **no** es paquete del workspace (`pnpm-workspace.yaml` solo cubre `apps/*` y `packages/*`). Tiene su propio `pnpm-lock.yaml`.

## Instalar

```bash
cd video/portada
pnpm install --ignore-workspace
npx remotion versions   # debe mostrar una sola versión de Remotion (4.0.541)
```

## Ver y editar

```bash
pnpm studio
```

## Renderizar

```bash
pnpm render
```

`render.mjs` genera `colmena.mp4`, `colmena.webm` y `colmena-final.webp` y los deja en `apps/web/public/portada/`. Cada archivo de video debe pesar 4 MB o menos.

## Contenido

- `assets/`: Honey sin fondo, Renacer, fotos de Wikimedia Commons (800 px máx.) y la música (40 s, sin fundidos: se aplican en Remotion con `volume`).
- `CREDITOS.md`: autor, licencia y enlace de cada obra de terceros. Debe coincidir con `apps/web/app/portada/creditos.ts`.
- Los textos en pantalla viven en `apps/web/app/portada/textos-video.ts`.

Licencia de Remotion: uso gratuito para organizaciones sin fines de lucro, individuos y empresas de hasta 3 empleados (https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
