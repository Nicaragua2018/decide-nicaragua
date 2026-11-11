import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import Link from 'next/link';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import type { CambioReglaView, GroupListResponse, RuleView } from '@decide/shared';
import { ProponerCambio } from './ProponerCambio';

export const metadata: Metadata = { title: 'Reglas — Decide Nicaragua' };

const UNIT_LABEL: Record<string, string> = {
  personas: 'personas',
  porcentaje: '%',
  dias: 'días',
  meses: 'meses',
  preguntas: 'preguntas',
};

const ESTADO_LABEL: Record<string, string> = {
  aplicado: 'Aplicado',
  rechazado: 'Rechazado',
  rechazado_mesa: 'Rechazado por la mesa',
  sin_participacion: 'Sin participación suficiente',
  anulado: 'Anulado',
};

function Historial({ items }: { items: CambioReglaView[] }) {
  const resueltos = items.filter((c) => ESTADO_LABEL[c.estado]);
  if (resueltos.length === 0) return null;
  return (
    <ul className="text-sm text-muted">
      {resueltos.map((c) => (
        <li key={c.id}>
          {ESTADO_LABEL[c.estado]}: de {c.valorAnterior} a {c.valorPropuesto}
          {c.resueltoAt ? ` · ${new Date(c.resueltoAt).toLocaleDateString('es-NI')}` : ''}
        </li>
      ))}
    </ul>
  );
}

function EnCurso({ c }: { c: CambioReglaView }) {
  if (c.estado === 'pendiente_mesa') {
    return <p className="text-sm">Esperando a la mesa (2 de 3): de {c.valorAnterior} a {c.valorPropuesto}</p>;
  }
  const texto = `En votación: de ${c.valorAnterior} a ${c.valorPropuesto}`;
  return (
    <p className="text-sm">
      {c.proposalId ? <Link href={`/proposals/${c.proposalId}`}>{texto}</Link> : texto}
    </p>
  );
}

function RulesTable({ rules, groupId }: { rules: RuleView[]; groupId: string | null }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Regla</th>
            <th>Valor</th>
            <th>Estado</th>
            <th>Límites</th>
            <th>Cambios</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => {
            const unit = r.unit ? ` ${UNIT_LABEL[r.unit] ?? r.unit}` : '';
            const limits =
              r.type === 'int' && r.min !== undefined && r.max !== undefined
                ? `${r.min} a ${r.max}${unit}`
                : r.options
                  ? r.options.join(', ')
                  : '—';
            return (
              <tr key={`${r.level}-${r.key}`}>
                <td>{r.label}</td>
                <td>{r.value}{r.type === 'int' ? unit : ''}</td>
                <td>{r.isDefault ? 'por defecto' : 'ajustada'}</td>
                <td>{limits}</td>
                <td>
                  {!r.conectada && (
                    <p className="text-sm text-muted">Aún no tiene efecto (se conecta con las elecciones)</p>
                  )}
                  {r.enCurso && <EnCurso c={r.enCurso} />}
                  {r.puedoProponer && !r.enCurso && groupId && (
                    <ProponerCambio
                      groupId={groupId}
                      ruleKey={r.key}
                      type={r.type}
                      value={r.value}
                      min={r.min}
                      max={r.max}
                      options={r.options}
                    />
                  )}
                  <Historial items={r.historial} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReglasPage() {
  const [colmenaRes, groupsRes] = await Promise.all([
    serverFetch('/api/public/reglas'),
    serverFetch('/api/groups'),
  ]);
  const colmena = colmenaRes.ok ? ((await colmenaRes.json()) as RuleView[]) : [];
  const groups = groupsRes.ok ? ((await groupsRes.json()) as GroupListResponse).groups ?? [] : [];

  // Las reglas de la colmena se proponen con el id del grupo general.
  const general = groups.find((g) => g.slug === GENERAL_GROUP_SLUG);
  let colmenaRules = colmena;
  if (general) {
    const res = await serverFetch(`/api/rules?groupId=${general.id}`);
    if (res.ok) {
      const all = (await res.json()) as RuleView[];
      const delGeneral = all.filter((r) => r.level === 'colmena');
      if (delGeneral.length > 0) colmenaRules = delGeneral;
    }
  }

  const locales = await Promise.all(
    groups.map(async (g) => {
      const res = await serverFetch(`/api/rules?groupId=${g.id}`);
      const all = res.ok ? ((await res.json()) as RuleView[]) : [];
      return { group: g, rules: all.filter((r) => r.level === 'local') };
    }),
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Reglas</h1>
        <p className="page-sub">Las reglas las decide la comunidad. Puedes proponer cambios desde aquí.</p>
      </div>

      <section className="card mb-4">
        <p className="card-title mb-3">Reglas de todo Nicaragua Decide</p>
        {colmenaRules.length === 0 ? (
          <p className="text-sm text-muted">No se pudieron cargar las reglas.</p>
        ) : (
          <RulesTable rules={colmenaRules} groupId={general?.id ?? null} />
        )}
      </section>

      {locales.map(({ group, rules }) => (
        <section key={group.id} className="card mb-4">
          <p className="card-title mb-3">Reglas de {group.name}</p>
          {rules.length === 0 ? (
            <p className="text-sm text-muted">No se pudieron cargar las reglas.</p>
          ) : (
            <RulesTable rules={rules} groupId={group.id} />
          )}
        </section>
      ))}
    </>
  );
}
