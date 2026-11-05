'use client';

import { useActionState, useEffect, useState } from 'react';
import { createFrase, type ActionResult } from '@/lib/actions';

export function NuevaFraseForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createFrase.bind(null, proposalId),
    null,
  );
  const [text, setText] = useState('');

  useEffect(() => {
    if (state && 'success' in state) setText('');
  }, [state]);

  return (
    <form action={action} className="form">
      <div className="form-field">
        <label className="form-label" htmlFor="frase-text">Escribe una frase</label>
        <textarea
          id="frase-text"
          name="text"
          className="form-textarea"
          rows={2}
          required
          minLength={10}
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-muted">{text.length}/140</p>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Publicar frase</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu frase quedó publicada.</p>}
    </form>
  );
}
