'use client';

import { useState, useTransition } from 'react';
import { iniciarBifurcacion, sumarmeAIniciativa } from '@/lib/actions';

/**
 * Para quien apoyó una solución que puede bifurcarse: inicia la iniciativa de un grupo o, si ya
 * existe (`bifurcacionId`), se suma a ella. En ambos casos, al salir bien, se va a la iniciativa.
 */
export function ImpulsarSolucion({ solucionId, bifurcacionId = null }: { solucionId: string; bifurcacionId?: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const r = bifurcacionId ? await sumarmeAIniciativa(bifurcacionId) : await iniciarBifurcacion(solucionId);
      if (r && 'error' in r) setError(r.error);
    });
  }

  return (
    <div className="mt-1">
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={run}>
        {bifurcacionId ? 'Sumarme a esta iniciativa' : 'Impulsar esta solución como iniciativa de un grupo'}
      </button>
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
