import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { AuditListResponse } from '@decide/shared';

export const metadata: Metadata = { title: 'Auditoría' };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    action?: string;
    resource?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp     = await searchParams;
  const page   = sp.page ?? '1';
  const action = sp.action ?? '';
  const resource = sp.resource ?? '';
  const from   = sp.from ?? '';
  const to     = sp.to ?? '';

  const query = new URLSearchParams({ page, limit: '50' });
  if (action)   query.set('action', action);
  if (resource) query.set('resource', resource);
  if (from)     query.set('from', from);
  if (to)       query.set('to', to);

  const res = await serverFetch(`/api/audit/events?${query.toString()}`);
  const data = res.ok ? (await res.json()) as AuditListResponse : null;

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const currentPage = data?.page ?? 1;

  function pageLink(p: number) {
    const q = new URLSearchParams(query);
    q.set('page', p.toString());
    return `/audit?${q.toString()}`;
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Registro de auditoría</h1>
        <p className="page-sub">
          Eventos del sistema. Los campos sensibles (IPs, payloads) se almacenan como hash.
        </p>
      </div>

      {/* Filtros */}
      <form method="GET" className="card mb-4">
        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
          <div className="form-field" style={{ flex: 1, minWidth: 180 }}>
            <label className="form-label">Acción (prefijo)</label>
            <input name="action" defaultValue={action} placeholder="user., vote.cast…"
                   className="form-input" />
          </div>
          <div className="form-field" style={{ flex: 1, minWidth: 180 }}>
            <label className="form-label">Recurso</label>
            <input name="resource" defaultValue={resource} placeholder="proposal:uuid…"
                   className="form-input" />
          </div>
          <div className="form-field" style={{ minWidth: 150 }}>
            <label className="form-label">Desde</label>
            <input name="from" type="date" defaultValue={from} className="form-input" />
          </div>
          <div className="form-field" style={{ minWidth: 150 }}>
            <label className="form-label">Hasta</label>
            <input name="to" type="date" defaultValue={to} className="form-input" />
          </div>
          <div className="form-field" style={{ justifyContent: 'flex-end', paddingTop: '1.55rem' }}>
            <button type="submit" className="btn btn-primary btn-sm">Filtrar</button>
          </div>
        </div>
      </form>

      {!data && <p className="empty-state">Error cargando eventos.</p>}

      {data && (
        <>
          <p className="text-sm text-muted mb-3">
            {data.total} evento{data.total !== 1 ? 's' : ''} encontrado{data.total !== 1 ? 's' : ''} ·
            Página {currentPage} de {totalPages}
          </p>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acción</th>
                    <th>Actor</th>
                    <th>Recurso</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted" style={{ textAlign: 'center' }}>
                        No hay eventos para estos filtros.
                      </td>
                    </tr>
                  ) : (
                    data.events.map((event) => (
                      <tr key={event.id}>
                        <td className="text-xs">
                          {new Date(event.createdAt).toLocaleString('es-NI')}
                        </td>
                        <td>
                          <code style={{ fontSize: '0.8rem' }}>{event.action}</code>
                        </td>
                        <td className="text-sm">{event.actorDisplayName ?? '—'}</td>
                        <td className="text-xs text-muted">{event.resource ?? '—'}</td>
                        <td>
                          <Link href={`/audit/${event.id}`} className="text-xs">
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex gap-2 mt-4 justify-between items-center">
              {currentPage > 1 ? (
                <Link href={pageLink(currentPage - 1)} className="btn btn-ghost btn-sm">← Anterior</Link>
              ) : <span />}
              <span className="text-sm text-muted">{currentPage} / {totalPages}</span>
              {currentPage < totalPages ? (
                <Link href={pageLink(currentPage + 1)} className="btn btn-ghost btn-sm">Siguiente →</Link>
              ) : <span />}
            </div>
          )}
        </>
      )}
    </>
  );
}
