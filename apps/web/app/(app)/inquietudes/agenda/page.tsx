import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { GroupListResponse, InquietudSummary } from '@decide/shared';
import { formatDate } from '../status';
import { MarcaAsistente } from '@/components/SugerenciaAsistente';
import { UmbralSeccion } from '@/components/SugerenciasSecciones';
import { DebateRellenable, OpenDebateForm } from './OpenDebateForm';
import { InquietudesParecidas } from './InquietudesParecidas';

export const metadata: Metadata = { title: 'Agenda' };

export default async function AgendaPage() {
  const [res, groupsRes] = await Promise.all([
    serverFetch('/api/inquietudes/agenda'),
    serverFetch('/api/groups'),
  ]);

  if (res.status === 403) {
    return <p className="empty-state">Esta sección es solo para quien organiza la agenda.</p>;
  }
  if (!res.ok) return <p className="alert alert-error">No se pudo cargar la agenda.</p>;

  const items = (await res.json()) as InquietudSummary[];
  const groups = groupsRes.ok ? ((await groupsRes.json()) as GroupListResponse).groups ?? [] : [];
  const nameOf = (gid: string) => groups.find((g) => g.id === gid)?.name ?? 'Comunidad';

  // Orden por plazo (sin plazo al final) y agrupado por comunidad.
  const sorted = [...items].sort((a, b) => {
    const ta = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Infinity;
    const tb = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Infinity;
    return ta - tb;
  });
  const byGroup = new Map<string, InquietudSummary[]>();
  for (const q of sorted) {
    byGroup.set(q.groupId, [...(byGroup.get(q.groupId) ?? []), q]);
  }

  return (
    <>
      <div className="page-header">
        <Link href="/inquietudes" className="text-sm text-muted">← Volver a las inquietudes</Link>
        <h1 className="page-title mt-2">Agenda</h1>
        <p className="page-sub">
          Inquietudes con apoyo suficiente. Abre un debate (puedes juntar varias de la misma comunidad) o responde en público.
        </p>
      </div>

      {byGroup.size === 0 ? (
        <div className="empty-card">
          <p className="empty-card-title">No hay inquietudes pendientes en la agenda</p>
        </div>
      ) : (
        [...byGroup.entries()].map(([groupId, list]) => (
          <section key={groupId} className="card mb-4">
            <p className="card-title mb-3">{nameOf(groupId)}</p>
            <DebateRellenable>
              <Suspense fallback={null}>
                <InquietudesParecidas groupId={groupId} idsEnLista={list.map((q) => q.id)} />
              </Suspense>
              <OpenDebateForm
                groupId={groupId}
                items={list.map((q) => ({
                  id: q.id,
                  title: q.title,
                  supportCount: q.supportCount,
                  threshold: q.threshold,
                  deadline: q.deadlineAt ? formatDate(q.deadlineAt) : null,
                }))}
              />
            </DebateRellenable>
            <p className="text-sm mt-4">Para responder en público, abre la inquietud:</p>
            {list.map((q) => (
              <div key={q.id} className="mt-2">
                <p className="text-sm">
                  <Link href={`/inquietudes/${q.id}`}>{q.title}</Link>
                  {q.origen === 'asistente' && <> <MarcaAsistente /></>}
                </p>
                <Suspense fallback={null}>
                  <UmbralSeccion inquietudId={q.id} />
                </Suspense>
              </div>
            ))}
          </section>
        ))
      )}
    </>
  );
}
