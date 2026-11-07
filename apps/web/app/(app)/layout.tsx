import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { serverFetch } from '@/lib/api';
import NavBar from '@/components/NavBar';
import AsistentePanel from '@/components/AsistentePanel';
import type { AuthResponse } from '@decide/shared';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const res = await serverFetch('/api/auth/me');

  if (!res.ok) {
    redirect('/login');
  }

  const { user } = (await res.json()) as AuthResponse;

  // Si el estado del asistente no se puede leer, se trata como apagado.
  const estadoRes = await serverFetch('/api/asistente/estado').catch(() => null);
  const estado = estadoRes?.ok ? ((await estadoRes.json()) as { activo: boolean; topeAlcanzado: boolean }) : null;

  return (
    <>
      <NavBar displayName={user.displayName} email={user.email} status={user.status} />
      <main className="container page">{children}</main>
      {estado?.activo && <AsistentePanel topeAlcanzado={estado.topeAlcanzado} />}
    </>
  );
}
