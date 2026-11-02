import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { GroupListResponse, GroupType, VerificationStatus } from '@decide/shared';

export const metadata: Metadata = { title: 'Mis Grupos' };

const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  territorial_origin:    'Departamento de origen',
  territorial_residence: 'País de residencia',
  custom:                'Grupo personalizado',
};

export default async function DashboardPage() {
  const vRes = await serverFetch('/api/verifications/me');
  const verif = vRes.ok ? ((await vRes.json()) as VerificationStatus) : null;
  if (verif && verif.status === 'pending_verification') {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Tu verificación</h1>
          <p className="page-sub">
            Para participar necesitas dos confirmaciones: la de quien te invitó y la del administrador u otro
            miembro de tu territorio o de tu comunidad de acogida.
          </p>
        </div>
        <div className="card">
          <p className="card-title">{verif.references.length} de 2 confirmaciones</p>
          {verif.references.map((r) => (
            <p key={r.kind} className="text-sm">✓ {r.kind === 'invitador' ? 'Quien te invitó' : 'Segunda referencia'}: {r.displayName}</p>
          ))}
          {verif.missing.map((k) => (
            <p key={k} className="text-sm text-muted">… Falta: {k === 'invitador' ? 'quien te invitó' : 'una segunda referencia'}</p>
          ))}
        </div>
      </>
    );
  }

  const res = await serverFetch('/api/groups');

  if (!res.ok) {
    return <p className="empty-state">No se pudieron cargar los grupos. Intenta de nuevo.</p>;
  }

  const data = (await res.json()) as GroupListResponse;
  const groups = data.groups ?? [];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Mis grupos</h1>
        <p className="page-sub">Grupos a los que perteneces según tu perfil.</p>
      </div>

      {groups.length === 0 ? (
        <p className="empty-state">No tienes grupos asignados aún.</p>
      ) : (
        <div>
          {groups.map((group) => (
            <Link key={group.id} href={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="card-title">{group.name}</p>
                    <p className="card-meta">{GROUP_TYPE_LABEL[group.type]}</p>
                    {group.description && (
                      <p className="text-sm text-muted mt-1">{group.description}</p>
                    )}
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
