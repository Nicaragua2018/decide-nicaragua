'use client';

import { useActionState, useTransition } from 'react';
import { NICARAGUA_DEPARTMENTS } from '@decide/shared';
import { assignSeat, proposeBoardAction, voteBoardAction, type ActionResult } from '@/lib/actions';

const ROLE_LABEL: Record<string, string> = {
  administrador: 'Administrador',
  coordinador_general: 'Coordinador general',
  secretario: 'Secretario',
};

export function AssignSeatForm({ members }: { members: { profileId: string; displayName: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(assignSeat, null);
  return (
    <form action={action} className="form">
      <select name="role" className="form-select" required>
        <option value="coordinador_general">{ROLE_LABEL['coordinador_general']}</option>
        <option value="secretario">{ROLE_LABEL['secretario']}</option>
      </select>
      <select name="profileId" className="form-select" required>
        <option value="">— Miembro verificado —</option>
        {members.map((m) => (
          <option key={m.profileId} value={m.profileId}>{m.displayName}</option>
        ))}
      </select>
      <button className="btn btn-primary" disabled={pending}>Asignar cargo fundador</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}

export function ProposeActionForm({ people }: { people: { userId: string; displayName: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(proposeBoardAction, null);
  return (
    <form action={action} className="form">
      <select name="type" className="form-select" required>
        <option value="suspend_user">Suspender una cuenta</option>
        <option value="change_origin">Cambiar territorio de origen</option>
      </select>
      <select name="targetUserId" className="form-select" required>
        <option value="">— Persona —</option>
        {people.map((p) => (
          <option key={p.userId} value={p.userId}>{p.displayName}</option>
        ))}
      </select>
      <select name="birthDepartment" className="form-select">
        <option value="">(Solo para cambio de origen) nuevo territorio</option>
        {NICARAGUA_DEPARTMENTS.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <input name="reason" className="form-input" placeholder="Motivo" required minLength={3} maxLength={500} />
      <button className="btn btn-primary" disabled={pending}>Proponer (necesita 2 de 3)</button>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}

export function VoteButtons({ actionId }: { actionId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex" style={{ gap: 8 }}>
      <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { await voteBoardAction(actionId, true); })}>
        Aprobar
      </button>
      <button className="btn" disabled={pending} onClick={() => start(async () => { await voteBoardAction(actionId, false); })}>
        Rechazar
      </button>
    </div>
  );
}

export { ROLE_LABEL };
