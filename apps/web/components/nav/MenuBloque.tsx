'use client';

import Link from 'next/link';
import { useId, useRef, type KeyboardEvent } from 'react';
import { useMenu } from './useMenu';
import type { BloqueNav } from '@/lib/navegacion';

interface Props {
  bloque: BloqueNav;
  abierto: boolean;
  activo: boolean;
  onAlternar(): void;
  onCerrar(): void;
}

export default function MenuBloque({ bloque, abierto, activo, onAlternar, onCerrar }: Props) {
  const idMenu = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useMenu(abierto, onCerrar, raiz, boton);

  function opciones(): HTMLElement[] {
    return Array.from(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (!abierto) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const lista = opciones();
    if (lista.length === 0) return;
    const i = lista.indexOf(document.activeElement as HTMLElement);
    const siguiente = e.key === 'ArrowDown' ? (i + 1) % lista.length : i <= 0 ? lista.length - 1 : i - 1;
    lista[siguiente]?.focus();
  }

  return (
    <div className="nav-item" ref={raiz} onKeyDown={alTeclear}>
      <button
        ref={boton}
        type="button"
        className={`nav-bloque${activo ? ' nav-bloque-activo' : ''}`}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={idMenu}
        onClick={onAlternar}
      >
        {bloque.titulo}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={abierto ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
        </svg>
      </button>
      {abierto && (
        <div id={idMenu} role="menu" aria-label={bloque.titulo} className="nav-menu">
          {bloque.opciones.map((o) => (
            <Link key={o.ruta} href={o.ruta} role="menuitem" className="nav-opcion" onClick={onCerrar}>
              <span className="nav-opcion-titulo">{o.titulo}</span>
              <span className="nav-opcion-ayuda">{o.ayuda}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
