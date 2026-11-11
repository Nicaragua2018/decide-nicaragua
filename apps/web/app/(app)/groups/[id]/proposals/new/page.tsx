'use client';

import Link from 'next/link';
import { use } from 'react';
import { createProposal } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';
import { Volver } from '@/components/Volver';

export default function NewProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { formRef, formAction, onSubmit, state, ocupado: isPending, aviso } = useFormConRevision({
    tipo: 'tema',
    accion: createProposal,
    campos: ['title', 'body'],
    campoSugerencia: 'body',
    reiniciar: false,
  });

  return (
    <>
      <div className="page-header">
        <Volver href={`/groups/${id}?tab=proposals`}>Volver al grupo</Volver>
        <h1 className="page-title mt-2">Nueva propuesta</h1>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <form ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
          <input type="hidden" name="groupId" value={id} />

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

          {state && 'error' in state && (
            <p className="form-error">{state.error}</p>
          )}

          {aviso}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Creando…' : 'Crear propuesta'}
            </button>
            <Link href={`/groups/${id}?tab=proposals`} className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
