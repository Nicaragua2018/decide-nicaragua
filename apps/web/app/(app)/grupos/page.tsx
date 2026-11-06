import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { ComunidadTipo, GruposAmbitoResponse, RuleView } from '@decide/shared';
import { GrupoCard } from './GrupoCard';
import { ProponerGrupoForm, type AmbitoOpcion } from './ProponerGrupoForm';

export const metadata: Metadata = { title: 'Grupos de trabajo — Decide Nicaragua' };

const ENCABEZADO: Record<ComunidadTipo, string> = {
  origen: 'Tu territorio de origen',
  acogida: 'Tu comunidad de acogida',
  general: 'Nivel general',
};

async function minimoDe(ambitoId: string): Promise<number> {
  try {
    const res = await serverFetch(`/api/rules?groupId=${ambitoId}`);
    if (!res.ok) return 5;
    const rules = (await res.json()) as RuleView[];
    const v = Number(rules.find((r) => r.key === 'subgrupo.minimo_personas')?.value);
    return Number.isFinite(v) && v > 0 ? v : 5;
  } catch {
    return 5;
  }
}

export default async function GruposPage() {
  const res = await serverFetch('/api/grupos');
  const ambitos = res.ok ? ((await res.json()) as GruposAmbitoResponse).ambitos : null;
  const opciones: AmbitoOpcion[] = ambitos
    ? await Promise.all(ambitos.map(async (a) => ({ id: a.id, name: a.name, minimo: await minimoDe(a.id) })))
    : [];

  return (
    <>
      <div className="dash-welcome">
        <div>
          <h1 className="page-title">Grupos de trabajo</h1>
          <p className="page-sub">
            Grupos más pequeños dentro de tus comunidades para trabajar un tema a fondo.
          </p>
        </div>
      </div>

      {ambitos === null ? (
        <p className="alert alert-error">No se pudieron cargar los grupos.</p>
      ) : ambitos.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-title">Aún no perteneces a ninguna comunidad</p>
        </div>
      ) : (
        <>
          {ambitos.map((a) => (
            <section key={a.id}>
              <div className="dash-section-header">
                <h2 className="dash-section-title">{ENCABEZADO[a.tipo]}: {a.name}</h2>
              </div>
              <div className="card mt-4">
                <p className="card-title">Grupos de trabajo</p>
                {a.grupos.length === 0 ? (
                  <p className="card-meta">Todavía no hay grupos de trabajo aquí.</p>
                ) : (
                  <ul>{a.grupos.map((g) => <GrupoCard key={g.id} g={g} />)}</ul>
                )}
              </div>
            </section>
          ))}
          <ProponerGrupoForm ambitos={opciones} />
        </>
      )}
    </>
  );
}
