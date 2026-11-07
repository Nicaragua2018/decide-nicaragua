'use client';

import { useState, useTransition } from 'react';
import { MODERACION_CAUSAS } from '@decide/shared';
import type { TextoEnRevisionView } from '@decide/shared';
import { firmarRevision } from '@/lib/actions';

export function RevisionesList({ items, mesaSuficiente }: { items: TextoEnRevisionView[]; mesaSuficiente: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function firmar(id: string, aprobar: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await firmarRevision(id, aprobar);
      if ('error' in r) setError(r.error);
    });
  }

  return (
    <>
      {!mesaSuficiente && (
        <p className="alert alert-warning">La mesa necesita al menos 2 cargos ocupados para revisar textos.</p>
      )}
      {items.length === 0 && <p className="empty-state">No hay textos en revisión.</p>}
      {items.map((r) => (
        <div key={r.id} className="card">
          <blockquote className="card" style={{ whiteSpace: 'pre-wrap' }}>{r.texto}</blockquote>
          <p className="card-meta">
            Causa: {MODERACION_CAUSAS.find((c) => c.value === r.causa)?.label ?? r.causa}
          </p>
          <p className="card-meta">
            Aprobaciones: {r.aprobaciones} de 2 · vence el {new Date(r.venceAt).toLocaleDateString('es-NI')}
          </p>
          {r.yaFirme ? (
            <p className="text-sm text-muted mt-2">Ya diste tu voto. Esperando a otra persona de la mesa.</p>
          ) : (
            <div className="flex gap-2 mt-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => firmar(r.id, true)}>
                Aprobar y publicar
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => firmar(r.id, false)}>
                Rechazar
              </button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="alert alert-error">{error}</p>}
    </>
  );
}
