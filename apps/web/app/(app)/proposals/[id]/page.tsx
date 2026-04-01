import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import SignalForm from '@/components/SignalForm';
import { createComment, updateProposalStatus } from '@/lib/actions';
import type { ProposalDetail, ProposalStatus } from '@decide/shared';

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Borrador', open: 'Abierta', closed: 'Cerrada', archived: 'Archivada',
};
const NEXT_STATUS: Partial<Record<ProposalStatus, ProposalStatus[]>> = {
  draft:  ['open'],
  open:   ['closed'],
  closed: ['archived'],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const res = await serverFetch(`/api/deliberation/proposals/${id}`);
  const data = (await res.json()) as ProposalDetail;
  return { title: data.title };
}

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await serverFetch(`/api/deliberation/proposals/${id}`);

  if (!res.ok) return <p className="empty-state">Propuesta no encontrada.</p>;
  const proposal = (await res.json()) as ProposalDetail;

  const rootComments  = proposal.comments.filter((c) => !c.parentId);
  const repliesById   = new Map(
    rootComments.map((c) => [
      c.id,
      proposal.comments.filter((r) => r.parentId === c.id),
    ]),
  );

  const nextStatuses = NEXT_STATUS[proposal.status] ?? [];
  const isOpen = proposal.status === 'open';

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <Link href={`/groups/${proposal.groupId}?tab=proposals`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        <div className="flex justify-between items-center mt-2">
          <h1 className="page-title">{proposal.title}</h1>
          <span className={`badge badge-${proposal.status}`}>
            {STATUS_LABEL[proposal.status]}
          </span>
        </div>
        <p className="card-meta">
          {proposal.authorDisplayName} · {new Date(proposal.createdAt).toLocaleDateString('es-NI')}
        </p>
      </div>

      {/* Body */}
      <div className="card mb-4">
        <p style={{ whiteSpace: 'pre-wrap' }}>{proposal.body}</p>
      </div>

      {/* Señales de consenso */}
      <div className="card mb-4">
        <p className="card-title">Señales de consenso</p>
        <div className="signal-bar mt-2">
          <span className="signal-count">✓ Apoyo: {proposal.signalCounts.support}</span>
          <span className="signal-count">◆ Neutral: {proposal.signalCounts.neutral}</span>
          <span className="signal-count">✗ Objeción: {proposal.signalCounts.object}</span>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Tu posición:</p>
          <SignalForm
            proposalId={id}
            currentSignal={proposal.userSignal}
            isOpen={isOpen}
          />
        </div>
      </div>

      {/* Cambiar estado (autor) */}
      {nextStatuses.length > 0 && (
        <div className="card mb-4">
          <p className="card-title">Gestión del autor</p>
          <div className="flex gap-2 mt-2">
            {nextStatuses.map((s) => (
              <form key={s} action={updateProposalStatus}>
                <input type="hidden" name="proposalId" value={id} />
                <input type="hidden" name="status" value={s} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Marcar como {STATUS_LABEL[s].toLowerCase()}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {/* Comentarios */}
      <div className="card">
        <p className="card-title mb-4">Comentarios ({proposal.commentCount})</p>

        {rootComments.map((comment) => (
          <div key={comment.id} style={{ marginBottom: '1.25rem' }}>
            <p className="text-sm font-medium">{comment.authorDisplayName}</p>
            <p className="card-meta">{new Date(comment.createdAt).toLocaleDateString('es-NI')}</p>
            <p className="mt-1">{comment.body}</p>

            {repliesById.get(comment.id)?.map((reply) => (
              <div
                key={reply.id}
                style={{ marginLeft: '1.5rem', marginTop: '0.75rem',
                         paddingLeft: '0.75rem', borderLeft: '2px solid var(--border)' }}
              >
                <p className="text-sm font-medium">{reply.authorDisplayName}</p>
                <p className="card-meta">{new Date(reply.createdAt).toLocaleDateString('es-NI')}</p>
                <p className="mt-1">{reply.body}</p>
              </div>
            ))}
          </div>
        ))}

        {/* Nuevo comentario */}
        {isOpen && (
          <form action={createComment} className="form mt-4"
                style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <input type="hidden" name="proposalId" value={id} />
            <div className="form-field">
              <label className="form-label" htmlFor="body">Añadir comentario</label>
              <textarea id="body" name="body" required className="form-textarea"
                        placeholder="Escribe tu comentario…" rows={3} />
            </div>
            <div>
              <button type="submit" className="btn btn-primary btn-sm">Publicar comentario</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
