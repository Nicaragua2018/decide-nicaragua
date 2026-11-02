import type { Metadata } from 'next';
import type { BoardActionSummary, BoardSeatSummary, UserListResponse } from '@decide/shared';
import { serverFetch } from '@/lib/api';
import { AssignSeatForm, ProposeActionForm, ROLE_LABEL, VoteButtons } from './MesaForms';

export const metadata: Metadata = { title: 'Mesa directiva' };

export default async function MesaPage() {
  const [seatsRes, meRes, actionsRes, usersRes] = await Promise.all([
    serverFetch('/api/board/seats'),
    serverFetch('/api/board/me'),
    serverFetch('/api/board/actions'),
    serverFetch('/api/users?status=verified_citizen'),
  ]);
  const seats = seatsRes.ok ? ((await seatsRes.json()) as BoardSeatSummary[]) : [];
  const me = meRes.ok ? ((await meRes.json()) as { role: string | null }) : { role: null };
  if (!me.role) return <p className="empty-state">Esta sección es solo para la mesa directiva.</p>;

  const actions = actionsRes.ok ? ((await actionsRes.json()) as BoardActionSummary[]) : [];
  const users = usersRes.ok ? ((await usersRes.json()) as UserListResponse).users : [];
  const noElected = seats.every((s) => s.source !== 'eleccion');

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Mesa directiva</h1>
        <p className="page-sub">Tres cargos. Las acciones delicadas necesitan la aprobación de 2 de los 3.</p>
      </div>

      {seats.map((s) => (
        <div key={s.role} className="card">
          <p className="card-title">{ROLE_LABEL[s.role]}</p>
          <p className="card-meta">{s.holder ? `${s.holder.displayName} · ${s.source === 'fundador' ? 'fundador' : 'electo'}` : 'Vacante'}</p>
        </div>
      ))}

      {me.role === 'administrador' && noElected && users.length > 0 && (
        <section className="mt-2">
          <h2 className="section-title">Cargos fundadores</h2>
          <p className="text-sm text-muted">Hasta la primera elección, el administrador asigna los otros dos cargos.</p>
          <AssignSeatForm members={users.filter((u) => u.profileId).map((u) => ({ profileId: u.profileId!, displayName: u.displayName ?? '—' }))} />
        </section>
      )}

      {users.length > 0 && (
        <section className="mt-2">
          <h2 className="section-title">Proponer una acción</h2>
          <ProposeActionForm people={users.map((u) => ({ userId: u.id, displayName: u.displayName ?? '—' }))} />
        </section>
      )}

      <section className="mt-2">
        <h2 className="section-title">Acciones</h2>
        {actions.length === 0 && <p className="empty-state">No hay acciones.</p>}
        {actions.map((a) => (
          <div key={a.id} className="card">
            <p className="card-title">
              {a.type === 'suspend_user' ? 'Suspender' : `Cambiar origen a ${String(a.params['birthDepartment'])}`}: {a.targetDisplayName ?? '—'}
            </p>
            <p className="card-meta">
              Propuso {a.proposedBy} · {a.approvals.filter((x) => x.approve).length} a favor ·{' '}
              {a.approvals.filter((x) => !x.approve).length} en contra · {a.status}
            </p>
            <p className="text-sm">{a.reason}</p>
            {a.status === 'pending' && <VoteButtons actionId={a.id} />}
          </div>
        ))}
      </section>
    </>
  );
}
