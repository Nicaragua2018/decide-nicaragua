/**
 * Cálculo puro de varios puestos por preferencias (Schulze repetido).
 *
 * Cada ronda ejecuta Schulze sobre los candidatos que quedan, con las
 * papeletas sin los ya elegidos. Un empate se resuelve por el menor id en
 * orden lexicográfico, de modo que el resultado es determinista.
 */

import { runSchulze, type BallotInput } from '../voting/schulze';

export interface RondaPuestos {
  pairwiseMatrix: number[][];
  schulzeMatrix: number[][];
  candidatos: string[];
}

/**
 * @param papeletas  Cada papeleta es una lista ordenada de profileIds (de más a menos preferido).
 * @param candidatos Candidatos entre los que se elige.
 * @param puestos    Cantidad de puestos a llenar.
 */
export function elegirPuestos(
  papeletas: string[][],
  candidatos: string[],
  puestos: number,
): { elegidos: string[]; rondas: RondaPuestos[] } {
  if (candidatos.length <= puestos) {
    return { elegidos: [...candidatos], rondas: [] };
  }

  const elegidos: string[] = [];
  const rondas: RondaPuestos[] = [];
  let restantes = [...candidatos];

  while (elegidos.length < puestos && restantes.length > 0) {
    const enJuego = new Set(restantes);
    const ballots: BallotInput[] = papeletas.map((orden) =>
      orden
        .filter((id) => enJuego.has(id))
        .map((candidateId, i) => ({ candidateId, rank: i + 1 })),
    );
    const { pairwiseMatrix, schulzeMatrix, winnerIds } = runSchulze(ballots, restantes);
    const ganador = [...winnerIds].sort()[0];
    if (ganador === undefined) break;
    rondas.push({ pairwiseMatrix, schulzeMatrix, candidatos: [...restantes] });
    elegidos.push(ganador);
    restantes = restantes.filter((id) => id !== ganador);
  }

  return { elegidos, rondas };
}
