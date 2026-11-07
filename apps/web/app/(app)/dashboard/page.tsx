import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import AlDiaCard from '@/components/AlDiaCard';
import type {
  GroupListResponse,
  GroupType,
  AuthResponse,
  AlDiaView,
  VerificationStatus,
} from '@decide/shared';

export const metadata: Metadata = { title: 'Panel — Decide Nicaragua' };

const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  territorial_origin:    'Dpto. de origen',
  territorial_residence: 'País de residencia',
  custom:                'Grupo personalizado',
  trabajo:               'Grupo de trabajo',
};

const PIPELINE_STEPS = [
  { label: 'Propuesta',    desc: 'Plantea una idea al grupo' },
  { label: 'Deliberación', desc: 'Debate y señales de consenso' },
  { label: 'Elección',     desc: 'Votación Condorcet' },
  { label: 'Sorteo',       desc: 'Selección verificable' },
  { label: 'Auditoría',    desc: 'Registro inmutable' },
];

export default async function DashboardPage() {
  // Plan 1: quien aún no está verificado ve su estado de verificación en lugar de los grupos.
  const vRes = await serverFetch('/api/verifications/me');
  const verif = vRes.ok ? ((await vRes.json()) as VerificationStatus) : null;
  if (verif && verif.status === 'pending_verification') {
    return (
      <>
        <div className="dash-welcome">
          <div>
            <h1 className="page-title">Tu verificación</h1>
            <p className="page-sub">
              Para participar necesitas dos confirmaciones: la de quien te invitó y la del administrador u otro
              miembro de tu territorio o de tu comunidad de acogida.
            </p>
          </div>
        </div>

        <div className="dash-section-header">
          <h2 className="dash-section-title">Confirmaciones</h2>
          <span className="dash-section-count">{verif.references.length} de 2</span>
        </div>

        <div className="card">
          <p className="card-title">{verif.references.length} de 2 confirmaciones</p>
          {verif.references.map((r) => (
            <div key={r.kind} className="alert alert-success">
              ✓ {r.kind === 'invitador' ? 'Quien te invitó' : 'Segunda referencia'}: {r.displayName}
            </div>
          ))}
          {verif.missing.map((k) => (
            <div key={k} className="alert alert-warning">
              … Falta: {k === 'invitador' ? 'quien te invitó' : 'una segunda referencia'}
            </div>
          ))}
        </div>
      </>
    );
  }

  const [groupsRes, meRes, alDiaRes] = await Promise.all([
    serverFetch('/api/groups'),
    serverFetch('/api/auth/me'),
    serverFetch('/api/asistente/al-dia').catch(() => null),
  ]);

  const alDia = alDiaRes?.ok ? ((await alDiaRes.json()) as AlDiaView) : null;

  const groups = groupsRes.ok
    ? ((await groupsRes.json()) as GroupListResponse).groups ?? []
    : [];

  const displayName = meRes.ok
    ? ((await meRes.json()) as AuthResponse).user.displayName
    : null;

  return (
    <>
      {/* ── Bienvenida ─────────────────────────────────────────── */}
      <div className="dash-welcome">
        <div>
          <h1 className="page-title">
            {displayName ? `Hola, ${displayName.split(' ')[0]}` : 'Panel'}
          </h1>
          <p className="page-sub">Tus grupos de participación democrática.</p>
        </div>
        <Link href="/audit" className="btn btn-ghost btn-sm">
          Ver auditoría pública →
        </Link>
      </div>

      {alDia?.mostrar && <AlDiaCard resumen={alDia.resumen} items={alDia.items} />}

      {/* ── Pipeline ───────────────────────────────────────────── */}
      <div className="pipeline">
        <p className="pipeline-label">Flujo de decisión dentro de un grupo</p>
        <ol className="pipeline-steps">
          {PIPELINE_STEPS.map((step, i) => (
            <li key={step.label} className="pipeline-step">
              <span className="pipeline-num">{i + 1}</span>
              <div className="pipeline-body">
                <strong>{step.label}</strong>
                <span>{step.desc}</span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <span className="pipeline-arrow" aria-hidden>›</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* ── Grupos ─────────────────────────────────────────────── */}
      <div className="dash-section-header">
        <h2 className="dash-section-title">Mis grupos</h2>
        <span className="dash-section-count">{groups.length}</span>
      </div>

      {groups.length === 0 ? (
        <div className="empty-card">
          <span className="empty-card-icon">🏛️</span>
          <p className="empty-card-title">Aún no tienes grupos asignados</p>
          <p className="empty-card-sub">
            Los grupos se asignan automáticamente según tu departamento de origen
            y país de residencia. Completa tu perfil para que aparezcan.
          </p>
          <Link href="/me" className="btn btn-primary">
            Completar mi perfil
          </Link>
        </div>
      ) : (
        <div className="group-grid">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/groups/${group.id}`}
              className="group-card"
            >
              <div className="group-card-type">
                {GROUP_TYPE_LABEL[group.type]}
              </div>
              <h3 className="group-card-name">{group.name}</h3>
              {group.description && (
                <p className="group-card-desc">{group.description}</p>
              )}
              <div className="group-card-footer">
                <span className="group-card-members">Comunidad</span>
                <span className="group-card-cta">Ver grupo →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
