'use client';

import { useState, useTransition } from 'react';
import { voteFrase } from '@/lib/actions';
import { ModerarForm } from '@/components/ModerarForm';
import type { FraseVotoValue } from '@decide/shared';

const OPCIONES: { value: FraseVotoValue; label: string; className: string }[] = [
  { value: 'de_acuerdo', label: 'De acuerdo', className: 'btn btn-primary btn-sm' },
  { value: 'en_desacuerdo', label: 'En desacuerdo', className: 'btn btn-ghost btn-sm' },
  { value: 'paso', label: 'Paso', className: 'btn btn-ghost btn-sm' },
];

export function VotarFrase({ fraseId, proposalId }: { fraseId: string; proposalId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function votar(value: FraseVotoValue) {
    setError(null);
    startTransition(async () => {
      const result = await voteFrase(fraseId, value, proposalId);
      if ('error' in result) setError(result.error);
    });
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {OPCIONES.map((o) => (
          <button
            key={o.value}
            type="button"
            className={o.className}
            disabled={pending}
            onClick={() => votar(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}

export function OcultarFrase({ fraseId, proposalId }: { fraseId: string; proposalId: string }) {
  return <ModerarForm target="frase" targetId={fraseId} topicId={proposalId} colapsable className="comment-reply-form" />;
}
