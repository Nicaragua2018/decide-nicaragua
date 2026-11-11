'use client';

import { useMemo, useState } from 'react';
import { OBSERVACION_MAX } from '@decide/shared';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';
import { dejarObservacion } from '@/lib/actions';

const TEXTO_MIN = 10;

/** «Dejar una observación pública» sobre un evento del registro; pasa por la revisión previa. */
export function ObservacionForm({ auditEventId }: { auditEventId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const accion = useMemo(() => dejarObservacion.bind(null, auditEventId), [auditEventId]);

  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'observacion',
    accion,
    campos: ['texto'],
    campoSugerencia: 'texto',
    alUsarSugerencia: (t) => setTexto(t.trim().slice(0, OBSERVACION_MAX)),
    reiniciar: false,
    alVaciar: () => setTexto(''),
  });

  if (!abierto) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(true)}>
        Dejar una observación pública
      </button>
    );
  }

  const idTexto = `obs-${auditEventId}`;
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
      <div className="form-field">
        <label htmlFor={idTexto} className="form-label">
          Tu observación (se publica con tu nombre; mínimo {TEXTO_MIN} caracteres)
        </label>
        <textarea
          id={idTexto}
          name="texto"
          className="form-textarea"
          required
          minLength={TEXTO_MIN}
          maxLength={OBSERVACION_MAX}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <span className="form-hint">{texto.length} de {OBSERVACION_MAX} caracteres</span>
      </div>
      {aviso}
      {state && 'error' in state && <p role="alert" className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p role="status" className="alert alert-success">Tu observación quedó publicada.</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>Publicar la observación</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(false)}>Cerrar</button>
      </div>
    </form>
  );
}
