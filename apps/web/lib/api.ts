import { cookies } from 'next/headers';

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
