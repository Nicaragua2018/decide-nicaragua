import type { SignalCounts } from './deliberation.types.js';
import type { ModeracionCausaValue } from '../constants/moderacion.js';

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
  /** Quien lee desde el ámbito de un grupo de trabajo, sin ser miembro: no abre temas. */
  soloLectura: boolean;
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
  /** Informe final de la comisión, si lo hubo. */
  informeFinal: string | null;
}

/** Apelación pendiente, para la cola de la mesa. */
export interface ModerationAppeal {
  id: string;
  target: 'tema' | 'respuesta' | 'inquietud' | 'frase' | 'solucion' | 'informe';
  targetId: string;
  reason: string;
  /** Null en las moderaciones anteriores a las causas cerradas. */
  causa: ModeracionCausaValue | null;
  appealText: string;
  originalText: string;
  appealedAt: string;
}

/** Solicitud de moderación que espera la segunda firma de la mesa. Solo la ve la mesa. */
export interface ModeracionPorConfirmar {
  id: string;
  target: 'tema' | 'respuesta' | 'inquietud' | 'frase' | 'solucion' | 'informe';
  targetId: string;
  causa: ModeracionCausaValue;
  /** Detalle opcional de quien la pidió ('' si no escribió nada). */
  detalle: string;
  originalText: string;
  /** pendiente: sigue visible; provisional: ya oculto por causa urgente. */
  estado: 'pendiente' | 'provisional';
  venceAt: string;
  createdAt: string;
  /** La pidió quien consulta: no puede confirmarla. */
  esMia: boolean;
  /** Contexto para la mesa: «Propuesta formal», «Debate vinculado a una inquietud oculta» o null. */
  contexto: string | null;
}
