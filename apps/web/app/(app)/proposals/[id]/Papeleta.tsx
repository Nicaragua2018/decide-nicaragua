'use client';

import { useState, useTransition } from 'react';
import { castPapeleta } from '@/lib/actions';
import type { PapeletaValue } from '@decide/shared';

type Candidata = { id: string; title: string; description: string; hidden: boolean };

function actual(p: PapeletaValue | null, unica: boolean): string | null {
  if (!p) return null;
  if (p.abstencion) return 'Me abstengo';
  if (unica) return p.orden.length > 0 ? 'Apruebo' : 'No apruebo';
  return p.orden.length > 0 ? 'guardada con soluciones aceptadas' : 'Rechazo todas';
}

export function Papeleta({
  proposalId,
  candidatas,
  miPapeleta,
}: {
  proposalId: string;
  candidatas: Candidata[];
  miPapeleta: PapeletaValue | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>(
    miPapeleta && !miPapeleta.abstencion ? miPapeleta.orden : [],
  );
  const unica = candidatas.length === 1;
  const titulo = (id: string) => candidatas.find((c) => c.id === id)?.title ?? '';

  function enviar(abstencion: boolean, nuevoOrden: string[]) {
    setError(null);
    startTransition(async () => {
      const r = await castPapeleta(proposalId, abstencion, nuevoOrden);
      if ('error' in r) setError(r.error);
    });
  }

  function alternar(id: string) {
    setOrden((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }

  function mover(i: number, delta: number) {
    setOrden((o) => {
      const j = i + delta;
      if (j < 0 || j >= o.length) return o;
      const copia = [...o];
      const a = copia[i] as string;
      copia[i] = copia[j] as string;
      copia[j] = a;
      return copia;
    });
  }

  const marca = actual(miPapeleta, unica);
  const sel = miPapeleta?.abstencion
    ? 'abst'
    : miPapeleta
      ? miPapeleta.orden.length > 0
        ? 'si'
        : 'no'
      : null;
  const primera = candidatas[0];

  return (
    <div>
      {marca && <p className="alert alert-success mb-3">Tu papeleta: {marca}</p>}

      {unica && primera ? (
        <>
          <p className="font-medium">{primera.title}</p>
          {primera.description && <p className="text-sm text-muted mb-2">{primera.description}</p>}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className={sel === 'si' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              disabled={pending}
              onClick={() => enviar(false, [primera.id])}
            >
              Apruebo
            </button>
            <button
              type="button"
              className={sel === 'no' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              disabled={pending}
              onClick={() => enviar(false, [])}
            >
              No apruebo
            </button>
            <button
              type="button"
              className={sel === 'abst' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              disabled={pending}
              onClick={() => enviar(true, [])}
            >
              Me abstengo
            </button>
          </div>
        </>
      ) : (
        <>
          <ul>
            {candidatas.map((c) => (
              <li key={c.id} className="mb-2">
                <label className="flex gap-2 items-center">
                  <input type="checkbox" checked={orden.includes(c.id)} onChange={() => alternar(c.id)} />
                  <span>
                    {c.title} <span className="text-xs text-muted">La acepto</span>
                    {c.description && <span className="text-sm text-muted" style={{ display: 'block' }}>{c.description}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mb-3">Las que no marques cuentan como rechazadas</p>

          {orden.length > 1 && (
            <div className="mb-3">
              <p className="text-sm font-medium">Tu orden de preferencia</p>
              <ol>
                {orden.map((id, i) => (
                  <li key={id} className="flex gap-2 items-center mt-1">
                    <span>{i + 1}. {titulo(id)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Subir ${titulo(id)}`}
                      disabled={i === 0}
                      onClick={() => mover(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Bajar ${titulo(id)}`}
                      disabled={i === orden.length - 1}
                      onClick={() => mover(i, 1)}
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => enviar(false, orden)}>
              Guardar mi papeleta
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                setOrden([]);
                enviar(false, []);
              }}
            >
              Rechazo todas
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => enviar(true, [])}>
              Me abstengo
            </button>
          </div>
        </>
      )}
      {error && <p role="alert" className="alert alert-error mt-2">{error}</p>}
    </div>
  );
}
