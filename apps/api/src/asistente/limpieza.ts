/** Correos electrónicos. */
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Números de teléfono: 7 o más dígitos, con un espacio o guion opcional entre
 * ellos y un «+» opcional delante. Los puntos no cuentan como separador, así
 * «35.000» sigue igual; un año («2018») tiene solo 4 dígitos. Los rangos de
 * años («2007-2026») y las fechas ISO («2026-11-06») tampoco se tocan.
 */
const TELEFONO = /(?<![\w+])\+?\d(?:[ \t-]?\d){6,}(?!\w)/g;

/** Un rango de años («2007-2026»): dos años entre 1900 y 2099, el segundo mayor. */
const RANGO_DE_ANOS = /^((?:19|20)\d{2})-((?:19|20)\d{2})$/;
/** Una fecha ISO («2026-11-06»). */
const FECHA_ISO = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function pareceTelefono(s: string): boolean {
  if (FECHA_ISO.test(s)) return false;
  const rango = RANGO_DE_ANOS.exec(s);
  if (rango && Number(rango[2]) > Number(rango[1])) return false;
  return true;
}

/**
 * Quita datos de contacto antes de enviar texto al servicio de IA.
 * Se aplica a todo envío.
 */
export function limpiarTexto(texto: string): string {
  return texto.replace(CORREO, '[correo]').replace(TELEFONO, (m) => (pareceTelefono(m) ? '[teléfono]' : m));
}
