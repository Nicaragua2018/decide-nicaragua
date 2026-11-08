/**
 * Cálculo puro del resultado de una decisión entre soluciones (spec §5).
 *
 * Cada papeleta es una abstención o un orden de preferencia; las soluciones
 * que una papeleta deja fuera cuentan como rechazadas por esa persona y
 * quedan empatadas entre sí al final del orden (así lo trata `runSchulze`).
 *
 * - Quórum: cuentan todas las papeletas, también las abstenciones.
 * - Aprobada: aparece en más de la mitad de las papeletas válidas.
 * - Compatibles: ganan todas las aprobadas.
 * - Excluyentes: gana la ganadora de Schulze si está aprobada; entre varias
 *   ganadoras de Schulze solo cuentan las aprobadas (Ruling R1), y si quedan
 *   dos o más es un empate.
 * - Excluidas (soluciones ocultas por moderación al contar): siguen en las
 *   matrices y en las aprobaciones, pero no pueden quedar aprobadas; en
 *   excluyentes se descartan antes de cruzar con las ganadoras de Schulze.
 *
 * No usa Nest ni Prisma: entra todo por parámetro y es determinista.
 */

import { runSchulze, type BallotInput } from '../voting/schulze';

export interface PapeletaInput {
  abstencion: boolean;
  orden: string[];
}

export interface TallyInput {
  candidatas: string[];
  modo: 'excluyentes' | 'compatibles';
  papeletas: PapeletaInput[];
  miembros: number;
  quorumPct: number;
  /** Candidatas que no pueden ganar (ocultas por moderación al contar). */
  excluidas?: string[];
}

export interface TallyOutput {
  resultado: 'aprobada' | 'ninguna' | 'empate' | 'sin_quorum';
  ganadoras: string[];
  aprobaciones: number[];
  papeletasTotal: number;
  abstenciones: number;
  validas: number;
  pairwiseMatrix: number[][];
  schulzeMatrix: number[][];
}

/** Hay quórum si votaron (o se abstuvieron) al menos `quorumPct` % de los miembros. */
export function hayQuorum(papeletasTotal: number, miembros: number, quorumPct: number): boolean {
  return miembros > 0 && papeletasTotal * 100 >= quorumPct * miembros;
}

/** Una solución está aprobada si aparece en más de la mitad de las papeletas válidas. */
export function estaAprobada(aprobaciones: number, validas: number): boolean {
  return validas > 0 && aprobaciones * 2 > validas;
}

/** Convierte un orden de preferencia en la papeleta que espera Schulze. */
export function aBallot(orden: string[]): BallotInput {
  return orden.map((candidateId, i) => ({ candidateId, rank: i + 1 }));
}

/** Calcula el resultado completo de una decisión. */
export function tallyDecision(input: TallyInput): TallyOutput {
  const { candidatas, modo, papeletas, miembros, quorumPct } = input;
  const excluidas = new Set(input.excluidas ?? []);

  const papeletasTotal = papeletas.length;
  const validasList = papeletas.filter((p) => !p.abstencion);
  const validas = validasList.length;
  const abstenciones = papeletasTotal - validas;

  const aprobaciones = candidatas.map((c) => validasList.filter((p) => p.orden.includes(c)).length);

  const { pairwiseMatrix, schulzeMatrix, winnerIds } = runSchulze(
    validasList.map((p) => aBallot(p.orden)),
    candidatas,
  );

  const base = {
    aprobaciones,
    papeletasTotal,
    abstenciones,
    validas,
    pairwiseMatrix,
    schulzeMatrix,
  };

  if (!hayQuorum(papeletasTotal, miembros, quorumPct)) {
    return { ...base, resultado: 'sin_quorum', ganadoras: [] };
  }

  const aprobadas = new Set(
    candidatas.filter((c, i) => !excluidas.has(c) && estaAprobada(aprobaciones[i] ?? 0, validas)),
  );

  if (modo === 'compatibles') {
    const ganadoras = candidatas.filter((c) => aprobadas.has(c));
    return {
      ...base,
      resultado: ganadoras.length > 0 ? 'aprobada' : 'ninguna',
      ganadoras,
    };
  }

  const ganadorasAprobadas = winnerIds.filter((c) => aprobadas.has(c));
  if (ganadorasAprobadas.length === 0) {
    return { ...base, resultado: 'ninguna', ganadoras: [] };
  }
  if (ganadorasAprobadas.length === 1) {
    return { ...base, resultado: 'aprobada', ganadoras: ganadorasAprobadas };
  }
  return { ...base, resultado: 'empate', ganadoras: [] };
}
