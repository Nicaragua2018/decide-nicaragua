import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { GroupListResponse, GroupType } from '@decide/shared';

export const metadata: Metadata = { title: 'Mis Grupos' };

const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  territorial_origin:    'Departamento de origen',
  territorial_residence: 'País de residencia',
  custom:                'Grupo personalizado',
};

export default async function DashboardPage() {
  const res = await serverFetch('/api/groups/my');

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
