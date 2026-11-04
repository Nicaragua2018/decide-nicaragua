'use client';

import { useActionState } from 'react';
import { createInquietud, type ActionResult } from '@/lib/actions';

export function NewInquietudForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createInquietud, null);
  return (
    <form action={action} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      <input
        name="title"
        className="form-input"
        required
        minLength={10}
        maxLength={140}
        placeholder="¿Qué preocupa a tu comunidad? (título)"
      />
      <textarea
        name="body"
        className="form-textarea"
        rows={4}
        maxLength={2000}
        placeholder="Explícala con más detalle (opcional)"
      />
      <button className="btn btn-primary" disabled={pending}>Plantear inquietud</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu inquietud fue planteada.</p>}
    </form>
  );
}
