/**
 * Algoritmo de Schulze (Condorcet method).
 *
 * Implementación pura sin dependencias externas.
 * Todas las funciones son deterministas y verificables independientemente.
 *
 * Referencia: https://en.wikipedia.org/wiki/Schulze_method
 *
 * Flujo:
 *  1. buildPairwiseMatrix  — cuenta preferencias par a par
 *  2. computeStrongestPaths — Floyd-Warshall para rutas más fuertes
 *  3. findWinnerIndices    — candidatos que ganan a todos los demás
 *  4. runSchulze           — ejecuta los tres pasos y devuelve el resultado completo
 */

export type BallotInput = Array<{ candidateId: string; rank: number }>;

/**
 * Construye la matriz de preferencias pairwise.
 *
 * d[i][j] = número de votantes que prefieren el candidato i sobre el candidato j.
 *
 * Los candidatos no incluidos en una papeleta se tratan como empatados en
 * el último lugar (rank = Infinity).
 */
export function buildPairwiseMatrix(ballots: BallotInput[], candidates: string[]): number[][] {
  const n = candidates.length;
  const d: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (const ballot of ballots) {
    const rankMap = new Map<string, number>();
    for (const { candidateId, rank } of ballot) {
      rankMap.set(candidateId, rank);
    }

    for (let i = 0; i < n; i++) {
      const ri = rankMap.get(candidates[i]!) ?? Infinity;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const rj = rankMap.get(candidates[j]!) ?? Infinity;
        if (ri < rj) {
          d[i]![j]!++;
        }
      }
    }
  }

  return d;
}

/**
 * Calcula la matriz de rutas más fuertes usando Floyd-Warshall.
 *
 * p[i][j] = fuerza de la ruta más fuerte del candidato i al candidato j.
 *
 * La fuerza de una ruta es el mínimo de las preferencias pairwise a lo
 * largo de la ruta. La ruta más fuerte es la que maximiza esta fuerza.
 */
export function computeStrongestPaths(d: readonly (readonly number[])[], n: number): number[][] {
  const p: number[][] = d.map((row) => [...row]);

  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      for (let j = 0; j < n; j++) {
        if (j === k || j === i) continue;
        const via = Math.min(p[i]![k]!, p[k]![j]!);
        if (via > p[i]![j]!) {
          p[i]![j]! = via;
        }
      }
    }
  }

  return p;
}

/**
 * Determina los índices de los candidatos ganadores.
 *
 * El candidato i gana si para todo j ≠ i: p[i][j] >= p[j][i].
 * En empate exacto puede haber múltiples ganadores.
 */
export function findWinnerIndices(p: readonly (readonly number[])[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => i).filter((i) =>
    Array.from({ length: n }, (_, j) => j).every((j) => i === j || p[i]![j]! >= p[j]![i]!),
  );
}

/**
 * Ejecuta el algoritmo completo de Schulze.
 *
 * @param ballots    Papeletas. Cada papeleta es un array de { candidateId, rank }.
 *                   Los candidatos omitidos se tratan como empatados en último lugar.
 * @param candidates IDs de candidatos en el orden que indexará las matrices.
 *
 * @returns pairwiseMatrix, schulzeMatrix (para auditoría) y winnerIds.
 */
export function runSchulze(
  ballots: BallotInput[],
  candidates: string[],
): {
  pairwiseMatrix: number[][];
  schulzeMatrix: number[][];
  winnerIds: string[];
} {
  const n = candidates.length;

  if (n === 0) {
    return { pairwiseMatrix: [], schulzeMatrix: [], winnerIds: [] };
  }

  const pairwiseMatrix = buildPairwiseMatrix(ballots, candidates);
  const schulzeMatrix = computeStrongestPaths(pairwiseMatrix, n);
  const winnerIndices = findWinnerIndices(schulzeMatrix, n);
  const winnerIds = winnerIndices.map((i) => candidates[i]!);

  return { pairwiseMatrix, schulzeMatrix, winnerIds };
}
