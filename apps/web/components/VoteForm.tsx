'use client';

import { useState, useTransition } from 'react';
import { castVote } from '@/lib/actions';
import type { CandidateSummary } from '@decide/shared';

interface VoteFormProps {
  electionId: string;
  candidates: CandidateSummary[];
  existingRankings?: Array<{ candidateId: string; rank: number }>;
}

export default function VoteForm({ electionId, candidates, existingRankings }: VoteFormProps) {
  const sorted = existingRankings && existingRankings.length > 0
    ? [...candidates].sort((a, b) => {
        const ra = existingRankings.find((r) => r.candidateId === a.id)?.rank ?? 999;
        const rb = existingRankings.find((r) => r.candidateId === b.id)?.rank ?? 999;
        return ra - rb;
      })
    : [...candidates].sort((a, b) => a.position - b.position);

  const [order, setOrder]     = useState<CandidateSummary[]>(sorted);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [isPending, start]    = useTransition();

  function move(idx: number, dir: -1 | 1) {
    const next = [...order];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setOrder(next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set('electionId', electionId);
    order.forEach((c, i) => fd.set(`rank_${c.id}`, String(i + 1)));

    start(async () => {
      const result = await castVote(null, fd);
      if (result && 'error' in result) setError(result.error as string);
      else setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="alert alert-success">
        ✓ Voto registrado correctamente. Tu ranking ha sido guardado.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <p className="text-sm text-muted mb-3">
        Ordena los candidatos según tu preferencia. El primero de la lista es tu candidato favorito.
        Usa las flechas ↑ ↓ para reordenar.
      </p>

      <div className="rank-list">
        {order.map((c, i) => (
          <div key={c.id} className="rank-item">
            <span className="rank-num">{i + 1}</span>
            <div className="rank-info">
              <p className="font-medium">{c.title}</p>
              {c.description && <p className="text-sm text-muted">{c.description}</p>}
            </div>
            <div className="rank-controls">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="rank-arrow"
                aria-label="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                className="rank-arrow"
                aria-label="Bajar"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}

      <button type="submit" className="btn btn-primary mt-4" disabled={isPending}>
        {isPending ? 'Enviando voto…' : existingRankings ? 'Actualizar voto' : 'Emitir voto'}
      </button>
    </form>
  );
}
