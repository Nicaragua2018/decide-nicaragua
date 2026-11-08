import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { GroupListResponse, InquietudSummary } from '@decide/shared';
import { NewInquietudForm } from './NewInquietudForm';
import { SupportButton } from './SupportButton';
import { MarcaAsistente } from '@/components/SugerenciaAsistente';
import { INQUIETUD_STATUS_BADGE, INQUIETUD_STATUS_LABEL, formatDate } from './status';

export const metadata: Metadata = { title: 'Inquietudes — Decide Nicaragua' };

export default async function InquietudesPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  const { groupId: requested } = await searchParams;

  const [groupsRes, agendaRes] = await Promise.all([
    serverFetch('/api/groups'),
    serverFetch('/api/inquietudes/agenda'),
  ]);
  const groups = groupsRes.ok ? ((await groupsRes.json()) as GroupListResponse).groups ?? [] : [];
  const canSeeAgenda = agendaRes.ok;

  const selected = groups.find((g) => g.id === requested) ?? groups[0] ?? null;

  let inquietudes: InquietudSummary[] = [];
  let loadError = false;
  if (selected) {
    const res = await serverFetch(`/api/inquietudes?groupId=${selected.id}`);
    if (res.ok) inquietudes = (await res.json()) as InquietudSummary[];
    else loadError = true;
  }

  return (
    <>
      <div className="dash-welcome">
        <div>
          <h1 className="page-title">Inquietudes</h1>
          <p className="page-sub">
            Plantea lo que preocupa a tu comunidad. Cuando una inquietud reúne suficiente apoyo, quien organiza la agenda debe abrir un debate o responder en público.
          </p>
        </div>
        {canSeeAgenda && (
          <Link href="/inquietudes/agenda" className="btn btn-ghost btn-sm">Agenda →</Link>
        )}
      </div>

      {groups.length === 0 || !selected ? (
        <div className="empty-card">
          <p className="empty-card-title">Aún no perteneces a ninguna comunidad</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/inquietudes?groupId=${g.id}`}
                className={g.id === selected.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              >
                {g.name}
              </Link>
            ))}
          </div>

          {loadError ? (
            <p className="alert alert-error">No se pudieron cargar las inquietudes de esta comunidad.</p>
          ) : inquietudes.length === 0 ? (
            <div className="empty-card">
              <p className="empty-card-title">Aún no hay inquietudes en {selected.name}</p>
            </div>
          ) : (
            <div className="group-grid">
              {inquietudes.map((q) => (
                <div key={q.id} className="card">
                  <Link href={`/inquietudes/${q.id}`}>
                    <h3 className="group-card-name">{q.hidden ? 'Inquietud oculta por la moderación' : q.title}</h3>
                  </Link>
                  <p className="mt-1">
                    <span className={`badge ${INQUIETUD_STATUS_BADGE[q.status]}`}>
                      {INQUIETUD_STATUS_LABEL[q.status]}
                    </span>
                    {!q.hidden && q.origen === 'asistente' && <> <MarcaAsistente /></>}
                  </p>
                  <p className="card-meta mt-2">
                    {q.supportCount} apoyos de {q.threshold} necesarios
                  </p>
                  {q.status === 'en_plazo' && q.deadlineAt && (
                    <p className="card-meta">Plazo para responder: {formatDate(q.deadlineAt)}</p>
                  )}
                  {!q.hidden && (
                    <div className="mt-2">
                      <SupportButton id={q.id} supported={q.supportedByMe} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="card mt-4">
            <p className="card-title mb-3">Plantear una inquietud en {selected.name}</p>
            <NewInquietudForm groupId={selected.id} />
          </div>
        </>
      )}
    </>
  );
}
