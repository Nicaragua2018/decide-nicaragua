'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createDraw } from '@/lib/actions';

export default function NewSortitionPage({
  params,
}: {
  params: { id: string };
}) {
  const [state, action, isPending] = useActionState(createDraw, null);

  return (
    <>
      <div className="page-header">
        <Link href={`/groups/${params.id}?tab=sortition`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        <h1 className="page-title mt-2">Nuevo sorteo verificable</h1>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <p className="text-sm text-muted mb-4">
          El sorteo usa Fisher-Yates con SHA-256 como PRNG determinista.
          La semilla pública y el pool de perfiles quedan almacenados para verificación independiente.
        </p>

        <form action={action} className="form">
          <input type="hidden" name="groupId" value={params.id} />

          <div className="form-field">
            <label className="form-label" htmlFor="title">Título</label>
            <input id="title" name="title" required maxLength={200}
                   className="form-input" placeholder="Ej: Selección de delegados" />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="description">
              Descripción <span className="text-muted">(opcional)</span>
            </label>
            <textarea id="description" name="description" className="form-textarea" rows={3} />
          </div>

          <div className="form-field" style={{ maxWidth: 160 }}>
            <label className="form-label" htmlFor="selectionSize">Número a seleccionar</label>
            <input id="selectionSize" name="selectionSize" type="number"
                   required min={1} max={100} defaultValue={5}
                   className="form-input" />
          </div>

          {'error' in (state ?? {}) && (
            <p className="form-error">{(state as { error: string }).error}</p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Creando…' : 'Crear sorteo'}
            </button>
            <Link href={`/groups/${params.id}?tab=sortition`} className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
