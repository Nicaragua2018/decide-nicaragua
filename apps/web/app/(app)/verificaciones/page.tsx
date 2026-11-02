import type { Metadata } from 'next';
import type { PendingVerification } from '@decide/shared';
import { serverFetch } from '@/lib/api';
import { ConfirmButton } from './ConfirmButton';

export const metadata: Metadata = { title: 'Verificaciones' };

export default async function VerificacionesPage() {
  const res = await serverFetch('/api/verifications/pending');
  const pending = res.ok ? ((await res.json()) as PendingVerification[]) : [];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Verificaciones</h1>
        <p className="page-sub">
          Personas que esperan una confirmación tuya. Confirma solo si las conoces: tu nombre queda registrado
          como referencia.
        </p>
      </div>
      {pending.length === 0 ? (
        <p className="empty-state">No hay nadie esperando tu confirmación.</p>
      ) : (
        pending.map((p) => (
          <div key={p.userId} className="card flex justify-between items-center">
            <div>
              <p className="card-title">{p.displayName}</p>
              <p className="card-meta">
                {p.birthDepartment ?? 'Sin territorio'} · {p.hostCommunity ?? 'Sin comunidad de acogida'}
                {p.invitedByMe ? ' · Invitada por ti' : ''} · {p.referencesCount} de 2
              </p>
            </div>
            <ConfirmButton userId={p.userId} displayName={p.displayName} />
          </div>
        ))
      )}
    </>
  );
}
