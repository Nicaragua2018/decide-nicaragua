import type { Metadata } from 'next';
import Link from 'next/link';
import { serverFetch } from '@/lib/api';
import type { UserListResponse, AccountStatus } from '@decide/shared';
import ChangeStatusForm from './ChangeStatusForm';

export const metadata: Metadata = { title: 'Admin · Usuarios' };

const STATUS_LABELS: Record<string, string> = {
  invited:               'Invitado',
  pending_verification:  'Pendiente',
  verified_citizen:      'Ciudadano',
  observer:              'Observador',
  external_collaborator: 'Colaborador ext.',
  rejected:              'Rechazado',
  suspended:             'Suspendido',
};

const STATUS_BADGE: Record<string, string> = {
  invited:               'badge-neutral',
  pending_verification:  'badge-warning',
  verified_citizen:      'badge-success',
  observer:              'badge-info',
  external_collaborator: 'badge-info',
  rejected:              'badge-error',
  suspended:             'badge-error',
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? '';

  const query = new URLSearchParams();
  if (statusFilter) query.set('status', statusFilter);

  const res = await serverFetch(`/api/users?${query.toString()}`);
  const data = res.ok ? ((await res.json()) as UserListResponse) : null;

  const statuses = [
    'invited',
    'pending_verification',
    'verified_citizen',
    'observer',
    'external_collaborator',
    'rejected',
    'suspended',
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestión de usuarios</h1>
          <p className="page-sub">
            {data?.total ?? 0} usuario{data?.total !== 1 ? 's' : ''}
            {statusFilter ? ` · filtro: ${STATUS_LABELS[statusFilter] ?? statusFilter}` : ''}
          </p>
        </div>
        <Link href="/admin/invite" className="btn btn-primary btn-sm">
          + Invitar usuario
        </Link>
      </div>

      {/* Filtro por estado */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        <Link
          href="/admin/users"
          className={`btn btn-sm ${!statusFilter ? 'btn-primary' : 'btn-ghost'}`}
        >
          Todos
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/admin/users?status=${s}`}
            className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {!data && <p className="empty-state">Error cargando usuarios.</p>}

      {data && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th>Registro</th>
                  <th>Último acceso</th>
                  <th>Cambiar estado</th>
                </tr>
              </thead>
              <tbody>
                {data.users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted" style={{ textAlign: 'center' }}>
                      No hay usuarios para este filtro.
                    </td>
                  </tr>
                ) : (
                  data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="text-sm">{user.displayName ?? '—'}</div>
                        <div className="text-xs text-muted">{user.email}</div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[user.status] ?? 'badge-neutral'}`}>
                          {STATUS_LABELS[user.status] ?? user.status}
                        </span>
                      </td>
                      <td className="text-xs">
                        {new Date(user.createdAt).toLocaleDateString('es-NI')}
                      </td>
                      <td className="text-xs text-muted">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleDateString('es-NI')
                          : '—'}
                      </td>
                      <td>
                        <ChangeStatusForm
                          userId={user.id}
                          currentStatus={user.status as AccountStatus}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
