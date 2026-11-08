/**
 * Texto de miembros dentro del material: saltos de línea, tabuladores y espacios repetidos pasan a
 * un solo espacio. Así nadie puede escribir una línea que imite el formato del servidor
 * («[f9] … puente», «Grupo A: unas 50 personas»).
 */
export function enUnaLinea(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}
