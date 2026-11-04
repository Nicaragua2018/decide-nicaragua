import type { InquietudStatusValue } from '@decide/shared';

export const INQUIETUD_STATUS_LABEL: Record<InquietudStatusValue, string> = {
  abierta: 'Abierta',
  en_plazo: 'En plazo de respuesta',
  en_debate: 'En debate',
  respondida: 'Respondida',
  abierta_por_la_comunidad: 'Abierta por la comunidad',
};

export const INQUIETUD_STATUS_BADGE: Record<InquietudStatusValue, string> = {
  abierta: 'badge-draft',
  en_plazo: 'badge-pending',
  en_debate: 'badge-open',
  respondida: 'badge-completed',
  abierta_por_la_comunidad: 'badge-open',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI');
}
