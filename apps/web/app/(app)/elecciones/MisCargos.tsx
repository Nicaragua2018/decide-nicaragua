'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CARGO_ETIQUETA, type MiCargoVista } from '@decide/shared';
import { fechaLarga } from '@/components/elecciones/textos';
import { renunciarCargo } from '@/lib/actions';

function Cargo({ c }: { c: MiCargoVista }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function renunciar() {
    setError(null);
    startTransition(async () => {
      const r = await renunciarCargo(c.id);
      if ('error' in r) {
        setError(r.error);
        setConfirmando(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="el-tarjeta">
      <p className="el-etiqueta">{CARGO_ETIQUETA[c.tipo]}{c.comunidad ? ` · ${c.comunidad}` : ''}</p>
      <p className="el-nota">
        {c.hasta ? `Del ${fechaLarga(c.desde)} al ${fechaLarga(c.hasta)}` : `Desde el ${fechaLarga(c.desde)}`}
        {c.enFunciones && <span className="el-insignia el-insignia-azul">En funciones</span>}
      </p>
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      {c.puedeRenunciar &&
        (confirmando ? (
          <div role="group" aria-label="Confirmar la renuncia" className="el-form">
            <p><strong>¿Seguro? Se abrirá una elección para cubrir tu puesto.</strong></p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="el-btn el-btn-primario" style={{ minHeight: 44 }} disabled={pendiente} onClick={renunciar}>
                Sí, renunciar
              </button>
              <button type="button" className="el-btn el-btn-secundario" style={{ minHeight: 44 }} disabled={pendiente} onClick={() => setConfirmando(false)}>
                No, quedarme
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" className="el-btn el-btn-secundario" style={{ minHeight: 44 }} onClick={() => setConfirmando(true)}>
              Renunciar
            </button>
          </div>
        ))}
    </li>
  );
}

/** Los cargos vigentes de quien entra. No se muestra si no tiene ninguno. */
export function MisCargos({ cargos }: { cargos: MiCargoVista[] }) {
  if (cargos.length === 0) return null;
  return (
    <section className="el-bloque" aria-labelledby="mis-cargos-titulo">
      <h2 id="mis-cargos-titulo" className="el-h2">Mis cargos</h2>
      <ul className="el-lista" style={{ listStyle: 'none', padding: 0 }}>
        {cargos.map((c) => (
          <Cargo key={c.id} c={c} />
        ))}
      </ul>
    </section>
  );
}
