'use client';

import { useState, useTransition } from 'react';
import { AccountStatus } from '@decide/shared';
import { updateUserStatus } from '@/lib/actions';

/**
 * Lo único que el panel puede hacer (espejo del backend): rechazar una cuenta
 * invitada o pendiente. Verificar va por dos referencias; suspender, reactivar
 * u otorgar otro estatus lo decide la mesa (2 de 3) o una elección.
 */
const RECHAZABLES: AccountStatus[] = [AccountStatus.invited, AccountStatus.pending_verification];

interface Props {
  userId: string;
  currentStatus: AccountStatus;
}

export default function ChangeStatusForm({ userId, currentStatus }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!RECHAZABLES.includes(currentStatus)) {
    return <span className="text-xs text-muted">—</span>;
  }

  function handleReject() {
    if (!window.confirm('¿Rechazar esta cuenta? La persona no podrá entrar.')) return;
    setError(null);
    startTransition(async () => {
      const result = await updateUserStatus(userId, AccountStatus.rejected);
      if ('error' in result) setError(result.error);
    });
  }

  return (
    <div>
      <button type="button" className="btn btn-danger btn-sm" onClick={handleReject} disabled={isPending}>
        {isPending ? 'Rechazando…' : 'Rechazar'}
      </button>
      {error && <p className="form-error text-xs">{error}</p>}
    </div>
  );
}
