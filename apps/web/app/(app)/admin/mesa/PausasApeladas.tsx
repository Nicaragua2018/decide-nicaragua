'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MODERACION_CAUSAS } from '@decide/shared';
import type { PausaApeladaItem } from '@decide/shared';
import { resolverPausa } from '@/lib/actions';

export function PausasApeladas({ items }: { items: PausaApeladaItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolver(id: string, reanudar: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await resolverPausa(id, reanudar);
      if ('error' in r) setError(r.error);
      else router.refresh();
    });
  }

  if (items.length === 0) return <p className="empty-state">No hay pausas apeladas pendientes.</p>;
  return (
    <>
      {items.map((p) => (
        <div key={p.grupoId} className="card">
          <p className="card-title">Iniciativa de un grupo: {p.solucionTitulo}</p>
          <p className="card-meta">
            Causa de la pausa: {MODERACION_CAUSAS.find((c) => c.value === p.causa)?.label ?? p.causa}
            {p.detalle && <> · {p.detalle}</>}
          </p>
          <p className="text-sm font-medium mt-2">Apelación</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.apelacion}</p>
          <p className="text-xs text-muted">{new Date(p.apeladaAt).toLocaleDateString('es-NI')}</p>
          <div className="flex gap-2 mt-2">
            <Link href={`/grupos/${p.grupoId}`} className="btn btn-ghost btn-sm">Ver</Link>
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => resolver(p.grupoId, true)}>Reanudar</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => resolver(p.grupoId, false)}>Mantener</button>
          </div>
        </div>
      ))}
      {error && <p role="alert" className="alert alert-error">{error}</p>}
    </>
  );
}
