'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cambiarMembresiaGrupo } from '@/lib/actions';

export function EntrarSalir({
  grupoId,
  accion,
  small = true,
}: {
  grupoId: string;
  accion: 'entrar' | 'salir';
  small?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await cambiarMembresiaGrupo(grupoId, accion);
      if ('error' in r) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={`btn ${accion === 'entrar' ? 'btn-primary' : 'btn-ghost'}${small ? ' btn-sm' : ''}`}
        disabled={pending}
        onClick={run}
      >
        {accion === 'entrar' ? 'Unirme' : 'Salir del grupo'}
      </button>
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </>
  );
}
