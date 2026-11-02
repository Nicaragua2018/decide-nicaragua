'use client';

import Link from 'next/link';
import { use, useActionState, useState } from 'react';
import { createElection } from '@/lib/actions';

export default function NewElectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [state, action, isPending] = useActionState(createElection, null);
  const [numCandidates, setNumCandidates] = useState(3);
  const [dateError, setDateError] = useState<string | null>(null);

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const form = e.currentTarget.closest('form') as HTMLFormElement | null;
    if (!form) return;
    const starts = (form.elements.namedItem('startsAt') as HTMLInputElement)?.value;
    const ends   = (form.elements.namedItem('endsAt')   as HTMLInputElement)?.value;
    if (starts && ends && starts >= ends) {
      setDateError('La fecha de inicio debe ser anterior a la fecha de cierre.');
    } else {
      setDateError(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <Link href={`/groups/${id}?tab=elections`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        <h1 className="page-title mt-2">Nueva elección Condorcet</h1>
        <p className="page-sub">
          Los miembros ordenarán los candidatos por preferencia. El método Condorcet-Schulze
          elige al candidato que ganaría en cada comparación directa.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 680 }}>
        <form action={action} className="form">
          <input type="hidden" name="groupId" value={id} />

          <div className="form-field">
            <label className="form-label" htmlFor="title">Título</label>
            <input
              id="title" name="title" required maxLength={200}
              className="form-input"
              placeholder="Ej: Elección del comité coordinador"
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="description">
              Descripción <span className="text-muted">(opcional)</span>
            </label>
            <textarea
              id="description" name="description"
              className="form-textarea" rows={3}
              placeholder="Contexto de la elección, criterios de elegibilidad…"
            />
          </div>

          <div className="flex gap-4">
            <div className="form-field" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="startsAt">Inicio de votación</label>
              <input
                id="startsAt" name="startsAt" type="datetime-local" required
                className="form-input" onChange={handleDateChange}
              />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="endsAt">Cierre de votación</label>
              <input
                id="endsAt" name="endsAt" type="datetime-local" required
                className="form-input" onChange={handleDateChange}
              />
            </div>
          </div>
          {dateError && <p className="form-error">{dateError}</p>}

          {/* Candidatos dinámicos con título + descripción */}
          <div>
            <p className="form-label mb-1">Candidatos ({numCandidates})</p>
            <p className="text-xs text-muted mb-3">Mínimo 2. La descripción es opcional pero ayuda a los votantes.</p>
            <div className="candidate-form-list">
              {Array.from({ length: numCandidates }).map((_, i) => (
                <div key={i} className="candidate-form-item">
                  <span className="candidate-form-num">{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <input
                      name={`candidate_title_${i}`}
                      required
                      maxLength={200}
                      className="form-input"
                      placeholder={`Nombre del candidato ${i + 1}`}
                    />
                    <input
                      name={`candidate_description_${i}`}
                      maxLength={300}
                      className="form-input mt-1"
                      placeholder="Breve descripción (opcional)"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setNumCandidates((n) => n + 1)}
              >
                + Añadir candidato
              </button>
              {numCandidates > 2 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setNumCandidates((n) => n - 1)}
                >
                  – Quitar último
                </button>
              )}
            </div>
          </div>

          {'error' in (state ?? {}) && (
            <p className="form-error">{(state as { error: string }).error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending || !!dateError}
            >
              {isPending ? 'Creando…' : 'Crear elección'}
            </button>
            <Link href={`/groups/${id}?tab=elections`} className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
