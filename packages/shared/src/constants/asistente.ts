import type { ModeracionCausaValue } from './moderacion.js';

/** Qué clase de texto revisa el asistente. */
export type TipoTexto =
  | 'inquietud'
  | 'respuesta_inquietud'
  | 'frase'
  | 'solucion'
  | 'tema'
  | 'comentario'
  | 'informe'
  | 'motivo_regla'
  | 'subgrupo';

/** 0 = sin problema, 1 = aviso al autor, 2 = no se publica sin la mesa. */
export type NivelRevision = 0 | 1 | 2;

export interface RevisionTexto {
  nivel: NivelRevision;
  causa?: ModeracionCausaValue;
  explicacion?: string;
  sugerencia?: string;
  /** false = el asistente no respondió. */
  revisado: boolean;
}

/** Causas por las que un texto no se publica sin la revisión de la mesa. */
export const CAUSAS_NIVEL_2: readonly ModeracionCausaValue[] = [
  'odio',
  'insultos_amenazas',
  'datos_personales',
  'ilegal_violencia',
];

export type EstadoTextoEnRevision = 'pendiente' | 'publicado' | 'rechazado' | 'vencido' | 'no_publicable';

export interface TextoEnRevisionView {
  id: string;
  tipo: TipoTexto;
  texto: string;
  causa: ModeracionCausaValue;
  estado: EstadoTextoEnRevision;
  creadoAt: string;
  venceAt: string;
  aprobaciones: number;
  rechazos: number;
  yaFirme: boolean;
  motivo: string | null;
}

/** Todos los tipos de texto que revisa el asistente (para validar la entrada). */
export const TIPOS_TEXTO: readonly TipoTexto[] = [
  'inquietud',
  'respuesta_inquietud',
  'frase',
  'solucion',
  'tema',
  'comentario',
  'informe',
  'motivo_regla',
  'subgrupo',
];

/**
 * Cómo se une un texto de varias partes (título y cuerpo, nombre y propósito)
 * para revisarlo. La web y la API usan la misma forma, así la revisión previa
 * de la web y la del servidor dan el mismo texto (y la misma caché).
 */
export function textoParaRevisar(...partes: string[]): string {
  return partes
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join('\n\n');
}
