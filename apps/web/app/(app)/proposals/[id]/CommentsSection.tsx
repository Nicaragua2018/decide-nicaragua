'use client';

import { useActionState, useState } from 'react';
import { createCommentDirect, hideContent, type ActionResult } from '@/lib/actions';
import type { CommentItem } from '@decide/shared';

interface CommentsSectionProps {
  proposalId: string;
  comments: CommentItem[];
  isOpen: boolean;
  canModerate?: boolean;
}

function HideCommentForm({ proposalId, commentId }: { proposalId: string; commentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(hideContent, null);
  if (!open) {
    return (
      <button type="button" className="comment-reply-btn" onClick={() => setOpen(true)}>
        Ocultar
      </button>
    );
  }
  return (
    <form action={action} className="comment-reply-form">
      <input type="hidden" name="target" value="respuesta" />
      <input type="hidden" name="targetId" value={commentId} />
      <input type="hidden" name="topicId" value={proposalId} />
      <textarea
        name="reason"
        required
        minLength={10}
        maxLength={500}
        rows={2}
        className="form-textarea"
        placeholder="Motivo (obligatorio)"
      />
      <div className="comment-reply-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Ocultar</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}

export function CommentsSection({ proposalId, comments, isOpen, canModerate = false }: CommentsSectionProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const rootComments = comments.filter((c) => !c.parentId);
  const repliesById  = new Map(
    rootComments.map((c) => [c.id, comments.filter((r) => r.parentId === c.id)]),
  );

  return (
    <div>
      {rootComments.map((comment) => (
        <div key={comment.id} className="comment-thread">
          <div className="comment-root">
            <div className="comment-header">
              <span className="comment-author">{comment.authorDisplayName ?? 'Anónimo'}</span>
              <span className="comment-date">
                {new Date(comment.createdAt).toLocaleDateString('es-NI')}
              </span>
            </div>
            {comment.hidden ? (
              <p className="comment-body text-muted">
                Respuesta oculta por la moderación. Motivo: {comment.hiddenReason}.
              </p>
            ) : (
              <p className="comment-body">{comment.body}</p>
            )}

            {canModerate && !comment.hidden && (
              <HideCommentForm proposalId={proposalId} commentId={comment.id} />
            )}

            {isOpen && (
              <button
                type="button"
                className="comment-reply-btn"
                onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              >
                {replyingTo === comment.id ? 'Cancelar' : '↩ Responder'}
              </button>
            )}

            {replyingTo === comment.id && (
              <form
                action={createCommentDirect}
                onSubmit={() => setReplyingTo(null)}
                className="comment-reply-form"
              >
                <input type="hidden" name="proposalId" value={proposalId} />
                <input type="hidden" name="parentId"   value={comment.id} />
                <textarea
                  name="body"
                  required
                  autoFocus
                  rows={2}
                  className="form-textarea"
                  placeholder={`Responder a ${comment.authorDisplayName ?? 'este comentario'}…`}
                />
                <div className="comment-reply-actions">
                  <button type="submit" className="btn btn-primary btn-sm">Publicar respuesta</button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReplyingTo(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>

          {repliesById.get(comment.id)?.map((reply) => (
            <div key={reply.id} className="comment-reply">
              <div className="comment-header">
                <span className="comment-author">{reply.authorDisplayName ?? 'Anónimo'}</span>
                <span className="comment-date">
                  {new Date(reply.createdAt).toLocaleDateString('es-NI')}
                </span>
              </div>
              {reply.hidden ? (
                <p className="comment-body text-muted">
                  Respuesta oculta por la moderación. Motivo: {reply.hiddenReason}.
                </p>
              ) : (
                <p className="comment-body">{reply.body}</p>
              )}
              {canModerate && !reply.hidden && (
                <HideCommentForm proposalId={proposalId} commentId={reply.id} />
              )}
            </div>
          ))}
        </div>
      ))}

      {isOpen && (
        <form action={createCommentDirect} className="form comment-new-form">
          <input type="hidden" name="proposalId" value={proposalId} />
          <div className="form-field">
            <label className="form-label" htmlFor="body">Añadir comentario</label>
            <textarea
              id="body"
              name="body"
              required
              className="form-textarea"
              placeholder="Escribe tu comentario…"
              rows={3}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Publicar comentario</button>
        </form>
      )}
    </div>
  );
}
