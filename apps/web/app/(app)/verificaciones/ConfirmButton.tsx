'use client';

import { useState, useTransition } from 'react';
import { confirmReference } from '@/lib/actions';

export function ConfirmButton({ userId, displayName }: { userId: string; displayName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`¿Confirmas que conoces a ${displayName}, que es nicaragüense y que es una sola persona?`)) return;
          start(async () => {
            const r = await confirmReference(userId);
            if ('error' in r) setError(r.error);
          });
        }}
      >
        {pending ? 'Confirmando…' : 'Confirmar'}
      </button>
      {error && <p className="alert alert-error mt-1">{error}</p>}
    </div>
  );
}
