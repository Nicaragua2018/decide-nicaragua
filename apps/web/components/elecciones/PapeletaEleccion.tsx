'use client';

import { useState, useTransition } from 'react';
import type { CandidaturaVista } from '@decide/shared';
import { votarEleccion } from '@/lib/actions';
import { FichaContenido } from './FichaCandidatura';

type MiPapeleta = { abstencion: boolean; orden: string[] } | null;

function textoGuardado(p: MiPapeleta, fichas: CandidaturaVista[]): string | null {
  if (!p) return null;
  if (p.abstencion) return 'Tu voto quedó guardado: te abstienes.';
  if (p.orden.length === 0) return 'Tu voto quedó guardado: rechazas a todas las personas.';
  const nombres = p.orden.map((id) => fichas.find((f) => f.id === id)?.nombre).filter(Boolean);
  return `Tu voto quedó guardado: aceptas a ${nombres.join(', ')}, en ese orden.`;
}

/**
 * La papeleta de una elección. Se toca a las personas que se aceptan, en orden de preferencia;
 * quien no se toca queda rechazado. Una papeleta es una abstención o un orden (vacío = rechazo a todas).
 */
export function PapeletaEleccion({
  eleccionId,
  fichas,
  miPapeleta,
}: {
  eleccionId: string;
  fichas: CandidaturaVista[];
  miPapeleta: MiPapeleta;
}) {
  const visibles = new Set(fichas.map((f) => f.id));
  const [orden, setOrden] = useState<string[]>(
    miPapeleta && !miPapeleta.abstencion ? miPapeleta.orden.filter((id) => visibles.has(id)) : [],
  );
  const [guardada, setGuardada] = useState<MiPapeleta>(miPapeleta);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function alternar(id: string) {
    setError(null);
    setOrden((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }

  function enviar(abstencion: boolean, nuevoOrden: string[]) {
    setError(null);
    startTransition(async () => {
      const r = await votarEleccion(eleccionId, abstencion, nuevoOrden);
      if ('error' in r) setError(r.error);
      else setGuardada({ abstencion, orden: abstencion ? [] : nuevoOrden });
    });
  }

  const guardado = textoGuardado(guardada, fichas);
  // Lo que hay tocado ahora frente a lo último que se guardó (solo para avisar, nunca se envía solo).
  const ordenGuardado = guardada && !guardada.abstencion ? guardada.orden.filter((id) => visibles.has(id)) : [];
  const sinEnviar =
    guardada === null || guardada.abstencion ? orden.length > 0 : orden.join(',') !== ordenGuardado.join(',');

  return (
    <section className="el-papeleta" aria-labelledby="papeleta-titulo">
      <h2 id="papeleta-titulo" className="el-h2">Tu papeleta</h2>
      <p className="el-instruccion">
        Toca a las personas que aceptas, en tu orden de preferencia. A quien no toques, lo rechazas.
      </p>

      {fichas.length === 0 ? (
        <p className="el-nota">No hay candidaturas en esta elección.</p>
      ) : (
        <ul className="el-fichas">
          {fichas.map((f) => {
            const lugar = orden.indexOf(f.id);
            const marcada = lugar >= 0;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  className={`el-ficha el-ficha-boton${marcada ? ' el-ficha-marcada' : ''}`}
                  aria-pressed={marcada}
                  disabled={pending}
                  onClick={() => alternar(f.id)}
                >
                  <FichaContenido ficha={f} marca={marcada ? `Tu opción n.º ${lugar + 1}` : null} />
                  <span className="el-ficha-estado">{marcada ? 'La aceptas' : 'Toca para aceptarla'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="el-papeleta-acciones">
        <button
          type="button"
          className="el-btn el-btn-primario"
          disabled={pending}
          onClick={() => {
            // Sin nadie tocado no se envía: rechazar a todas se hace con su propio botón.
            if (orden.length === 0) {
              setError('Elige al menos a una persona, o usa «Rechazo a todas» o «Me abstengo».');
              return;
            }
            enviar(false, orden);
          }}
        >
          Enviar mi voto
        </button>
        <button
          type="button"
          className="el-btn el-btn-secundario"
          disabled={pending}
          onClick={() => {
            setOrden([]);
            enviar(false, []);
          }}
        >
          Rechazo a todas
        </button>
        <button
          type="button"
          className="el-btn el-btn-secundario"
          disabled={pending}
          onClick={() => {
            setOrden([]);
            enviar(true, []);
          }}
        >
          Me abstengo
        </button>
        {sinEnviar && <span className="el-sin-enviar">Cambios sin enviar</span>}
      </div>

      <div aria-live="polite">
        {guardado && !error && <p className="alert alert-success mt-2">{guardado}</p>}
        {error && (
          <p role="alert" className="alert alert-error mt-2">
            {error}
          </p>
        )}
      </div>

      <p className="el-nota">Tu voto es secreto. Puedes cambiarlo hasta el cierre.</p>
      <p className="el-nota">Las fichas salen en un orden al azar distinto para cada persona.</p>
    </section>
  );
}
