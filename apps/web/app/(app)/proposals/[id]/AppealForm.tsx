'use client';

import { useActionState } from 'react';
import { appealModeration, type ActionResult } from '@/lib/actions';

export function AppealForm({ moderationId, topicId }: { moderationId: string; topicId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(appealModeration, null);

  if (state && 'success' in state) {
    return <p className="alert alert-success">Tu apelación llegó a la mesa directiva.</p>;
  }

  return (
    <form action={action} className="form">
      <input type="hidden" name="moderationId" value={moderationId} />
      <input type="hidden" name="topicId" value={topicId} />
      <textarea
        name="text"
        className="form-textarea"
        rows={3}
        required
        minLength={10}
        maxLength={1000}
        placeholder="Explica por qué crees que no debió ocultarse"
      />
      <button className="btn btn-primary btn-sm" disabled={pending}>Apelar</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}
