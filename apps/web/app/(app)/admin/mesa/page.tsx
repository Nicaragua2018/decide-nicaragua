import type { Metadata } from 'next';
import { conUnidad, ruleDefinition } from '@decide/shared';
import type { TextoEnRevisionView } from '@decide/shared';
import type { BoardActionSummary, BoardSeatSummary, ModeracionPorConfirmar, ModerationAppeal, PausaApeladaItem, UserListResponse } from '@decide/shared';
import { serverFetch } from '@/lib/api';
import { AppealsList } from './AppealsList';
import { PausasApeladas } from './PausasApeladas';
import { PorConfirmarList } from './PorConfirmarList';
import { RevisionesList } from './RevisionesList';
import { AssignSeatForm, ProposeActionForm, ROLE_LABEL, VoteButtons } from './MesaForms';

export const metadata: Metadata = { title: 'Mesa directiva' };

function descripcionCambioRegla(a: BoardActionSummary): string {
  const key = String(a.params['key']);
  const valor = String(a.params['valor']);
  let label = key;
  let conSuUnidad = valor;
  try {
    const def = ruleDefinition(key);
    label = def.label;
    conSuUnidad = conUnidad(def, valor);
  } catch {
    // regla desconocida: se muestra la clave y el valor tal cual
  }
  return `Cambiar la regla de la colmena «${label}» a ${conSuUnidad}`;
}

export default async function MesaPage() {
  const [seatsRes, meRes, actionsRes, usersRes, appealsRes, porConfirmarRes, pausasRes, estadoRes, revisionesRes] = await Promise.all([
    serverFetch('/api/board/seats'),
    serverFetch('/api/board/me'),
    serverFetch('/api/board/actions'),
    serverFetch('/api/users?status=verified_citizen'),
    serverFetch('/api/forums/moderation/appeals'),
    serverFetch('/api/forums/moderation/por-confirmar'),
    serverFetch('/api/grupos/pausas/apeladas'),
    serverFetch('/api/asistente/estado'),
    serverFetch('/api/asistente/revisiones'),
  ]);
  const seats = seatsRes.ok ? ((await seatsRes.json()) as BoardSeatSummary[]) : [];
  const me = meRes.ok ? ((await meRes.json()) as { role: string | null }) : { role: null };
  if (!me.role) return <p className="empty-state">Esta sección es solo para la mesa directiva.</p>;

  const actions = actionsRes.ok ? ((await actionsRes.json()) as BoardActionSummary[]) : [];
  const users = usersRes.ok ? ((await usersRes.json()) as UserListResponse).users : [];
  const appeals = appealsRes.ok ? ((await appealsRes.json()) as ModerationAppeal[]) : [];
  const porConfirmar = porConfirmarRes.ok ? ((await porConfirmarRes.json()) as ModeracionPorConfirmar[]) : [];
  const pausas = pausasRes.ok ? ((await pausasRes.json()) as PausaApeladaItem[]) : [];
  const estadoAsistente = estadoRes.ok ? ((await estadoRes.json()) as { activo: boolean; topeAlcanzado: boolean }) : null;
  const revisiones = revisionesRes.ok
    ? ((await revisionesRes.json()) as { mesaSuficiente: boolean; revisiones: TextoEnRevisionView[] })
    : { mesaSuficiente: true, revisiones: [] };
  const noElected = seats.every((s) => s.source !== 'eleccion');

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Mesa directiva</h1>
        <p className="page-sub">Tres cargos. Las acciones delicadas necesitan la aprobación de 2 de los 3.</p>
      </div>

      {estadoAsistente?.topeAlcanzado && (
        <p className="alert alert-warning">
          El asistente alcanzó su tope de gasto del mes y descansa hasta el próximo. La plataforma sigue funcionando.
        </p>
      )}

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
              {a.type === 'change_rule'
                ? descripcionCambioRegla(a)
                : a.type === 'ocultar_candidatura'
                  ? `Ocultar la ficha de candidatura de ${a.targetDisplayName ?? '—'}`
                  : `${a.type === 'suspend_user' ? 'Suspender' : `Cambiar origen a ${String(a.params['birthDepartment'])}`}: ${a.targetDisplayName ?? '—'}`}
            </p>
            <p className="card-meta">
              Propuso {a.proposedBy ?? 'la comunidad'} · {a.approvals.filter((x) => x.approve).length} a favor ·{' '}
              {a.approvals.filter((x) => !x.approve).length} en contra · {a.status}
            </p>
            <p className="text-sm">{a.reason}</p>
            {a.status === 'pending' && <VoteButtons actionId={a.id} />}
          </div>
        ))}
      </section>

      <section className="mt-2">
        <h2 className="section-title">Ocultaciones por confirmar</h2>
        <PorConfirmarList items={porConfirmar} />
      </section>

      <section className="mt-2">
        <h2 className="section-title">Textos en revisión</h2>
        <RevisionesList items={revisiones.revisiones} mesaSuficiente={revisiones.mesaSuficiente} />
      </section>

      <section className="mt-2">
        <h2 className="section-title">Apelaciones de moderación</h2>
        <AppealsList appeals={appeals} />
      </section>

      <section className="mt-2">
        <h2 className="section-title">Pausas de iniciativas de un grupo apeladas</h2>
        <PausasApeladas items={pausas} />
      </section>
    </>
  );
}
