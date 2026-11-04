'use client';

import { useState, useTransition } from 'react';
import { supportInquietud, unsupportInquietud } from '@/lib/actions';

export function SupportButton({ id, supported }: { id: string; supported: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const r = await (supported ? unsupportInquietud(id) : supportInquietud(id));
      if ('error' in r) setError(r.error);
    });
  }

  return (
    <>
      <button
        type="button"
        className={supported ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
        disabled={pending}
        onClick={toggle}
      >
        {supported ? 'Quitar apoyo' : 'Apoyar'}
      </button>
      {error && <p className="alert alert-error mt-2">{error}</p>}
    </>
  );
}
