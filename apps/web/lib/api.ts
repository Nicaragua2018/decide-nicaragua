import { cookies } from 'next/headers';
import type { SugerenciaTipo, SugerenciaVista } from '@decide/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Fetch autenticado para Server Components.
 * Reenvía las cookies de sesión al API interno.
 */
export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  });
}

/**
 * Lee una sugerencia del asistente. Devuelve null si no hay (204), si no hay acceso (403)
 * o ante cualquier error: nunca rompe la página.
 */
export async function leerSugerencia(tipo: SugerenciaTipo, objetoId: string): Promise<SugerenciaVista | null> {
  try {
    const res = await serverFetch(`/api/asistente/sugerencias/${tipo}/${encodeURIComponent(objetoId)}`);
    if (res.status !== 200) return null;
    const text = await res.text();
    if (!text) return null;
    const s = JSON.parse(text) as SugerenciaVista;
    return s.tipo === tipo ? s : null;
  } catch {
    return null;
  }
}
