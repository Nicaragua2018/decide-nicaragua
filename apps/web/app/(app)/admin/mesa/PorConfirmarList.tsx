'use client';

import { useState, useTransition } from 'react';
import { MODERACION_CAUSAS } from '@decide/shared';
import type { ModeracionPorConfirmar } from '@decide/shared';
import { confirmarModeracion } from '@/lib/actions';

const TIPO: Record<ModeracionPorConfirmar['target'], string> = {
  tema: 'Tema',
  respuesta: 'Respuesta',
  inquietud: 'Inquietud',
  frase: 'Frase',
  solucion: 'Solución',
  informe: 'Informe',
};

export function PorConfirmarList({ items }: { items: ModeracionPorConfirmar[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolver(id: string, aprobar: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await confirmarModeracion(id, aprobar);
      if ('error' in r) setError(r.error);
    });
  }

  if (items.length === 0) return <p className="empty-state">No hay ocultaciones por confirmar.</p>;

  return (
    <>
      {items.map((m) => (
        <div key={m.id} className="card">
          <p className="card-title">{TIPO[m.target]}</p>
          {m.contexto && <p className="text-sm text-muted">{m.contexto}</p>}
          <p className="card-meta">
            Causa: {MODERACION_CAUSAS.find((c) => c.value === m.causa)?.label ?? m.causa}
          </p>
          {m.detalle && <p className="text-sm">Detalle: {m.detalle}</p>}
          <p className="text-sm font-medium mt-2">Texto original</p>
          <blockquote className="card" style={{ whiteSpace: 'pre-wrap' }}>{m.originalText}</blockquote>
          <p className="card-meta">
            {m.estado === 'provisional' ? 'Oculto provisionalmente' : 'Pendiente'} · vence el{' '}
            {new Date(m.venceAt).toLocaleDateString('es-NI')}
          </p>
          {m.esMia ? (
            <p className="text-sm text-muted mt-2">Esperando a otra persona de la mesa</p>
          ) : (
            <div className="flex gap-2 mt-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => resolver(m.id, true)}>
                Confirmar
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => resolver(m.id, false)}>
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
