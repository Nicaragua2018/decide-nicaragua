import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import SignalForm from '@/components/SignalForm';
import { CommentsSection } from './CommentsSection';
import { TopicActions } from './TopicActions';
import { AppealForm } from './AppealForm';
import { FrasesSection } from './FrasesSection';
import { updateProposalStatusDirect } from '@/lib/actions';
import { ProposalStatus } from '@decide/shared';
import type { ProposalDetail, SignalCounts } from '@decide/shared';

const STATUS_LABEL: Record<ProposalStatus, string> = {
  [ProposalStatus.draft]:    'Borrador',
  [ProposalStatus.open]:     'Abierta',
  [ProposalStatus.closed]:   'Cerrada',
  [ProposalStatus.archived]: 'Archivada',
};
const NEXT_STATUS: Partial<Record<ProposalStatus, ProposalStatus[]>> = {
  [ProposalStatus.draft]:   [ProposalStatus.open],
};
const NEXT_STATUS_LABEL: Partial<Record<ProposalStatus, string>> = {
  [ProposalStatus.open]:     'Abrir para debate',
  [ProposalStatus.closed]:   'Cerrar propuesta',
  [ProposalStatus.archived]: 'Archivar',
};

function ConsensusBar({ counts }: { counts: SignalCounts }) {
  const total = counts.support + counts.neutral + counts.object;
  if (total === 0) {
    return <p className="text-sm text-muted">Aún no hay señales de consenso.</p>;
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  const supportPct = pct(counts.support);
  const neutralPct = pct(counts.neutral);
  const objectPct  = pct(counts.object);

  return (
    <div className="consensus-block">
      <div className="consensus-bar">
        {supportPct > 0 && (
          <div className="consensus-seg consensus-seg--support" style={{ width: `${supportPct}%` }} />
        )}
        {neutralPct > 0 && (
          <div className="consensus-seg consensus-seg--neutral" style={{ width: `${neutralPct}%` }} />
        )}
        {objectPct > 0 && (
          <div className="consensus-seg consensus-seg--object"  style={{ width: `${objectPct}%`  }} />
        )}
      </div>
      <div className="consensus-legend">
        <span className="signal-count signal-support">✓ Apoyo {supportPct}% <small>({counts.support})</small></span>
        <span className="signal-count signal-neutral">◆ Neutral {neutralPct}% <small>({counts.neutral})</small></span>
        <span className="signal-count signal-object">✗ Objeción {objectPct}% <small>({counts.object})</small></span>
        <span className="text-xs text-muted">{total} señal{total !== 1 ? 'es' : ''} emitidas</span>
      </div>
    </div>
  );
}

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

  const nextStatuses = NEXT_STATUS[proposal.status] ?? [];
  const isOpen       = proposal.status === ProposalStatus.open;

  return (
    <>
      {/* Cabecera */}
      <div className="page-header">
        <Link href={`/groups/${proposal.groupId}?tab=proposals`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        {proposal.forumId && (
          <>
            {' · '}
            <Link href={`/foros/${proposal.forumId}`} className="text-sm text-muted">
              Volver al foro
            </Link>
          </>
        )}
        <div className="flex justify-between items-center mt-2">
          <h1 className="page-title">{proposal.title}</h1>
          <span className={`badge badge-${proposal.status}`}>
            {STATUS_LABEL[proposal.status]}
          </span>
        </div>
        <p className="card-meta">
          {proposal.authorDisplayName} · {new Date(proposal.createdAt).toLocaleDateString('es-NI')}
          {' · '}{proposal.commentCount} comentario{proposal.commentCount !== 1 ? 's' : ''}
        </p>
      </div>

      {proposal.abiertoPorComunidad && (
        <p className="mb-4">
          <span className="badge badge-open">Abierto por la comunidad: no hubo respuesta en el plazo</span>
        </p>
      )}

      {proposal.inquietudes.length > 0 && (
        <div className="card mb-4">
          <p className="card-title">Nace de estas inquietudes</p>
          <ul className="mt-2">
            {proposal.inquietudes.map((q) => (
              <li key={q.id}>
                <Link href={`/inquietudes/${q.id}`}>{q.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cuerpo de la propuesta */}
      <div className="card mb-4">
        {proposal.hidden ? (
          <>
            <p className="alert alert-warning">
              Este tema fue ocultado por la moderación. Motivo: {proposal.hiddenReason}.
            </p>
            {proposal.moderationId && <AppealForm moderationId={proposal.moderationId} topicId={id} />}
          </>
        ) : (
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{proposal.body}</p>
        )}
      </div>

      {/* Consenso alcanzado */}
      {proposal.conclusion && (
        <div className="card mb-4">
          <p className="card-title">Consenso</p>
          <p className="mt-2" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{proposal.conclusion}</p>
          {proposal.objections && (
            <>
              <p className="text-sm font-medium mt-3">Objeciones de la minoría</p>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{proposal.objections}</p>
            </>
          )}
        </div>
      )}

      {/* Señales de consenso */}
      <div className="card mb-4">
        <p className="card-title mb-3">Señales de consenso</p>
        <ConsensusBar counts={proposal.signalCounts} />
        <div className="mt-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          {!proposal.hidden && (
            <>
              <p className="text-sm font-medium mb-2">Tu posición:</p>
              <SignalForm
                proposalId={id}
                currentSignal={proposal.userSignal}
                isOpen={isOpen}
              />
            </>
          )}
        </div>
      </div>

      <TopicActions proposal={proposal} />

      {/* Gestión del autor — solo visible si el usuario es el autor */}
      {proposal.isAuthor && nextStatuses.length > 0 && (
        <div className="card mb-4">
          <p className="card-title">Gestionar propuesta</p>
          <p className="text-sm text-muted mt-1 mb-3">
            Como autor, puedes avanzar el estado de esta propuesta.
          </p>
          <div className="flex gap-2 flex-wrap">
            {nextStatuses.map((s) => (
              <form key={s} action={updateProposalStatusDirect}>
                <input type="hidden" name="proposalId" value={id} />
                <input type="hidden" name="status"     value={s} />
                <button
                  type="submit"
                  className={s === ProposalStatus.archived ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                >
                  {NEXT_STATUS_LABEL[s] ?? `Marcar como ${STATUS_LABEL[s].toLowerCase()}`}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {/* Comentarios */}
      <div className="card">
        <p className="card-title mb-4">Debate ({proposal.commentCount})</p>
        <CommentsSection
          proposalId={id}
          comments={proposal.comments}
          isOpen={isOpen}
          canModerate={proposal.canModerate}
        />
      </div>

      {!proposal.hidden && (
        <FrasesSection proposalId={id} isOpen={isOpen} canModerate={proposal.canModerate} />
      )}
    </>
  );
}
