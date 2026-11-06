'use client';

import { useState, useTransition } from 'react';
import { iniciarBifurcacion } from '@/lib/actions';

export function ImpulsarSolucion({ solucionId }: { solucionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await iniciarBifurcacion(solucionId);
      if (r && 'error' in r) setError(r.error);
    });
  }

  return (
    <div className="mt-1">
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={run}>
        Impulsar esta solución como iniciativa de un grupo
      </button>
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
