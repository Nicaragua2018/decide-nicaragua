'use client';

import { useState } from 'react';
import { TEXTO_INVITACION } from '../portada/invitacion';

// El botón copia la invitación completa, con el enlace al sitio.
const SHARE_TEXT = TEXTO_INVITACION;

interface ShareButtonProps {
  variant?: 'nav' | 'hero' | 'light';
}

export function ShareButton({ variant = 'hero' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

  const base = 'ln-share-btn';
  const variantClass = variant !== 'hero' ? ` ln-share-btn--${variant}` : '';
  const copiedClass  = copied ? ' ln-share-btn--copied' : '';

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${base}${variantClass}${copiedClass}`}
      aria-label="Copiar la invitación con el enlace al sitio"
    >
      {copied ? '✓ Copiado' : '↗ Compartir'}
    </button>
  );
}
