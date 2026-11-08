export type InquietudStatusValue =
  | 'abierta'
  | 'en_plazo'
  | 'en_debate'
  | 'respondida'
  | 'abierta_por_la_comunidad';

export interface InquietudSummary {
  id: string;
  groupId: string;
  title: string;
  status: InquietudStatusValue;
  hidden: boolean;
  supportCount: number;
  supportedByMe: boolean;
  threshold: number;
  deadlineAt: string | null;
  proposalId: string | null;
  authorDisplayName: string;
  origen: 'persona' | 'asistente';
  createdAt: string;
}

export interface InquietudDetail extends InquietudSummary {
  body: string;
  response: string | null;
  respondedAt: string | null;
  canOrganize: boolean;
  /** Falso para quien organiza la agenda sin ser miembro de la comunidad. */
  isMember: boolean;
  isAuthor: boolean;
  hiddenReason: string | null;
  moderationId: string | null;
}
