'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { bloquesDeNavegacion, bloqueActivo, type BloqueId } from '@/lib/navegacion';
import Marca from './Marca';
import MenuBloque from './MenuBloque';
import MenuAvatar from './MenuAvatar';
import MenuChat from './MenuChat';
import { novedadesChat } from '@/lib/actions';
import { sinLaSalaAbierta } from '@/lib/chat';
import type { ChatNovedades } from '@decide/shared';

/** Cada cuánto se vuelve a contar lo que hay sin leer, con la pestaña a la vista. */
const REVISAR_CHAT_MS = 60_000;
import BotonGuardian from './BotonGuardian';
import BarraInferior from './BarraInferior';
import GuardianFlotante from './GuardianFlotante';

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
  const [abierto, setAbierto] = useState<BloqueId | 'avatar' | 'chat' | null>(null);
  const [salas, setSalas] = useState<ChatNovedades>([]);
  const conChat = status === 'verified_citizen';

  // El número de mensajes sin leer: al entrar, al cambiar de página y cada minuto con la pestaña a la vista.
  useEffect(() => {
    if (!conChat) return;
    let vivo = true;
    const contar = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await novedadesChat();
      if (vivo) setSalas(sinLaSalaAbierta(r, window.location.pathname, window.location.search));
    };
    void contar();
    const reloj = setInterval(() => void contar(), REVISAR_CHAT_MS);
    const alVolver = () => void contar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [conChat, pathname]);

  const bloques = bloquesDeNavegacion({ status, esObservador });
  const activo = bloqueActivo(pathname, bloques);
  const nombre = displayName ?? email;
  const iniciales = nombre.slice(0, 2).toUpperCase();

  const cerrar = useCallback(() => setAbierto(null), []);
  const alternar = (id: BloqueId | 'avatar' | 'chat') => setAbierto((actual) => (actual === id ? null : id));

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
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
          {conChat && <MenuChat salas={salas} abierto={abierto === 'chat'} onAlternar={() => alternar('chat')} onCerrar={cerrar} />}
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
    <BarraInferior bloques={bloques} activo={activo} onAbrir={cerrar} />
    <GuardianFlotante />
    </>
  );
}
