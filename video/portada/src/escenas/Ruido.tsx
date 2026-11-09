// Escena 2 · El ruido: la foto, gris y borrosa, se llena de bocadillos de redes que la tapan.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { INTER } from '../Titular';
import { clamp, FOTO_RECT } from './comun';

type Bocadillo = { texto: string; x: number; y: number; f: number; tam: number; giro: number; cola: 'izq' | 'der' };

// Primera ola: grandes. Segunda ola: los mismos mensajes repetidos, más pequeños, hasta tapar la foto.
const BOCADILLOS: Bocadillo[] = [
  { texto: '¡Traición!', x: 170, y: 468, f: 20, tam: 50, giro: -4, cola: 'izq' },
  { texto: '#fake', x: 650, y: 540, f: 38, tam: 54, giro: 3, cola: 'der' },
  { texto: '¿Y quién paga?', x: 215, y: 740, f: 56, tam: 46, giro: 2, cola: 'izq' },
  { texto: '🔥🔥🔥', x: 640, y: 800, f: 72, tam: 50, giro: -3, cola: 'der' },
  { texto: '#fake', x: 470, y: 452, f: 96, tam: 36, giro: 5, cola: 'izq' },
  { texto: '🔥🔥🔥', x: 120, y: 612, f: 106, tam: 36, giro: -6, cola: 'izq' },
  { texto: '¡Traición!', x: 700, y: 676, f: 114, tam: 36, giro: 4, cola: 'der' },
  { texto: '¿Y quién paga?', x: 430, y: 900, f: 122, tam: 34, giro: -3, cola: 'der' },
  { texto: '#fake', x: 150, y: 892, f: 130, tam: 34, giro: 6, cola: 'izq' },
  { texto: '🔥🔥🔥', x: 470, y: 624, f: 138, tam: 34, giro: -2, cola: 'der' },
];

const Globo: React.FC<{ b: Bocadillo; frame: number; fps: number; salida: number }> = ({ b, frame, fps, salida }) => {
  const s = spring({ frame: frame - b.f, fps, config: { damping: 9, stiffness: 160, mass: 0.6 } });
  if (frame < b.f) return null;
  // Temblor leve, cada uno a su ritmo, para que el ruido no se quede quieto.
  const temblor = Math.sin((frame + b.f * 7) * 0.5) * 1.6;
  const pad = b.tam * 0.34;
  return (
    <div
      style={{
        position: 'absolute',
        left: b.x,
        top: b.y,
        transformOrigin: b.cola === 'izq' ? '15% 100%' : '85% 100%',
        transform: `scale(${s * (1 - 0.25 * salida)}) rotate(${b.giro + temblor}deg)`,
        opacity: Math.min(1, s * 1.5) * (1 - salida),
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          border: '4px solid #E0A8A8',
          color: '#B04A4A',
          fontFamily: INTER,
          fontWeight: 600,
          fontSize: b.tam,
          lineHeight: 1.1,
          padding: `${pad * 0.7}px ${pad * 1.25}px`,
          borderRadius: b.tam * 0.5,
          whiteSpace: 'nowrap',
          boxShadow: '0 12px 26px rgba(176,74,74,0.18)',
        }}
      >
        {b.texto}
        <div
          style={{
            position: 'absolute',
            bottom: -b.tam * 0.24,
            [b.cola === 'izq' ? 'left' : 'right']: b.tam * 0.6,
            width: b.tam * 0.42,
            height: b.tam * 0.42,
            background: '#FFFFFF',
            borderRight: '4px solid #E0A8A8',
            borderBottom: '4px solid #E0A8A8',
            transform: 'rotate(45deg)',
          }}
        />
      </div>
    </div>
  );
};

export const Ruido: React.FC<{ duracion: number }> = ({ duracion }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = interpolate(frame, [0, 20], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const borroso = interpolate(frame, [0, 150], [3, 11], clamp);
  // Al final los bocadillos se desinflan y la foto se va: deja sitio a la escena 3.
  const salida = interpolate(frame, [duracion - 36, duracion - 14], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  // Un leve sacudón de la foto mientras llega el ruido.
  const sacude = interpolate(frame, [20, 140], [0, 1], clamp) * (1 - salida);
  const sx = Math.sin(frame * 1.7) * 2.2 * sacude;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          ...FOTO_RECT,
          overflow: 'hidden',
          borderRadius: 18,
          opacity: entrada * (1 - salida) * 0.62,
          transform: `translateX(${sx}px) scale(${1 + 0.03 * salida})`,
        }}
      >
        <Img
          src={staticFile('renacer.jpg')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `grayscale(1) blur(${borroso}px) contrast(0.85) brightness(1.08)`,
            transform: 'scale(1.06)',
          }}
        />
      </div>
      {BOCADILLOS.map((b, i) => (
        <Globo key={i} b={b} frame={frame} fps={fps} salida={salida} />
      ))}
    </AbsoluteFill>
  );
};
