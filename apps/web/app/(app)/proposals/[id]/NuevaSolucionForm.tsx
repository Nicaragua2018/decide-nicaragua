'use client';

import { useState } from 'react';
import { createSolucion } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export function NuevaSolucionForm({ proposalId }: { proposalId: string }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'solucion',
    accion: createSolucion.bind(null, proposalId),
    campos: ['title', 'description'],
    campoSugerencia: 'description',
    alUsarSugerencia: setDescription,
    alUsarTitulo: setTitle,
    reiniciar: false,
    alOk: () => {
      setTitle('');
      setDescription('');
    },
  });

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
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
      {aviso}
      <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>Proponer solución</button>
      {state && 'error' in state && <p role="alert" className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu solución quedó publicada.</p>}
    </form>
  );
}
