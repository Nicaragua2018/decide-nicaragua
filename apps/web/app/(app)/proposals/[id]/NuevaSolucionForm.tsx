'use client';

import { useActionState, useEffect, useState } from 'react';
import { createSolucion, type ActionResult } from '@/lib/actions';

export function NuevaSolucionForm({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createSolucion.bind(null, proposalId),
    null,
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (state && 'success' in state) {
      setTitle('');
      setDescription('');
    }
  }, [state]);

  return (
    <form action={action} className="form">
      <p className="text-sm font-medium">Proponer una solución</p>
      <div className="form-field">
        <label className="form-label" htmlFor="solucion-title">Título</label>
        <input
          id="solucion-title"
          name="title"
          className="form-input"
          required
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="solucion-description">Descripción</label>
        <textarea
          id="solucion-description"
          name="description"
          className="form-textarea"
          rows={3}
          required
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Proponer solución</button>
      {state && 'error' in state && <p role="alert" className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu solución quedó publicada.</p>}
    </form>
  );
}
