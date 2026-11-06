/** Correos electrónicos. */
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Números de teléfono: 7 o más dígitos, con un espacio o guion opcional entre
 * ellos y un «+» opcional delante. Los puntos no cuentan como separador, así
 * «35.000» sigue igual; un año («2018») tiene solo 4 dígitos.
 */
const TELEFONO = /(?<![\w+])\+?\d(?:[ \t-]?\d){6,}(?!\w)/g;

/**
 * Quita datos de contacto antes de enviar texto al servicio de IA.
 * Se aplica a todo envío.
 */
export function limpiarTexto(texto: string): string {
  return texto.replace(CORREO, '[correo]').replace(TELEFONO, '[teléfono]');
}
