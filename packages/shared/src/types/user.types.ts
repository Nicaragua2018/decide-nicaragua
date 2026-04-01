/**
 * AccountStatus define el ciclo de vida de una cuenta de usuario.
 *
 * Flujo esperado:
 *   invited → pending_verification → verified_citizen
 *                                  → observer
 *                                  → external_collaborator
 *                                  → rejected
 *   (cualquier estado activo) → suspended
 *
 * Nota: Este enum combina estado del ciclo de vida y nivel de acceso
 * para simplificar el MVP. Ver DECISIONS.md ADR-009.
 */
export enum AccountStatus {
  /** Invitación enviada, el usuario no ha completado el registro */
  invited = 'invited',

  /** El usuario completó el registro y espera verificación manual */
  pending_verification = 'pending_verification',

  /** Identidad verificada como ciudadano nicaragüense */
  verified_citizen = 'verified_citizen',

  /** Aprobado como observador (no ciudadano o sin verificar ciudadanía) */
  observer = 'observer',

  /** Colaborador externo con acceso limitado */
  external_collaborator = 'external_collaborator',

  /** Solicitud rechazada por el proceso de verificación */
  rejected = 'rejected',

  /** Cuenta suspendida temporalmente por el administrador */
  suspended = 'suspended',
}

/** Permisos de acceso funcional derivados del AccountStatus */
export const ACTIVE_STATUSES: AccountStatus[] = [
  AccountStatus.verified_citizen,
  AccountStatus.observer,
  AccountStatus.external_collaborator,
];

export const CAN_VOTE_STATUSES: AccountStatus[] = [
  AccountStatus.verified_citizen,
];

export const CAN_PARTICIPATE_STATUSES: AccountStatus[] = [
  AccountStatus.verified_citizen,
  AccountStatus.observer,
];

// ─── Admin types ───────────────────────────────────────────────────────────────

/** Resumen de usuario para el panel de administración. */
export interface UserSummary {
  id: string;
  email: string;
  status: AccountStatus;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserListResponse {
  users: UserSummary[];
  total: number;
}
