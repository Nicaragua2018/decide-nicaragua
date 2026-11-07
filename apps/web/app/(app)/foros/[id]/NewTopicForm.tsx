'use client';

import { createTopic } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export function NewTopicForm({ groupId, forumId }: { groupId: string; forumId: string }) {
  const { formRef, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'tema',
    accion: createTopic,
    campos: ['title', 'body'],
    campoSugerencia: 'body',
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="form">
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
      {aviso}
      <button className="btn btn-primary" disabled={ocupado}>Publicar tema</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tema publicado.</p>}
    </form>
  );
}
