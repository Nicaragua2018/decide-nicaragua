const ANGULOS = [0, 72, 144, 216, 288];

const PETALO_LOGO = 'M0 0C-3.2-2.2-5-6.4-3.6-9.8C-2.6-12.6 1.2-13.2 3-10.8C5-8 3.4-3.2 0 0Z';
const PETALO_ICONO = 'M0 0C-2.6-1.7-4-5-2.9-7.8C-2.1-10 .9-10.5 2.3-8.6C3.9-6.4 2.6-2.5 0 0Z';

interface Props {
  variante: 'logo' | 'icono' | 'contorno';
  tamano?: number;
  color?: string;
  centro?: string;
  className?: string;
}

export function Sacuanjoche({ variante, tamano, color, centro = '#f2b00a', className }: Props) {
  if (variante === 'logo') {
    const t = tamano ?? 34;
    return (
      <svg viewBox="0 0 34 34" width={t} height={t} className={className} aria-hidden="true">
        <rect width="34" height="34" rx="10" fill="#0a3880" />
        <g transform="translate(17 17)">
          {ANGULOS.map((a) => (
            <path key={a} d={PETALO_LOGO} fill="#ffffff" transform={`rotate(${a})`} />
          ))}
          <circle r="3.2" fill="#f2b00a" />
        </g>
      </svg>
    );
  }

  const t = tamano ?? 24;
  const contorno = variante === 'contorno';
  // «contorno» es gris por defecto; con color="currentColor" sigue al texto (p. ej. pestaña activa).
  const tinta = color ?? (contorno ? '#94a3b8' : '#0a3880');
  return (
    <svg viewBox="0 0 24 24" width={t} height={t} className={className} aria-hidden="true">
      <g transform="translate(12 12)">
        {ANGULOS.map((a) => (
          <path
            key={a}
            d={PETALO_ICONO}
            transform={`rotate(${a})`}
            {...(contorno
              ? { fill: 'none', stroke: tinta, strokeWidth: 1.8, strokeLinejoin: 'round' as const }
              : { fill: tinta })}
          />
        ))}
        <circle r={contorno ? 1.6 : 2.2} fill={contorno ? tinta : centro} />
      </g>
    </svg>
  );
}
