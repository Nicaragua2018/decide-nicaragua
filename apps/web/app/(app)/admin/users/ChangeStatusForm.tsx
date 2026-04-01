'use client';

import { useState, useTransition } from 'react';
import { AccountStatus } from '@decide/shared';
import { updateUserStatus } from '@/lib/actions';

/** Transiciones permitidas por estado (espejo del backend — sólo para la UI). */
const TRANSITIONS: Partial<Record<AccountStatus, AccountStatus[]>> = {
  [AccountStatus.invited]:               [AccountStatus.rejected],
  [AccountStatus.pending_verification]:  [
    AccountStatus.verified_citizen,
    AccountStatus.observer,
    AccountStatus.external_collaborator,
    AccountStatus.rejected,
  ],
  [AccountStatus.verified_citizen]:      [AccountStatus.suspended],
  [AccountStatus.observer]:              [AccountStatus.verified_citizen, AccountStatus.suspended],
  [AccountStatus.external_collaborator]: [AccountStatus.verified_citizen, AccountStatus.suspended],
  [AccountStatus.suspended]:             [AccountStatus.observer, AccountStatus.verified_citizen],
};

const STATUS_LABELS: Record<AccountStatus, string> = {
  [AccountStatus.invited]:               'Invitado',
  [AccountStatus.pending_verification]:  'Pendiente',
  [AccountStatus.verified_citizen]:      'Ciudadano',
  [AccountStatus.observer]:             'Observador',
  [AccountStatus.external_collaborator]:'Colaborador ext.',
  [AccountStatus.rejected]:             'Rechazado',
  [AccountStatus.suspended]:            'Suspendido',
};

interface Props {
  userId: string;
  currentStatus: AccountStatus;
}

export default function ChangeStatusForm({ userId, currentStatus }: Props) {
  const allowed = TRANSITIONS[currentStatus] ?? [];
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (allowed.length === 0) {
    return <span className="text-xs text-muted">—</span>;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    if (!newStatus) return;
    setError(null);

    startTransition(async () => {
      const result = await updateUserStatus(userId, newStatus);
      if ('error' in result) setError(result.error);
    });
  }

  return (
    <div>
      <select
        className="form-input"
        style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
        defaultValue=""
        onChange={handleChange}
        disabled={isPending}
      >
        <option value="" disabled>Cambiar…</option>
        {allowed.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error && <p className="form-error text-xs">{error}</p>}
    </div>
  );
}
