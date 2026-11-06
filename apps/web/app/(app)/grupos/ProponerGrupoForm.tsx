'use client';

import { useActionState, useEffect, useState } from 'react';
import { proponerGrupo, type ActionResult } from '@/lib/actions';

export interface AmbitoOpcion {
  id: string;
  name: string;
  minimo: number;
}

export function ProponerGrupoForm({ ambitos }: { ambitos: AmbitoOpcion[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(proponerGrupo, null);
  const [ambitoId, setAmbitoId] = useState(ambitos[0]?.id ?? '');
  const [name, setName] = useState('');
  const [proposito, setProposito] = useState('');

  useEffect(() => {
    if (state && 'success' in state) {
      setName('');
      setProposito('');
    }
  }, [state]);

  const minimo = ambitos.find((a) => a.id === ambitoId)?.minimo ?? 5;

  return (
    <form action={action} className="form card mt-4">
      <p className="card-title">Proponer un grupo de trabajo</p>
      <div className="form-field">
        <label className="form-label" htmlFor="grupo-ambito">Comunidad</label>
        <select
          id="grupo-ambito"
          name="ambitoId"
          className="form-input"
          value={ambitoId}
          onChange={(e) => setAmbitoId(e.target.value)}
        >
          {ambitos.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="grupo-name">Nombre</label>
        <input
          id="grupo-name"
          name="name"
          className="form-input"
          required
          minLength={5}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="grupo-proposito">Propósito</label>
        <textarea
          id="grupo-proposito"
          name="proposito"
          className="form-textarea"
          rows={3}
          required
          minLength={20}
          maxLength={1000}
          value={proposito}
          onChange={(e) => setProposito(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted">Nace solo cuando se suman {minimo} personas</p>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Proponer grupo</button>
      {state && 'error' in state && <p role="alert" className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu grupo quedó propuesto.</p>}
    </form>
  );
}
