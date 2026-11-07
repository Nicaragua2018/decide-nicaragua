'use client';

import { useState, useTransition } from 'react';
import type { ComisionView } from '@decide/shared';
import {
  ajustarComision,
  apoyarRenovacion,
  guardarPapeletaComision,
  ofrecerseComision,
  publicarInforme,
  retirarseComision,
  verificarSorteo,
} from '@/lib/actions';
import { useAccion } from './useAccion';
import { useRevisionPrevia, type ModoEnvio } from '@/components/RevisarAntesDePublicar';

function Aviso({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="alert alert-error mt-2">{msg}</p> : null;
}

export function OfrecerseForm({ grupoId, yoVoluntario }: { grupoId: string; yoVoluntario: boolean }) {
  const { pending, error, run } = useAccion();
  const [experiencia, setExperiencia] = useState('');

  if (yoVoluntario) {
    return (
      <div className="mt-3">
        <p className="card-meta"><strong>Te ofreciste como voluntaria o voluntario</strong></p>
        <button type="button" className="btn btn-ghost btn-sm mt-2" disabled={pending} onClick={() => run(() => retirarseComision(grupoId))}>
          Retirarme
        </button>
        <Aviso msg={error} />
      </div>
    );
  }
  return (
    <form
      className="form mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => ofrecerseComision(grupoId, experiencia));
      }}
    >
      <label className="form-label" htmlFor={`exp-${grupoId}`}>Tu experiencia relacionada (opcional)</label>
      <textarea
        id={`exp-${grupoId}`}
        className="form-textarea"
        rows={3}
        maxLength={500}
        value={experiencia}
        onChange={(e) => setExperiencia(e.target.value)}
      />
      <p className="text-xs text-muted">No escribas datos que te identifiquen fuera de la comunidad</p>
      <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={pending}>Me ofrezco</button>
      <Aviso msg={error} />
    </form>
  );
}

export function AjustarForm({ grupoId, tarea, puestos }: { grupoId: string; tarea: string; puestos: number }) {
  const { pending, error, hecho, run } = useAccion();
  const [t, setT] = useState(tarea);
  const [p, setP] = useState(String(puestos));
  return (
    <details className="mt-3">
      <summary className="text-sm">Ajustar tarea y puestos</summary>
      <form
        className="form mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => ajustarComision(grupoId, t, Number(p)));
        }}
      >
        <label className="form-label" htmlFor={`tarea-${grupoId}`}>Tarea</label>
        <textarea id={`tarea-${grupoId}`} className="form-textarea" rows={4} maxLength={2000} value={t} onChange={(e) => setT(e.target.value)} />
        <label className="form-label" htmlFor={`puestos-${grupoId}`}>Puestos</label>
        <input id={`puestos-${grupoId}`} className="form-input" type="number" min={1} value={p} onChange={(e) => setP(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={pending}>Ajustar tarea y puestos</button>
        {hecho && !error && <p className="text-xs text-muted mt-1">Guardado</p>}
        <Aviso msg={error} />
      </form>
    </details>
  );
}

