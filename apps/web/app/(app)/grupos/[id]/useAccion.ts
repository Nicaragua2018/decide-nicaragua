'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/actions';

/** Ejecuta una acción del servidor, muestra su error y refresca la página si salió bien. */
export function useAccion() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function run(fn: () => Promise<ActionResult>, alOk?: () => void) {
    setError(null);
    setHecho(false);
    startTransition(async () => {
      const r = await fn();
      if (r && 'error' in r) setError(r.error);
      else {
        setHecho(true);
        alOk?.();
        router.refresh();
      }
    });
  }

  return { pending, error, hecho, run };
}
