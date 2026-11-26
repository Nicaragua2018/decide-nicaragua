'use client';

import Link from 'next/link';
import { useId, useRef } from 'react';
import type { ChatNovedades } from '@decide/shared';
import { totalSinLeer, textoSinLeer } from '@/lib/chat';
import { useMenu } from './useMenu';

interface Props {
  salas: ChatNovedades;
  abierto: boolean;
  onAlternar(): void;
  onCerrar(): void;
}

/** Acceso al chat desde cualquier página, con el número de mensajes sin leer. */
export default function MenuChat({ salas, abierto, onAlternar, onCerrar }: Props) {
  const idMenu = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const total = totalSinLeer(salas);

  useMenu(abierto, onCerrar, raiz, boton);

  return (
    <div className="nav-item nav-item-chat" ref={raiz}>
      <button
        ref={boton}
        type="button"
        className="nav-chat"
        aria-label={total > 0 ? `Chat: ${textoSinLeer(total)}` : 'Chat'}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={idMenu}
        onClick={onAlternar}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z" />
        </svg>
        <span className="nav-chat-texto">Chat</span>
        {total > 0 && (
          <span className="nav-chat-numero" aria-hidden="true">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {abierto && (
        <div id={idMenu} role="menu" aria-label="Chat de tus comunidades" className="nav-menu nav-chat-menu">
          <p className="nav-chat-titulo" role="none">Chat de tus comunidades</p>
          {salas.length === 0 && (
            <p className="nav-chat-vacio" role="none">Todavía no perteneces a una comunidad con chat.</p>
          )}
          {salas.map((s) => (
            <Link key={s.groupId} href={`/groups/${s.groupId}`} role="menuitem" className="nav-opcion nav-opcion-fila" onClick={onCerrar}>
              <span className="nav-opcion-titulo">{s.nombre}</span>
              {s.sinLeer > 0 ? (
                <span className="nav-chat-cuenta" aria-label={textoSinLeer(s.sinLeer)}>
                  {s.sinLeer > 99 ? '99+' : s.sinLeer}
                </span>
              ) : (
                <span className="nav-opcion-ayuda">Al día</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
