'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FACILIDADES, GARANTIAS } from '@decide/shared';
import { cerrarCrecer } from '@/lib/actions';

export default function CrecerCard({
  groupId,
  activa,
  faltan,
  texto,
  mensajeInvitacion,
  deAsistente,
}: {
  groupId: string;
  activa: boolean;
  faltan: number;
  texto: string;
  mensajeInvitacion: string;
  deAsistente: boolean;
}) {
  const [mensaje, setMensaje] = useState(mensajeInvitacion);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, empezar] = useTransition();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="card crecer" aria-labelledby="crecer-titulo">
      <h2 id="crecer-titulo" className="card-title">
        Faltan {faltan} personas para {activa ? 'llegar a 20' : 'activar la comunidad'}
      </h2>
      {deAsistente && <p className="marca-asistente">sugerencia del asistente</p>}
      <p>{texto}</p>
      <div className="crecer-listas">
        <div>
          <p className="text-sm font-medium">Lo que garantizamos</p>
          <ul className="crecer-lista">{GARANTIAS.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
        <div>
          <p className="text-sm font-medium">Lo que tendrás</p>
          <ul className="crecer-lista">{FACILIDADES.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="crecer-mensaje" className="form-label">Mensaje para invitar</label>
        <textarea
          id="crecer-mensaje"
          className="form-textarea"
          rows={5}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
        />
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <Link href="/admin/invite" className="btn btn-ghost btn-sm">Invitar a alguien</Link>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => empezar(() => cerrarCrecer(groupId))}>
          Cerrar por 7 días
        </button>
      </div>
    </section>
  );
}
