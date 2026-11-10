/**
 * Regla del examen decidida por Carlos (2026-11-10): un caso que falla se repite dos veces más y
 * aprueba si acierta al menos 2 de 3. Un caso que pasa a la primera no se repite. Un problema real
 * (que falla siempre) sigue reprobando; un fallo suelto por azar no.
 *
 * `intentar` corre el caso una vez y devuelve null si aprobó o el motivo del fallo.
 */
export async function dosDeTres(
  intentar: () => Promise<string | null>,
): Promise<{ fallo: string | null; aciertos: number; intentos: number }> {
  const primero = await intentar();
  if (primero === null) return { fallo: null, aciertos: 1, intentos: 1 };
  let aciertos = 0;
  let intentos = 1;
  for (let i = 0; i < 2; i++) {
    intentos++;
    if ((await intentar()) === null) aciertos++;
    else if (i === 0) break; // ya falló 2 de 2: no puede llegar a 2 aciertos
  }
  return { fallo: aciertos >= 2 ? null : primero, aciertos, intentos };
}
