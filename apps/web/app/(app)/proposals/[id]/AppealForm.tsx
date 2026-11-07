'use client';

import { useActionState } from 'react';
import { appealModeration } from '@/lib/actions';
import type { ActionResult } from '@/lib/actions';

interface AppealFormProps {
  moderationId: string;
  topicId: string;
}

export function AppealForm({ moderationId, topicId }: AppealFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    appealModeration,
    null,
  );

  if (state && !('error' in state)) {
    return <p className="text-sm text-muted mt-1">Apelación enviada. Será revisada por los moderadores.</p>;
  }

  return (
    <form action={formAction} className="mt-1">
      <input type="hidden" name="moderationId" value={moderationId} />
      <input type="hidden" name="topicId"       value={topicId} />
      <div className="form-field">
        <textarea
          name="reason"
          required
          className="form-textarea"
          rows={2}
          placeholder="Explica por qué crees que esta ocultación fue incorrecta…"
        />
      </div>
      {state && 'error' in state && <p className="form-error">{state.error as string}</p>}
      <button type="submit" className="btn btn-ghost btn-sm mt-1" disabled={isPending}>
        {isPending ? 'Enviando…' : 'Apelar ocultación'}
      </button>
    </form>
  );
}
