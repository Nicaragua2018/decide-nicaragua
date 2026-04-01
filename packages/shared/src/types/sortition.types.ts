// ─── Sortition types ──────────────────────────────────────────────────────────

export enum SortitionStatus {
  pending = 'pending',
  completed = 'completed',
  cancelled = 'cancelled',
}

export interface SortitionMemberItem {
  profileId: string;
  displayName: string | null;
  selectionOrder: number;
}

export interface SortitionDrawSummary {
  id: string;
  groupId: string;
  title: string;
  status: SortitionStatus;
  selectionSize: number;
  createdAt: string;
  executedAt: string | null;
}

export interface SortitionDrawDetail extends SortitionDrawSummary {
  description: string | null;
  /**
   * Semilla aleatoria en hex almacenada públicamente.
   * Null hasta que se ejecute el sorteo.
   */
  seed: string | null;
  /**
   * Identificador del algoritmo usado (e.g. "fisher-yates-sha256-v1").
   * Null hasta que se ejecute el sorteo.
   */
  algorithm: string | null;
  /** Tamaño de la bolsa al momento del sorteo. Null hasta la ejecución. */
  poolSize: number | null;
  selectedMembers: SortitionMemberItem[];
}

export interface SortitionListResponse {
  draws: SortitionDrawSummary[];
}

/**
 * Resultado de la verificación independiente del sorteo.
 * Cualquier miembro puede verificar que storedIds === recomputedIds.
 */
export interface SortitionVerificationResult {
  verified: boolean;
  seed: string;
  algorithm: string;
  poolSize: number;
  selectionSize: number;
  /** IDs almacenados en base de datos (en orden de selección). */
  storedIds: string[];
  /** IDs recomputados aplicando el mismo algoritmo (en orden de selección). */
  recomputedIds: string[];
}
