'use client';

import { useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { bloquesDeNavegacion, bloqueActivo, type BloqueId } from '@/lib/navegacion';
import Marca from './Marca';
import MenuBloque from './MenuBloque';
import MenuAvatar from './MenuAvatar';
import BotonGuardian from './BotonGuardian';

interface NavBarProps {
  displayName: string | null;
  email: string;
  status: string;
  /** La persona tiene un cargo de observador en funciones. */
  esObservador?: boolean;
}

export default function NavBar({ displayName, email, status, esObservador = false }: NavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [abierto, setAbierto] = useState<BloqueId | 'avatar' | null>(null);

  const bloques = bloquesDeNavegacion({ status, esObservador });
  const activo = bloqueActivo(pathname, bloques);
  const nombre = displayName ?? email;
  const iniciales = nombre.slice(0, 2).toUpperCase();

  const cerrar = useCallback(() => setAbierto(null), []);
  const alternar = (id: BloqueId | 'avatar') => setAbierto((actual) => (actual === id ? null : id));

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Marca enlace="/dashboard" />
        <nav aria-label="Principal" className="navbar-bloques">
          {bloques.map((b) => (
            <MenuBloque
              key={b.id}
              bloque={b}
              abierto={abierto === b.id}
              activo={activo === b.id}
              onAlternar={() => alternar(b.id)}
              onCerrar={cerrar}
            />
          ))}
        </nav>
        <div className="navbar-derecha">
          <BotonGuardian />
          <MenuAvatar
            nombre={nombre}
            iniciales={iniciales}
            status={status}
            abierto={abierto === 'avatar'}
            onAlternar={() => alternar('avatar')}
            onCerrar={cerrar}
            onSalir={handleLogout}
          />
        </div>
      </div>
    </header>
  );
}
