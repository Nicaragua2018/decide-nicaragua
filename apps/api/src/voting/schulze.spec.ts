/**
 * Tests del algoritmo puro de Schulze.
 *
 * Los casos de prueba usan ejemplos con resultados conocidos que pueden
 * verificarse manualmente para garantizar la correctitud del algoritmo.
 */

import { describe, it, expect } from 'vitest';
import { buildPairwiseMatrix, computeStrongestPaths, findWinnerIndices, runSchulze } from './schulze';
import type { BallotInput } from './schulze';

// ─── Caso 1: Paradoja de Condorcet → Schulze resuelve con ganador único ───────
//
// 21 votantes, 3 candidatos: A, B, C
//   9 votan: A > B > C
//   7 votan: B > C > A
//   5 votan: C > A > B
//
// Preferencias pairwise:
//   A vs B: 9+5=14 prefieren A, 7 prefieren B         → A>B (14 > 7)
//   A vs C: 9 prefieren A, 7+5=12 prefieren C          → C>A (12 > 9)
//   B vs C: 9+7=16 prefieren B, 5 prefieren C          → B>C (16 > 5)
//
// Ciclo: A>B, B>C, C>A (Condorcet paradox).
// Schulze resuelve: A gana vía rutas más fuertes.
//   Ruta A→C más fuerte: max(d[A][C]=9, vía B: min(14,16)=14) = 14
//   Ruta C→A más fuerte: max(d[C][A]=12, vía B: min(5,7)=5) = 12
//   Por tanto A>C en Schulze (14 > 12)

function makeCondorcetBallots(): BallotInput[] {
  return [
    ...Array.from({ length: 9 }, () => [
      { candidateId: 'c-a', rank: 1 },
      { candidateId: 'c-b', rank: 2 },
      { candidateId: 'c-c', rank: 3 },
    ]),
    ...Array.from({ length: 7 }, () => [
      { candidateId: 'c-b', rank: 1 },
      { candidateId: 'c-c', rank: 2 },
      { candidateId: 'c-a', rank: 3 },
    ]),
    ...Array.from({ length: 5 }, () => [
      { candidateId: 'c-c', rank: 1 },
      { candidateId: 'c-a', rank: 2 },
      { candidateId: 'c-b', rank: 3 },
    ]),
  ];
}

const CANDIDATES_ABC = ['c-a', 'c-b', 'c-c'];

describe('buildPairwiseMatrix', () => {
  it('construye la matriz pairwise correctamente (ejemplo Condorcet)', () => {
    const d = buildPairwiseMatrix(makeCondorcetBallots(), CANDIDATES_ABC);

    // A (idx 0) vs B (idx 1): 14 prefieren A, 7 prefieren B
    expect(d[0]![1]).toBe(14);
    expect(d[1]![0]).toBe(7);

    // A (idx 0) vs C (idx 2): 9 prefieren A, 12 prefieren C
    expect(d[0]![2]).toBe(9);
    expect(d[2]![0]).toBe(12);

    // B (idx 1) vs C (idx 2): 16 prefieren B, 5 prefieren C
    expect(d[1]![2]).toBe(16);
    expect(d[2]![1]).toBe(5);
  });

  it('diagonal siempre es 0', () => {
    const d = buildPairwiseMatrix(makeCondorcetBallots(), CANDIDATES_ABC);
    expect(d[0]![0]).toBe(0);
    expect(d[1]![1]).toBe(0);
    expect(d[2]![2]).toBe(0);
  });

  it('candidatos no rankeados se tratan como empate en último lugar', () => {
    // 1 voto: A(1) — B y C no rankeados → A bate a B y C
    const d = buildPairwiseMatrix([[{ candidateId: 'c-a', rank: 1 }]], CANDIDATES_ABC);
    expect(d[0]![1]).toBe(1); // A > B
    expect(d[0]![2]).toBe(1); // A > C
    expect(d[1]![2]).toBe(0); // B vs C: empate (ambos Infinity), nadie gana
    expect(d[2]![1]).toBe(0);
  });

  it('devuelve matriz de ceros con 0 papeletas', () => {
    const d = buildPairwiseMatrix([], CANDIDATES_ABC);
    expect(d.every((row) => row.every((v) => v === 0))).toBe(true);
  });
});

