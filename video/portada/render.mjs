// Renderiza el video de la portada y su imagen fija en apps/web/public/portada/.
//
//   node render.mjs                      → colmena.mp4, colmena.webm y colmena-final.webp
//   node render.mjs --capturas 90,285    → solo capturas PNG de esos cuadros en out/
//
// Cada video debe pesar 4 MB o menos. Si se pasa, se sube el crf y se vuelve a
// intentar (3 intentos); si aun así no cabe, se renderiza a 720×720 (scale 2/3).
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(RAIZ, '../../apps/web/public/portada');
const CAPTURAS = path.join(RAIZ, 'out');
const LIMITE = 4 * 1024 * 1024; // 4 194 304 bytes
const ULTIMO_CUADRO = 1049;

const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB (${b} bytes)`;

console.log('Empaquetando el proyecto…');
const serveUrl = await bundle({
  entryPoint: path.join(RAIZ, 'src/index.ts'),
  publicDir: path.join(RAIZ, 'assets'),
});
const composition = await selectComposition({ serveUrl, id: 'Colmena' });
console.log(`Composición ${composition.id}: ${composition.width}×${composition.height}, ${composition.durationInFrames} cuadros a ${composition.fps} fps`);

// --- modo capturas
const iCapt = process.argv.indexOf('--capturas');
if (iCapt !== -1) {
  mkdirSync(CAPTURAS, { recursive: true });
  const cuadros = (process.argv[iCapt + 1] ?? '').split(',').filter(Boolean).map(Number);
  for (const frame of cuadros) {
    const output = path.join(CAPTURAS, `cuadro-${String(frame).padStart(4, '0')}.png`);
    await renderStill({ serveUrl, composition, frame, output, imageFormat: 'png' });
    console.log(`  ${output}`);
  }
  process.exit(0);
}

mkdirSync(SALIDA, { recursive: true });

/** Renderiza un video probando crf cada vez más altos; si no cabe, baja a 720×720. */
const renderizarVideo = async ({ nombre, codec, crfs, extra }) => {
  const output = path.join(SALIDA, nombre);
  for (const scale of [1, 2 / 3]) {
    for (const crf of crfs) {
      const lado = Math.round(composition.width * scale);
      console.log(`\n${nombre}: ${codec}, crf ${crf}, ${lado}×${lado}…`);
      let ultimo = -1;
      await renderMedia({
        serveUrl,
        composition,
        codec,
        crf,
        scale,
        outputLocation: output,
        overwrite: true,
        ...extra,
        onProgress: ({ progress }) => {
          const p = Math.floor(progress * 10);
          if (p !== ultimo) {
            ultimo = p;
            process.stdout.write(` ${p * 10}%`);
          }
        },
      });
      const peso = statSync(output).size;
      console.log(`\n  ${nombre}: ${mb(peso)}`);
      if (peso <= LIMITE) return { output, peso, crf, scale };
      console.log('  Pasa de 4 MB: se intenta con más compresión.');
    }
  }
  throw new Error(`${nombre} no cabe en 4 MB ni a 720×720.`);
};

const mp4 = await renderizarVideo({
  nombre: 'colmena.mp4',
  codec: 'h264',
  crfs: [25, 27, 29],
  extra: { audioCodec: 'aac', audioBitrate: '128k', x264Preset: 'slow', pixelFormat: 'yuv420p' },
});
const webm = await renderizarVideo({
  nombre: 'colmena.webm',
  codec: 'vp9',
  crfs: [38, 40, 42],
  extra: { audioCodec: 'opus', audioBitrate: '96k', pixelFormat: 'yuv420p' },
});

const fija = path.join(SALIDA, 'colmena-final.webp');
console.log('\nImagen fija (último cuadro)…');
await renderStill({ serveUrl, composition, frame: ULTIMO_CUADRO, output: fija, imageFormat: 'webp' });

console.log('\nListo:');
for (const r of [mp4, webm]) console.log(`  ${path.basename(r.output)}: ${mb(r.peso)} · crf ${r.crf} · escala ${r.scale.toFixed(2)}`);
console.log(`  colmena-final.webp: ${mb(statSync(fija).size)}`);
