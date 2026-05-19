import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { serverFetch } from '@/lib/api';
import NavBar from '@/components/NavBar';
import type { AuthResponse } from '@decide/shared';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const res = await serverFetch('/api/auth/me');

  if (!res.ok) {
    redirect('/login');
  }

  const { user } = (await res.json()) as AuthResponse;

  return (
    <>
      <NavBar displayName={user.displayName} email={user.email} status={user.status} />
      <main className="container page">{children}</main>
    </>
  );
}
