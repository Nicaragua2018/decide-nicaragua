import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { InquietudDetail } from '@decide/shared';
import { AppealForm } from '../../proposals/[id]/AppealForm';
import { SupportButton } from '../SupportButton';
import { INQUIETUD_STATUS_BADGE, INQUIETUD_STATUS_LABEL, formatDate } from '../status';
import { OrganizerActions } from './OrganizerActions';

export const metadata: Metadata = { title: 'Inquietud — Decide Nicaragua' };

export default async function InquietudPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await serverFetch(`/api/inquietudes/${id}`);
  if (res.status === 403) return <p className="empty-state">No tienes acceso a esta inquietud.</p>;
  if (!res.ok) return <p className="empty-state">Inquietud no encontrada.</p>;
  const q = (await res.json()) as InquietudDetail;

  return (
    <>
      <div className="page-header">
        {q.isMember && (
          <Link href={`/inquietudes?groupId=${q.groupId}`} className="text-sm text-muted">
            ← Volver a las inquietudes
          </Link>
        )}
        <div className="flex justify-between items-center mt-2">
          <h1 className="page-title">{q.hidden ? 'Inquietud oculta por la moderación' : q.title}</h1>
          <span className={`badge ${INQUIETUD_STATUS_BADGE[q.status]}`}>{INQUIETUD_STATUS_LABEL[q.status]}</span>
        </div>
        <p className="card-meta">
          {q.authorDisplayName} · {formatDate(q.createdAt)}
        </p>
      </div>

      <div className="card mb-4">
        {q.hidden ? (
          <>
            <p className="alert alert-warning">
              Esta inquietud fue ocultada por la moderación. Motivo: {q.hiddenReason}.
            </p>
            {q.moderationId && q.isAuthor && <AppealForm moderationId={q.moderationId} inquietudId={q.id} />}
          </>
        ) : (
          <>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{q.body}</p>
            <p className="card-meta mt-4">{q.supportCount} apoyos de {q.threshold} necesarios</p>
            {q.status === 'en_plazo' && q.deadlineAt && (
              <p className="card-meta">Plazo para responder: {formatDate(q.deadlineAt)}</p>
            )}
            {q.isMember && (
              <div className="mt-2">
                <SupportButton id={q.id} supported={q.supportedByMe} />
              </div>
            )}
          </>
        )}
      </div>

      {!q.hidden && q.response && (
        <div className="card mb-4">
          <p className="card-title">Respuesta pública</p>
          <p className="mt-2" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{q.response}</p>
          {q.respondedAt && <p className="card-meta mt-2">{formatDate(q.respondedAt)}</p>}
        </div>
      )}

      {!q.hidden && q.proposalId && q.isMember && (
        <p className="mb-4">
          <Link href={`/proposals/${q.proposalId}`} className="btn btn-primary btn-sm">Ver el debate</Link>
        </p>
      )}

      {q.canOrganize && !q.hidden && (
        <OrganizerActions inquietudId={q.id} status={q.status} />
      )}
    </>
  );
}
