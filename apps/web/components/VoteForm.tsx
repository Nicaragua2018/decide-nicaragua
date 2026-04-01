'use client';

import { useActionState } from 'react';
import { castVote } from '@/lib/actions';
import type { CandidateSummary } from '@decide/shared';

interface VoteFormProps {
  electionId: string;
  candidates: CandidateSummary[];
}

export default function VoteForm({ electionId, candidates }: VoteFormProps) {
  const [state, action, isPending] = useActionState(castVote, null);

  return (
    <form action={action} className="form">
      <input type="hidden" name="electionId" value={electionId} />

      <p className="text-sm text-muted">
        Asigna un número de preferencia a cada opción (1 = primera preferencia).
        Puedes omitir candidatos — irán al último lugar.
      </p>

      {candidates.map((c) => (
        <div key={c.id} className="vote-candidate">
          <div style={{ flex: 1 }}>
            <p className="font-medium">{c.title}</p>
            {c.description && <p className="text-sm text-muted">{c.description}</p>}
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label className="text-xs text-muted">Preferencia</label>
            <input
              type="number"
              name={`rank_${c.id}`}
              min={1}
              max={candidates.length}
              className="form-input vote-rank-input"
              placeholder="—"
            />
          </div>
        </div>
      ))}

      {'error' in (state ?? {}) && (
        <p className="form-error">{(state as { error: string }).error}</p>
      )}
      {'success' in (state ?? {}) && (
        <p className="alert alert-success">Voto registrado correctamente.</p>
      )}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? 'Enviando voto…' : 'Emitir voto'}
      </button>
    </form>
  );
}
