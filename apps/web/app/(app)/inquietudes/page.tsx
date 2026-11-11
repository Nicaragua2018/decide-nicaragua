import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { GroupListResponse, InquietudSummary } from '@decide/shared';
import { NewInquietudForm } from './NewInquietudForm';
import { Migas } from '@/components/Migas';
import { PestanasComunidad } from './PestanasComunidad';
import { TarjetaInquietud } from './TarjetaInquietud';

export const metadata: Metadata = { title: 'Inquietudes' };

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

  const titulo = inquietudes.length < 20 ? 'Las primeras preguntas' : 'Inquietudes';

  return (
    <>
      <Migas
        items={[
          { texto: 'Inicio', ruta: '/dashboard' },
          { texto: 'Participar', ruta: '/inquietudes' },
          { texto: 'Inquietudes' },
        ]}
      />
      <div className="dash-welcome">
        <div>
          <h1 className="page-title">{titulo}</h1>
          <p className="page-sub">
            Plantea lo que preocupa a tu comunidad. Cuando una inquietud reúne suficiente apoyo, quien organiza la agenda debe abrir un debate o responder en público.
          </p>
        </div>
        <div className="inq-acciones">
          {canSeeAgenda && (
            <Link href="/inquietudes/agenda" className="btn btn-ghost btn-sm">Agenda →</Link>
          )}
          {selected && (
            <a href="#nueva-inquietud" className="btn btn-primary">Nueva inquietud</a>
          )}
        </div>
      </div>

      {groups.length === 0 || !selected ? (
        <div className="empty-card">
          <p className="empty-card-title">Aún no perteneces a ninguna comunidad</p>
        </div>
      ) : (
        <>
          <PestanasComunidad
            groups={groups}
            selectedId={selected.id}
            conteos={{ [selected.id]: loadError ? undefined : inquietudes.length }}
          />

          {loadError ? (
            <p className="alert alert-error">No se pudieron cargar las inquietudes de esta comunidad.</p>
          ) : inquietudes.length === 0 ? (
            <div className="empty-card">
              <p className="empty-card-title">Aún no hay inquietudes en {selected.name}</p>
            </div>
          ) : (
            <div className="inq-lista">
              {inquietudes.map((q, i) => (
                <div key={q.id} className={`fade-up d${Math.min(i + 1, 7)}`}>
                  <TarjetaInquietud q={q} />
                </div>
              ))}
            </div>
          )}

          <div id="nueva-inquietud" className="card mt-4">
            <p className="card-title mb-3">Plantear una inquietud en {selected.name}</p>
            <NewInquietudForm groupId={selected.id} />
          </div>
        </>
      )}
    </>
  );
}
