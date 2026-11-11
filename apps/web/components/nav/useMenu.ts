'use client';

import { useEffect, type RefObject } from 'react';

/** Mientras el menú está abierto: clic fuera cierra; Escape cierra y devuelve el foco al botón. */
export function useMenu(
  abierto: boolean,
  onCerrar: () => void,
  raiz: RefObject<HTMLElement | null>,
  boton: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) onCerrar();
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onCerrar();
      boton.current?.focus();
    };
    document.addEventListener('pointerdown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto, onCerrar, raiz, boton]);
}
