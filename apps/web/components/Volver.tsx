import Link from 'next/link';
import type { ReactNode } from 'react';

/** Enlace para regresar a la vista anterior o al inicio: flecha azul en una pastilla, fácil de ver y de tocar. */
export function Volver({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="volver">
      <svg className="volver-flecha" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </Link>
  );
}
