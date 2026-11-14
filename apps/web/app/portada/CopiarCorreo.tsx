'use client';

import { useState } from 'react';
import s from './secciones.module.css';

// El enlace «mailto:» solo funciona si la computadora tiene un programa de
// correo configurado. Este botón copia la dirección para pegarla en Gmail,
// Outlook web o donde sea.
export function CopiarCorreo({ correo }: { correo: string }) {
  const [estado, setEstado] = useState<'listo' | 'copiado' | 'error'>('listo');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(correo);
      setEstado('copiado');
    } catch {
      setEstado('error');
    }
    setTimeout(() => setEstado('listo'), 2500);
  }

  return (
    <button type="button" onClick={copiar} className={`${s.botonPrincipal} ${s.botonCopiar}`}>
      <span aria-live="polite">
        {estado === 'copiado' ? '¡Copiado!' : estado === 'error' ? `Copia: ${correo}` : 'Copiar correo'}
      </span>
    </button>
  );
}
