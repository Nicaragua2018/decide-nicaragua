'use client';

import { useActionState, useState, useTransition } from 'react';
import { hideContent, voteFrase, type ActionResult } from '@/lib/actions';
import type { FraseVotoValue } from '@decide/shared';

const OPCIONES: { value: FraseVotoValue; label: string; className: string }[] = [
  { value: 'de_acuerdo', label: 'De acuerdo', className: 'btn btn-primary btn-sm' },
  { value: 'en_desacuerdo', label: 'En desacuerdo', className: 'btn btn-ghost btn-sm' },
  { value: 'paso', label: 'Paso', className: 'btn btn-ghost btn-sm' },
];

export function VotarFrase({ fraseId, proposalId }: { fraseId: string; proposalId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function votar(value: FraseVotoValue) {
    setError(null);
    startTransition(async () => {
      const result = await voteFrase(fraseId, value, proposalId);
      if ('error' in result) setError(result.error);
    });
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {OPCIONES.map((o) => (
          <button
            key={o.value}
            type="button"
            className={o.className}
            disabled={pending}
            onClick={() => votar(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}

export function OcultarFrase({ fraseId, proposalId }: { fraseId: string; proposalId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(hideContent, null);
  if (!open) {
    return (
      <button type="button" className="comment-reply-btn" onClick={() => setOpen(true)}>
        Ocultar
      </button>
    );
  }
  return (
    <form action={action} className="comment-reply-form">
      <input type="hidden" name="target" value="frase" />
      <input type="hidden" name="targetId" value={fraseId} />
      <input type="hidden" name="topicId" value={proposalId} />
      <textarea
        name="reason"
        required
        minLength={10}
        maxLength={500}
        rows={2}
        className="form-textarea"
        placeholder="Motivo (obligatorio)"
      />
      <div className="comment-reply-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Ocultar</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}
