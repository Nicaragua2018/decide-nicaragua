import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import VoteForm from '@/components/VoteForm';
import { updateElectionStatus, tallyElection } from '@/lib/actions';
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

  // Ambas requests en paralelo — results devuelve 404 si no está tallied (se ignora)
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
          {new Date(election.endsAt).toLocaleDateString('es-NI')} ·{' '}
          {election.ballotCount} votos emitidos
        </p>
        {election.description && <p className="mt-2">{election.description}</p>}
      </div>

      {/* Candidatos */}
      <div className="card mb-4">
        <p className="card-title mb-2">Candidatos</p>
        <ol style={{ paddingLeft: '1.25rem' }}>
          {election.candidates.map((c) => (
            <li key={c.id} style={{ marginBottom: '0.5rem' }}>
              <span className="font-medium">{c.title}</span>
              {c.description && <span className="text-muted"> — {c.description}</span>}
            </li>
          ))}
        </ol>
      </div>

      {/* Voto */}
      {isOpen && !election.userHasVoted && (
        <div className="card mb-4">
          <p className="card-title mb-4">Emitir voto (Condorcet)</p>
          <VoteForm electionId={id} candidates={election.candidates} />
        </div>
      )}
      {isOpen && election.userHasVoted && (
        <div className="alert alert-success mb-4">Tu voto ha sido registrado.</div>
      )}

      {/* Administración */}
      {!isTallied && election.status !== 'cancelled' && (
        <div className="card mb-4">
          <p className="card-title mb-2">Administración</p>
          <div className="flex gap-2">
            {isDraft && (
              <form action={updateElectionStatus}>
                <input type="hidden" name="electionId" value={id} />
                <input type="hidden" name="status" value="open" />
                <button className="btn btn-primary btn-sm">Abrir votación</button>
              </form>
            )}
            {isOpen && (
              <>
                <form action={updateElectionStatus}>
                  <input type="hidden" name="electionId" value={id} />
                  <input type="hidden" name="status" value="cancelled" />
                  <button className="btn btn-danger btn-sm">Cancelar</button>
                </form>
                <form action={tallyElection.bind(null, id)}>
                  <button className="btn btn-primary btn-sm">Contar votos (tally)</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Resultados */}
      {isTallied && results && (
        <div className="card">
          <p className="card-title mb-2">Resultados — Condorcet-Schulze</p>
          <div className="alert alert-success mb-4">
            <strong>Ganador(es):</strong>{' '}
            {results.winners.map((w) => w.title).join(', ')}
            {' '}· {results.totalBallots} votos contados
          </div>

          <p className="text-sm font-medium mb-1">Matriz pairwise</p>
          <p className="text-xs text-muted mb-2">
            Fila i vs. columna j = votos donde el candidato i fue preferido sobre j.
          </p>
          <div className="matrix-wrap mb-4">
            <table className="matrix">
              <thead>
                <tr>
                  <th></th>
                  {results.candidates.map((c) => <th key={c.id}>{c.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.pairwiseMatrix.map((row, i) => (
                  <tr key={i}>
                    <th>{results!.candidates[i]?.title}</th>
                    {row.map((cell, j) => (
                      <td key={j} style={{ background: i === j ? 'var(--bg)' : '' }}>
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
            Las matrices completas permiten verificación independiente.
          </p>
        </div>
      )}
    </>
  );
}
