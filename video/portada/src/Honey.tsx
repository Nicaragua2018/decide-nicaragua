// Vuelo de Honey. Solo existe una pose (assets/honey.png): la vida del vuelo
// sale de trayectorias curvas (Bézier), un balanceo vertical de ±8 px,
// una inclinación de ±4° según la velocidad y un leve «respirar» de escala.
import React from 'react';
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { anchoCelda, centroCelda, celdaPorId, PANAL, PRIMERA } from './Panal';

type P = { x: number; y: number };

/** Tramo de vuelo: curva cúbica de p0 a p1 con controles c1 y c2, entre los cuadros f0 y f1. */
type Tramo = { f0: number; f1: number; p0: P; c1: P; c2: P; p1: P };

export const HONEY_ANCHO = 150;
/** Distancia vertical entre Honey y el centro de la pieza que carga. */
export const CARGA_DY = 114;
/** Radio de una pieza mientras Honey la lleva. */
export const PIEZA_R = 56;

const sobre = (p: P): P => ({ x: p.x, y: p.y - CARGA_DY });

// --- puntos clave del guion
const w1 = anchoCelda(PRIMERA.R);
/** Donde Honey suelta la mitad derecha de la primera celda (escena 3). */
export const HONEY_UNE = { x: PRIMERA.cx + w1 / 4, y: PRIMERA.cy - PRIMERA.R + 8 };
const DESCANSO_3 = { x: 862, y: 600 };
export const DESCANSO_FINAL = { x: 905, y: 880 };

/** Piezas que Honey recoge y lleva a su celda en la escena 4 (cuadros globales). */
export const PIEZAS_HONEY = [
  { celda: 'guardabarranco', espera: { x: 975, y: 962 }, recoge: 612, suelta: 660 },
  { celda: 'ometepe', espera: { x: 100, y: 735 }, recoge: 702, suelta: 745 },
  { celda: 'sacuanjoche', espera: { x: 92, y: 992 }, recoge: 782, suelta: 822 },
] as const;

const destino = (id: string) => sobre(centroCelda(celdaPorId(id), PANAL));
const [p1, p2, p3] = PIEZAS_HONEY;

const TRAMOS: Tramo[] = [
  // Escena 3: entra por la derecha con la mitad de la celda y la une.
  { f0: 392, f1: 462, p0: { x: 1280, y: 470 }, c1: { x: 1040, y: 470 }, c2: { x: 790, y: 640 }, p1: HONEY_UNE },
  { f0: 478, f1: 528, p0: HONEY_UNE, c1: { x: 690, y: 470 }, c2: { x: 860, y: 470 }, p1: DESCANSO_3 },
  // Escena 4: tres viajes de ida y vuelta.
  { f0: 572, f1: p1.recoge, p0: DESCANSO_3, c1: { x: 950, y: 660 }, c2: { x: 990, y: 790 }, p1: sobre(p1.espera) },
  { f0: p1.recoge + 4, f1: p1.suelta, p0: sobre(p1.espera), c1: { x: 930, y: 900 }, c2: { x: 800, y: 700 }, p1: destino(p1.celda) },
  { f0: p1.suelta + 3, f1: p2.recoge, p0: destino(p1.celda), c1: { x: 640, y: 980 }, c2: { x: 180, y: 930 }, p1: sobre(p2.espera) },
  { f0: p2.recoge + 4, f1: p2.suelta, p0: sobre(p2.espera), c1: { x: 150, y: 520 }, c2: { x: 260, y: 540 }, p1: destino(p2.celda) },
  { f0: p2.suelta + 3, f1: p3.recoge, p0: destino(p2.celda), c1: { x: 330, y: 830 }, c2: { x: 120, y: 790 }, p1: sobre(p3.espera) },
  { f0: p3.recoge + 4, f1: p3.suelta, p0: sobre(p3.espera), c1: { x: 190, y: 960 }, c2: { x: 400, y: 900 }, p1: destino(p3.celda) },
  // Hacia el lugar de descanso junto al panal (escena 5).
  { f0: p3.suelta + 4, f1: 872, p0: destino(p3.celda), c1: { x: 600, y: 930 }, c2: { x: 860, y: 990 }, p1: DESCANSO_FINAL },
];

const bezier = (t: number, a: number, b: number, c: number, d: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const suave = Easing.bezier(0.42, 0, 0.25, 1);

/** Punto de la trayectoria (sin balanceo) en un cuadro cualquiera, incluso fraccionario. */
const trayectoria = (f: number): P => {
  let ultimo = TRAMOS[0].p0;
  for (const t of TRAMOS) {
    if (f < t.f0) return ultimo;
    if (f <= t.f1) {
      const k = suave((f - t.f0) / (t.f1 - t.f0));
      return {
        x: bezier(k, t.p0.x, t.c1.x, t.c2.x, t.p1.x),
        y: bezier(k, t.p0.y, t.c1.y, t.c2.y, t.p1.y),
      };
    }
    ultimo = t.p1;
  }
  return ultimo;
};

export type EstadoHoney = { x: number; y: number; rot: number; escala: number; ancho: number; visible: boolean };

export const estadoHoney = (f: number): EstadoHoney => {
  const p = trayectoria(f);
  const vx = trayectoria(f + 1).x - trayectoria(f - 1).x;
  // Balanceo vertical de ±8 px y una leve deriva horizontal cuando está quieta.
  const bob = Math.sin(f * 0.21) * 8;
  const deriva = Math.sin(f * 0.047) * 6;
  const inclinacion = Math.max(-4, Math.min(4, vx * 0.35 + Math.sin(f * 0.13 + 0.6) * 1.4));
  const respira = 1 + Math.sin(f * 0.33 + 1.1) * 0.022;
  const ancho = interpolate(f, [840, 880], [HONEY_ANCHO, 172], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  return { x: p.x + deriva, y: p.y + bob, rot: inclinacion, escala: respira, ancho, visible: f >= 390 };
};

/** Honey dibujada en su estado del cuadro actual. */
export const Honey: React.FC = () => {
  const frame = useCurrentFrame();
  const e = estadoHoney(frame);
  if (!e.visible) return null;
  const alto = (e.ancho * 800) / 689;
  // Sombra que se acerca y se aleja con el balanceo, para separarla del fondo blanco.
  const sombraY = 10 + Math.sin(frame * 0.21) * 3;
  return (
    <Img
      src={staticFile('honey.png')}
      style={{
        position: 'absolute',
        left: e.x - e.ancho / 2,
        top: e.y - alto / 2,
        width: e.ancho,
        height: alto,
        transform: `rotate(${e.rot}deg) scale(${e.escala})`,
        filter: `drop-shadow(0 ${sombraY}px 12px rgba(27,42,74,0.20))`,
      }}
    />
  );
};

/** Centro de la pieza que Honey lleva colgada en el cuadro f. */
export const piezaColgada = (f: number): P => {
  const e = estadoHoney(f);
  return { x: e.x, y: e.y + CARGA_DY };
};
