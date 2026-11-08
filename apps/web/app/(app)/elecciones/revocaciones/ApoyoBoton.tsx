'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apoyarRevocacion } from '@/lib/actions';

export function ApoyoBoton({ id, apoyaste }: { id: string; apoyaste: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function alternar() {
    setError(null);
    startTransition(async () => {
      const r = await apoyarRevocacion(id, !apoyaste);
      if ('error' in r) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        className={`el-btn ${apoyaste ? 'el-btn-secundario' : 'el-btn-primario'}`}
        style={{ minHeight: 44 }}
        disabled={pendiente}
        onClick={alternar}
      >
        {apoyaste ? 'Quitar mi apoyo' : 'Apoyar'}
      </button>
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
