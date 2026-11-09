// Escena 1 · Dispersos: la foto de Renacer, en gris, se parte en pedazos que se alejan.
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FOTO_RECT } from './comun';

const c = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Pedazos de la foto (en % del rectángulo), con vértices compartidos para que encajen.
// d = desplazamiento final en px y giro final en grados.
const PEDAZOS: { pts: [number, number][]; dx: number; dy: number; giro: number }[] = [
  { pts: [[0, 0], [34, 0], [48, 30], [22, 38], [0, 48]], dx: -250, dy: -40, giro: -9 },
  { pts: [[34, 0], [63, 0], [76, 42], [48, 30]], dx: -20, dy: -62, giro: 5 },
  { pts: [[63, 0], [100, 0], [100, 55], [76, 42]], dx: 240, dy: -46, giro: 8 },
  { pts: [[0, 48], [22, 38], [30, 70], [40, 100], [0, 100]], dx: -280, dy: 46, giro: -6 },
  { pts: [[22, 38], [48, 30], [58, 64], [30, 70]], dx: -105, dy: 4, giro: 4 },
  { pts: [[48, 30], [76, 42], [84, 72], [58, 64]], dx: 110, dy: -14, giro: -5 },
  { pts: [[30, 70], [58, 64], [70, 100], [40, 100]], dx: -60, dy: 40, giro: 7 },
  { pts: [[58, 64], [84, 72], [100, 100], [70, 100]], dx: 140, dy: 46, giro: -7 },
  { pts: [[76, 42], [100, 55], [100, 100], [84, 72]], dx: 290, dy: 24, giro: 9 },
];

export const Dispersos: React.FC<{ duracion: number }> = ({ duracion }) => {
  const frame = useCurrentFrame();
  // La foto ya está en el primer cuadro (al empezar o al repetirse el video nunca se ve un hueco blanco).
  const entrada = interpolate(frame, [0, 22], [0.75, 1], { ...c, easing: Easing.out(Easing.cubic) });
  // Primero se agrieta (unos px) y luego los pedazos se alejan despacio.
  const grieta = interpolate(frame, [20, 34], [0, 1], { ...c, easing: Easing.out(Easing.back(2)) });
  const aleja = interpolate(frame, [30, duracion], [0, 1], { ...c, easing: Easing.inOut(Easing.sin) });
  const salida = interpolate(frame, [duracion - 20, duracion], [1, 0], c);

  return (
    <AbsoluteFill style={{ opacity: entrada * salida }}>
      {PEDAZOS.map((p, i) => {
        const cx = p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length;
        const cy = p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length;
        // La grieta separa cada pedazo unos px desde el centro de la foto.
        const gx = ((cx - 50) / 50) * 10 * grieta;
        const gy = ((cy - 50) / 50) * 8 * grieta;
        const x = gx + p.dx * aleja;
        const y = gy + p.dy * aleja;
        const giro = p.giro * aleja;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...FOTO_RECT,
              clipPath: `polygon(${p.pts.map((q) => `${q[0]}% ${q[1]}%`).join(',')})`,
              transformOrigin: `${cx}% ${cy}%`,
              transform: `translate(${x}px, ${y}px) rotate(${giro}deg) scale(${1.03 - 0.03 * entrada - 0.06 * aleja})`,
              opacity: 1 - 0.45 * aleja,
            }}
          >
            <Img
              src={staticFile('renacer.jpg')}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'grayscale(1) contrast(0.92) brightness(1.06)',
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
