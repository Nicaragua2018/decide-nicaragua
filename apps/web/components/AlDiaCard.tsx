'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import type { ItemAlDia } from '@decide/shared';
import { cerrarAlDia } from '@/lib/actions';

const ETIQUETA: Record<ItemAlDia['clase'], string> = {
  debate: 'Debate nuevo',
  votacion_abierta: 'Votación abierta',
  votacion_cierra: 'Votación que cierra pronto',
  decision: 'Decisión',
  informe: 'Informe de comisión',
  umbral: 'Inquietud que pide respuesta',
};

export default function AlDiaCard({ resumen, items }: { resumen: string | null; items: ItemAlDia[] }) {
  const [ocupado, empezar] = useTransition();

  const porComunidad = new Map<string, ItemAlDia[]>();
  for (const it of items) {
    const lista = porComunidad.get(it.comunidad) ?? [];
    lista.push(it);
    porComunidad.set(it.comunidad, lista);
  }

  return (
    <section className="card al-dia" aria-labelledby="al-dia-titulo">
      <div className="al-dia-cabecera">
        <h2 id="al-dia-titulo" className="card-title">Desde tu última visita</h2>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => empezar(() => cerrarAlDia())}>
          Cerrar
        </button>
      </div>
      {resumen && (
        <div className="al-dia-resumen">
          <p className="marca-asistente">sugerencia del asistente</p>
          <p>{resumen}</p>
        </div>
      )}
      {[...porComunidad.entries()].map(([comunidad, lista]) => (
        <div key={comunidad} className="al-dia-grupo">
          <h3 className="al-dia-comunidad">{comunidad}</h3>
          <ul className="al-dia-lista">
            {lista.map((it, i) => (
              <li key={`${it.ruta}-${i}`}>
                <span className="al-dia-etiqueta">{ETIQUETA[it.clase]}</span>{' '}
                <Link href={it.ruta}>{it.titulo}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
