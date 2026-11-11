'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';
import type { BloqueId, BloqueNav } from '@/lib/navegacion';
import HojaBloque from './HojaBloque';

interface Props {
  bloques: BloqueNav[];
  activo: BloqueId | null;
  /** Se llama al abrir una hoja, para cerrar cualquier menú de escritorio. */
  onAbrir?(): void;
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ICONOS: Record<BloqueId, ReactNode> = {
  participar: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...trazo} aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  comunidad: <Sacuanjoche variante="contorno" tamano={22} />,
  transparencia: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...trazo} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
};

export default function BarraInferior({ bloques, activo, onAbrir }: Props) {
  const [hoja, setHoja] = useState<BloqueId | null>(null);
  const botones = useRef<Partial<Record<BloqueId, HTMLButtonElement | null>>>({});

  const cerrar = useCallback(() => {
    setHoja(null);
  }, []);

  // Al cerrar la hoja, el foco vuelve al botón que la abrió.
  const cerrarYEnfocar = useCallback(
    (id: BloqueId) => {
      cerrar();
      botones.current[id]?.focus();
    },
    [cerrar],
  );

  const bloqueAbierto = bloques.find((b) => b.id === hoja) ?? null;

  return (
    <>
      <nav aria-label="Secciones" className="barra-inferior">
        {bloques.map((b) => (
          <button
            key={b.id}
            ref={(el) => {
              botones.current[b.id] = el;
            }}
            type="button"
            className={`barra-tab${activo === b.id ? ' barra-tab-activo' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={hoja === b.id}
            onClick={() => {
              onAbrir?.();
              setHoja(b.id);
            }}
          >
            {ICONOS[b.id]}
            <span>{b.titulo}</span>
          </button>
        ))}
      </nav>
      {bloqueAbierto && <HojaBloque bloque={bloqueAbierto} onCerrar={() => cerrarYEnfocar(bloqueAbierto.id)} />}
    </>
  );
}
