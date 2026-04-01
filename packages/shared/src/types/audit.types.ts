// ─── Audit — tipos públicos de lectura ────────────────────────────────────────

/**
 * Resumen de un evento de auditoría para listados.
 *
 * Campos sensibles (ipHash, payloadHash, actorId) excluidos deliberadamente.
 * actorDisplayName proviene del perfil del actor (semi-público).
 */
export interface AuditEventSummary {
  id: string;
  createdAt: string; // ISO 8601
  action: string;
  resource: string | null;
  actorDisplayName: string | null;
  metadata: Record<string, unknown> | null;
}

/** Respuesta paginada del listado de eventos. */
export interface AuditListResponse {
  events: AuditEventSummary[];
  total: number;
  page: number;
  limit: number;
}
