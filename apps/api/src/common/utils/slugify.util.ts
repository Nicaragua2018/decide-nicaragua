/**
 * Convierte texto a slug URL-friendly.
 *
 * Ejemplos:
 *   "Nueva Segovia" → "nueva-segovia"
 *   "Río San Juan"  → "rio-san-juan"
 *   "RACCN"         → "raccn"
 *   "CR" (país)     → usado como "country-cr" en GroupsService
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                        // descompone caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '')         // elimina diacríticos (á→a, ñ→n, etc.)
    .replace(/\s+/g, '-')                    // espacios → guiones
    .replace(/[^a-z0-9-]/g, '')             // elimina cualquier otro carácter
    .replace(/-+/g, '-')                     // colapsa guiones múltiples
    .replace(/^-|-$/g, '');                  // elimina guiones al inicio/fin
}
