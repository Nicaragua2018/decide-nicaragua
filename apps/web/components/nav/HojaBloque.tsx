'use client';

import Link from 'next/link';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { BloqueNav } from '@/lib/navegacion';

interface Props {
  bloque: BloqueNav;
  onCerrar(): void;
}

/** Hoja que sube desde abajo en el celular con las opciones de un bloque. */
export default function HojaBloque({ bloque, onCerrar }: Props) {
  const hoja = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  // Al abrir, el foco entra en la hoja; Escape la cierra.
  useEffect(() => {
    hoja.current?.focus();
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') cerrarRef.current();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, []);

  // El foco se queda dentro de la hoja mientras está abierta.
  function alTabular(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const foco = Array.from(hoja.current?.querySelectorAll<HTMLElement>('a[href], button') ?? []);
    const primero = foco[0];
    const ultimo = foco[foco.length - 1];
    if (!primero || !ultimo) return;
    const actual = document.activeElement;
    if (e.shiftKey && (actual === primero || actual === hoja.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && actual === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div
        ref={hoja}
        className="hoja"
        role="dialog"
        aria-modal="true"
        aria-label={bloque.titulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={alTabular}
      >
        <h2 className="hoja-titulo">{bloque.titulo}</h2>
        <div className="hoja-lista">
          {bloque.opciones.map((o) => (
            <Link key={o.ruta} href={o.ruta} className="nav-opcion" onClick={onCerrar}>
              <span className="nav-opcion-titulo">{o.titulo}</span>
              <span className="nav-opcion-ayuda">{o.ayuda}</span>
            </Link>
          ))}
        </div>
        <button type="button" className="hoja-cerrar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
