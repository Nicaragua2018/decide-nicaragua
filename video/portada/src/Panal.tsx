// Geometría hexagonal compartida por las escenas: celdas «de punta arriba»,
// fotos recortadas dentro de cada celda y la disposición final del panal.
import React from 'react';
import { Img, staticFile } from 'remotion';

export const ANCHO = 1080;
export const ALTO = 1080;

export const COLORES = {
  blanco: '#FFFFFF',
  azulPastel: '#CFE3F7',
  amarilloPastel: '#FCE9A8',
  platino: '#E5E4E2',
  texto: '#1B2A4A',
  textoSecundario: '#3D4A63',
  azulBandera: '#0067C6',
  miel: '#F2B00A',
} as const;

export const SQRT3 = Math.sqrt(3);
/** Separación (px de radio) entre celdas vecinas: cada celda se dibuja un poco más chica que su hueco. */
export const HUECO = 6;

/** Ancho de una celda de radio R (de punta arriba). Su alto es 2R. */
export const anchoCelda = (R: number) => SQRT3 * R;

/** Contorno de un hexágono de radio R con esquinas redondeadas (rr px),
 *  en coordenadas de una caja de anchoCelda(R) × 2R. */
export const hexPath = (R: number, rr = 14, ox = 0, oy = 0): string => {
  const cx = anchoCelda(R) / 2 + ox;
  const cy = R + oy;
  const v = Array.from({ length: 6 }, (_, i) => {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const;
  });
  const t = Math.min(0.45, rr / R);
  const mezcla = (a: readonly number[], b: readonly number[], k: number) =>
    `${(a[0] + (b[0] - a[0]) * k).toFixed(2)} ${(a[1] + (b[1] - a[1]) * k).toFixed(2)}`;
  let d = `M ${mezcla(v[0], v[1], t)}`;
  for (let i = 1; i <= 6; i++) {
    const p = v[i % 6];
    d += ` L ${mezcla(p, v[i - 1], t)} Q ${p[0].toFixed(2)} ${p[1].toFixed(2)} ${mezcla(p, v[(i + 1) % 6], t)}`;
  }
  return `${d} Z`;
};

/** Contorno de la celda ya descontada la separación, en la caja de una celda de radio R. */
export const hexInterior = (R: number) => {
  const r = Math.max(1, R - HUECO);
  return hexPath(r, 14, (anchoCelda(R) - anchoCelda(r)) / 2, R - r);
};

// ---------------------------------------------------------------- fotos

export type FotoId =
  | 'renacer'
  | 'ometepe'
  | 'guardabarranco'
  | 'gueguense'
  | 'granada'
  | 'sacuanjoche'
  | 'momotombo';

/** Tamaño natural de cada foto y el punto que debe quedar al centro de la celda. */
export const FOTOS: Record<
  FotoId,
  { archivo: string; w: number; h: number; fx: number; fy: number; zoom: number }
> = {
  renacer: { archivo: 'renacer.jpg', w: 1536, h: 1024, fx: 0.5, fy: 0.5, zoom: 1.05 },
  ometepe: { archivo: 'ometepe.jpg', w: 800, h: 369, fx: 0.46, fy: 0.5, zoom: 1.15 },
  guardabarranco: { archivo: 'guardabarranco.jpg', w: 800, h: 533, fx: 0.49, fy: 0.42, zoom: 2.2 },
  gueguense: { archivo: 'gueguense.jpg', w: 525, h: 800, fx: 0.52, fy: 0.36, zoom: 1.1 },
  granada: { archivo: 'granada.jpg', w: 800, h: 533, fx: 0.32, fy: 0.42, zoom: 1.35 },
  sacuanjoche: { archivo: 'sacuanjoche.jpg', w: 600, h: 800, fx: 0.5, fy: 0.46, zoom: 1.05 },
  momotombo: { archivo: 'momotombo.jpg', w: 792, h: 521, fx: 0.42, fy: 0.42, zoom: 1.12 },
};

