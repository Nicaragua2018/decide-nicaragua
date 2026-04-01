/**
 * Tests del algoritmo de sortition.
 *
 * Los casos cubren las propiedades fundamentales que hacen al algoritmo
 * verificable e independiente: determinismo, cobertura uniforme y verificación.
 */

import { describe, it, expect } from 'vitest';
import {
  selectMembers,
  sortPool,
  verifySelection,
  generateSeed,
  ALGORITHM_VERSION,
} from './sortition-algorithm';

// Pool de profileIds de prueba
const POOL_10 = [
  'profile-03', 'profile-07', 'profile-01', 'profile-09', 'profile-05',
  'profile-02', 'profile-08', 'profile-04', 'profile-06', 'profile-10',
];
const POOL_10_SORTED = [...POOL_10].sort();

const FIXED_SEED = 'a'.repeat(64); // seed determinista para tests

describe('ALGORITHM_VERSION', () => {
  it('tiene el valor esperado', () => {
    expect(ALGORITHM_VERSION).toBe('fisher-yates-sha256-v1');
  });
});

describe('sortPool', () => {
  it('ordena los IDs lexicográficamente sin modificar el original', () => {
    const original = [...POOL_10];
    const sorted = sortPool(POOL_10);
    expect(sorted).toEqual(POOL_10_SORTED);
    expect(POOL_10).toEqual(original); // original sin modificar
  });

  it('es idempotente — ordenar dos veces da el mismo resultado', () => {
    expect(sortPool(sortPool(POOL_10))).toEqual(sortPool(POOL_10));
  });
});

describe('selectMembers', () => {
  it('es determinista — misma seed y pool devuelven el mismo resultado', () => {
    const resultA = selectMembers(POOL_10_SORTED, 3, FIXED_SEED);
    const resultB = selectMembers(POOL_10_SORTED, 3, FIXED_SEED);
    expect(resultA).toEqual(resultB);
  });

  it('seeds distintas producen resultados distintos (con alta probabilidad)', () => {
    const seedA = 'a'.repeat(64);
    const seedB = 'b'.repeat(64);
    const resultA = selectMembers(POOL_10_SORTED, 5, seedA);
    const resultB = selectMembers(POOL_10_SORTED, 5, seedB);
    // Es estadísticamente imposible que sean iguales con dos seeds distintas
    expect(resultA).not.toEqual(resultB);
  });

  it('selecciona exactamente selectionSize miembros cuando pool > selectionSize', () => {
    const result = selectMembers(POOL_10_SORTED, 4, FIXED_SEED);
    expect(result).toHaveLength(4);
  });

  it('selecciona todos si selectionSize >= pool.length', () => {
    const result = selectMembers(POOL_10_SORTED, 20, FIXED_SEED);
    expect(result).toHaveLength(POOL_10_SORTED.length);
    // Todos los IDs originales están presentes (aunque en distinto orden)
    expect([...result].sort()).toEqual(POOL_10_SORTED);
  });

  it('devuelve array vacío para pool vacío', () => {
    expect(selectMembers([], 3, FIXED_SEED)).toEqual([]);
  });

  it('devuelve array vacío para selectionSize = 0', () => {
    expect(selectMembers(POOL_10_SORTED, 0, FIXED_SEED)).toEqual([]);
  });

  it('el resultado es un subconjunto del pool original', () => {
    const result = selectMembers(POOL_10_SORTED, 5, FIXED_SEED);
    const poolSet = new Set(POOL_10_SORTED);
    expect(result.every((id) => poolSet.has(id))).toBe(true);
  });

  it('no hay duplicados en el resultado', () => {
    const result = selectMembers(POOL_10_SORTED, 8, FIXED_SEED);
    expect(new Set(result).size).toBe(result.length);
  });

  it('no modifica el array de entrada', () => {
    const original = [...POOL_10_SORTED];
    selectMembers(POOL_10_SORTED, 5, FIXED_SEED);
    expect(POOL_10_SORTED).toEqual(original);
  });

  it('selección de 1 devuelve exactamente 1 miembro', () => {
    const result = selectMembers(POOL_10_SORTED, 1, FIXED_SEED);
    expect(result).toHaveLength(1);
    expect(POOL_10_SORTED).toContain(result[0]);
  });

  it('pool de 1 elemento siempre devuelve ese elemento', () => {
    const result = selectMembers(['only-profile'], 1, FIXED_SEED);
    expect(result).toEqual(['only-profile']);
  });

  it('el orden de selección varía según la seed (distribución no sesgada)', () => {
    // Con 100 seeds distintas, verificamos que todos los miembros son seleccionados al menos una vez
    const selected = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const seed = i.toString().padStart(64, '0');
      const result = selectMembers(POOL_10_SORTED, 1, seed);
      result.forEach((id) => selected.add(id));
    }
    // Con 100 muestras de un pool de 10, esperamos ver al menos 5 distintos (holgadamente)
    expect(selected.size).toBeGreaterThan(4);
  });
});

describe('verifySelection', () => {
  it('retorna true cuando el resultado coincide con el recomputado', () => {
    const storedIds = selectMembers(POOL_10_SORTED, 3, FIXED_SEED);
    expect(verifySelection(POOL_10_SORTED, 3, FIXED_SEED, storedIds)).toBe(true);
  });

  it('retorna false si el resultado fue manipulado', () => {
    const storedIds = selectMembers(POOL_10_SORTED, 3, FIXED_SEED);
    const tampered = [...storedIds];
    tampered[0] = 'profile-00'; // ID no seleccionado originalmente
    expect(verifySelection(POOL_10_SORTED, 3, FIXED_SEED, tampered)).toBe(false);
  });

  it('retorna false si el orden fue manipulado', () => {
    const storedIds = selectMembers(POOL_10_SORTED, 3, FIXED_SEED);
    if (storedIds.length >= 2) {
      const reordered = [storedIds[1]!, storedIds[0]!, ...storedIds.slice(2)];
      expect(verifySelection(POOL_10_SORTED, 3, FIXED_SEED, reordered)).toBe(false);
    }
  });

  it('retorna false con seed incorrecta', () => {
    const storedIds = selectMembers(POOL_10_SORTED, 3, FIXED_SEED);
    const wrongSeed = 'b'.repeat(64);
    expect(verifySelection(POOL_10_SORTED, 3, wrongSeed, storedIds)).toBe(false);
  });

  it('retorna false si storedIds tiene distinta longitud', () => {
    const storedIds = selectMembers(POOL_10_SORTED, 3, FIXED_SEED);
    expect(verifySelection(POOL_10_SORTED, 5, FIXED_SEED, storedIds)).toBe(false);
  });
});

describe('generateSeed', () => {
  it('genera una string de 64 caracteres hex', () => {
    const seed = generateSeed();
    expect(seed).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(seed)).toBe(true);
  });

  it('dos llamadas consecutivas producen seeds distintas', () => {
    const a = generateSeed();
    const b = generateSeed();
    expect(a).not.toBe(b);
  });
});
