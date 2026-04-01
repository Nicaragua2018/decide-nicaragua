import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type {
  GroupDetail,
  ProposalListResponse,
  ElectionListResponse,
  SortitionListResponse,
  ProposalStatus,
  ElectionStatus,
  SortitionStatus,
} from '@decide/shared';

type Tab = 'proposals' | 'elections' | 'sortition';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const res  = await serverFetch(`/api/groups/${id}`);
  const data = (await res.json()) as GroupDetail;
  return { title: data.name };
}

const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Borrador', open: 'Abierta', closed: 'Cerrada', archived: 'Archivada',
};
const ELECTION_STATUS_LABEL: Record<ElectionStatus, string> = {
  draft: 'Borrador', open: 'Abierta', tallied: 'Contada', cancelled: 'Cancelada',
};
const SORTITION_STATUS_LABEL: Record<SortitionStatus, string> = {
  pending: 'Pendiente', completed: 'Completado', cancelled: 'Cancelado',
};

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: Tab }>;
}) {
  const { id }               = await params;
  const { tab = 'proposals' } = await searchParams;

  const [groupRes, contentRes] = await Promise.all([
    serverFetch(`/api/groups/${id}`),
    tab === 'proposals'
      ? serverFetch(`/api/deliberation/groups/${id}/proposals`)
      : tab === 'elections'
        ? serverFetch(`/api/voting/groups/${id}/elections`)
        : serverFetch(`/api/sortition/groups/${id}/draws`),
  ]);

  const group = (await groupRes.json()) as GroupDetail;
  const contentData = contentRes.ok ? await contentRes.json() : null;

  const TAB_LABELS: Record<Tab, string> = {
    proposals: 'Propuestas',
    elections: 'Elecciones',
    sortition: 'Sorteos',
  };

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">{group.name}</h1>
          <p className="page-sub">{group.memberCount} miembros</p>
        </div>
        {tab === 'proposals' && (
          <Link href={`/groups/${id}/proposals/new`} className="btn btn-primary">
            + Nueva propuesta
          </Link>
        )}
        {tab === 'elections' && (
          <Link href={`/groups/${id}/elections/new`} className="btn btn-primary">
            + Nueva elección
          </Link>
        )}
        {tab === 'sortition' && (
          <Link href={`/groups/${id}/sortition/new`} className="btn btn-primary">
            + Nuevo sorteo
          </Link>
        )}
      </div>

      <nav className="tab-nav">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/groups/${id}?tab=${t}`}
            className={`tab-link${tab === t ? ' tab-link-active' : ''}`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      {!contentData && <p className="empty-state">Error cargando datos.</p>}

      {tab === 'proposals' && contentData && (
        <ProposalsTab data={contentData as ProposalListResponse} />
      )}
      {tab === 'elections' && contentData && (
        <ElectionsTab data={contentData as ElectionListResponse} />
      )}
      {tab === 'sortition' && contentData && (
        <SortitionTab data={contentData as SortitionListResponse} />
      )}
    </>
  );
}

function ProposalsTab({ data }: { data: ProposalListResponse }) {
  if (data.proposals.length === 0)
    return <p className="empty-state">No hay propuestas en este grupo aún.</p>;

  return (
    <div>
      {data.proposals.map((p) => (
        <Link key={p.id} href={`/proposals/${p.id}`} style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <div className="flex justify-between items-center">
              <div>
                <p className="card-title">{p.title}</p>
                <p className="card-meta">
                  {p.authorDisplayName} · {new Date(p.createdAt).toLocaleDateString('es-NI')} ·{' '}
                  {p.commentCount} comentarios
                </p>
                <div className="signal-bar mt-1">
                  <span className="signal-count" title="Apoyo">✓ {p.signalCounts.support}</span>
                  <span className="signal-count" title="Neutral">◆ {p.signalCounts.neutral}</span>
                  <span className="signal-count" title="Objeción">✗ {p.signalCounts.object}</span>
                </div>
              </div>
              <span className={`badge badge-${p.status}`}>
                {PROPOSAL_STATUS_LABEL[p.status]}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ElectionsTab({ data }: { data: ElectionListResponse }) {
  if (data.elections.length === 0)
    return <p className="empty-state">No hay elecciones en este grupo aún.</p>;

  return (
    <div>
      {data.elections.map((e) => (
        <Link key={e.id} href={`/elections/${e.id}`} style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <div className="flex justify-between items-center">
              <div>
                <p className="card-title">{e.title}</p>
                <p className="card-meta">
                  {e.candidateCount} candidatos · {e.ballotCount} votos ·{' '}
                  {new Date(e.startsAt).toLocaleDateString('es-NI')} – {new Date(e.endsAt).toLocaleDateString('es-NI')}
                </p>
              </div>
              <span className={`badge badge-${e.status}`}>
                {ELECTION_STATUS_LABEL[e.status]}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function SortitionTab({ data }: { data: SortitionListResponse }) {
  if (data.draws.length === 0)
    return <p className="empty-state">No hay sorteos en este grupo aún.</p>;

  return (
    <div>
      {data.draws.map((d) => (
        <Link key={d.id} href={`/sortition/${d.id}`} style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <div className="flex justify-between items-center">
              <div>
                <p className="card-title">{d.title}</p>
                <p className="card-meta">
                  Selección de {d.selectionSize} · {new Date(d.createdAt).toLocaleDateString('es-NI')}
                </p>
              </div>
              <span className={`badge badge-${d.status}`}>
                {SORTITION_STATUS_LABEL[d.status]}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
