/**
 * Hexágono de la colmena con iniciales (o un número, o ✓). Sin fotos: todas las personas se ven igual.
 * Es decorativo: el nombre siempre va escrito al lado.
 */
export type HexVariante = 'oro' | 'azul' | 'claro' | 'punteado';

const RELLENO: Record<HexVariante, string> = {
  oro: '#F2B00A',
  azul: '#2E5A99',
  claro: '#FCE7B2',
  punteado: '#FFFDF7',
};

const TEXTO: Record<HexVariante, string> = {
  oro: '#1B2A4A',
  azul: '#FFFFFF',
  claro: '#1B2A4A',
  punteado: '#1B2A4A',
};

export function Hexagono({
  texto,
  variante = 'claro',
  tamano = 48,
}: {
  texto: string;
  variante?: HexVariante;
  tamano?: number;
}) {
  // Hexágono con punta arriba en un cuadro de 100 × 100.
  const puntos = '50,3 93,27 93,73 50,97 7,73 7,27';
  const largo = texto.length;
  const fuente = largo <= 1 ? 42 : largo === 2 ? 34 : 26;
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className="el-hex"
    >
      <polygon
        points={puntos}
        fill={RELLENO[variante]}
        stroke="#1B2A4A"
        strokeWidth={variante === 'punteado' ? 3 : 4}
        strokeDasharray={variante === 'punteado' ? '8 6' : undefined}
        strokeLinejoin="round"
      />
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fuente}
        fontWeight={700}
        fill={TEXTO[variante]}
        fontFamily="inherit"
      >
        {texto}
      </text>
    </svg>
  );
}
