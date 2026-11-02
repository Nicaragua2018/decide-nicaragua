'use client';

import { useActionState } from 'react';
import { createForum, type ActionResult } from '@/lib/actions';

export function NewForumForm({ communities }: { communities: { groupId: string; groupName: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createForum, null);
  return (
    <form action={action} className="form">
      <select name="groupId" className="form-select" required>
        <option value="">— Comunidad —</option>
        {communities.map((c) => (
          <option key={c.groupId} value={c.groupId}>{c.groupName}</option>
        ))}
      </select>
      <input name="title" className="form-input" required minLength={3} maxLength={120} placeholder="Título del foro" />
      <textarea name="description" className="form-textarea" rows={2} maxLength={500} placeholder="Descripción (opcional)" />
      <button className="btn btn-primary" disabled={pending}>Crear foro</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Foro creado.</p>}
    </form>
  );
}
