'use client';

import { useState, useTransition } from 'react';
import { proposeModo, setObjecion } from '@/lib/actions';
import type { DecisionModoValue } from '@decide/shared';

const MODO_TEXTO: Record<DecisionModoValue, string> = {
  excluyentes: 'excluyentes: solo una puede llevarse a cabo',
  compatibles: 'compatibles: pueden aprobarse varias',
};

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
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}

export function ObjecionPanel({
  proposalId,
  modoPropuesto,
  puedoObjetar,
  yoObjete,
  fraccionObjecionPct,
}: {
  proposalId: string;
  modoPropuesto: DecisionModoValue | null;
  puedoObjetar: boolean;
  yoObjete: boolean;
  fraccionObjecionPct: number;
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
      {modoPropuesto && <p>Se propone decidir como {MODO_TEXTO[modoPropuesto]}</p>}
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
        Si se opone al menos el {fraccionObjecionPct} % de quienes participaron, se usa el otro modo
      </p>
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
