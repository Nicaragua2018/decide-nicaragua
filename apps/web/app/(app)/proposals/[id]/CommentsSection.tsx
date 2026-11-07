'use client';

import { useState } from 'react';
import { createComment } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';
import { ModerarForm } from '@/components/ModerarForm';
import type { CommentItem } from '@decide/shared';
import { AppealForm } from './AppealForm';

interface CommentsSectionProps {
  proposalId: string;
  comments: CommentItem[];
  isOpen: boolean;
  canModerate?: boolean;
}

function HideCommentForm({ proposalId, commentId }: { proposalId: string; commentId: string }) {
  return (
    <ModerarForm target="respuesta" targetId={commentId} topicId={proposalId} colapsable className="comment-reply-form" />
  );
}

/** Formulario de un comentario (o de una respuesta si lleva `parentId`) con revisión previa. */
function ComentarioForm({
  proposalId,
  parentId,
  className,
  children,
  textarea,
  alOk,
}: {
  proposalId: string;
  parentId?: string;
  className: string;
  children: (ocupado: boolean) => React.ReactNode;
  textarea: React.ReactNode;
  alOk?: () => void;
}) {
  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'comentario',
    accion: createComment,
    campos: ['body'],
    campoSugerencia: 'body',
    alOk,
  });
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className={className}>
      <input type="hidden" name="proposalId" value={proposalId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {textarea}
      {aviso}
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
      {children(ocupado)}
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
              <>
                <p className="comment-body text-muted">
                  Respuesta oculta por la moderación. Motivo: {comment.hiddenReason}.
                </p>
                {comment.moderationId && (
                  <AppealForm moderationId={comment.moderationId} topicId={proposalId} />
                )}
              </>
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
              <ComentarioForm
                proposalId={proposalId}
                parentId={comment.id}
                className="comment-reply-form"
                alOk={() => setReplyingTo(null)}
                textarea={
                  <textarea
                    name="body"
                    required
                    autoFocus
                    rows={2}
                    className="form-textarea"
                    placeholder={`Responder a ${comment.authorDisplayName ?? 'este comentario'}…`}
                  />
                }
              >
                {(ocupado) => (
                  <div className="comment-reply-actions">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>Publicar respuesta</button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setReplyingTo(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </ComentarioForm>
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
                <>
                  <p className="comment-body text-muted">
                    Respuesta oculta por la moderación. Motivo: {reply.hiddenReason}.
                  </p>
                  {reply.moderationId && (
                    <AppealForm moderationId={reply.moderationId} topicId={proposalId} />
                  )}
                </>
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
        <ComentarioForm
          proposalId={proposalId}
          className="form comment-new-form"
          textarea={
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
          }
        >
          {(ocupado) => (
            <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>Publicar comentario</button>
          )}
        </ComentarioForm>
      )}
    </div>
  );
}
