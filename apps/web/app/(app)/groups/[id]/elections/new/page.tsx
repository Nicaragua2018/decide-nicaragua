'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createElection } from '@/lib/actions';

export default function NewElectionPage({
  params,
}: {
  params: { id: string };
}) {
  const [state, action, isPending] = useActionState(createElection, null);
  const [numCandidates, setNumCandidates] = useState(3);

  return (
    <>
      <div className="page-header">
        <Link href={`/groups/${params.id}?tab=elections`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        <h1 className="page-title mt-2">Nueva elección Condorcet</h1>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <form action={action} className="form">
          <input type="hidden" name="groupId" value={params.id} />

          <div className="form-field">
            <label className="form-label" htmlFor="title">Título</label>
            <input id="title" name="title" required maxLength={200}
                   className="form-input" />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="description">Descripción <span className="text-muted">(opcional)</span></label>
            <textarea id="description" name="description" className="form-textarea" rows={3} />
          </div>

          <div className="flex gap-4">
            <div className="form-field" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="startsAt">Inicia</label>
              <input id="startsAt" name="startsAt" type="datetime-local" required
                     className="form-input" />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="endsAt">Termina</label>
              <input id="endsAt" name="endsAt" type="datetime-local" required
                     className="form-input" />
            </div>
          </div>

          {/* Candidatos dinámicos */}
          <div>
            <p className="form-label mb-2">
              Candidatos ({numCandidates} mínimo 2)
            </p>
            {Array.from({ length: numCandidates }).map((_, i) => (
              <div key={i} className="form-field" style={{ marginBottom: '0.5rem' }}>
                <label className="form-label text-xs">Candidato {i + 1}</label>
                <input name={`candidate_title_${i}`} required maxLength={200}
                       className="form-input"
                       placeholder={`Nombre del candidato ${i + 1}`} />
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => setNumCandidates((n) => n + 1)}>
                + Añadir candidato
              </button>
              {numCandidates > 2 && (
                <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setNumCandidates((n) => n - 1)}>
                  – Quitar último
                </button>
              )}
            </div>
          </div>

          {'error' in (state ?? {}) && (
            <p className="form-error">{(state as { error: string }).error}</p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Creando…' : 'Crear elección'}
            </button>
            <Link href={`/groups/${params.id}?tab=elections`} className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
