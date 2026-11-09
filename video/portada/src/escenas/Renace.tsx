// Escena 3 · Renace: dos mitades a color se unen y forman la primera celda.
// Honey hace todo el trabajo: trae la mitad izquierda, va por la derecha
// (que la espera flotando) y la junta con la primera.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { estadoHoney, MITAD_DX, MITAD_DY, S3 } from '../Honey';
import { HexBorde, HexFoto, PRIMERA } from '../Panal';
import { clamp } from './comun';

export const Renace: React.FC<{ desde: number }> = ({ desde }) => {
  const local = useCurrentFrame();
  const f = desde + local;
  const { fps } = useVideoConfig();
  const { cx, cy, R } = PRIMERA;
  const UNION = S3.union - desde;
  const h = estadoHoney(f);

  // Mitad izquierda: colgada de Honey hasta que la deja en su sitio.
  const dejaIzq = interpolate(f, [S3.sueltaIzq - 8, S3.sueltaIzq], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const izqColgada = { x: h.x + MITAD_DX, y: h.y + MITAD_DY };
  const izqX = izqColgada.x + (cx - izqColgada.x) * dejaIzq;
  const izqY = izqColgada.y + (cy - izqColgada.y) * dejaIzq;
  const izqGiro = h.rot * (1 - dejaIzq);

  // Mitad derecha: entra flotando por la derecha, espera, Honey la recoge y la une.
  const aparece = S3.recogeDer - 60;
  const flota = interpolate(f, [aparece, S3.recogeDer - 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const espera = {
    x: S3.esperaDer.x + 360 * (1 - flota),
    y: S3.esperaDer.y + 30 * (1 - flota) + Math.sin(f * 0.15) * 6,
  };
  const toma = interpolate(f, [S3.recogeDer, S3.recogeDer + 5], [0, 1], clamp);
  const derColgada = { x: h.x - MITAD_DX, y: h.y + MITAD_DY };
  const deja = interpolate(f, [S3.union - 8, S3.union], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  let derX = espera.x + (derColgada.x - espera.x) * toma;
  let derY = espera.y + (derColgada.y - espera.y) * toma;
  derX += (cx - derX) * deja;
  derY += (cy - derY) * deja;
  const derGiro = (f < S3.recogeDer ? Math.sin(f * 0.11) * 5 : h.rot) * (1 - deja);

  // Al unirse: un pulso de la celda, un resplandor de miel y el borde amarillo que se dibuja.
  const pulso = spring({ frame: local - UNION, fps, config: { damping: 11, stiffness: 140 } });
  const escala =
    local < UNION ? 1 : 1 + 0.06 * Math.sin(Math.min(1, pulso) * Math.PI) * (1 - Math.min(1, (local - UNION) / 36));
  const resplandor = interpolate(local, [UNION, UNION + 8, UNION + 40], [0, 1, 0], clamp);
  const borde = interpolate(local, [UNION + 2, UNION + 30], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const brillo = interpolate(local, [UNION + 2, UNION + 16, UNION + 42], [0, 1, 0.15], clamp);
  const unidas = local >= UNION;

  return (
    <AbsoluteFill>
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
          {f >= aparece && <HexFoto foto="renacer" cx={derX} cy={derY} R={R} mitad="derecha" rotacion={derGiro} />}
        </>
      )}
      {unidas && <HexBorde cx={cx} cy={cy} R={R} progreso={borde} brillo={brillo} escala={escala} />}
    </AbsoluteFill>
  );
};
