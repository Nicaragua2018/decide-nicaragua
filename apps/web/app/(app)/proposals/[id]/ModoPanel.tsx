'use client';

import { useState, useTransition } from 'react';
import { proposeModo, setObjecion } from '@/lib/actions';
import type { DecisionModoValue } from '@decide/shared';

export function ProponerModo({ proposalId }: { proposalId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function proponer(modo: DecisionModoValue) {
    setError(null);
    startTransition(async () => {
      const r = await proposeModo(proposalId, modo);
      if ('error' in r) setError(r.error);
    });
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => proponer('excluyentes')}>
          Excluyentes: solo una puede llevarse a cabo
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => proponer('compatibles')}>
          Compatibles: pueden aprobarse varias
        </button>
      </div>
      {error && <p className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}

export function ObjecionPanel({
  proposalId,
  modoPropuesto,
  puedoObjetar,
  yoObjete,
}: {
  proposalId: string;
  modoPropuesto: DecisionModoValue | null;
  puedoObjetar: boolean;
  yoObjete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function objetar(objeto: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setObjecion(proposalId, objeto);
      if ('error' in r) setError(r.error);
    });
  }

  return (
    <div>
      {modoPropuesto && <p>Se propone decidir como {modoPropuesto}</p>}
      {puedoObjetar && (
        <p className="mt-2">
          <button
            type="button"
            className={yoObjete ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
            disabled={pending}
            onClick={() => objetar(!yoObjete)}
          >
            {yoObjete ? 'Retirar mi objeción' : 'Me opongo'}
          </button>
        </p>
      )}
      <p className="text-xs text-muted mt-2">
        Si se opone al menos un tercio de quienes participaron, se usa el otro modo
      </p>
      {error && <p className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
