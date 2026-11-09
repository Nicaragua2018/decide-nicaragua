import type { ReactNode } from 'react';

// Celda hexagonal decorativa con un dibujo sencillo dentro (trazos de 24×24).
// Es solo adorno: el texto de al lado dice lo mismo, así que va oculta a lectores de pantalla.

export type ColorCelda = 'azul' | 'amarillo' | 'platino';

const RELLENO: Record<ColorCelda, string> = {
  azul: '#CFE3F7',
  amarillo: '#FCE9A8',
  platino: '#E5E4E2',
};

export function Hexagono({
  color,
  tamano = 64,
  className,
  children,
}: {
  color: ColorCelda;
  tamano?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      width={tamano}
      height={Math.round((tamano * 72) / 64)}
      viewBox="0 0 64 72"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M32 3 60 19v34L32 69 4 53V19z"
        fill={RELLENO[color]}
        stroke="#0067C6"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <g
        transform="translate(20 24)"
        fill="none"
        stroke="#1B2A4A"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

// Dibujos (24×24) para las celdas.
export const DIBUJOS = {
  inquietud: (
    <>
      <path d="M4 4h16v12H10l-6 4z" />
      <path d="M12 7.5v4" />
      <path d="M12 14v.01" />
    </>
  ),
  debate: (
    <>
      <path d="M2 4h12v8H6l-4 3z" />
      <path d="M17 8h5v11l-4-3h-7v-1.5" />
    </>
  ),
  voto: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M8 12.5l3 3 5-6.5" />
    </>
  ),
  comision: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16.5" cy="8" r="3" />
      <path d="M2 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M14.5 14.8c.6-.2 1.3-.3 2-.3 3.3 0 5.5 2.2 5.5 5.5" />
    </>
  ),
  resultado: (
    <>
      <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  aval: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21c0-4 3-6.5 7-6.5 1.4 0 2.7.3 3.7.8" />
      <path d="M15 18l2.2 2.2L22 15.5" />
    </>
  ),
  secreto: (
    <>
      <path d="M5 11h14v10H5z" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      <path d="M12 15v2" />
    </>
  ),
  codigo: (
    <>
      <path d="M8 7l-5 5 5 5" />
      <path d="M16 7l5 5-5 5" />
      <path d="M13.5 4l-3 16" />
    </>
  ),
  asistente: (
    <>
      <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />
      <path d="M19 17v4M17 19h4" />
    </>
  ),
} as const;
