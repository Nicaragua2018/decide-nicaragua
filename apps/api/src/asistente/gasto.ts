/**
 * Precios en dólares por millón de tokens, copiados de la tabla de modelos de
 * la skill `claude-api` (shared/models.md, 2026-11-06):
 * - Claude Haiku 5.5: «$0.10 / $0.50 per MTok when the prompt is 100K tokens or
 *   fewer and $0.50 / $2.50 above that».
 * - Claude Sonnet 5.5: «$2 / $10 per MTok».
 *
 * Un dólar por millón de tokens = una millonésima de dólar por token, así que
 * tokens × precio da directamente millonésimas de dólar.
 */
interface Precio {
  entrada: number;
  salida: number;
  /** Por encima de estos tokens de entrada se cobra el precio largo. */
  umbralEntrada?: number;
  entradaLargo?: number;
  salidaLargo?: number;
}

export const PRECIOS_POR_MILLON: Readonly<Record<string, Precio>> = {
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, umbralEntrada: 100_000, entradaLargo: 0.5, salidaLargo: 2.5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
};

/** Para un modelo sin precio conocido se cobra el más caro: nunca se subestima. */
const PRECIO_DESCONOCIDO: Precio = { entrada: 2, salida: 10 };

export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Costo de una llamada en millonésimas de dólar, redondeado hacia arriba. */
export function costoMicrodolares(modelo: string, uso: UsoTokens): bigint {
  const p = PRECIOS_POR_MILLON[modelo] ?? PRECIO_DESCONOCIDO;
  // Los tokens de caché se cobran como entrada normal (cota superior).
  const entrada = uso.input_tokens + (uso.cache_creation_input_tokens ?? 0) + (uso.cache_read_input_tokens ?? 0);
  const largo = p.umbralEntrada !== undefined && entrada > p.umbralEntrada;
  const precioEntrada = largo ? (p.entradaLargo ?? p.entrada) : p.entrada;
  const precioSalida = largo ? (p.salidaLargo ?? p.salida) : p.salida;
  const micro = entrada * precioEntrada + uso.output_tokens * precioSalida;
  // El épsilon evita que un error de coma flotante (0,30000000000000004) sume una unidad.
  return BigInt(Math.max(0, Math.ceil(micro - 1e-9)));
}

/** Mes UTC en formato «AAAA-MM». */
export function mesUtc(fecha: Date = new Date()): string {
  return fecha.toISOString().slice(0, 7);
}

/** Tope mensual en millonésimas de dólar. */
export function topeMicrodolares(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}
