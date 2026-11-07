/** Solo rutas internas del sitio: una ruta que venga de la IA no puede llevar a otro dominio. */
export function esRutaInterna(r: unknown): r is string {
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/\\');
}
