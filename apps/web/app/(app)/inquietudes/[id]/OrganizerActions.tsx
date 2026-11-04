'use client';

import { useActionState } from 'react';
import type { InquietudStatusValue } from '@decide/shared';
import { hideContent, respondInquietud, type ActionResult } from '@/lib/actions';

/** Solo una inquietud abierta o en plazo admite respuesta (igual que en la API). */
const RESPONDIBLES: readonly InquietudStatusValue[] = ['abierta', 'en_plazo'];

export function OrganizerActions({
  inquietudId,
  status,
}: {
  inquietudId: string;
  status: InquietudStatusValue;
}) {
  const canRespond = RESPONDIBLES.includes(status);
  const [respState, respAction, responding] = useActionState<ActionResult | null, FormData>(respondInquietud, null);
  const [hideState, hideAction, hiding] = useActionState<ActionResult | null, FormData>(hideContent, null);

  return (
    <div className="card mb-4">
      {canRespond && (
        <form action={respAction} className="form mb-3">
          <p className="card-title">Responder en público</p>
          <input type="hidden" name="inquietudId" value={inquietudId} />
          <textarea
            name="text"
            className="form-textarea"
            rows={4}
            required
            minLength={50}
            maxLength={2000}
            placeholder="Respuesta pública a la comunidad (mínimo 50 caracteres)"
          />
          <button className="btn btn-primary btn-sm" disabled={responding}>Publicar respuesta</button>
          {respState && 'error' in respState && <p className="alert alert-error">{respState.error}</p>}
          {respState && 'success' in respState && <p className="alert alert-success">Respuesta publicada.</p>}
        </form>
      )}

      <form action={hideAction} className="form">
        <p className="card-title">Ocultar inquietud</p>
        <input type="hidden" name="target" value="inquietud" />
        <input type="hidden" name="targetId" value={inquietudId} />
        <input type="hidden" name="inquietudId" value={inquietudId} />
        <textarea
          name="reason"
          className="form-textarea"
          rows={2}
          required
          minLength={10}
          maxLength={500}
          placeholder="Motivo (obligatorio)"
        />
        <button className="btn btn-ghost btn-sm" disabled={hiding}>Ocultar inquietud</button>
        {hideState && 'error' in hideState && <p className="alert alert-error">{hideState.error}</p>}
      </form>
    </div>
  );
}
