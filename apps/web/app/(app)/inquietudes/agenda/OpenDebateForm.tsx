'use client';

import { openDebate } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export interface AgendaItem {
  id: string;
  title: string;
  supportCount: number;
  threshold: number;
  deadline: string | null;
}

export function OpenDebateForm({ groupId, items }: { groupId: string; items: AgendaItem[] }) {
  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'tema',
    accion: openDebate,
    campos: ['title', 'body'],
    campoSugerencia: 'body',
    reiniciar: false,
  });
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      {items.map((q) => (
        <label key={q.id} className="flex gap-2 items-center">
          <input type="checkbox" name="inquietudIds" value={q.id} />
          <span>
            {q.title}
            <small className="text-muted">
              {' '}· {q.supportCount} apoyos de {q.threshold} necesarios
              {q.deadline ? ` · plazo ${q.deadline}` : ''}
            </small>
          </span>
        </label>
      ))}
      <input
        name="title"
        className="form-input"
        required
        minLength={10}
        maxLength={200}
        placeholder="Título del debate"
      />
      <textarea
        name="body"
        className="form-textarea"
        rows={4}
        required
        minLength={20}
        maxLength={10000}
        placeholder="Planteamiento del debate"
      />
      {aviso}
      <button className="btn btn-primary" disabled={ocupado}>Abrir debate con las inquietudes marcadas</button>
      <p className="text-xs text-muted">Marca una o varias inquietudes de esta comunidad.</p>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}
