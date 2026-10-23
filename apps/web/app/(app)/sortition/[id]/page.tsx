import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import { ConfirmForm } from '@/components/ConfirmForm';
import { executeDraw, cancelDraw } from '@/lib/actions';
import type { SortitionDrawDetail, SortitionStatus, SortitionVerificationResult } from '@decide/shared';

const STATUS_LABEL: Record<SortitionStatus, string> = {
  pending: 'Pendiente', completed: 'Completado', cancelled: 'Cancelado',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const res = await serverFetch(`/api/sortition/draws/${id}`);
  const data = (await res.json()) as SortitionDrawDetail;
  return { title: data.title };
}

export default async function SortitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ verify?: string }>;
}) {
  const { id }     = await params;
  const { verify } = await searchParams;
  const showVerify = verify === '1';

  const res = await serverFetch(`/api/sortition/draws/${id}`);
  if (!res.ok) return <p className="empty-state">Sorteo no encontrado.</p>;
  const draw = (await res.json()) as SortitionDrawDetail;

  let verification: SortitionVerificationResult | null = null;
  if (showVerify && draw.status === 'completed') {
    const vRes = await serverFetch(`/api/sortition/draws/${id}/verify`);
    if (vRes.ok) verification = (await vRes.json()) as SortitionVerificationResult;
  }

  const isPending   = draw.status === 'pending';
  const isCompleted = draw.status === 'completed';

  return (
    <>
      <div className="page-header">
        <Link href={`/groups/${draw.groupId}?tab=sortition`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        <div className="flex justify-between items-center mt-2">
          <h1 className="page-title">{draw.title}</h1>
          <span className={`badge badge-${draw.status}`}>
            {STATUS_LABEL[draw.status]}
          </span>
        </div>
        <p className="card-meta">
          Selección de {draw.selectionSize} miembro{draw.selectionSize !== 1 ? 's' : ''} ·{' '}
          {new Date(draw.createdAt).toLocaleDateString('es-NI')}
        </p>
        {draw.description && <p className="mt-2">{draw.description}</p>}
      </div>

      {/* Administración (pendiente) */}
      {isPending && (
        <div className="card mb-4">
          <p className="card-title mb-1">Ejecutar sorteo</p>
          <p className="text-sm text-muted mb-3">
            Se generará una semilla pública aleatoria y se seleccionarán{' '}
            {draw.selectionSize} miembro{draw.selectionSize !== 1 ? 's' : ''} usando el algoritmo
            Fisher-Yates con SHA-256. El resultado es reproducible e independientemente verificable.
          </p>
          <div className="alert-info mb-4 text-sm">
            Esta acción es <strong>irreversible</strong>. Una vez ejecutado el sorteo,
            los miembros seleccionados quedan registrados en la auditoría pública.
          </div>
          <div className="flex gap-2">
            <ConfirmForm
              action={executeDraw.bind(null, id)}
              message={`¿Ejecutar el sorteo ahora? Se seleccionarán ${draw.selectionSize} miembro${draw.selectionSize !== 1 ? 's' : ''} aleatoriamente. Esta acción no se puede deshacer.`}
            >
              <button className="btn btn-primary">Ejecutar sorteo</button>
            </ConfirmForm>
            <ConfirmForm
              action={cancelDraw.bind(null, id)}
              message="¿Cancelar este sorteo? Se marcará como cancelado y no podrá ejecutarse."
            >
              <button className="btn btn-ghost">Cancelar sorteo</button>
            </ConfirmForm>
          </div>
        </div>
      )}

      {/* Miembros seleccionados */}
      {isCompleted && (
        <div className="card mb-4">
          <p className="card-title mb-3">
            Miembros seleccionados ({draw.selectedMembers.length} de{' '}
            {draw.poolSize ?? '?'} en el universo)
          </p>
          <ul className="member-list">
            {draw.selectedMembers.map((m) => (
              <li key={m.profileId} className="member-item">
                <span className="member-order">{m.selectionOrder}</span>
                <span>{m.displayName ?? m.profileId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Verificación técnica */}
      {isCompleted && (
        <div className="card mb-4">
          <p className="card-title mb-2">Datos de verificación independiente</p>
          <div className="verify-row">
            <span className="text-sm text-muted">Algoritmo:</span>
            <code className="verify-value">{draw.algorithm}</code>
          </div>
          <div className="verify-row">
            <span className="text-sm text-muted">Semilla pública (seed):</span>
            <div className="verify-seed-wrap">
              <code className="verify-box verify-seed">{draw.seed}</code>
            </div>
          </div>
          <p className="text-xs text-muted mt-2">
            Con esta semilla y el listado de miembros del grupo en el momento del sorteo,
            cualquier persona puede reproducir el resultado aplicando el mismo algoritmo.
          </p>

          <div className="mt-3">
            {!showVerify ? (
              <Link href={`/sortition/${id}?verify=1`} className="btn btn-ghost btn-sm">
                Verificar resultado en el servidor
              </Link>
            ) : (
              <Link href={`/sortition/${id}`} className="btn btn-ghost btn-sm">
                Ocultar verificación
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Resultado de verificación */}
      {verification && (
        <div className="card">
          <div className={`alert alert-${verification.verified ? 'success' : 'error'} mb-3`}>
            {verification.verified
              ? '✓ Verificado: los resultados almacenados coinciden con la recomputación.'
              : '✗ ¡Alerta! Los resultados no coinciden con el algoritmo. Contacta a los administradores.'}
          </div>
          <div className="flex gap-4 text-sm mb-3">
            <span>Universo: <strong>{verification.poolSize}</strong> perfiles</span>
            <span>Selección: <strong>{verification.selectionSize}</strong></span>
          </div>

          {/* Mostrar nombres en lugar de IDs crudos */}
          <div className="verify-compare">
            <div>
              <p className="text-sm font-medium mb-1">Selección almacenada:</p>
              <ol className="verify-box verify-names">
                {draw.selectedMembers
                  .sort((a, b) => a.selectionOrder - b.selectionOrder)
                  .map((m, i) => (
                    <li key={i}>{m.displayName ?? m.profileId}</li>
                  ))}
              </ol>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">IDs recomputados:</p>
              <ol className="verify-box verify-names">
                {verification.recomputedIds.map((rid, i) => (
                  <li key={i}>
                    {draw.selectedMembers.find((m) => m.profileId === rid)?.displayName ?? rid}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
