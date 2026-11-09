// Escena 4 · Se multiplica: la primera celda toma su lugar y el panal se llena.
// Honey trae las tres primeras piezas; después las demás llegan solas, cada una
// por su lado: la colmena crece sin un jefe en el centro.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PIEZA_R, PIEZAS_HONEY, piezaColgada } from '../Honey';
import {
  CELDAS,
  CeldaDibujo,
  celdaPorId,
  centroCelda,
  HexBorde,
  HexHueco,
  PANAL,
  PRIMERA,
} from '../Panal';
import { clamp } from './comun';

type P = { x: number; y: number };

/** Piezas que llegan solas: desde fuera del cuadro, por una curva (cuadros globales). */
const PIEZAS_SOLAS: { celda: string; desde: P; control: P; sale: number }[] = [
  { celda: 'miel', desde: { x: -140, y: 1180 }, control: { x: 40, y: 1040 }, sale: 714 },
  { celda: 'gueguense', desde: { x: -140, y: 470 }, control: { x: 170, y: 410 }, sale: 726 },
  { celda: 'granada', desde: { x: 1220, y: 400 }, control: { x: 900, y: 380 }, sale: 738 },
  { celda: 'bandera', desde: { x: 1220, y: 640 }, control: { x: 1060, y: 450 }, sale: 750 },
  { celda: 'momotombo', desde: { x: 780, y: 1220 }, control: { x: 900, y: 1010 }, sale: 762 },
];
const VIAJE = 46;

const curva = (t: number, a: P, c: P, b: P): P => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

export const Multiplica: React.FC<{ desde: number }> = ({ desde }) => {
  const local = useCurrentFrame();
  const f = desde + local;
  const { fps } = useVideoConfig();

  // La primera celda se encoge hasta el tamaño del panal.
  const encoge = interpolate(local, [0, 34], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const R0 = PRIMERA.R + (PANAL.R - PRIMERA.R) * encoge;

  const piezas: React.ReactNode[] = [];

  // Piezas que trae Honey: llegan flotando a su punto de espera, Honey las recoge y las suelta.
  PIEZAS_HONEY.forEach((p, i) => {
    const celda = celdaPorId(p.celda);
    const destino = centroCelda(celda);
    const aparece = p.recoge - 44;
    if (f < aparece) return;
    const flota = interpolate(f, [aparece, aparece + 38], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const fuera = { x: p.espera.x < 540 ? -120 : 1200, y: p.espera.y + 70 };
    const espera = {
      x: fuera.x + (p.espera.x - fuera.x) * flota,
      y: fuera.y + (p.espera.y - fuera.y) * flota + Math.sin(f * 0.16 + i) * 5,
    };
    let pos = espera;
    let R = PIEZA_R;
    let giro = Math.sin(f * 0.12 + i * 2) * 6;
    if (f >= p.recoge) {
      const colgada = piezaColgada(f);
      const toma = interpolate(f, [p.recoge, p.recoge + 5], [0, 1], clamp);
      pos = { x: espera.x + (colgada.x - espera.x) * toma, y: espera.y + (colgada.y - espera.y) * toma };
    }
    if (f >= p.suelta - 4) {
      const encaja = spring({ frame: f - (p.suelta - 4), fps, config: { damping: 13, stiffness: 150 } });
      const colgada = piezaColgada(Math.min(f, p.suelta));
      pos = { x: colgada.x + (destino.x - colgada.x) * Math.min(1, encaja), y: colgada.y + (destino.y - colgada.y) * Math.min(1, encaja) };
      R = PIEZA_R + (PANAL.R - PIEZA_R) * encaja;
      giro *= 1 - Math.min(1, encaja);
    }
    piezas.push(<CeldaDibujo key={p.celda} celda={celda} cx={pos.x} cy={pos.y} R={R} rotacion={giro} />);
  });

  // Piezas que llegan solas.
  PIEZAS_SOLAS.forEach((p, i) => {
    if (f < p.sale) return;
    const celda = celdaPorId(p.celda);
    const destino = centroCelda(celda);
    const t = interpolate(f, [p.sale, p.sale + VIAJE], [0, 1], { ...clamp, easing: Easing.bezier(0.35, 0, 0.25, 1) });
    const pos = curva(t, p.desde, p.control, destino);
    const encaja = spring({ frame: f - (p.sale + VIAJE - 6), fps, config: { damping: 13, stiffness: 150 } });
    const R = PIEZA_R + (PANAL.R - PIEZA_R) * (f < p.sale + VIAJE - 6 ? 0 : encaja);
    const giro = (i % 2 ? 18 : -18) * (1 - t);
    piezas.push(<CeldaDibujo key={p.celda} celda={celda} cx={pos.x} cy={pos.y} R={R} rotacion={giro} />);
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
