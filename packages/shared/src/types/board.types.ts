/** Cargos de la mesa directiva (spec §3). */
export enum BoardRole {
  administrador = 'administrador',
  coordinador_general = 'coordinador_general',
  secretario = 'secretario',
}

export const BOARD_ROLES: BoardRole[] = [
  BoardRole.administrador,
  BoardRole.coordinador_general,
  BoardRole.secretario,
];

/** Acciones delicadas que requieren 2 de 3 aprobaciones de la mesa. */
export enum BoardActionType {
  suspend_user = 'suspend_user',
  change_origin = 'change_origin',
  change_rule = 'change_rule',
  /** Oculta una ficha de candidatura publicada. params: { candidaturaId, causa }. */
  ocultar_candidatura = 'ocultar_candidatura',
  /** Reactiva a una persona suspendida. params: { solicitudId }. */
  reactivate_user = 'reactivate_user',
  /** Rechaza una solicitud de reactivación. params: { solicitudId }; el `reason` de la acción es el motivo que ve la persona. */
  rechazar_reactivacion = 'rechazar_reactivacion',
}

export interface BoardSeatSummary {
  role: BoardRole;
  holder: { profileId: string; displayName: string } | null;
  source: 'fundador' | 'eleccion' | null;
  since: string | null;
}

export interface BoardActionSummary {
  id: string;
  type: BoardActionType;
  targetDisplayName: string | null;
  params: Record<string, unknown>;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  proposedBy: string | null;
  approvals: { role: BoardRole; approve: boolean }[];
  createdAt: string;
}

/** Pedido de reactivación pendiente, tal como lo ve la mesa (nombre visible, nunca el correo). */
export interface ReactivacionPendiente {
  id: string;
  userId: string;
  nombre: string;
  motivoSuspension: string;
  texto: string;
  createdAt: string;
}

/** Estado de verificación que ve la propia persona. */
export interface VerificationStatus {
  status: string;
  references: { kind: 'invitador' | 'segunda'; displayName: string }[];
  missing: ('invitador' | 'segunda')[];
}

/** Persona pendiente que el miembro actual puede confirmar. */
export interface PendingVerification {
  userId: string;
  displayName: string;
  birthDepartment: string | null;
  hostCommunity: string | null;
  invitedByMe: boolean;
  referencesCount: number;
}
