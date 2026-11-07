'use client';

import { createInquietud } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export function NewInquietudForm({ groupId }: { groupId: string }) {
  const { formRef, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'inquietud',
    accion: createInquietud,
    campos: ['title', 'body'],
    campoSugerencia: 'body',
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      <input
        name="title"
        className="form-input"
        required
        minLength={10}
        maxLength={140}
        placeholder="¿Qué preocupa a tu comunidad? (título)"
      />
      <textarea
        name="body"
        className="form-textarea"
        rows={4}
        maxLength={2000}
        placeholder="Explícala con más detalle (opcional)"
      />
      {aviso}
      <button className="btn btn-primary" disabled={ocupado}>Plantear inquietud</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu inquietud fue planteada.</p>}
    </form>
  );
}
