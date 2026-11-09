// Escena 4 · Se multiplica: la primera celda toma su lugar y el panal se llena.
// Honey junta ella misma todas las piezas: en cada viaje recoge dos que llegan
// flotando a la orilla del cuadro y deja cada una en su celda.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PAR_DX, PIEZA_R, piezaColgada, VIAJES } from '../Honey';
import { CELDAS, CeldaDibujo, celdaPorId, centroCelda, HexBorde, HexHueco, PANAL, PRIMERA } from '../Panal';
import { clamp } from './comun';

type P = { x: number; y: number };

export const Multiplica: React.FC<{ desde: number }> = ({ desde }) => {
  const local = useCurrentFrame();
  const f = desde + local;
  const { fps } = useVideoConfig();

  // La primera celda se encoge hasta el tamaño del panal.
  const encoge = interpolate(local, [0, 34], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const R0 = PRIMERA.R + (PANAL.R - PRIMERA.R) * encoge;

  const piezas: React.ReactNode[] = [];

  VIAJES.forEach((v, i) => {
    // Las dos piezas llegan flotando desde fuera del cuadro hasta la orilla y esperan a Honey.
    const aparece = Math.max(desde + 1, v.recoge - 46);
    if (f < aparece) return;
    const flota = interpolate(f, [aparece, v.recoge - 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const haciaFuera = v.espera.x < 540 ? -1 : 1;

    v.entregas.forEach((e, j) => {
      const celda = celdaPorId(e.celda);
      const destino = centroCelda(celda);
      const vaiven = Math.sin(f * 0.16 + i * 2 + j * 1.3) * 5;
      const espera: P = {
        x: v.espera.x + e.lado * PAR_DX + haciaFuera * 300 * (1 - flota),
        y: v.espera.y + 40 * (1 - flota) + vaiven,
      };
      let pos = espera;
      let R = PIEZA_R;
      let giro = Math.sin(f * 0.12 + i * 2 + j) * 6;
      if (f >= v.recoge) {
        const colgada = piezaColgada(Math.min(f, e.f), e.lado * PAR_DX);
        const toma = interpolate(f, [v.recoge, v.recoge + 5], [0, 1], clamp);
        pos = { x: espera.x + (colgada.x - espera.x) * toma, y: espera.y + (colgada.y - espera.y) * toma };
      }
      if (f >= e.f - 4) {
        // Al soltarla, la pieza baja a su celda y crece hasta llenarla.
        const encaja = spring({ frame: f - (e.f - 4), fps, config: { damping: 13, stiffness: 150 } });
        const k = Math.min(1, encaja);
        const colgada = piezaColgada(Math.min(f, e.f), e.lado * PAR_DX);
        pos = { x: colgada.x + (destino.x - colgada.x) * k, y: colgada.y + (destino.y - colgada.y) * k };
        R = PIEZA_R + (PANAL.R - PIEZA_R) * encaja;
        giro *= 1 - k;
      }
      piezas.push(
        <CeldaDibujo key={e.celda} celda={celda} cx={pos.x} cy={pos.y} R={R} rotacion={giro} style={{ zIndex: f >= e.f ? 0 : 1 }} />,
      );
    });
  });

  return (
    <AbsoluteFill>
      {/* huecos del panal, que aparecen uno a uno */}
      {CELDAS.slice(1).map((c, i) => {
        const centro = centroCelda(c);
        const o = interpolate(local, [14 + i * 4, 34 + i * 4], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return <HexHueco key={c.id} cx={centro.x} cy={centro.y} R={PANAL.R} opacidad={o} />;
      })}
      <CeldaDibujo celda={CELDAS[0]} cx={PANAL.cx} cy={PANAL.cy} R={R0} />
      <HexBorde cx={PANAL.cx} cy={PANAL.cy} R={R0} brillo={0.15} />
      {piezas}
    </AbsoluteFill>
  );
};
