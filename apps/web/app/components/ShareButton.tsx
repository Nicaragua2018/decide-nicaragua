'use client';

import { useState } from 'react';

const SHARE_TEXT =
  'Puedes seguir las decisiones de la comunidad nicaragüense desde cualquier lugar del mundo: https://nicaraguadecide.org — Invitación a observadores y auditorías.';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: seleccionar texto de un input oculto
      const ta = document.createElement('textarea');
      ta.value = SHARE_TEXT;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`ln-share-btn${copied ? ' ln-share-btn--copied' : ''}`}
      aria-label="Copiar enlace de invitación"
    >
      {copied ? '✓ Enlace copiado' : '↗ Compartir enlace'}
    </button>
  );
}
