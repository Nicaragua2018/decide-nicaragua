'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NavBarProps {
  displayName: string | null;
  email: string;
  status: string;
}

export default function NavBar({ displayName, email, status }: NavBarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/dashboard" className="navbar-brand">
          Decide <span>Nicaragua</span>
        </Link>

        <div className="navbar-links">
          <Link href="/dashboard" className="navbar-link">Grupos</Link>
          <Link href="/audit" className="navbar-link">Auditoría</Link>
          {status === 'verified_citizen' && (
            <Link href="/admin/users" className="navbar-link">Admin</Link>
          )}
          <Link href="/me" className="navbar-link">Mi perfil</Link>

          <span className="navbar-user">{displayName ?? email}</span>

          <button onClick={handleLogout} className="btn btn-ghost btn-sm">
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
