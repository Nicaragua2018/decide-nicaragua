'use client';

import { useState, useTransition } from 'react';
import { resolveAppeal } from '@/lib/actions';
import { MODERACION_CAUSAS } from '@decide/shared';
import type { ModerationAppeal } from '@decide/shared';

const TIPO: Record<ModerationAppeal['target'], string> = {
  tema: 'Tema',
  respuesta: 'Respuesta',
  inquietud: 'Inquietud',
  frase: 'Frase',
  solucion: 'Solución',
  informe: 'Informe',
};

/** Etiqueta de la causa más el detalle (si lo hay); sin causa, el motivo de las moderaciones viejas. */
function motivo(a: ModerationAppeal): string {
  if (!a.causa) return a.reason;
  const etiqueta = MODERACION_CAUSAS.find((c) => c.value === a.causa)?.label ?? a.causa;
  return a.reason.trim() ? `${etiqueta}: ${a.reason}` : etiqueta;
}

export function AppealsList({ appeals }: { appeals: ModerationAppeal[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(id: string, restore: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await resolveAppeal(id, restore);
      if ('error' in r) setError(r.error);
    });
  }

  if (appeals.length === 0) return <p className="empty-state">No hay apelaciones pendientes.</p>;

  return (
    <>
      {appeals.map((a) => (
        <div key={a.id} className="card">
          <p className="card-title">{TIPO[a.target]}</p>
          <p className="card-meta">Motivo de la moderación: {motivo(a)}</p>
          <p className="text-sm font-medium mt-2">Texto original</p>
          <blockquote className="card" style={{ whiteSpace: 'pre-wrap' }}>{a.originalText}</blockquote>
          <p className="text-sm font-medium mt-2">Apelación</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{a.appealText}</p>
          <div className="flex gap-2 mt-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => resolve(a.id, true)}>
              Restaurar
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => resolve(a.id, false)}>
              Mantener oculto
            </button>
          </div>
        </div>
      ))}
      {error && <p className="alert alert-error">{error}</p>}
    </>
  );
}
