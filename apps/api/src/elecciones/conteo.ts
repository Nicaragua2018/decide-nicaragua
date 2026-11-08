/**
 * Conteo puro de una elección (plan 3C-1): mayoría de aprobación más orden
 * de Schulze para varios puestos, con desempate reproducible.
 *
 * - Quórum: cuentan todas las papeletas, también las abstenciones.
 * - Una candidatura queda aprobada si aparece en más de la mitad de las
 *   papeletas no abstenidas (`estaAprobada`).
 * - Entre las aprobadas, se llenan los puestos en orden Schulze. Un nivel
 *   empatado que no cabe entero se resuelve con `selectMembers` y la semilla.
 * - Las excluidas (ocultas por moderación al contar) siguen en las matrices
 *   pero no pueden quedar electas.
 *
 * No usa Nest ni Prisma: entra todo por parámetro y es determinista.
 */

import { selectMembers, sortPool } from '../sortition/sortition-algorithm';
import { aBallot, estaAprobada, hayQuorum, type PapeletaInput } from '../decisiones/decision-tally';
import {
  computeStrongestPaths,
  buildPairwiseMatrix,
  findWinnerIndices,
} from '../voting/schulze';

export interface ConteoInput {
  candidatas: string[];
  puestos: number;
  papeletas: PapeletaInput[];
  miembros: number;
  quorumPct: number;
  /** Candidaturas que no pueden quedar electas (ocultas por moderación al contar). */
  excluidas?: string[];
  /** Semilla pública del desempate. */
  semilla: string;
}

export interface ConteoEleccion {
  sinQuorum: boolean;
  electas: string[];
  /** Aprobadas en orden (con el desempate aplicado), luego las no aprobadas en orden Schulze. */
  ordenFinal: string[];
  aprobaciones: number[];
  papeletasTotal: number;
  abstenciones: number;
  validas: number;
  pairwiseMatrix: number[][];
  schulzeMatrix: number[][];
  desempateUsado: boolean;
}

/**
 * Ordena las candidatas en niveles: el nivel 0 son las ganadoras de Schulze
 * entre todas; se quitan y se repite con las restantes. Cada nivel puede
 * tener empates (ids en el orden de `candidatas`).
 */
export function ordenSchulze(schulzeMatrix: number[][], candidatas: string[]): string[][] {
  const niveles: string[][] = [];
  let restantes = candidatas.map((_, i) => i);

  while (restantes.length > 0) {
    const sub = restantes.map((i) => restantes.map((j) => schulzeMatrix[i]![j]!));
    const ganadoras = findWinnerIndices(sub, restantes.length);
    // Las rutas más fuertes son transitivas, así que siempre hay ganadora;
    // por seguridad, si no la hubiera, todo lo que queda empata.
    const posiciones = ganadoras.length > 0 ? ganadoras : restantes.map((_, k) => k);
    niveles.push(posiciones.map((k) => candidatas[restantes[k]!]!));
    const quitar = new Set(posiciones);
    restantes = restantes.filter((_, k) => !quitar.has(k));
  }

  return niveles;
}

export function contarEleccion(input: ConteoInput): ConteoEleccion {
  const { candidatas, puestos, papeletas, miembros, quorumPct, semilla } = input;
  const excluidas = new Set(input.excluidas ?? []);

  const papeletasTotal = papeletas.length;
  const validasList = papeletas.filter((p) => !p.abstencion);
  const validas = validasList.length;
  const abstenciones = papeletasTotal - validas;

  const aprobaciones = candidatas.map((c) => validasList.filter((p) => p.orden.includes(c)).length);

  const pairwiseMatrix = buildPairwiseMatrix(
    validasList.map((p) => aBallot(p.orden)),
    candidatas,
  );
  const schulzeMatrix = computeStrongestPaths(pairwiseMatrix, candidatas.length);
  const nivelesTodas = ordenSchulze(schulzeMatrix, candidatas);

  const aprobadas = new Set(
    candidatas.filter((c, i) => !excluidas.has(c) && estaAprobada(aprobaciones[i] ?? 0, validas)),
  );

  const base = {
    aprobaciones,
    papeletasTotal,
    abstenciones,
    validas,
    pairwiseMatrix,
    schulzeMatrix,
  };

  const porSchulze = nivelesTodas.flatMap((n) => sortPool(n));
  if (!hayQuorum(papeletasTotal, miembros, quorumPct)) {
    return { ...base, sinQuorum: true, electas: [], ordenFinal: porSchulze, desempateUsado: false };
  }

  // El orden entre quienes logran la mayoría se calcula solo entre ellas:
  // las excluidas o no aprobadas no influyen.
  const aprobadasLista = candidatas.filter((c) => aprobadas.has(c));
  const pairwiseAprobadas = buildPairwiseMatrix(
    validasList.map((p) => aBallot(p.orden)),
    aprobadasLista,
  );
  const niveles = ordenSchulze(
    computeStrongestPaths(pairwiseAprobadas, aprobadasLista.length),
    aprobadasLista,
  );

  const electas: string[] = [];
  const ordenAprobadas: string[] = [];
  let desempateUsado = false;

  for (const nivel of niveles) {
    const delNivel = sortPool(nivel);
    const faltan = Math.max(0, puestos - electas.length);
    if (faltan === 0) {
      ordenAprobadas.push(...delNivel);
    } else if (delNivel.length <= faltan) {
      electas.push(...delNivel);
      ordenAprobadas.push(...delNivel);
    } else {
      const elegidas = selectMembers(delNivel, faltan, semilla);
      desempateUsado = true;
      electas.push(...elegidas);
      ordenAprobadas.push(...elegidas, ...delNivel.filter((c) => !elegidas.includes(c)));
    }
  }
  const noAprobadas = nivelesTodas.flatMap((n) => sortPool(n).filter((c) => !aprobadas.has(c)));

  return {
    ...base,
    sinQuorum: false,
    electas,
    ordenFinal: [...ordenAprobadas, ...noAprobadas],
    desempateUsado,
  };
}
