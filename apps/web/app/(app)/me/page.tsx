import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { AuthResponse } from '@decide/shared';

export const metadata: Metadata = { title: 'Mi perfil' };

const STATUS_LABEL: Record<string, string> = {
  invited:                'Invitado',
  pending_verification:   'Pendiente de verificación',
  verified_citizen:       'Ciudadano verificado',
  observer:               'Observador',
  external_collaborator:  'Colaborador externo',
  rejected:               'Rechazado',
  suspended:              'Suspendido',
};

export default async function MePage() {
  const res = await serverFetch('/api/auth/me');
  if (!res.ok) return <p className="empty-state">Error cargando perfil.</p>;
  const { user } = (await res.json()) as AuthResponse;

  const statusBadge =
    ['verified_citizen', 'observer', 'external_collaborator'].includes(user.status)
      ? 'badge-open'
      : ['rejected', 'suspended'].includes(user.status)
        ? 'badge-cancelled'
        : 'badge-pending';

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Mi perfil</h1>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <table>
          <tbody>
            <tr>
              <th style={{ width: 140 }}>Nombre público</th>
              <td>{user.displayName ?? '—'}</td>
            </tr>
            <tr>
              <th>Correo</th>
              <td>{user.email}</td>
            </tr>
            <tr>
              <th>Estado</th>
              <td>
                <span className={`badge ${statusBadge}`}>
                  {STATUS_LABEL[user.status] ?? user.status}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {user.status === 'pending_verification' && (
          <div className="alert alert-info mt-4">
            Tu cuenta está pendiente de verificación por un administrador.
            Recibirás un aviso cuando sea revisada.
          </div>
        )}
      </div>
    </>
  );
}
