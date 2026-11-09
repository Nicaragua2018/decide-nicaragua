// Escena 3 · Renace: dos mitades a color se unen y forman la primera celda.
// La mitad derecha la trae Honey; la izquierda llega sola desde el otro lado.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { estadoHoney, HONEY_UNE } from '../Honey';
import { HexBorde, HexFoto, PRIMERA } from '../Panal';
import { clamp } from './comun';

/** Cuadro (local) en que se unen las dos mitades: cuando Honey llega a HONEY_UNE. */
export const UNION = 72;

export const Renace: React.FC<{ desde: number }> = ({ desde }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cx, cy, R } = PRIMERA;

  // Mitad izquierda: entra desde fuera con una curva suave que frena al llegar.
  const llegada = interpolate(frame, [8, UNION], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const izqX = cx - 620 * (1 - llegada);
  const izqY = cy + Math.sin(llegada * Math.PI) * -40;
  const izqGiro = -10 * (1 - llegada);

  // Mitad derecha: cuelga de Honey hasta la unión y luego queda en su sitio.
  const h = estadoHoney(desde + frame);
  const colgadaX = h.x - (HONEY_UNE.x - cx);
  const colgadaY = h.y - (HONEY_UNE.y - cy);
  const suelta = interpolate(frame, [UNION - 8, UNION], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const derX = colgadaX + (cx - colgadaX) * suelta;
  const derY = colgadaY + (cy - colgadaY) * suelta;
  const derGiro = h.rot * (1 - suelta);

  // Al unirse: un pulso de la celda, un resplandor de miel y el borde amarillo que se dibuja.
  const pulso = spring({ frame: frame - UNION, fps, config: { damping: 11, stiffness: 140 } });
  const escala = frame < UNION ? 1 : 1 + 0.06 * Math.sin(Math.min(1, pulso) * Math.PI) * (1 - Math.min(1, (frame - UNION) / 40));
  const resplandor = interpolate(frame, [UNION, UNION + 10, UNION + 50], [0, 1, 0], clamp);
  const borde = interpolate(frame, [UNION + 2, UNION + 34], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const brillo = interpolate(frame, [UNION + 2, UNION + 20, UNION + 70], [0, 1, 0.15], clamp);
  const unidas = frame >= UNION;

  return (
    <AbsoluteFill>
      {/* resplandor detrás de la celda */}
      <div
        style={{
          position: 'absolute',
          left: cx - 330,
          top: cy - 330,
          width: 660,
          height: 660,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(242,176,10,0.55) 0%, rgba(252,233,168,0.35) 38%, rgba(252,233,168,0) 70%)',
          opacity: resplandor,
          transform: `scale(${0.6 + 0.6 * resplandor})`,
        }}
      />
      {unidas ? (
        <HexFoto foto="renacer" cx={cx} cy={cy} R={R} escala={escala} />
      ) : (
        <>
          <HexFoto foto="renacer" cx={izqX} cy={izqY} R={R} mitad="izquierda" rotacion={izqGiro} />
          <HexFoto foto="renacer" cx={derX} cy={derY} R={R} mitad="derecha" rotacion={derGiro} />
        </>
      )}
      {unidas && <HexBorde cx={cx} cy={cy} R={R} progreso={borde} brillo={brillo} escala={escala} />}
    </AbsoluteFill>
  );
};
