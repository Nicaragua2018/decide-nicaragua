'use client';

import { useState } from 'react';
import { MODERACION_CAUSAS } from '@decide/shared';
import { apelarPausa, llevarALaComunidad, pausarBifurcacion, pedirComision } from '@/lib/actions';
import { useAccion } from './useAccion';

function Aviso({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="alert alert-error mt-2">{msg}</p> : null;
}

export function VolverALaColmena({ grupoId, solucionId }: { grupoId: string; solucionId: string }) {
  const { pending, error, run } = useAccion();
  return (
    <div className="mt-2">
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => llevarALaComunidad(grupoId, solucionId))}>
        Llevar la solución a todo Nicaragua Decide
      </button>
      <Aviso msg={error} />
    </div>
  );
}

export function PedirComisionButton({ grupoId }: { grupoId: string }) {
  const { pending, error, run } = useAccion();
  return (
    <div className="mt-2">
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => pedirComision(grupoId))}>
        Pedir una comisión
      </button>
      <Aviso msg={error} />
    </div>
  );
}

export function PausarForm({ grupoId }: { grupoId: string }) {
  const { pending, error, run } = useAccion();
  const [causa, setCausa] = useState('');
  const [detalle, setDetalle] = useState('');
  return (
    <details className="mt-3">
      <summary className="text-sm">Pausar</summary>
      <form
        className="form mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => pausarBifurcacion(grupoId, causa, detalle));
        }}
      >
        <label className="form-label" htmlFor={`causa-${grupoId}`}>Causa</label>
        <select id={`causa-${grupoId}`} className="form-select" required value={causa} onChange={(e) => setCausa(e.target.value)}>
          <option value="" disabled>Elige una causa</option>
          {MODERACION_CAUSAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label className="form-label" htmlFor={`detalle-${grupoId}`}>Detalle (opcional)</label>
        <textarea id={`detalle-${grupoId}`} className="form-textarea" rows={2} maxLength={500} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        <button type="submit" className="btn btn-ghost btn-sm mt-2" disabled={pending || causa === ''}>Pausar</button>
        <Aviso msg={error} />
      </form>
    </details>
  );
}

export function ApelarForm({ grupoId }: { grupoId: string }) {
  const { pending, error, run } = useAccion();
  const [texto, setTexto] = useState('');
  return (
    <form
      className="form mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => apelarPausa(grupoId, texto));
      }}
    >
      <label className="form-label" htmlFor={`apelar-${grupoId}`}>Apelación (una sola vez)</label>
      <textarea id={`apelar-${grupoId}`} className="form-textarea" rows={3} minLength={10} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={pending}>Apelar</button>
      <Aviso msg={error} />
    </form>
  );
}
