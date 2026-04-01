import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { serverFetch } from '@/lib/api';
import type { AuthResponse } from '@decide/shared';

/**
 * Layout de las rutas /admin/*.
 *
 * Doble protección:
 *   1. El layout (app)/layout.tsx ya verifica que exista sesión válida.
 *   2. Este layout adicional verifica que el usuario sea verified_citizen.
 *
 * Así un observer o collaborator que navegue directamente a /admin/users
 * recibe 403 en el servidor, sin necesidad de confiar en el NavBar.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const res = await serverFetch('/api/auth/me');

  if (res.status === 401) {
    redirect('/login');
  }

  const { user } = (await res.json()) as AuthResponse;

  if (user.status !== 'verified_citizen') {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
