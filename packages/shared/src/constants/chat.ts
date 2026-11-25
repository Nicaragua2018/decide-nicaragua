/** Chat por comunidad: tipos y límites compartidos entre API y web. */

export const CHAT_MAX = 1000;
export const CHAT_PAGINA = 50;
export const CHAT_INTERVALO_MS = 10_000;

export type ChatTipoValue = 'miembro' | 'pregunta_guardian' | 'guardian' | 'sistema';

export type ChatMensajeVista = {
  id: string;
  tipo: ChatTipoValue;
  /** Nombre público; null en los mensajes de Guardián y del sistema. */
  autor: string | null;
  iniciales: string | null;
  /** null si fue eliminado u ocultado. */
  texto: string | null;
  estado: 'visible' | 'eliminado' | 'oculto';
  /** Solo en los mensajes de Guardián: páginas de la plataforma, ya resueltas por el servidor. */
  enlaces: { texto: string; ruta: string }[];
  respondeA: string | null;
  esMio: boolean;
  /** Cuántas personas avisaron de este mensaje; solo para quien puede moderar. */
  avisos: number | null;
  createdAt: string;
};

export type ChatPagina = {
  mensajes: ChatMensajeVista[];
  hayAnteriores: boolean;
  puedoModerar: boolean;
  esperandoGuardian: boolean;
};

export type ChatNovedades = { groupId: string; nuevos: boolean }[];

/**
 * true si el texto empieza llamando a Guardián: «@Guardián», «@guardian», con o sin tilde y sin
 * distinguir mayúsculas. Una mención en medio del texto no cuenta.
 */
export function llamaAGuardian(texto: string): boolean {
  return /^\s*@guardi[aá]n(?![\p{L}\p{N}_])/iu.test(texto);
}

const FIN_SUELTO = /[.,;:!?)]+$/;

/** Parte un texto en trozos de texto y enlaces http(s). Ningún otro esquema sale como enlace. */
export function partirEnlaces(texto: string): { tipo: 'texto' | 'enlace'; valor: string }[] {
  const partes: { tipo: 'texto' | 'enlace'; valor: string }[] = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let desde = 0;
  for (let m = re.exec(texto); m !== null; m = re.exec(texto)) {
    const enlace = m[0].replace(FIN_SUELTO, '');
    if (enlace.length <= 'https://'.length) continue;
    if (m.index > desde) partes.push({ tipo: 'texto', valor: texto.slice(desde, m.index) });
    partes.push({ tipo: 'enlace', valor: enlace });
    desde = m.index + enlace.length;
    re.lastIndex = desde;
  }
  if (desde < texto.length) partes.push({ tipo: 'texto', valor: texto.slice(desde) });
  return partes;
}
