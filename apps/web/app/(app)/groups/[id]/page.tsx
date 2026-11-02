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
  return { title: `${data.name} — Decide Nicaragua` };
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

const TAB_META = {
  proposals: {
    label:    'Propuestas',
    empty:    'No hay propuestas aún.',
    emptySub: 'Las propuestas inician el proceso deliberativo del grupo.',
    cta:      '+ Nueva propuesta',
    href:     (id: string) => `/groups/${id}/proposals/new`,
  },
  elections: {
    label:    'Elecciones',
    empty:    'No hay elecciones aún.',
    emptySub: 'Las elecciones usan el método Condorcet para reflejar la voluntad del grupo.',
    cta:      '+ Nueva elección',
    href:     (id: string) => `/groups/${id}/elections/new`,
  },
  sortition: {
    label:    'Sorteos',
    empty:    'No hay sorteos aún.',
    emptySub: 'Los sorteos seleccionan representantes de forma aleatoria y verificable.',
    cta:      '+ Nuevo sorteo',
    href:     (id: string) => `/groups/${id}/sortition/new`,
  },
} satisfies Record<Tab, { label: string; empty: string; emptySub: string; cta: string; href: (id: string) => string }>;

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

  const group       = (await groupRes.json()) as GroupDetail;
  const contentData = contentRes.ok ? await contentRes.json() : null;
  const meta        = TAB_META[tab];

  return (
    <>
      {/* ── Breadcrumb ──────────────────────────────────────────── */}
      <nav className="breadcrumb" aria-label="Navegación">
        <Link href="/dashboard" className="breadcrumb-link">Grupos</Link>
        <span className="breadcrumb-sep" aria-hidden>›</span>
        <span className="breadcrumb-current">{group.name}</span>
      </nav>

      {/* ── Cabecera ────────────────────────────────────────────── */}
      <div className="page-header group-header">
        <div>
          <h1 className="page-title">{group.name}</h1>
          <p className="page-sub">
            {group.memberCount} miembro{group.memberCount !== 1 ? 's' : ''}
            {group.description ? ` · ${group.description}` : ''}
          </p>
        </div>
        <Link href={meta.href(id)} className="btn btn-primary">
          {meta.cta}
        </Link>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <nav className="tab-nav" aria-label="Secciones del grupo">
        {(Object.keys(TAB_META) as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/groups/${id}?tab=${t}`}
            className={`tab-link${tab === t ? ' tab-link-active' : ''}`}
          >
            {TAB_META[t].label}
          </Link>
        ))}
      </nav>

      {!contentData && (
        <p className="empty-state">Error cargando datos. Intenta de nuevo.</p>
      )}

      {tab === 'proposals' && contentData && (
        <ProposalsTab
          data={contentData as ProposalListResponse}
          groupId={id}
        />
      )}
      {tab === 'elections' && contentData && (
        <ElectionsTab
          data={contentData as ElectionListResponse}
          groupId={id}
        />
      )}
      {tab === 'sortition' && contentData && (
        <SortitionTab
          data={contentData as SortitionListResponse}
          groupId={id}
        />
      )}
    </>
  );
}

function EmptyTab({
  message,
  sub,
  ctaLabel,
  ctaHref,
}: {
  message: string;
  sub: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="empty-card">
      <p className="empty-card-title">{message}</p>
      <p className="empty-card-sub">{sub}</p>
      <Link href={ctaHref} className="btn btn-primary btn-sm">
        {ctaLabel}
      </Link>
    </div>
  );
}

function ProposalsTab({
  data,
  groupId,
}: {
  data: ProposalListResponse;
  groupId: string;
}) {
  if (data.proposals.length === 0)
    return (
      <EmptyTab
        message={TAB_META.proposals.empty}
        sub={TAB_META.proposals.emptySub}
        ctaLabel={TAB_META.proposals.cta}
        ctaHref={TAB_META.proposals.href(groupId)}
      />
    );

  return (
    <div>
      {data.proposals.map((p) => (
        <Link key={p.id} href={`/proposals/${p.id}`} style={{ textDecoration: 'none' }}>
          <div className="card item-card">
            <div className="item-card-main">
              <p className="card-title">{p.title}</p>
              <p className="card-meta">
                {p.authorDisplayName} · {new Date(p.createdAt).toLocaleDateString('es-NI')} · {p.commentCount} comentarios
              </p>
              <div className="signal-bar mt-1">
                <span className="signal-count signal-support" title="Apoyo">✓ {p.signalCounts.support}</span>
                <span className="signal-count signal-neutral" title="Neutral">◆ {p.signalCounts.neutral}</span>
                <span className="signal-count signal-object"  title="Objeción">✗ {p.signalCounts.object}</span>
              </div>
            </div>
            <span className={`badge badge-${p.status}`}>
              {PROPOSAL_STATUS_LABEL[p.status]}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ElectionsTab({
  data,
  groupId,
}: {
  data: ElectionListResponse;
  groupId: string;
}) {
  if (data.elections.length === 0)
    return (
      <EmptyTab
        message={TAB_META.elections.empty}
        sub={TAB_META.elections.emptySub}
        ctaLabel={TAB_META.elections.cta}
        ctaHref={TAB_META.elections.href(groupId)}
      />
    );

  return (
    <div>
      {data.elections.map((e) => (
        <Link key={e.id} href={`/elections/${e.id}`} style={{ textDecoration: 'none' }}>
          <div className="card item-card">
            <div className="item-card-main">
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
        </Link>
      ))}
    </div>
  );
}

function SortitionTab({
  data,
  groupId,
}: {
  data: SortitionListResponse;
  groupId: string;
}) {
  if (data.draws.length === 0)
    return (
      <EmptyTab
        message={TAB_META.sortition.empty}
        sub={TAB_META.sortition.emptySub}
        ctaLabel={TAB_META.sortition.cta}
        ctaHref={TAB_META.sortition.href(groupId)}
      />
    );

  return (
    <div>
      {data.draws.map((d) => (
        <Link key={d.id} href={`/sortition/${d.id}`} style={{ textDecoration: 'none' }}>
          <div className="card item-card">
            <div className="item-card-main">
              <p className="card-title">{d.title}</p>
              <p className="card-meta">
                Selección de {d.selectionSize} · {new Date(d.createdAt).toLocaleDateString('es-NI')}
              </p>
            </div>
            <span className={`badge badge-${d.status}`}>
              {SORTITION_STATUS_LABEL[d.status]}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
