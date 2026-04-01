import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { AuditEventSummary } from '@decide/shared';

export const metadata: Metadata = { title: 'Detalle de evento' };

export default async function AuditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await serverFetch(`/api/audit/events/${id}`);

  if (!res.ok) return <p className="empty-state">Evento no encontrado.</p>;
  const event = (await res.json()) as AuditEventSummary;

  return (
    <>
      <div className="page-header">
        <Link href="/audit" className="text-sm text-muted">← Volver al registro</Link>
        <h1 className="page-title mt-2">Evento de auditoría</h1>
      </div>

      <div className="card">
        <table>
          <tbody>
            <tr>
              <th style={{ width: 140 }}>ID</th>
              <td><code style={{ fontSize: '0.8rem' }}>{event.id}</code></td>
            </tr>
            <tr>
              <th>Fecha</th>
              <td>{new Date(event.createdAt).toLocaleString('es-NI')}</td>
            </tr>
            <tr>
              <th>Acción</th>
              <td><code>{event.action}</code></td>
            </tr>
            <tr>
              <th>Actor</th>
              <td>{event.actorDisplayName ?? '— (sistema)'}</td>
            </tr>
            <tr>
              <th>Recurso</th>
              <td>{event.resource ?? '—'}</td>
            </tr>
            <tr>
              <th>Metadatos</th>
              <td>
                {event.metadata ? (
                  <pre className="verify-box" style={{ margin: 0 }}>
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                ) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
