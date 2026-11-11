import Link from 'next/link';
import type { Metadata } from 'next';
import type { AuditListResponse } from '@decide/shared';
import { serverFetch } from '@/lib/api';
import { eventoEtiqueta } from '@/components/elecciones/textos';
import { ObservacionForm } from './ObservacionForm';

export const metadata: Metadata = { title: 'Observar' };
export const dynamic = 'force-dynamic';

type VerificacionStat = { nombre: string; invitador: number; segunda: number };
type GastoMes = { mes: string; usd: number };
type Etiquetado = { id: string; nombre: string };
type Matrices = { pairwiseMatrix: unknown; schulzeMatrix: unknown };
type MatricesVista = {
  elecciones: (Matrices & { id: string; titulo: string; fecha: string | null; candidaturas: Etiquetado[]; ordenFinal: string[]; electas: string[]; papeletasTotal: number | null; sinQuorum: boolean; semilla: string | null })[];
  decisiones: (Matrices & { id: string; titulo: string; fecha: string | null; resultado: string | null; opciones: Etiquetado[]; ganadoras: string[]; aprobaciones: number[]; papeletasTotal: number | null })[];
  votaciones: (Matrices & { id: string; titulo: string; fecha: string; opciones: Etiquetado[]; ganadoras: string[]; totalPapeletas: number })[];
  sorteos: { id: string; titulo: string; fecha: string | null; tamano: number; algoritmo: string | null; semilla: string | null }[];
};

