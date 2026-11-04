// ─── Deliberation types ───────────────────────────────────────────────────────

export enum ProposalStatus {
  draft = 'draft',
  open = 'open',
  closed = 'closed',
  archived = 'archived',
}

export enum SignalType {
  support = 'support',
  neutral = 'neutral',
  object = 'object',
}

export interface SignalCounts {
  support: number;
  neutral: number;
  object: number;
}

export interface ProposalSummary {
  id: string;
  groupId: string;
  title: string;
  status: ProposalStatus;
  authorDisplayName: string | null;
  signalCounts: SignalCounts;
  commentCount: number;
  createdAt: string;
  kind: 'tema' | 'propuesta';
  hidden: boolean;
  forumId: string | null;
}

export interface CommentItem {
  id: string;
  authorDisplayName: string | null;
  body: string;
  parentId: string | null;
  createdAt: string;
  hidden: boolean;
  hiddenReason: string | null;
  /** Solo para el autor de contenido oculto aún sin apelar; permite apelar. */
  moderationId: string | null;
}

export interface ProposalDetail extends ProposalSummary {
  body: string;
  authorProfileId: string;
  isAuthor: boolean;
  comments: CommentItem[];
  /** Señal del usuario autenticado, o null si no ha señalado */
  userSignal: SignalType | null;
  deliberationEndsAt: string | null;
  electionId: string | null;
  /** Estado de la votación vinculada; null si no hay votación o si el tema está oculto. */
  electionStatus: 'draft' | 'open' | 'tallied' | 'cancelled' | null;
  conclusion: string | null;
  objections: string | null;
  hiddenReason: string | null;
  moderationId: string | null;
  canModerate: boolean;
  abiertoPorComunidad: boolean;
  inquietudes: { id: string; title: string }[];
}

export interface ProposalListResponse {
  proposals: ProposalSummary[];
}