/** Papeleta por preferencias: marca a quienes aceptas y ordénalos. */
export function PapeletaForm({
  grupoId,
  voluntarios,
  miPapeleta,
}: {
  grupoId: string;
  voluntarios: ComisionView['voluntarios'];
  miPapeleta: string[] | null;
}) {
  const { pending, error, hecho, run } = useAccion();
  const conId = voluntarios.flatMap((v) => (v.id === null ? [] : [{ ...v, id: v.id }]));
  // Solo los voluntarios que siguen en la lista: alguien guardado que ya no está no se reenvía.
  const [orden, setOrden] = useState<string[]>(() => (miPapeleta ?? []).filter((id) => conId.some((v) => v.id === id)));

  function alternar(id: string) {
    setOrden((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }
  function mover(id: string, d: -1 | 1) {
    setOrden((o) => {
      const i = o.indexOf(id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o];
      const a = n[i];
      const b = n[j];
      if (a === undefined || b === undefined) return o;
      n[i] = b;
      n[j] = a;
      return n;
    });
  }

  return (
    <form
      className="form mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => guardarPapeletaComision(grupoId, orden));
      }}
    >
      <p className="card-title">Tu papeleta</p>
      <p className="text-sm">Ordena a los voluntarios que aceptas, del que más prefieres al que menos.</p>
      <p className="text-xs text-muted">Las que no marques cuentan como no elegidas</p>
      <ul className="mt-2">
        {conId.map((v) => {
          const pos = orden.indexOf(v.id);
          return (
            <li key={v.id} className="mt-2">
              <label>
                <input type="checkbox" checked={pos >= 0} onChange={() => alternar(v.id)} /> {v.nombre}
                {pos >= 0 && <> · lugar {pos + 1}</>}
              </label>
              {v.experiencia && <p className="card-meta">{v.experiencia}</p>}
              {pos >= 0 && (
                <span className="flex gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Subir a ${v.nombre}`} disabled={pos === 0} onClick={() => mover(v.id, -1)}>↑</button>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Bajar a ${v.nombre}`} disabled={pos === orden.length - 1} onClick={() => mover(v.id, 1)}>↓</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={pending || orden.length === 0}>Guardar mi papeleta</button>
      {hecho && !error && <p className="text-xs text-muted mt-1">Papeleta guardada</p>}
      <Aviso msg={error} />
    </form>
  );
}

export function InformeForm({ grupoId }: { grupoId: string }) {
  const { pending, error, run } = useAccion();
  const [texto, setTexto] = useState('');
  const [final, setFinal] = useState(false);
  const rev = useRevisionPrevia('informe');

  function enviar(modo: ModoEnvio) {
    run(
      async () => {
        const r = await publicarInforme(grupoId, texto, final, modo === 'pedir');
        rev.recibir(r);
        return r;
      },
      () => {
        setTexto('');
        setFinal(false);
      },
    );
  }

  return (
    <form
      className="form mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void rev.revisar(texto).then((puede) => {
          if (puede) enviar('normal');
        });
      }}
    >
      <label className="form-label" htmlFor={`informe-${grupoId}`}>Publicar informe</label>
      <textarea id={`informe-${grupoId}`} className="form-textarea" rows={5} maxLength={5000} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <label className="mt-1">
        <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} /> Es el informe final
      </label>
      <br />
      {rev.aviso({
        ocupado: pending || rev.revisando,
        onUsarSugerencia: (s) => {
          setTexto(s);
          rev.limpiar();
        },
        onPublicarComoEsta: () => enviar('omitir'),
        onPedirRevision: () => enviar('pedir'),
      })}
      <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={pending || rev.revisando}>Publicar informe</button>
      <Aviso msg={error} />
    </form>
  );
}

export function RenovacionButton({ grupoId, yoApoyo }: { grupoId: string; yoApoyo: boolean }) {
  const { pending, error, run } = useAccion();
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm mt-2" disabled={pending} onClick={() => run(() => apoyarRenovacion(grupoId, !yoApoyo))}>
        {yoApoyo ? 'Retirar mi apoyo' : 'Apoyo renovarla'}
      </button>
      <Aviso msg={error} />
    </>
  );
}

export function SorteoVerificable({ grupoId, semilla, pool }: { grupoId: string; semilla: string; pool: string[] }) {
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<{ ok: boolean; elegidos: number } | { error: string } | null>(null);
  return (
    <details className="mt-3">
      <summary className="text-sm">Ver cómo se hizo el sorteo</summary>
      <p className="text-sm mt-2">Semilla: <code>{semilla}</code></p>
      <p className="text-sm">Pool ({pool.length}):</p>
      <ul className="text-xs">{pool.map((p) => <li key={p}><code>{p}</code></li>)}</ul>
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-2"
        disabled={pending}
        onClick={() => startTransition(async () => setRes(await verificarSorteo(grupoId)))}
      >
        Verificar
      </button>
      {res && 'error' in res && <p role="alert" className="alert alert-error mt-2">{res.error}</p>}
      {res && 'ok' in res && (
        <p className="text-sm mt-2">
          {res.ok ? 'El sorteo se repite igual' : 'El sorteo no coincide'} · {res.elegidos} {res.elegidos === 1 ? 'elegida' : 'elegidas'}
        </p>
      )}
    </details>
  );
}
