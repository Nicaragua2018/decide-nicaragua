'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

interface NavBarProps {
  displayName: string | null;
  email: string;
  status: string;
}

export default function NavBar({ displayName, email, status }: NavBarProps) {
  const router   = useRouter();
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const initials = (displayName ?? email).slice(0, 2).toUpperCase();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/dashboard" className="navbar-brand">
          Decide <span>Nicaragua</span>
        </Link>

        <div className="navbar-links">
          <Link
            href="/dashboard"
            className={`navbar-link${isActive('/dashboard') ? ' navbar-link-active' : ''}`}
          >
            Grupos
          </Link>
          <Link
            href="/audit"
            className={`navbar-link${isActive('/audit') ? ' navbar-link-active' : ''}`}
          >
            Auditoría
          </Link>
          {status === 'verified_citizen' && (
            <Link
              href="/admin/users"
              className={`navbar-link${isActive('/admin') ? ' navbar-link-active' : ''}`}
            >
              Admin
            </Link>
          )}
          <Link
            href="/me"
            className={`navbar-link${isActive('/me') ? ' navbar-link-active' : ''}`}
          >
            Mi perfil
          </Link>

          <div className="navbar-avatar" title={displayName ?? email}>
            {initials}
          </div>

          <button onClick={handleLogout} className="btn btn-ghost btn-sm">
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
