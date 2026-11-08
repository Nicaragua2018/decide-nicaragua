'use client';

import { useState } from 'react';
import type { BaseSugerencia } from '@decide/shared';
import { SugerenciaAsistente } from '@/components/SugerenciaAsistente';
import { NuevaSolucionForm, type BorradorElegido } from './NuevaSolucionForm';

export interface BorradorItem {
  indice: number;
  titulo: string;
  descripcion: string;
  adoptado: boolean;
}

/** Borradores del asistente + el formulario de nueva solución, que se rellena al elegir uno. */
export function BorradoresSolucion({
  proposalId,
  borradores,
  base,
}: {
  proposalId: string;
  borradores: BorradorItem[];
  base: BaseSugerencia;
}) {
  const [elegido, setElegido] = useState<BorradorElegido | null>(null);

  function usar(b: BorradorItem) {
    setElegido({ indice: b.indice, titulo: b.titulo, descripcion: b.descripcion });
    document.getElementById('nueva-solucion')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <SugerenciaAsistente titulo="Borradores de solución" base={base}>
        {borradores.map((b) => (
          <div key={b.indice} className="comment-thread">
            <p className="font-medium">{b.titulo}</p>
            <p className="comment-body">{b.descripcion}</p>
            {b.adoptado ? (
              <p className="text-xs text-muted mt-1">Ya adoptado</p>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => usar(b)}>
                Usar este borrador
              </button>
            )}
          </div>
        ))}
      </SugerenciaAsistente>
      <NuevaSolucionForm key={elegido?.indice ?? 'vacio'} proposalId={proposalId} inicial={elegido} />
    </>
  );
}
