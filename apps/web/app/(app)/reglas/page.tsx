import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { GroupListResponse, RuleView } from '@decide/shared';

export const metadata: Metadata = { title: 'Reglas — Decide Nicaragua' };

const UNIT_LABEL: Record<string, string> = {
  personas: 'personas',
  porcentaje: '%',
  dias: 'días',
  meses: 'meses',
};

function RulesTable({ rules }: { rules: RuleView[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Regla</th>
            <th>Valor</th>
            <th>Estado</th>
            <th>Límites</th>
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
        <p className="page-sub">Las reglas las decide la comunidad. Pronto podrás proponer cambios desde aquí.</p>
      </div>

      <section className="card mb-4">
        <p className="card-title mb-3">Reglas de toda la colmena</p>
        {colmena.length === 0 ? (
          <p className="text-sm text-muted">No se pudieron cargar las reglas.</p>
        ) : (
          <RulesTable rules={colmena} />
        )}
      </section>

      {locales.map(({ group, rules }) => (
        <section key={group.id} className="card mb-4">
          <p className="card-title mb-3">Reglas de {group.name}</p>
          {rules.length === 0 ? (
            <p className="text-sm text-muted">No se pudieron cargar las reglas.</p>
          ) : (
            <RulesTable rules={rules} />
          )}
        </section>
      ))}
    </>
  );
}
