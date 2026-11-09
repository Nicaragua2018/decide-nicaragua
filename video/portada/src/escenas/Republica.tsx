// Escena 5 · La República‑colmena: el panal completo, Renacer en el centro con
// borde de miel y la celda de la bandera. Su último cuadro es la imagen fija.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { CELDAS, CeldaDibujo, centroCelda, HexBorde, PANAL } from '../Panal';
import { clamp } from './comun';

export const Republica: React.FC = () => {
  const frame = useCurrentFrame();
  // El panal «respira» una vez y queda quieto para el cuadro final.
  const respira = interpolate(frame, [0, 40, 110], [0, 1, 0], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const escala = 1 + 0.025 * respira;
  // El borde de Renacer brilla al completarse la colmena y queda con un brillo tibio.
  const brillo = interpolate(frame, [0, 30, 120], [0.15, 1, 0.45], { ...clamp, easing: Easing.inOut(Easing.quad) });
  // Un destello recorre las celdas de una en una (de dentro hacia fuera).
  const orden = [0, 4, 2, 6, 5, 1, 3, 7, 8];

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${escala})`,
        transformOrigin: `${PANAL.cx}px ${PANAL.cy}px`,
      }}
    >
      {CELDAS.map((c, i) => {
        const centro = centroCelda(c);
        const k = orden.indexOf(i);
        const destello = interpolate(frame, [20 + k * 6, 32 + k * 6, 50 + k * 6], [0, 1, 0], clamp);
        return (
          <CeldaDibujo
            key={c.id}
            celda={c}
            cx={centro.x}
            cy={centro.y}
            R={PANAL.R}
            style={{ filter: `drop-shadow(0 10px 18px rgba(27,42,74,0.16)) brightness(${1 + 0.12 * destello})` }}
          />
        );
      })}
      <HexBorde cx={PANAL.cx} cy={PANAL.cy} R={PANAL.R} brillo={brillo} />
    </AbsoluteFill>
  );
};
