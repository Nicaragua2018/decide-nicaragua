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

// ---------------------------------------------------------------- escena 3
const w1 = anchoCelda(PRIMERA.R);
/** Honey lleva cada mitad de la primera celda colgada así (centro de la mitad respecto a Honey). */
export const MITAD_DY = PRIMERA.R - 8;
export const MITAD_DX = w1 / 4;
/** Cuadros (globales) de la escena 3: suelta la mitad izquierda, recoge la derecha y las une. */
export const S3 = {
  sueltaIzq: 440,
  recogeDer: 480,
  union: 525,
  /** Donde espera flotando la mitad derecha (centro de la celda entera). */
  esperaDer: { x: 905, y: 740 },
};
const HONEY_IZQ = { x: PRIMERA.cx - MITAD_DX, y: PRIMERA.cy - MITAD_DY };
/** Donde Honey suelta la mitad derecha y se forma la celda. */
export const HONEY_UNE = { x: PRIMERA.cx + MITAD_DX, y: PRIMERA.cy - MITAD_DY };
const HONEY_DER = { x: S3.esperaDer.x + MITAD_DX, y: S3.esperaDer.y - MITAD_DY };
const DESCANSO_3 = { x: 862, y: 600 };
export const DESCANSO_FINAL = { x: 905, y: 880 };

// ---------------------------------------------------------------- escena 4
/** Separación horizontal entre las dos piezas que Honey lleva a la vez. */
export const PAR_DX = 46;

export type Entrega = { celda: string; lado: -1 | 1; f: number };
/** Viajes de Honey en la escena 4: recoge dos piezas a la vez y entrega cada una en su celda. */
export const VIAJES: { espera: P; recoge: number; entregas: [Entrega, Entrega] }[] = [
  { espera: { x: 965, y: 900 }, recoge: 600, entregas: [{ celda: 'guardabarranco', lado: -1, f: 634 }, { celda: 'bandera', lado: 1, f: 654 }] },
  { espera: { x: 120, y: 600 }, recoge: 689, entregas: [{ celda: 'gueguense', lado: 1, f: 716 }, { celda: 'granada', lado: -1, f: 738 }] },
  { espera: { x: 112, y: 988 }, recoge: 773, entregas: [{ celda: 'miel', lado: 1, f: 795 }, { celda: 'ometepe', lado: -1, f: 815 }] },
  { espera: { x: 962, y: 988 }, recoge: 850, entregas: [{ celda: 'momotombo', lado: -1, f: 878 }, { celda: 'sacuanjoche', lado: 1, f: 898 }] },
];

/** Posición de Honey cuando deja la pieza de ese lado justo encima de su celda. */
const alEntregar = (e: Entrega): P => {
  const c = centroCelda(celdaPorId(e.celda), PANAL);
  return { x: c.x - e.lado * PAR_DX, y: c.y - CARGA_DY };
};

/** Tramo con una curva suave: los controles se apartan de la recta hacia el centro del cuadro. */
const arco = (f0: number, f1: number, p0: P, p1: P, k = 0.22): Tramo => {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const largo = Math.hypot(dx, dy) || 1;
  let nx = -dy / largo;
  let ny = dx / largo;
  // Que la curva se combe hacia abajo arriba del cuadro y hacia arriba abajo: nunca hacia el texto ni fuera.
  const medioY = (p0.y + p1.y) / 2;
  if ((medioY < 760 && ny < 0) || (medioY >= 760 && ny > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const o = largo * k;
  return {
    f0,
    f1,
    p0,
    p1,
    c1: { x: p0.x + dx * 0.3 + nx * o, y: p0.y + dy * 0.3 + ny * o },
    c2: { x: p0.x + dx * 0.7 + nx * o, y: p0.y + dy * 0.7 + ny * o },
  };
};

const tramosEscena4 = (): Tramo[] => {
  const t: Tramo[] = [];
  let desde = DESCANSO_3;
  let libre = 572;
  for (const v of VIAJES) {
    const recoger = sobre(v.espera);
    t.push(arco(libre, v.recoge, desde, recoger));
    const [a, b] = v.entregas;
    t.push(arco(v.recoge + 4, a.f, recoger, alEntregar(a), 0.18));
    t.push(arco(a.f + 4, b.f, alEntregar(a), alEntregar(b), 0.15));
    desde = alEntregar(b);
    libre = b.f + 3;
  }
  t.push(arco(libre + 1, 944, desde, DESCANSO_FINAL));
  return t;
};

const TRAMOS: Tramo[] = [
  // Escena 3: trae la mitad izquierda, va por la derecha y las une.
  { f0: 392, f1: S3.sueltaIzq, p0: { x: -200, y: 500 }, c1: { x: 80, y: 470 }, c2: { x: 320, y: 620 }, p1: HONEY_IZQ },
  { f0: S3.sueltaIzq + 4, f1: S3.recogeDer, p0: HONEY_IZQ, c1: { x: 640, y: 470 }, c2: { x: 900, y: 470 }, p1: HONEY_DER },
  { f0: S3.recogeDer + 4, f1: S3.union, p0: HONEY_DER, c1: { x: 900, y: 650 }, c2: { x: 720, y: 640 }, p1: HONEY_UNE },
  { f0: S3.union + 7, f1: 566, p0: HONEY_UNE, c1: { x: 690, y: 470 }, c2: { x: 860, y: 470 }, p1: DESCANSO_3 },
  // Escena 4: cuatro viajes, dos piezas por viaje. Después, a descansar junto al panal.
  ...tramosEscena4(),
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
  const ancho = interpolate(f, [912, 950], [HONEY_ANCHO, 172], {
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

/** Centro de una pieza que Honey lleva colgada en el cuadro f (dx: desplazamiento lateral). */
export const piezaColgada = (f: number, dx = 0, dy = CARGA_DY): P => {
  const e = estadoHoney(f);
  return { x: e.x + dx, y: e.y + dy };
};
