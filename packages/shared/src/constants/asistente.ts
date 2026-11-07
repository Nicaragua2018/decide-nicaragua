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

/** Un mensaje del panel del asistente. */
export interface MensajePanel {
  rol: 'persona' | 'asistente';
  texto: string;
}

/** Lo que devuelve el panel del asistente a una pregunta. */
export type RespuestaPanel =
  | { tipo: 'respuesta'; texto: string; enlaces: { texto: string; ruta: string }[] }
  | { tipo: 'apagado' }
  | { tipo: 'descansa' }
  | { tipo: 'limite'; maximo: number };

/** Una novedad de la tarjeta «Al día». */
export interface ItemAlDia {
  clase: 'debate' | 'votacion_abierta' | 'votacion_cierra' | 'decision' | 'informe' | 'umbral';
  titulo: string;
  comunidad: string;
  ruta: string;
  fecha: string;
}

/** La tarjeta «Al día»: lo que pasó desde la última visita. */
export interface AlDiaView {
  mostrar: boolean;
  desde: string | null;
  items: ItemAlDia[];
  resumen: string | null;
}

/** La tarjeta para hacer crecer la comunidad. */
export type CrecerView =
  | { mostrar: false }
  | {
      mostrar: true;
      comunidad: string;
      miembros: number;
      activa: boolean;
      faltan: number;
      meta: number;
      texto: string;
      mensajeInvitacion: string;
      deAsistente: boolean;
    };

/** Lo que la comunidad garantiza (texto fijo de la tarjeta «crecer» y del mensaje de invitación). */
export const GARANTIAS: readonly string[] = [
  'identidad protegida',
  'voto secreto',
  'reglas votadas por todos',
  'sin caudillos',
  'cada miembro avalado por dos personas',
];

export const FACILIDADES: readonly string[] = [
  'debates y votaciones propios',
  'grupos de trabajo',
  'comisiones',
  'apoyo mutuo en papeles, trabajo y seguridad',
];