const TABS = [
  { id: 'auditoria', label: 'Auditoría' },
  { id: 'verificaciones', label: 'Verificaciones' },
  { id: 'matrices', label: 'Matrices' },
  { id: 'gastos', label: 'Gastos' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' });
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const nombres = (ids: string[], lista: Etiquetado[]) =>
  ids.map((id) => lista.find((x) => x.id === id)?.nombre ?? '—').join(', ') || '—';

function Matriz({ titulo, datos }: { titulo: string; datos: unknown }) {
  return (
    <details className="mt-2">
      <summary className="text-sm">{titulo}</summary>
      <pre className="text-sm" style={{ overflowX: 'auto' }}>{JSON.stringify(datos, null, 1)}</pre>
    </details>
  );
}

type Lectura<T> = { ok: true; data: T } | { ok: false; status: number };

async function leer<T>(path: string): Promise<Lectura<T>> {
  try {
    const res = await serverFetch(path);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

function Auditoria({ d }: { d: AuditListResponse }) {
  const paginas = Math.max(1, Math.ceil(d.total / d.limit));
  return (
    <>
      {d.events.length === 0 && <p className="empty-state">No hay eventos.</p>}
      {d.events.map((e) => (
        <div key={e.id} className="card">
          <p className="card-title">{eventoEtiqueta(e.action)}</p>
          <p className="card-meta">
            {fechaHora(e.createdAt)}
            {e.actorDisplayName ? ` · ${e.actorDisplayName}` : ''} · <span className="text-sm text-muted">{e.action}</span>
          </p>
          <ObservacionForm auditEventId={e.id} />
        </div>
      ))}
      <div className="flex gap-2 mt-2">
        {d.page > 1 && (
          <Link className="btn btn-ghost btn-sm" href={`/observar?tab=auditoria&page=${d.page - 1}`}>← Más recientes</Link>
        )}
        <span className="text-sm text-muted">Página {d.page} de {paginas}</span>
        {d.page < paginas && (
          <Link className="btn btn-ghost btn-sm" href={`/observar?tab=auditoria&page=${d.page + 1}`}>Más antiguos →</Link>
        )}
      </div>
    </>
  );
}

function Verificaciones({ filas }: { filas: VerificacionStat[] }) {
  if (filas.length === 0) return <p className="empty-state">Aún no hay verificaciones.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Persona</th><th>Como invitadora</th><th>Como segunda referencia</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre}><td>{f.nombre}</td><td>{f.invitador}</td><td>{f.segunda}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatricesTab({ m }: { m: MatricesVista }) {
  const vacio = m.elecciones.length + m.decisiones.length + m.votaciones.length + m.sorteos.length === 0;
  return (
    <>
      {vacio && <p className="empty-state">Aún no hay resultados contados.</p>}
      {m.elecciones.length > 0 && <h2 className="section-title">Elecciones</h2>}
      {m.elecciones.map((e) => (
        <div key={e.id} className="card">
          <p className="card-title">{e.titulo}</p>
          <p className="card-meta">
            {fecha(e.fecha)} · {e.papeletasTotal ?? '—'} papeletas{e.sinQuorum ? ' · sin la participación mínima' : ''}
          </p>
          <p className="text-sm">Electas: {nombres(e.electas, e.candidaturas)}</p>
          <p className="text-sm">Orden final: {nombres(e.ordenFinal, e.candidaturas)}</p>
          {e.semilla && <p className="text-sm text-muted">Semilla del desempate: {e.semilla}</p>}
          <Matriz titulo="Matriz de comparaciones" datos={e.pairwiseMatrix} />
          <Matriz titulo="Matriz de Schulze" datos={e.schulzeMatrix} />
        </div>
      ))}
      {m.decisiones.length > 0 && <h2 className="section-title mt-2">Decisiones</h2>}
      {m.decisiones.map((d) => (
        <div key={d.id} className="card">
          <p className="card-title">{d.titulo}</p>
          <p className="card-meta">
            {fecha(d.fecha)} · {d.papeletasTotal ?? '—'} papeletas{d.resultado ? ` · ${d.resultado}` : ''}
          </p>
          <p className="text-sm">Ganadoras: {nombres(d.ganadoras, d.opciones)}</p>
          <Matriz titulo="Matriz de comparaciones" datos={d.pairwiseMatrix} />
          <Matriz titulo="Matriz de Schulze" datos={d.schulzeMatrix} />
        </div>
      ))}
      {m.votaciones.length > 0 && <h2 className="section-title mt-2">Votaciones</h2>}
      {m.votaciones.map((v) => (
        <div key={v.id} className="card">
          <p className="card-title">{v.titulo}</p>
          <p className="card-meta">{fecha(v.fecha)} · {v.totalPapeletas} papeletas</p>
          <p className="text-sm">Ganadoras: {nombres(v.ganadoras, v.opciones)}</p>
          <Matriz titulo="Matriz de comparaciones" datos={v.pairwiseMatrix} />
          <Matriz titulo="Matriz de Schulze" datos={v.schulzeMatrix} />
        </div>
      ))}
      {m.sorteos.length > 0 && <h2 className="section-title mt-2">Sorteos</h2>}
      {m.sorteos.map((s) => (
        <div key={s.id} className="card">
          <p className="card-title">{s.titulo}</p>
          <p className="card-meta">{fecha(s.fecha)} · {s.tamano} personas · {s.algoritmo ?? '—'}</p>
          {s.semilla && <p className="text-sm text-muted">Semilla: {s.semilla}</p>}
        </div>
      ))}
    </>
  );
}

function Gastos({ filas }: { filas: GastoMes[] }) {
  if (filas.length === 0) return <p className="empty-state">Aún no hay gastos del asistente.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Mes</th><th>Gasto del asistente (USD)</th></tr>
        </thead>
        <tbody>
          {filas.map((g) => (
            <tr key={g.mes}><td>{g.mes}</td><td>{g.usd.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ObservarPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === sp.tab) ? (sp.tab as TabId) : 'auditoria';
  const page = /^\d+$/.test(sp.page ?? '') ? sp.page! : '1';

  let contenido: React.ReactNode;
  let estado: number | null = null;
  if (tab === 'auditoria') {
    const r = await leer<AuditListResponse>(`/api/observar/eventos?page=${page}&limit=50`);
    if (r.ok) contenido = <Auditoria d={r.data} />;
    else estado = r.status;
  } else if (tab === 'verificaciones') {
    const r = await leer<VerificacionStat[]>('/api/observar/verificaciones');
    if (r.ok) contenido = <Verificaciones filas={r.data} />;
    else estado = r.status;
  } else if (tab === 'matrices') {
    const r = await leer<MatricesVista>('/api/observar/matrices');
    if (r.ok) contenido = <MatricesTab m={r.data} />;
    else estado = r.status;
  } else {
    const r = await leer<GastoMes[]>('/api/observar/gastos');
    if (r.ok) contenido = <Gastos filas={r.data} />;
    else estado = r.status;
  }

  if (estado === 403) {
    return <p className="empty-state">Esta sección es solo para los observadores.</p>;
  }

  // Quien observa también puede firmar de suplente cuando la mesa está incompleta.
  const sup = await leer<unknown>('/api/asistente/revisiones');

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Observar</h1>
        <p className="page-sub">
          Lectura del registro y de las cuentas. Nunca se ve quién votó qué. Tus observaciones son públicas y se ven en «Quiénes nos representan».
        </p>
      </div>

      {sup.ok && (
        <p className="alert alert-info">
          <Link href="/admin/mesa">Revisiones pendientes (suplencia)</Link>: la mesa tiene menos de 2 personas y puedes firmar las revisiones.
        </p>
      )}

      <nav className="tab-nav" aria-label="Secciones de Observar">
        {TABS.map((t) => (
          <Link key={t.id} href={`/observar?tab=${t.id}`} className={`tab-link${t.id === tab ? ' tab-link-active' : ''}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {estado !== null ? (
        <p className="alert alert-error">No se pudo cargar esta sección. Prueba de nuevo en un rato.</p>
      ) : (
        contenido
      )}
    </>
  );
}
