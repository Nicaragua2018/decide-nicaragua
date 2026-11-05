import type { SignalCounts } from './deliberation.types.js';

export type ProposalKindValue = 'tema' | 'propuesta';

export interface ForumSummary {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  description: string | null;
  isDefault: boolean;
  topicCount: number;
}

export interface ForumDetail extends ForumSummary {
  canModerate: boolean;
  topics: import('./deliberation.types.js').ProposalSummary[];
}

/** Consenso publicado: lo ve cualquier visitante. Sin nombres de personas. */
export interface PublicConsensus {
  id: string;
  title: string;
  communityName: string;
  kind: ProposalKindValue;
  conclusion: string;
  objections: string | null;
  signalCounts: SignalCounts;
  closedAt: string;
  winningOption: string | null;
  /** Títulos de las soluciones aprobadas (vacío si no aplica). */
  approvedSolutions: string[];
}

/** Apelación pendiente, para la cola de la mesa. */
export interface ModerationAppeal {
  id: string;
  target: 'tema' | 'respuesta' | 'inquietud' | 'frase' | 'solucion';
  targetId: string;
  reason: string;
  appealText: string;
  originalText: string;
  appealedAt: string;
}