/** Imagen que cubre una caja w×h centrada en el punto de interés de la foto. */
export const FotoCubre: React.FC<{
  foto: FotoId;
  w: number;
  h: number;
  style?: React.CSSProperties;
}> = ({ foto, w, h, style }) => {
  const f = FOTOS[foto];
  const s = Math.max(w / f.w, h / f.h) * f.zoom;
  const dw = f.w * s;
  const dh = f.h * s;
  const left = Math.min(0, Math.max(w - dw, w / 2 - f.fx * dw));
  const top = Math.min(0, Math.max(h - dh, h / 2 - f.fy * dh));
  return (
    <Img
      src={staticFile(f.archivo)}
      style={{ position: 'absolute', left, top, width: dw, height: dh, maxWidth: 'none', ...style }}
    />
  );
};

// ---------------------------------------------------------------- celdas

type CeldaBase = {
  cx: number;
  cy: number;
  R: number;
  escala?: number;
  rotacion?: number;
  opacidad?: number;
  /** Recorta la celda: «izquierda» o «derecha» deja solo esa mitad. */
  mitad?: 'izquierda' | 'derecha';
  sombra?: boolean;
  style?: React.CSSProperties;
};

const Caja: React.FC<CeldaBase & { children: React.ReactNode }> = ({
  cx,
  cy,
  R,
  escala = 1,
  rotacion = 0,
  opacidad = 1,
  mitad,
  sombra = true,
  style,
  children,
}) => {
  const w = anchoCelda(R);
  const h = 2 * R;
  const recorteMitad =
    mitad === 'izquierda' ? 'inset(-40px 50% -40px -40px)' : mitad === 'derecha' ? 'inset(-40px -40px -40px 50%)' : undefined;
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        opacity: opacidad,
        transform: `rotate(${rotacion}deg) scale(${escala})`,
        filter: sombra ? 'drop-shadow(0 10px 18px rgba(27,42,74,0.16))' : undefined,
        clipPath: recorteMitad,
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: `path('${hexInterior(R)}')`, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
};

export const HexFoto: React.FC<CeldaBase & { foto: FotoId; filtro?: string }> = ({ foto, filtro, ...p }) => (
  <Caja {...p}>
    <FotoCubre foto={foto} w={anchoCelda(p.R)} h={2 * p.R} style={{ filter: filtro }} />
  </Caja>
);

/** Celda con la bandera dibujada: franjas azul / blanco / azul y un pequeño triángulo. */
export const HexBandera: React.FC<CeldaBase> = (p) => {
  const w = anchoCelda(p.R);
  const h = 2 * p.R;
  const t = p.R * 0.3;
  return (
    <Caja {...p}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h / 3, background: COLORES.azulBandera }} />
      <div style={{ position: 'absolute', left: 0, top: h / 3, width: w, height: h / 3, background: COLORES.blanco }} />
      <div style={{ position: 'absolute', left: 0, top: (2 * h) / 3, width: w, height: h / 3, background: COLORES.azulBandera }} />
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
        <polygon
          points={`${w / 2},${h / 2 - t * 0.55} ${w / 2 + t * 0.5},${h / 2 + t * 0.32} ${w / 2 - t * 0.5},${h / 2 + t * 0.32}`}
          fill="none"
          stroke={COLORES.azulBandera}
          strokeWidth={Math.max(2, p.R * 0.03)}
          strokeLinejoin="round"
        />
      </svg>
    </Caja>
  );
};

/** Celda de miel: amarillo cálido con un brillo suave. */
export const HexMiel: React.FC<CeldaBase> = (p) => (
  <Caja {...p}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(circle at 38% 30%, ${COLORES.amarilloPastel} 0%, #F7CB45 45%, ${COLORES.miel} 100%)`,
      }}
    />
  </Caja>
);

