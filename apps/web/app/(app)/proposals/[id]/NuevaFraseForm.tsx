'use client';

import { useState } from 'react';
import { createFrase } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export function NuevaFraseForm({ proposalId }: { proposalId: string }) {
  const [text, setText] = useState('');
  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'frase',
    accion: createFrase.bind(null, proposalId),
    campos: ['text'],
    campoSugerencia: 'text',
    alUsarSugerencia: setText,
    reiniciar: false,
    alOk: () => setText(''),
  });

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
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
      {aviso}
      <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>Publicar frase</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu frase quedó publicada.</p>}
    </form>
  );
}