describe('computeStrongestPaths', () => {
  it('resuelve la paradoja de Condorcet con Floyd-Warshall', () => {
    const d = buildPairwiseMatrix(makeCondorcetBallots(), CANDIDATES_ABC);
    const p = computeStrongestPaths(d, 3);

    // A→B: ruta directa 14; A→C: vía B = min(14,16)=14 > directo 9 → p[A][C]=14
    expect(p[0]![2]).toBe(14); // A→C = 14
    expect(p[2]![0]).toBe(12); // C→A = 12

    // A gana a B y a C en rutas más fuertes
    expect(p[0]![1]).toBeGreaterThan(p[1]![0]!); // A > B
    expect(p[0]![2]).toBeGreaterThan(p[2]![0]!); // A > C
    expect(p[1]![2]).toBeGreaterThan(p[2]![1]!); // B > C
  });
});

describe('findWinnerIndices', () => {
  it('devuelve índice 0 (A) como único ganador en el ejemplo Condorcet', () => {
    const d = buildPairwiseMatrix(makeCondorcetBallots(), CANDIDATES_ABC);
    const p = computeStrongestPaths(d, 3);
    const winners = findWinnerIndices(p, 3);

    expect(winners).toEqual([0]);
  });

  it('devuelve ambos índices en empate exacto', () => {
    // Empate: 1 voto A>B y 1 voto B>A → d[0][1]=1, d[1][0]=1 → paths iguales
    const d = [
      [0, 1],
      [1, 0],
    ];
    const p = computeStrongestPaths(d, 2);
    const winners = findWinnerIndices(p, 2);

    expect(winners).toEqual([0, 1]);
  });

  it('todos ganan con 0 papeletas (matriz de ceros)', () => {
    const d = buildPairwiseMatrix([], CANDIDATES_ABC);
    const p = computeStrongestPaths(d, 3);
    const winners = findWinnerIndices(p, 3);

    expect(winners).toHaveLength(3);
  });
});

describe('runSchulze', () => {
  it('devuelve A como ganador en ejemplo Condorcet', () => {
    const result = runSchulze(makeCondorcetBallots(), CANDIDATES_ABC);

    expect(result.winnerIds).toEqual(['c-a']);
    expect(result.pairwiseMatrix).toHaveLength(3);
    expect(result.schulzeMatrix).toHaveLength(3);
  });

  it('caso simple: ganador claro con 2 candidatos', () => {
    // 3 votan A>B, 2 votan B>A
    const ballots: BallotInput[] = [
      ...Array.from({ length: 3 }, () => [
        { candidateId: 'c-a', rank: 1 },
        { candidateId: 'c-b', rank: 2 },
      ]),
      ...Array.from({ length: 2 }, () => [
        { candidateId: 'c-b', rank: 1 },
        { candidateId: 'c-a', rank: 2 },
      ]),
    ];

    const result = runSchulze(ballots, ['c-a', 'c-b']);

    expect(result.winnerIds).toEqual(['c-a']);
    expect(result.pairwiseMatrix[0]![1]).toBe(3);
    expect(result.pairwiseMatrix[1]![0]).toBe(2);
  });

  it('maneja 4 candidatos con ganador único', () => {
    // A gana a todos: A>B, A>C, A>D
    const ballots: BallotInput[] = Array.from({ length: 10 }, () => [
      { candidateId: 'c-a', rank: 1 },
      { candidateId: 'c-b', rank: 2 },
      { candidateId: 'c-c', rank: 3 },
      { candidateId: 'c-d', rank: 4 },
    ]);

    const result = runSchulze(ballots, ['c-a', 'c-b', 'c-c', 'c-d']);

    expect(result.winnerIds).toEqual(['c-a']);
    expect(result.pairwiseMatrix).toHaveLength(4);
    expect(result.schulzeMatrix).toHaveLength(4);
  });

  it('devuelve resultado vacío con 0 candidatos', () => {
    const result = runSchulze([], []);

    expect(result.winnerIds).toHaveLength(0);
    expect(result.pairwiseMatrix).toHaveLength(0);
    expect(result.schulzeMatrix).toHaveLength(0);
  });
});