/** Hueco todavía vacío del panal: celda pálida con borde punteado. */
export const HexHueco: React.FC<{ cx: number; cy: number; R: number; opacidad?: number }> = ({ cx, cy, R, opacidad = 1 }) => {
  const w = anchoCelda(R);
  const h = 2 * R;
  return (
    <svg
      width={w}
      height={h}
      style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, opacity: opacidad, overflow: 'visible' }}
    >
      <path d={hexInterior(R)} fill="#F3F8FD" stroke={COLORES.azulPastel} strokeWidth={3} strokeDasharray="10 9" />
    </svg>
  );
};

/** Borde (amarillo) que se dibuja alrededor de una celda; progreso de 0 a 1. */
export const HexBorde: React.FC<{
  cx: number;
  cy: number;
  R: number;
  color?: string;
  grosor?: number;
  progreso?: number;
  brillo?: number;
  escala?: number;
}> = ({ cx, cy, R, color = COLORES.miel, grosor = 9, progreso = 1, brillo = 0, escala = 1 }) => {
  const w = anchoCelda(R);
  const h = 2 * R;
  const largo = 6 * R + 10;
  return (
    <svg
      width={w}
      height={h}
      style={{
        position: 'absolute',
        left: cx - w / 2,
        top: cy - h / 2,
        overflow: 'visible',
        transform: `scale(${escala})`,
        filter: brillo > 0 ? `drop-shadow(0 0 ${8 + 18 * brillo}px rgba(242,176,10,${0.25 + 0.5 * brillo}))` : undefined,
      }}
    >
      <path
        d={hexInterior(R)}
        fill="none"
        stroke={color}
        strokeWidth={grosor}
        strokeLinejoin="round"
        strokeDasharray={largo}
        strokeDashoffset={largo * (1 - progreso)}
      />
    </svg>
  );
};

// ---------------------------------------------------------------- panal final

export const PANAL = { cx: 540, cy: 700, R: 120 };
/** La primera celda (escena 3) es más grande y luego se encoge a su lugar en el panal. */
export const PRIMERA = { cx: 540, cy: 700, R: 165 };

export type CeldaPanal =
  | { id: string; tipo: 'foto'; foto: FotoId; q: number; r: number }
  | { id: string; tipo: 'bandera' | 'miel'; q: number; r: number };

/** Posición de cada celda en unidades: q = anchos de celda, r = filas (1,5R). */
export const CELDAS: CeldaPanal[] = [
  { id: 'renacer', tipo: 'foto', foto: 'renacer', q: 0, r: 0 },
  { id: 'ometepe', tipo: 'foto', foto: 'ometepe', q: -1, r: 0 },
  { id: 'guardabarranco', tipo: 'foto', foto: 'guardabarranco', q: 1, r: 0 },
  { id: 'gueguense', tipo: 'foto', foto: 'gueguense', q: -0.5, r: -1 },
  { id: 'granada', tipo: 'foto', foto: 'granada', q: 0.5, r: -1 },
  { id: 'sacuanjoche', tipo: 'foto', foto: 'sacuanjoche', q: -0.5, r: 1 },
  { id: 'momotombo', tipo: 'foto', foto: 'momotombo', q: 0.5, r: 1 },
  { id: 'bandera', tipo: 'bandera', q: 1.5, r: -1 },
  { id: 'miel', tipo: 'miel', q: -1.5, r: 1 },
];

export const centroCelda = (c: { q: number; r: number }, p = PANAL) => ({
  x: p.cx + c.q * anchoCelda(p.R),
  y: p.cy + c.r * 1.5 * p.R,
});

export const celdaPorId = (id: string) => {
  const c = CELDAS.find((x) => x.id === id);
  if (!c) throw new Error(`Celda desconocida: ${id}`);
  return c;
};

/** Dibuja una celda del panal (foto, bandera o miel) en una posición dada. */
export const CeldaDibujo: React.FC<{ celda: CeldaPanal } & CeldaBase> = ({ celda, ...p }) => {
  if (celda.tipo === 'foto') return <HexFoto foto={celda.foto} {...p} />;
  if (celda.tipo === 'bandera') return <HexBandera {...p} />;
  return <HexMiel {...p} />;
};
