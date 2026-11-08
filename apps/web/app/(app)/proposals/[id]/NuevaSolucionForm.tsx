'use client';

import { useState } from 'react';
import { createSolucion } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export interface BorradorElegido {
  indice: number;
  titulo: string;
  descripcion: string;
}

export function NuevaSolucionForm({
  proposalId,
  inicial = null,
}: {
  proposalId: string;
  /** Borrador del asistente que la persona eligió; puede cambiarlo antes de publicar. */
  inicial?: BorradorElegido | null;
}) {
  const [title, setTitle] = useState(inicial?.titulo ?? '');
  const [description, setDescription] = useState(inicial?.descripcion ?? '');
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
    <form id="nueva-solucion" ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
      {inicial && <input type="hidden" name="borrador" value={inicial.indice} />}
      <p className="text-sm font-medium">Proponer una solución</p>
      {inicial && <p className="card-meta">Parte de un borrador del asistente. Puedes cambiarlo antes de publicar.</p>}
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
