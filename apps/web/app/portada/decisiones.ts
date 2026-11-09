import type { DecisionPublicaItem } from '@decide/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const MAXIMO = 6;

function esDecision(x: unknown): x is DecisionPublicaItem {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.title === 'string' &&
    (d.estado === 'aprobada' || d.estado === 'rechazada') &&
    typeof d.fecha === 'string' &&
    !Number.isNaN(Date.parse(d.fecha))
  );
}

/**
 * Últimas decisiones cerradas del espacio general, para la portada pública.
 * Se vuelve a pedir como mucho cada 5 minutos. Ante cualquier error (API caída,
 * respuesta no 200 o JSON inválido) devuelve [] y la página muestra el mensaje amable.
 * Nunca lanza.
 */
export async function leerDecisionesPublicas(): Promise<DecisionPublicaItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/publico/decisiones`, { next: { revalidate: 300 } });
    if (res.status !== 200) return [];
    const datos: unknown = await res.json();
    if (!Array.isArray(datos)) return [];
    // Solo los campos públicos, aunque la API mandara algo de más.
    return datos
      .filter(esDecision)
      .slice(0, MAXIMO)
      .map(({ title, estado, fecha }) => ({ title, estado, fecha }));
  } catch {
    return [];
  }
}
