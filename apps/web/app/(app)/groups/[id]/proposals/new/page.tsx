'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createProposal } from '@/lib/actions';

export default function NewProposalPage({
  params,
}: {
  params: { id: string };
}) {
  const [state, action, isPending] = useActionState(createProposal, null);

  return (
    <>
      <div className="page-header">
        <Link href={`/groups/${params.id}?tab=proposals`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        <h1 className="page-title mt-2">Nueva propuesta</h1>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <form action={action} className="form">
          <input type="hidden" name="groupId" value={params.id} />

          <div className="form-field">
            <label className="form-label" htmlFor="title">Título</label>
            <input id="title" name="title" required maxLength={200}
                   className="form-input" placeholder="Título claro y concreto" />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="body">Contenido</label>
            <textarea id="body" name="body" required className="form-textarea"
                      rows={8} placeholder="Describe la propuesta con detalle…" />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="status">Estado inicial</label>
            <select id="status" name="status" className="form-select">
              <option value="draft">Borrador (solo visible para ti)</option>
              <option value="open">Abierta (visible y activa para el grupo)</option>
            </select>
          </div>

          {'error' in (state ?? {}) && (
            <p className="form-error">{(state as { error: string }).error}</p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Creando…' : 'Crear propuesta'}
            </button>
            <Link href={`/groups/${params.id}?tab=proposals`} className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
