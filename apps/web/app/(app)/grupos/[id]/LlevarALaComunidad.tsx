'use client';

import { useState, useTransition } from 'react';
import { llevarALaComunidad } from '@/lib/actions';

export function LlevarALaComunidad({ grupoId, solucionId }: { grupoId: string; solucionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await llevarALaComunidad(grupoId, solucionId);
      if (r && 'error' in r) setError(r.error);
    });
  }

  return (
    <div className="mt-2">
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={run}>
        Llevar a la comunidad
      </button>
      <p className="text-xs text-muted mt-1">Se presenta como inquietud que la comunidad debe responder</p>
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
