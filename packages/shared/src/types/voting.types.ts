// ─── Voting types (Condorcet-Schulze) ────────────────────────────────────────

export enum ElectionStatus {
  draft = 'draft',
  open = 'open',
  tallied = 'tallied',
  cancelled = 'cancelled',
}

export interface CandidateSummary {
  id: string;
  title: string;
  description: string | null;
  position: number;
}

export interface ElectionSummary {
  id: string;
  groupId: string;
  title: string;
  status: ElectionStatus;
  startsAt: string;
  endsAt: string;
  candidateCount: number;
  ballotCount: number;
  createdAt: string;
}

export interface ElectionDetail extends ElectionSummary {
  description: string | null;
  candidates: CandidateSummary[];
  /** Si el usuario autenticado ya ha votado en esta elección. */
  userHasVoted: boolean;
}

export interface ElectionListResponse {
  elections: ElectionSummary[];
}

export interface ElectionResultResponse {
  electionId: string;
  /** Candidatos ganadores (puede ser más de uno en caso de empate exacto). */
  winners: CandidateSummary[];
  /**
   * Orden de candidatos en las matrices (por `position` ascendente).
   * candidates[i] corresponde a la fila/columna i de ambas matrices.
   */
  candidates: CandidateSummary[];
  /**
   * Matriz de preferencias pairwise.
   * pairwiseMatrix[i][j] = número de votantes que prefieren candidates[i] sobre candidates[j].
   */
  pairwiseMatrix: number[][];
  /**
   * Matriz de rutas más fuertes (Schulze).
   * schulzeMatrix[i][j] = fuerza de la ruta más fuerte de candidates[i] a candidates[j].
   */
  schulzeMatrix: number[][];
  totalBallots: number;
  computedAt: string;
}
