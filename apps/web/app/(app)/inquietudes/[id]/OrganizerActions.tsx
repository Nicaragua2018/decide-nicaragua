'use client';

import type { InquietudStatusValue } from '@decide/shared';
import { respondInquietud } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';
import { ModerarForm } from '@/components/ModerarForm';

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
  const { formRef, onSubmit, state: respState, ocupado: responding, aviso } = useFormConRevision({
    tipo: 'respuesta_inquietud',
    accion: respondInquietud,
    campos: ['text'],
    campoSugerencia: 'text',
  });

  return (
    <div className="card mb-4">
      {canRespond && (
        <form ref={formRef} onSubmit={onSubmit} className="form mb-3">
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
          {aviso}
          <button className="btn btn-primary btn-sm" disabled={responding}>Publicar respuesta</button>
          {respState && 'error' in respState && <p className="alert alert-error">{respState.error}</p>}
          {respState && 'success' in respState && <p className="alert alert-success">Respuesta publicada.</p>}
        </form>
      )}

      <ModerarForm target="inquietud" targetId={inquietudId} inquietudId={inquietudId} titulo="Ocultar inquietud" boton="Ocultar inquietud" />
    </div>
  );
}
