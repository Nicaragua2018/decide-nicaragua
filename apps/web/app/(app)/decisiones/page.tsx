import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { ComunidadDecisiones, ComunidadTipo, DecisionesResumenResponse, DecisionResumenItem } from '@decide/shared';

export const metadata: Metadata = { title: 'Decisiones — Decide Nicaragua' };

const ENCABEZADO: Record<ComunidadTipo, string> = {
  origen: 'Tu territorio de origen',
  acogida: 'Tu comunidad de acogida',
  general: 'Nivel general',
};

const ESTADO_BADGE: Record<DecisionResumenItem['estado'], string> = {
  aprobada: 'badge-completed',
  rechazada: 'badge-cancelled',
  en_curso: 'badge-open',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI');
}

/** El detalle puede traer «{fecha}»: se sustituye por la fecha formateada. */
function textoDetalle(item: DecisionResumenItem): string {
  if (!item.detalle.includes('{fecha}')) return item.detalle;
  return item.detalle.replace('{fecha}', item.fecha ? formatDate(item.fecha) : '');
}

function Bloque({ titulo, items }: { titulo: string; items: DecisionResumenItem[] }) {
  return (
    <div className="card mt-4">
      <p className="card-title">{titulo}</p>
      {items.length === 0 ? (
        <p className="card-meta">Todavía no hay decisiones aquí.</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.proposalId} className="mt-2">
              <Link href={`/proposals/${it.proposalId}`}>
                <span className="group-card-name">{it.title}</span>
              </Link>
              <p className="card-meta">
                <span className={`badge ${ESTADO_BADGE[it.estado]}`}>{textoDetalle(it)}</span>
                {it.estado !== 'en_curso' && it.fecha && <> · {formatDate(it.fecha)}</>}
              </p>
              {it.ganadoras.length > 0 && (
                <ul className="card-meta">
                  {it.ganadoras.map((g, i) => (
                    <li key={i}>
                      {g.title}
                      {g.incluyenPct !== null && <> — {g.incluyenPct}% de las papeletas válidas</>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Comunidad({ c }: { c: ComunidadDecisiones }) {
  return (
    <section>
      <div className="dash-section-header">
        <h2 className="dash-section-title">
          {ENCABEZADO[c.tipo]}: {c.name}
        </h2>
      </div>
      <Bloque titulo="Aprobadas" items={c.aprobadas} />
      <Bloque titulo="Rechazadas o sin decisión" items={c.rechazadas} />
      <Bloque titulo="En curso" items={c.enCurso} />
      <div className="card mt-4">
        <p className="card-title">Grupos de trabajo</p>
        {c.grupos.length === 0 ? (
          <p className="card-meta">Todavía no hay grupos de trabajo aquí.</p>
        ) : (
          <ul>
            {c.grupos.map((g) => (
              <li key={g.id} className="mt-2">
                <Link href={`/grupos/${g.id}`}>
                  <span className="group-card-name">{g.name}</span>
                </Link>
                <p className="card-meta">{g.proposito}</p>
                {g.tipo === 'bifurcacion' && (
                  <p className="card-meta">Iniciativa de un grupo · {g.miembros} {g.miembros === 1 ? 'persona' : 'personas'}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default async function DecisionesPage() {
  const res = await serverFetch('/api/decisiones/resumen');
  const comunidades = res.ok ? ((await res.json()) as DecisionesResumenResponse).comunidades : null;

  return (
    <>
      <div className="dash-welcome">
        <div>
          <h1 className="page-title">Decisiones</h1>
          <p className="page-sub">
            Los consensos logrados, los rechazados y los resultados de las votaciones de cada una de tus comunidades.
          </p>
        </div>
      </div>

      {comunidades === null ? (
        <p className="alert alert-error">No se pudieron cargar las decisiones.</p>
      ) : comunidades.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-title">Aún no perteneces a ninguna comunidad</p>
        </div>
      ) : (
        comunidades.map((c) => <Comunidad key={c.groupId} c={c} />)
      )}
    </>
  );
}
