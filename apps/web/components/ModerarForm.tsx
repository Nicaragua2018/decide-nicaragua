'use client';

import { useActionState, useState } from 'react';
import { MODERACION_CAUSAS } from '@decide/shared';
import { hideContent, type ActionResult } from '@/lib/actions';

type Objetivo = 'tema' | 'respuesta' | 'inquietud' | 'frase' | 'solucion' | 'informe';

const MENSAJE_ESTADO: Record<string, string> = {
  oculto: 'Contenido ocultado.',
  provisional:
    'Ocultado de forma provisional: otra persona de la mesa debe confirmarlo en 48 horas o vuelve a mostrarse.',
  pendiente:
    'Solicitud registrada: el contenido sigue visible hasta que otra persona de la mesa la confirme (7 días).',
};

/**
 * Formulario único para ocultar contenido: causa cerrada + detalle opcional.
 * `colapsable` muestra primero solo un botón «Ocultar».
 */
export function ModerarForm({
  target,
  targetId,
  topicId,
  inquietudId,
  grupoId,
  titulo,
  boton = 'Ocultar',
  colapsable = false,
  className = 'form',
}: {
  target: Objetivo;
  targetId: string;
  topicId?: string;
  inquietudId?: string;
  grupoId?: string;
  titulo?: string;
  boton?: string;
  colapsable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(!colapsable);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(hideContent, null);

  if (!open) {
    return (
      <button type="button" className="comment-reply-btn" onClick={() => setOpen(true)}>
        {boton}
      </button>
    );
  }

  return (
    <form action={action} className={className}>
      {titulo && <p className="card-title">{titulo}</p>}
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="targetId" value={targetId} />
      {topicId && <input type="hidden" name="topicId" value={topicId} />}
      {inquietudId && <input type="hidden" name="inquietudId" value={inquietudId} />}
      {grupoId && <input type="hidden" name="grupoId" value={grupoId} />}
      <label className="form-label" htmlFor={`causa-${targetId}`}>Causa</label>
      <select id={`causa-${targetId}`} name="causa" className="form-select" required defaultValue="">
        <option value="" disabled>Elige una causa</option>
        {MODERACION_CAUSAS.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      <label className="form-label" htmlFor={`detalle-${targetId}`}>Detalle (opcional)</label>
      <textarea
        id={`detalle-${targetId}`}
        name="reason"
        className="form-textarea"
        rows={2}
        maxLength={500}
      />
      <p className="text-xs text-muted">No escribas aquí datos de la persona.</p>
      <div className="comment-reply-actions">
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>{boton}</button>
        {colapsable && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancelar</button>
        )}
      </div>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && (
        <p className="alert alert-success">{MENSAJE_ESTADO[state.estado ?? 'oculto'] ?? MENSAJE_ESTADO['oculto']}</p>
      )}
    </form>
  );
}
