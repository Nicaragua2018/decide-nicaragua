import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import VoteForm from '@/components/VoteForm';
import { ConfirmForm } from '@/components/ConfirmForm';
import { updateElectionStatusDirect, tallyElection } from '@/lib/actions';
import type { ElectionDetail, ElectionResultResponse, ElectionStatus } from '@decide/shared';

const STATUS_LABEL: Record<ElectionStatus, string> = {
  draft: 'Borrador', open: 'Abierta', tallied: 'Contada', cancelled: 'Cancelada',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const res = await serverFetch(`/api/voting/elections/${id}`);
  const data = (await res.json()) as ElectionDetail;
  return { title: data.title };
}

export default async function ElectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [res, rRes] = await Promise.all([
    serverFetch(`/api/voting/elections/${id}`),
    serverFetch(`/api/voting/elections/${id}/results`),
  ]);

  if (!res.ok) return <p className="empty-state">Elección no encontrada.</p>;
  const election = (await res.json()) as ElectionDetail;
  const results: ElectionResultResponse | null = rRes.ok
    ? ((await rRes.json()) as ElectionResultResponse)
    : null;

  const isOpen    = election.status === 'open';
  const isDraft   = election.status === 'draft';
  const isTallied = election.status === 'tallied';
  const endsAt    = new Date(election.endsAt);
  const now       = new Date();
  const hasEnded  = endsAt < now;

  return (
    <>
      <div className="page-header">
        <Link href={`/groups/${election.groupId}?tab=elections`} className="text-sm text-muted">
          ← Volver al grupo
        </Link>
        <div className="flex justify-between items-center mt-2">
          <h1 className="page-title">{election.title}</h1>
          <span className={`badge badge-${election.status}`}>
            {STATUS_LABEL[election.status]}
          </span>
        </div>
        <p className="card-meta">
          {new Date(election.startsAt).toLocaleDateString('es-NI')} –{' '}
          {election.endsAt
            ? `${endsAt.toLocaleDateString('es-NI')}${isOpen && !hasEnded ? ` (${daysRemaining(endsAt)} restantes)` : ''}`
            : '—'
          }
          {' · '}{election.ballotCount} voto{election.ballotCount !== 1 ? 's' : ''} emitidos
        </p>
        {election.description && <p className="mt-2">{election.description}</p>}
      </div>

      {/* Candidatos */}
      <div className="card mb-4">
        <p className="card-title mb-2">Candidatos ({election.candidateCount})</p>
        <ol className="candidate-list">
          {election.candidates.map((c) => (
            <li key={c.id} className="candidate-item">
              <span className="candidate-title">{c.title}</span>
              {c.description && (
                <span className="candidate-desc"> — {c.description}</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* Voto: emitir o actualizar */}
      {isOpen && (
        <div className="card mb-4">
          <p className="card-title mb-1">
            {election.userHasVoted ? 'Tu voto actual (puedes modificarlo)' : 'Emitir voto (Condorcet)'}
          </p>
          <p className="text-sm text-muted mb-4">
            {election.userHasVoted
              ? 'La elección sigue abierta — puedes cambiar tu preferencia hasta que cierre.'
              : 'Ordena los candidatos de mayor a menor preferencia. El método Condorcet compara pares de candidatos.'}
          </p>
          <VoteForm electionId={id} candidates={election.candidates} />
        </div>
      )}

      {/* Administración */}
      {!isTallied && election.status !== 'cancelled' && (
        <div className="card mb-4">
          <p className="card-title mb-2">Administración</p>
          <div className="flex gap-2 flex-wrap">
            {isDraft && (
              <form action={updateElectionStatusDirect}>
                <input type="hidden" name="electionId" value={id} />
                <input type="hidden" name="status"     value="open" />
                <button className="btn btn-primary btn-sm">Abrir votación</button>
              </form>
            )}
            {isOpen && (
              <>
                <ConfirmForm
                  action={updateElectionStatusDirect}
                  message="¿Cancelar esta elección? Esta acción no se puede deshacer y todos los votos se descartarán."
                >
                  <input type="hidden" name="electionId" value={id} />
                  <input type="hidden" name="status"     value="cancelled" />
                  <button className="btn btn-danger btn-sm">Cancelar elección</button>
                </ConfirmForm>

                <ConfirmForm
                  action={tallyElection.bind(null, id)}
                  message={
                    hasEnded
                      ? `¿Contar los votos ahora? Se procesarán ${election.ballotCount} votos con el método Condorcet-Schulze. Esta acción cerrará la votación.`
                      : `La fecha de cierre aún no ha llegado (${endsAt.toLocaleDateString('es-NI')}). ¿Contar los votos igualmente?`
                  }
                >
                  <button className="btn btn-primary btn-sm">Contar votos</button>
                </ConfirmForm>
              </>
            )}
          </div>
          {isOpen && !hasEnded && (
            <p className="text-xs text-muted mt-2">
              La elección cierra el {endsAt.toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' })}.
            </p>
          )}
        </div>
      )}

      {/* Resultados */}
      {isTallied && results && (
        <div className="card">
          <p className="card-title mb-2">Resultados — Condorcet-Schulze</p>
          <div className="alert alert-success mb-4">
            <strong>Ganador{results.winners.length > 1 ? 'es' : ''}:</strong>{' '}
            {results.winners.map((w) => w.title).join(', ')}
            {' '}· {results.totalBallots} votos contados
          </div>

          <p className="text-sm font-medium mb-1">Matriz de preferencias (pairwise)</p>
          <p className="text-xs text-muted mb-2">
            Celda [i, j] = número de votantes que prefirieron la fila i sobre la columna j.
            El método Schulze elige al candidato con las rutas más fuertes.
          </p>
          <div className="matrix-wrap mb-4">
            <table className="matrix">
              <thead>
                <tr>
                  <th></th>
                  {results.candidates.map((c) => <th key={c.id} title={c.title}>{c.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.pairwiseMatrix.map((row, i) => (
                  <tr key={i}>
                    <th>{results!.candidates[i]?.title}</th>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        style={{
                          background: i === j ? 'var(--bg)' : '',
                          fontWeight: results!.winners.some((w) => w.id === results!.candidates[i]?.id) ? 600 : undefined,
                        }}
                      >
                        {i === j ? '—' : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            Contado el {new Date(results.computedAt).toLocaleString('es-NI')}.
            La matriz permite verificación independiente del resultado.
          </p>
        </div>
      )}
    </>
  );
}

function daysRemaining(end: Date): string {
  const ms   = end.getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days > 1)  return `${days} días`;
  if (days === 1) return '1 día';
  const hours = Math.floor(ms / 3_600_000);
  if (hours > 0) return `${hours}h`;
  return 'menos de 1h';
}
