import Link from 'next/link';
import { serverFetch } from '@/lib/api';
import { ProposalStatus } from '@decide/shared';
import type { ForumDetail, SignalCounts } from '@decide/shared';
import { NewTopicForm } from './NewTopicForm';

const STATUS_LABEL: Record<ProposalStatus, string> = {
  [ProposalStatus.draft]:    'Borrador',
  [ProposalStatus.open]:     'Abierta',
  [ProposalStatus.closed]:   'Cerrada',
  [ProposalStatus.archived]: 'Archivada',
};

function SignalBar({ counts }: { counts: SignalCounts }) {
  const total = counts.support + counts.neutral + counts.object;
  if (total === 0) return <span className="text-xs text-muted">Sin señales</span>;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="consensus-block">
      <div className="consensus-bar">
        {counts.support > 0 && <div className="consensus-seg consensus-seg--support" style={{ width: `${pct(counts.support)}%` }} />}
        {counts.neutral > 0 && <div className="consensus-seg consensus-seg--neutral" style={{ width: `${pct(counts.neutral)}%` }} />}
        {counts.object > 0 && <div className="consensus-seg consensus-seg--object" style={{ width: `${pct(counts.object)}%` }} />}
      </div>
    </div>
  );
}

export default async function ForoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await serverFetch(`/api/forums/${id}`);
  if (!res.ok) return <p className="empty-state">Foro no encontrado.</p>;
  const forum = (await res.json()) as ForumDetail;

  return (
    <>
      <div className="page-header">
        <Link href="/foros" className="text-sm text-muted">← Volver a los foros</Link>
        <p className="card-meta mt-2">{forum.groupName}</p>
        <h1 className="page-title">{forum.title}</h1>
        {forum.description && <p className="page-sub">{forum.description}</p>}
      </div>

      {forum.topics.length === 0 ? (
        <div className="empty-card mb-4">
          <p className="empty-card-title">Aún no hay temas. Abre el primero.</p>
        </div>
      ) : (
        forum.topics.map((t) => (
          <div key={t.id} className="card mb-3" style={t.hidden ? { opacity: 0.6 } : undefined}>
            {t.hidden ? (
              <>
                <Link href={`/proposals/${t.id}`} className="card-title">{t.title}</Link>
                <p className="text-sm text-muted mt-1">Tema oculto por moderación</p>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <Link href={`/proposals/${t.id}`} className="card-title">{t.title}</Link>
                  <div className="flex gap-2">
                    {t.kind === 'propuesta' && <span className="badge badge-open">Propuesta formal</span>}
                    <span className={`badge badge-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                  </div>
                </div>
                <p className="card-meta">
                  {t.authorDisplayName ?? 'Anónimo'} · {new Date(t.createdAt).toLocaleDateString('es-NI')}
                  {' · '}{t.commentCount} respuesta{t.commentCount !== 1 ? 's' : ''}
                </p>
                <div className="mt-2"><SignalBar counts={t.signalCounts} /></div>
              </>
            )}
          </div>
        ))
      )}

      <div className="card mt-4">
        <p className="card-title mb-3">Abrir un tema nuevo</p>
        <NewTopicForm groupId={forum.groupId} forumId={forum.id} />
      </div>
    </>
  );
}
