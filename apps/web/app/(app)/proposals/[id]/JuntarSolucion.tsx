'use client';

import { useState, useTransition } from 'react';
import { mergeSolucion } from '@/lib/actions';

export function JuntarSolucion({
  solucionId,
  proposalId,
  opciones,
}: {
  solucionId: string;
  proposalId: string;
  opciones: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [intoId, setIntoId] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (opciones.length === 0) return null;
  if (!open) {
    return (
      <button type="button" className="comment-reply-btn" onClick={() => setOpen(true)}>
        Juntar con otra
      </button>
    );
  }

  function juntar() {
    setError(null);
    startTransition(async () => {
      const r = await mergeSolucion(solucionId, intoId, proposalId);
      if ('error' in r) setError(r.error);
      else setOpen(false);
    });
  }

  return (
    <div className="comment-reply-form">
      <label className="form-label" htmlFor={`juntar-${solucionId}`}>Juntar con</label>
      <select
        id={`juntar-${solucionId}`}
        className="form-select"
        value={intoId}
        onChange={(e) => setIntoId(e.target.value)}
      >
        <option value="">Elige una solución</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.title}</option>
        ))}
      </select>
      <div className="comment-reply-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={pending || !intoId} onClick={juntar}>
          Juntar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
    </div>
  );
}
