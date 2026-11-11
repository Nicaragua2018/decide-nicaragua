'use client';

import Link from 'next/link';
import { useId, useRef, type KeyboardEvent } from 'react';
import { useMenu } from './useMenu';
import { opcionesDeAvatar } from '@/lib/navegacion';

interface Props {
  nombre: string;
  iniciales: string;
  status: string;
  abierto: boolean;
  onAlternar(): void;
  onCerrar(): void;
  onSalir(): void;
}

export default function MenuAvatar({ nombre, iniciales, status, abierto, onAlternar, onCerrar, onSalir }: Props) {
  const idMenu = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const opciones = opcionesDeAvatar({ status });

  useMenu(abierto, onCerrar, raiz, boton);

  function items(): HTMLElement[] {
    return Array.from(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (!abierto) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const lista = items();
    if (lista.length === 0) return;
    const i = lista.indexOf(document.activeElement as HTMLElement);
    const siguiente = e.key === 'ArrowDown' ? (i + 1) % lista.length : i <= 0 ? lista.length - 1 : i - 1;
    lista[siguiente]?.focus();
  }

  return (
    <div className="nav-item nav-item-avatar" ref={raiz} onKeyDown={alTeclear}>
      <button
        ref={boton}
        type="button"
        className="nav-avatar"
        aria-label={`Menú de ${nombre}`}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={idMenu}
        onClick={onAlternar}
      >
        {iniciales}
      </button>
      {abierto && (
        <div id={idMenu} role="menu" aria-label="Tu cuenta" className="nav-menu nav-avatar-menu">
          <div className="nav-avatar-cabecera" role="none">
            <span className="nav-avatar-iniciales" aria-hidden="true">{iniciales}</span>
            <span className="nav-avatar-nombre">{nombre}</span>
          </div>
          {opciones.map((o) => (
            <Link key={o.ruta} href={o.ruta} role="menuitem" className="nav-opcion nav-opcion-fila" onClick={onCerrar}>
              {o.titulo}
              {o.etiqueta && <span className="nav-etiqueta">{o.etiqueta}</span>}
            </Link>
          ))}
          <button type="button" role="menuitem" className="nav-opcion nav-opcion-fila nav-opcion-salir" onClick={onSalir}>
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
