import { MODERACION_CAUSAS } from '@decide/shared';

const ETIQUETAS = new Map<string, string>(MODERACION_CAUSAS.map((c) => [c.value, c.label]));

/**
 * Motivo que se muestra de una moderación: la etiqueta de su causa, más «: detalle» si lo hay.
 * Las moderaciones anteriores a las causas cerradas (sin causa) muestran su motivo libre.
 */
export function motivoVisible(
  action: { causa?: string | null; reason: string } | null | undefined,
): string | null {
  if (!action) return null;
  const etiqueta = action.causa ? ETIQUETAS.get(action.causa) : undefined;
  if (!etiqueta) return action.reason;
  const detalle = action.reason.trim();
  return detalle ? `${etiqueta}: ${detalle}` : etiqueta;
}
