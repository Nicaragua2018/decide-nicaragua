'use client';

import type { BaseSugerencia } from '@decide/shared';
import { SugerenciaAsistente } from '@/components/SugerenciaAsistente';
import { useUsarBorrador } from './NuevaSolucionForm';

export interface BorradorItem {
  indice: number;
  titulo: string;
  descripcion: string;
  adoptado: boolean;
}

/** Borradores del asistente. «Usar este borrador» rellena el formulario (pregunta si ya hay texto). */
export function BorradoresSolucion({ borradores, base }: { borradores: BorradorItem[]; base: BaseSugerencia }) {
  const usar = useUsarBorrador();
  return (
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
  );
}
