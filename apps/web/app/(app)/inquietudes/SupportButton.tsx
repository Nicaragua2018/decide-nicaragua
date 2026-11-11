'use client';

import { useState, useTransition } from 'react';
import { supportInquietud, unsupportInquietud } from '@/lib/actions';

export function SupportButton({ id, supported, count }: { id: string; supported: boolean; count: number }) {
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
    <div className="inq-apoyo-caja">
      <button
        type="button"
        className={supported ? 'inq-apoyo inq-apoyo-activo' : 'inq-apoyo'}
        disabled={pending}
        aria-pressed={supported}
        aria-label={supported ? 'Quitar apoyo' : 'Apoyar'}
        onClick={toggle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m18 15-6-6-6 6" />
        </svg>
        <span className="inq-apoyo-n">{count}</span>
      </button>
      {error && <p className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
