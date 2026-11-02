'use client';

import { useActionState } from 'react';
import { createTopic, type ActionResult } from '@/lib/actions';

export function NewTopicForm({ groupId, forumId }: { groupId: string; forumId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createTopic, null);
  return (
    <form action={action} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="forumId" value={forumId} />
      <div className="form-field">
        <label className="form-label" htmlFor="topic-title">Título</label>
        <input id="topic-title" name="title" className="form-input" required minLength={5} maxLength={200} />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="topic-body">Tu mensaje</label>
        <textarea id="topic-body" name="body" className="form-textarea" rows={5} required minLength={10} maxLength={10000} />
      </div>
      <button className="btn btn-primary" disabled={pending}>Publicar tema</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tema publicado.</p>}
    </form>
  );
}
