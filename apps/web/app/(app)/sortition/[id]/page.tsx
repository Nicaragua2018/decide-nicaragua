import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
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
  const { id }         = await params;
  const { verify }     = await searchParams;
  const showVerify     = verify === '1';

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
          Selección de {draw.selectionSize} miembros ·{' '}
          {new Date(draw.createdAt).toLocaleDateString('es-NI')}
        </p>
        {draw.description && <p className="mt-2">{draw.description}</p>}
      </div>

      {/* Administración */}
      {isPending && (
        <div className="card mb-4">
          <p className="card-title mb-2">Ejecutar sorteo</p>
          <p className="text-sm text-muted mb-3">
            Al ejecutar se genera una semilla pública y se seleccionan {draw.selectionSize} miembros
            aleatoriamente del grupo.
          </p>
          <div className="flex gap-2">
            <form action={executeDraw.bind(null, id)}>
              <button className="btn btn-primary">Ejecutar sorteo</button>
            </form>
            <form action={cancelDraw.bind(null, id)}>
              <button className="btn btn-ghost">Cancelar</button>
            </form>
          </div>
        </div>
      )}

      {/* Miembros seleccionados */}
      {isCompleted && (
        <div className="card mb-4">
          <p className="card-title mb-3">Miembros seleccionados</p>
          <ul className="member-list">
            {draw.selectedMembers.map((m) => (
              <li key={m.profileId} className="member-item">
                <span className="member-order">{m.selectionOrder}</span>
                <span>{m.displayName ?? m.profileId}</span>
              </li>
            ))}
          </ul>
          {draw.poolSize !== null && (
            <p className="text-xs text-muted mt-3">
              Seleccionados de un universo de {draw.poolSize} miembros.
            </p>
          )}
        </div>
      )}

      {/* Datos técnicos y verificación */}
      {isCompleted && (
        <div className="card mb-4">
          <p className="card-title mb-2">Datos de verificación</p>
          <p className="text-sm text-muted mb-1">
            Algoritmo: <code>{draw.algorithm}</code>
          </p>
          <p className="text-sm font-medium mb-1">Semilla pública (seed):</p>
          <div className="verify-box mb-3">{draw.seed}</div>

          {!showVerify ? (
            <Link href={`/sortition/${id}?verify=1`} className="btn btn-ghost btn-sm">
              Verificar resultado de forma independiente
            </Link>
          ) : (
            <Link href={`/sortition/${id}`} className="btn btn-ghost btn-sm">
              Ocultar verificación
            </Link>
          )}
        </div>
      )}

      {/* Resultado de verificación */}
      {verification && (
        <div className="card">
          <div className={`alert alert-${verification.verified ? 'success' : 'error'} mb-3`}>
            {verification.verified
              ? '✓ Verificado: los resultados almacenados coinciden con el algoritmo.'
              : '✗ ¡Atención! Los resultados no coinciden con el algoritmo. Posible manipulación.'}
          </div>
          <div className="flex gap-4 text-sm mb-3">
            <span>Universo: {verification.poolSize} perfiles</span>
            <span>Selección: {verification.selectionSize}</span>
          </div>
          <div className="flex gap-4">
            <div style={{ flex: 1 }}>
              <p className="text-sm font-medium mb-1">IDs almacenados:</p>
              <ol className="verify-box" style={{ paddingLeft: '1rem' }}>
                {verification.storedIds.map((id, i) => <li key={i}>{id}</li>)}
              </ol>
            </div>
            <div style={{ flex: 1 }}>
              <p className="text-sm font-medium mb-1">IDs recomputados:</p>
              <ol className="verify-box" style={{ paddingLeft: '1rem' }}>
                {verification.recomputedIds.map((id, i) => <li key={i}>{id}</li>)}
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
