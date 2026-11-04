'use client';

import { useActionState } from 'react';
import { openDebate, type ActionResult } from '@/lib/actions';

export interface AgendaItem {
  id: string;
  title: string;
  supportCount: number;
  threshold: number;
  deadline: string | null;
}

export function OpenDebateForm({ groupId, items }: { groupId: string; items: AgendaItem[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(openDebate, null);
  return (
    <form action={action} className="form">
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
      <button className="btn btn-primary" disabled={pending}>Abrir debate con las inquietudes marcadas</button>
      <p className="text-xs text-muted">Marca una o varias inquietudes de esta comunidad.</p>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}
