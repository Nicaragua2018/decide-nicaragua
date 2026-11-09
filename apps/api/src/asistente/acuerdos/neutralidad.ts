/**
 * Filtro fijo de neutralidad para las salidas de acuerdos (agrupar, presentación, mapa y borradores).
 * Las instrucciones ya piden no tomar partido, pero el modelo no responde siempre igual: si una
 * salida trae alguna de estas frases, se descarta (y la puerta única la pide una vez más).
 */
const FRASES_DE_PARTIDO = [
  'tiene razon',
  'tienen razon',
  'esta en lo cierto',
  'estan en lo cierto',
  'tiene la verdad',
  'tienen la verdad',
  'la verdad es',
  'el gobierno debe',
  'la oposicion debe',
  'es culpable',
  'son culpables',
  'tienen la culpa',
  'tiene la culpa',
  'la oposicion miente',
  'el gobierno miente',
];

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function textos(x: unknown, salida: string[] = []): string[] {
  if (typeof x === 'string') salida.push(x);
  else if (Array.isArray(x)) for (const v of x) textos(v, salida);
  else if (typeof x === 'object' && x !== null) for (const v of Object.values(x)) textos(v, salida);
  return salida;
}

/** true si ningún texto de la salida contiene una frase de tomar partido. */
export function sinTomaDePartido(salida: unknown): boolean {
  const texto = normalizar(textos(salida).join('\n'));
  return !FRASES_DE_PARTIDO.some((f) => texto.includes(f));
}
