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
}

export interface CommentItem {
  id: string;
  authorDisplayName: string | null;
  body: string;
  parentId: string | null;
  createdAt: string;
}

export interface ProposalDetail extends ProposalSummary {
  body: string;
  comments: CommentItem[];
  /** Señal del usuario autenticado, o null si no ha señalado */
  userSignal: SignalType | null;
}

export interface ProposalListResponse {
  proposals: ProposalSummary[];
}
