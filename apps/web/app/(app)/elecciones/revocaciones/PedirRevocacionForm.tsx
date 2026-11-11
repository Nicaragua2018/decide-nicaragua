'use client';

import { useMemo, useState } from 'react';
import { CARGO_ETIQUETA, MOTIVO_REVOCACION_MAX, type CargoTipoValue } from '@decide/shared';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';
import { pedirRevocacion } from '@/lib/actions';

export type CargoPedible = { cargoId: string; tipo: CargoTipoValue; nombre: string; comunidad: string | null };

const MOTIVO_MIN = 10;

export function PedirRevocacionForm({ cargos }: { cargos: CargoPedible[] }) {
  const [cargoId, setCargoId] = useState('');
  const [motivo, setMotivo] = useState('');
  const accion = useMemo(() => pedirRevocacion.bind(null, cargoId), [cargoId]);

  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'revocacion',
    accion,
    campos: ['motivo'],
    campoSugerencia: 'motivo',
    alUsarSugerencia: (t) => setMotivo(t.trim().slice(0, MOTIVO_REVOCACION_MAX)),
    reiniciar: false,
    alVaciar: () => {
      setMotivo('');
      setCargoId('');
    },
  });

  if (cargos.length === 0) {
    return <p className="el-nota">Ahora no hay cargos para los que se pueda pedir una revocación.</p>;
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="form el-form">
      <div className="form-field">
        <label htmlFor="rev-cargo" className="form-label">¿De qué cargo?</label>
        <select
          id="rev-cargo"
          className="form-input"
          style={{ minHeight: 44 }}
          required
          value={cargoId}
          onChange={(e) => setCargoId(e.target.value)}
        >
          <option value="">Elige un cargo</option>
          {cargos.map((c) => (
            <option key={c.cargoId} value={c.cargoId}>
              {c.nombre} · {CARGO_ETIQUETA[c.tipo]}{c.comunidad ? ` (${c.comunidad})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="rev-motivo" className="form-label">¿Por qué lo pides? (mínimo {MOTIVO_MIN} caracteres)</label>
        <textarea
          id="rev-motivo"
          name="motivo"
          className="form-textarea"
          required
          minLength={MOTIVO_MIN}
          maxLength={MOTIVO_REVOCACION_MAX}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-describedby="rev-motivo-cuenta"
        />
        <span id="rev-motivo-cuenta" className="form-hint">
          {motivo.length} de {MOTIVO_REVOCACION_MAX} caracteres
        </span>
      </div>

      {aviso}
      {state && 'error' in state && (
        <p role="alert" className="alert alert-error">{state.error}</p>
      )}
      {state && 'success' in state && (
        <p role="status" className="alert alert-success">Tu pedido quedó abierto. Ya se puede apoyar.</p>
      )}

      <div>
        <button type="submit" className="el-btn el-btn-primario" style={{ minHeight: 44 }} disabled={ocupado || cargoId === ''}>
          Pedir la revocación
        </button>
      </div>
    </form>
  );
}
