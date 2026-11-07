'use client';

import { useState } from 'react';
import { proponerGrupo } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export interface AmbitoOpcion {
  id: string;
  name: string;
  minimo: number;
}

export function ProponerGrupoForm({ ambitos }: { ambitos: AmbitoOpcion[] }) {
  const [ambitoId, setAmbitoId] = useState(ambitos[0]?.id ?? '');
  const [name, setName] = useState('');
  const [proposito, setProposito] = useState('');
  const { formRef, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'subgrupo',
    accion: proponerGrupo,
    campos: ['name', 'proposito'],
    campoSugerencia: 'proposito',
    alUsarSugerencia: setProposito,
    reiniciar: false,
    alOk: () => {
      setName('');
      setProposito('');
    },
  });

  const minimo = ambitos.find((a) => a.id === ambitoId)?.minimo ?? 5;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="form card mt-4">
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
      {aviso}
      <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>Proponer grupo</button>
      {state && 'error' in state && <p role="alert" className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu grupo quedó propuesto.</p>}
    </form>
  );
}
