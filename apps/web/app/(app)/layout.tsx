import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { serverFetch } from '@/lib/api';
import NavBar from '@/components/nav/NavBar';
import { AsistenteProvider } from '@/components/asistente/AsistenteContexto';
import AsistentePanel from '@/components/AsistentePanel';
import type { AuthResponse, MiCargoVista } from '@decide/shared';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const res = await serverFetch('/api/auth/me');

  if (!res.ok) {
    redirect('/login');
  }

  const { user } = (await res.json()) as AuthResponse;

  // Si el estado del asistente no se puede leer, se trata como apagado.
  const estadoRes = await serverFetch('/api/asistente/estado').catch(() => null);
  const estado = estadoRes?.ok ? ((await estadoRes.json()) as { activo: boolean; topeAlcanzado: boolean }) : null;

  // «Observar» solo se muestra a quien observa; si la llamada falla, no se muestra.
  let esObservador = false;
  try {
    const cargosRes = await serverFetch('/api/elecciones/mis-cargos');
    if (cargosRes.ok) esObservador = ((await cargosRes.json()) as MiCargoVista[]).some((c) => c.tipo === 'observador');
  } catch {
    esObservador = false;
  }

  return (
    <AsistenteProvider activo={estado?.activo ?? false} topeAlcanzado={estado?.topeAlcanzado ?? false}>
      <NavBar displayName={user.displayName} email={user.email} status={user.status} esObservador={esObservador} />
      <main className="container page page-con-barra">{children}</main>
      <AsistentePanel />
    </AsistenteProvider>
  );
}
