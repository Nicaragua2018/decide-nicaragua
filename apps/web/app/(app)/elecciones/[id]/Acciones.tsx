'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { MODERACION_CAUSAS, type CandidaturaVista } from '@decide/shared';
import { pedirOcultarCandidatura, retirarCandidatura } from '@/lib/actions';
import { FichaCandidatura } from '@/components/elecciones/FichaCandidatura';
import { CandidaturaForm } from './CandidaturaForm';

/** La ficha propia: el aviso si la mesa la ocultó, «Editar mi ficha» y «Retirarme» mientras haya candidaturas. */
export function MiCandidatura({
  eleccionId,
  ficha,
  oculta,
  aviso,
  enCandidaturas,
}: {
  eleccionId: string;
  ficha: CandidaturaVista;
  oculta: boolean;
  aviso: string | null;
  enCandidaturas: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [cambiada, setCambiada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function retirarme() {
    if (!window.confirm('¿Seguro que quieres retirar tu candidatura? Tu ficha deja de verse.')) return;
    setError(null);
    startTransition(async () => {
      const r = await retirarCandidatura(eleccionId);
      if ('error' in r) setError(r.error);
    });
  }

  return (
    <section className="el-bloque el-mia" aria-labelledby="mia-titulo">
      <h2 id="mia-titulo" className="el-h2">Tu ficha</h2>
      {oculta && (
        <div className="alert alert-warning" role="status">
          <p>{aviso ?? 'Tu ficha la ocultó la mesa.'}</p>
          {enCandidaturas && <p>Puedes cambiarla mientras dure el plazo de candidaturas; volverá a revisarse.</p>}
        </div>
      )}
      {editando ? (
        <CandidaturaForm
          eleccionId={eleccionId}
          editar
          inicial={{ presentacion: ficha.presentacion, compromisos: ficha.compromisos }}
          alTerminar={() => {
            setEditando(false);
            setCambiada(true);
          }}
        />
      ) : (
        <FichaCandidatura ficha={ficha} />
      )}
      {enCandidaturas && (
        <div className="el-papeleta-acciones">
          {!editando ? (
            <button
              type="button"
              className="el-btn el-btn-secundario"
              onClick={() => {
                setCambiada(false);
                setEditando(true);
              }}
            >
              Editar mi ficha
            </button>
          ) : (
            <button type="button" className="el-btn el-btn-secundario" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={retirarme}>
            Retirar mi candidatura
          </button>
        </div>
      )}
      {cambiada && (
        <p role="status" className="alert alert-success mt-2">
          Tu ficha quedó cambiada.
        </p>
      )}
      {error && (
        <p role="alert" className="alert alert-error mt-2">
          {error}
        </p>
      )}
    </section>
  );
}

/** Para la mesa: pedir que se oculte una ficha. La segunda firma se da en la página de la mesa. */
export function OcultarFicha({ eleccionId, ficha }: { eleccionId: string; ficha: CandidaturaVista }) {
  const [causa, setCausa] = useState('');
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `causa-${ficha.id}`;

  if (hecho) {
    return (
      <p role="status" className="el-nota">
        Pedido enviado. Falta la firma de otra persona de la mesa en <Link href="/admin/mesa">la página de la mesa</Link>.
      </p>
    );
  }

  return (
    <details className="el-ocultar">
      <summary>Pedir que se oculte esta ficha</summary>
      <form
        className="el-ocultar-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!causa) return;
          setError(null);
          startTransition(async () => {
            const r = await pedirOcultarCandidatura(eleccionId, ficha.id, causa);
            if ('error' in r) setError(r.error);
            else setHecho(true);
          });
        }}
      >
        <label htmlFor={id} className="form-label">
          Causa
        </label>
        <select id={id} className="form-select" required value={causa} onChange={(e) => setCausa(e.target.value)}>
          <option value="">Elige una causa</option>
          {MODERACION_CAUSAS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending || !causa}>
          Pedir que se oculte
        </button>
        <p className="el-nota">Se oculta solo si firman dos personas de la mesa.</p>
        {error && (
          <p role="alert" className="alert alert-error">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
