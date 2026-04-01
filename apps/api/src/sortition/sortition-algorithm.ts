/**
 * Algoritmo de selección aleatoria verificable.
 *
 * Propiedades:
 *  - Determinista: misma seed + mismo pool → mismo resultado.
 *  - Verificable: cualquiera puede reproducir el resultado publicando la seed.
 *  - Auditable: el algoritmo está documentado y la versión identificada.
 *
 * Método: Fisher-Yates parcial usando SHA-256 como función pseudoaleatoria.
 *   Para cada posición i (0-indexed):
 *     hash = SHA-256(seed || ":" || i)   [hex string de 64 chars]
 *     j    = Number(BigInt("0x" + hash) mod BigInt(n - i)) + i
 *     swap(pool[i], pool[j])
 *   Los primeros `selectionSize` elementos del resultado son los seleccionados.
 *
 * Limitación MVP: la seed se genera con crypto.randomBytes en el servidor.
 * Para mayor seguridad (múltiples partes, VRF) ver docs/DECISIONS.md ADR-011.
 */

import { createHash, randomBytes } from 'crypto';

export const ALGORITHM_VERSION = 'fisher-yates-sha256-v1' as const;

/** Genera una seed aleatoria de 32 bytes en formato hex (64 caracteres). */
export function generateSeed(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Ordena el pool canónicamente antes de aplicar el algoritmo.
 * El orden lexicográfico ascendente por profileId es el orden canónico.
 * Esta función NO modifica el array original.
 */
export function sortPool(profileIds: string[]): string[] {
  return [...profileIds].sort();
}

/**
 * Selecciona `selectionSize` miembros del pool usando Fisher-Yates con SHA-256.
 *
 * @param pool          Pool ya ordenado canónicamente (usar sortPool primero).
 * @param selectionSize Número de miembros a seleccionar.
 * @param seed          Seed en hex (generada con generateSeed o externamente).
 * @returns             IDs seleccionados en orden de selección (posición 1 = índice 0).
 */
export function selectMembers(pool: string[], selectionSize: number, seed: string): string[] {
  if (pool.length === 0 || selectionSize <= 0) return [];

  const arr = [...pool];
  const n = arr.length;
  const size = Math.min(selectionSize, n);

  for (let i = 0; i < size; i++) {
    const hash = createHash('sha256').update(`${seed}:${i}`).digest('hex');
    const bigHash = BigInt(`0x${hash}`);
    const range = BigInt(n - i);
    const j = Number(bigHash % range) + i;

    // Swap arr[i] y arr[j]
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }

  return arr.slice(0, size);
}

/**
 * Verifica un sorteo recomputando el resultado con los datos almacenados.
 *
 * @param poolSnapshot  Snapshot del pool (debe estar ya ordenado — como se almacenó).
 * @param selectionSize Tamaño de la selección.
 * @param seed          Seed almacenada.
 * @param storedIds     IDs seleccionados almacenados (en orden de selección).
 * @returns true si el resultado recomputado coincide con el almacenado.
 */
export function verifySelection(
  poolSnapshot: string[],
  selectionSize: number,
  seed: string,
  storedIds: string[],
): boolean {
  const recomputed = selectMembers(poolSnapshot, selectionSize, seed);
  if (recomputed.length !== storedIds.length) return false;
  return recomputed.every((id, i) => id === storedIds[i]);
}
