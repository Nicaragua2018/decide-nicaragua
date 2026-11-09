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

`render.mjs` genera `colmena.mp4`, `colmena.webm` y `colmena-final.webp` y los deja en `apps/web/public/portada/`. Cada archivo de video debe pesar 4 MB o menos: si se pasa, sube el `crf` (3 intentos) y, como último recurso, renderiza a 720×720.

Para revisar cuadros sueltos sin renderizar todo:

```bash
node render.mjs --capturas 90,285,480,705,945   # PNG en out/ (no se sube a git)
```

## Cómo está hecho

- `src/Root.tsx`: composición `Colmena` (1080×1080, 30 fps, 1092 cuadros = 36,4 s), textos, aviso de IA y música (fundido de entrada y de salida).
- `src/tiempos.ts`: en qué cuadro empieza y termina cada escena.
- `src/escenas/`: una escena por archivo (Dispersos, Ruido, Renace, Multiplica, República).
- `src/Honey.tsx`: el vuelo de Honey (tramos curvos, balanceo de ±8 px, giro de ±4°) y las piezas que lleva.
- `src/Panal.tsx`: geometría de las celdas, encuadre de cada foto y posición de cada celda en el panal.

## Contenido

- `assets/`: Honey sin fondo, Renacer, fotos de Wikimedia Commons (800 px máx.) y la música (40 s, sin fundidos: se aplican en Remotion con `volume`).
- `CREDITOS.md`: autor, licencia y enlace de cada obra de terceros. Debe coincidir con `apps/web/app/portada/creditos.ts`.
- Los textos en pantalla viven en `apps/web/app/portada/textos-video.ts`.

Licencia de Remotion: uso gratuito para organizaciones sin fines de lucro, individuos y empresas de hasta 3 empleados (https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
