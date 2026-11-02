'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import {
  closeTopic,
  formalizeTopic,
  hideContent,
  openTopicVote,
  type ActionResult,
} from '@/lib/actions';
import { ProposalStatus } from '@decide/shared';
import type { ProposalDetail } from '@decide/shared';

export function TopicActions({ proposal }: { proposal: ProposalDetail }) {
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeState, closeAction, closing] = useActionState<ActionResult | null, FormData>(closeTopic, null);
  const [hideState, hideAction, hiding] = useActionState<ActionResult | null, FormData>(hideContent, null);

  const canAct = (proposal.isAuthor || proposal.canModerate) && !proposal.hidden;
  const isOpen = proposal.status === ProposalStatus.open;
  const endsAt = proposal.deliberationEndsAt ? new Date(proposal.deliberationEndsAt) : null;
  const deliberationOver = endsAt !== null && endsAt.getTime() <= Date.now();

  function run(fn: () => Promise<ActionResult>) {
    setActionError(null);
    startTransition(async () => {
      const r = await fn();
      if ('error' in r) setActionError(r.error);
    });
  }

  // Una propuesta formal se cierra con consenso solo cuando su votación ya fue contada (o cancelada).
  const isPropuesta = proposal.kind === 'propuesta';
  const voteDone = proposal.electionStatus === 'tallied' || proposal.electionStatus === 'cancelled';
  const canClose = !isPropuesta || voteDone;
  const canOpenVote = !proposal.electionId || proposal.electionStatus === 'cancelled';

  // De un tema oculto no se muestra nada: ni la propuesta, ni su votación, ni acciones.
  if (proposal.hidden) return null;

  const showAnything = isPropuesta || (canAct && isOpen) || proposal.canModerate;
  if (!showAnything) return null;

  return (
    <div className="card mb-4">
      {proposal.kind === 'propuesta' && (
        <div className="mb-3">
          <span className="badge badge-open">Propuesta formal</span>
          {endsAt && !deliberationOver && (
            <p className="text-sm text-muted mt-1">
              La deliberación termina el {endsAt.toLocaleDateString('es-NI')}
            </p>
          )}
          {deliberationOver && canOpenVote && isOpen && canAct && (
            <button
              type="button"
              className="btn btn-primary btn-sm mt-2"
              disabled={pending}
              onClick={() => run(() => openTopicVote(proposal.id))}
            >
              Abrir votación
            </button>
          )}
          {proposal.electionId && (
            <p className="mt-2">
              <Link href={`/elections/${proposal.electionId}`} className="btn btn-primary btn-sm">
                Ir a la votación
              </Link>
            </p>
          )}
        </div>
      )}

      {proposal.kind === 'tema' && isOpen && canAct && (
        <div className="mb-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (window.confirm('¿Convertir este tema en propuesta formal? Habrá 7 días de deliberación y luego una votación.')) {
                run(() => formalizeTopic(proposal.id));
              }
            }}
          >
            Convertir en propuesta formal
          </button>
        </div>
      )}

      {isOpen && canAct && !canClose && proposal.electionId && (
        <p className="text-sm text-muted mb-3">Podrás cerrar con consenso cuando se cuente la votación.</p>
      )}

      {isOpen && canAct && canClose && (
        <form action={closeAction} className="form mb-3">
          <p className="card-title">Cerrar con consenso</p>
          <input type="hidden" name="topicId" value={proposal.id} />
          <textarea
            name="conclusion"
            className="form-textarea"
            rows={3}
            required
            minLength={10}
            maxLength={2000}
            placeholder="Conclusión a la que llegó la comunidad"
          />
          <textarea
            name="objections"
            className="form-textarea"
            rows={2}
            maxLength={2000}
            placeholder="Objeciones de la minoría (opcional)"
          />
          <p className="text-xs text-muted">Resume las objeciones de quienes no estuvieron de acuerdo, sin nombres.</p>
          <button className="btn btn-primary btn-sm" disabled={closing}>Cerrar con consenso</button>
          {closeState && 'error' in closeState && <p className="alert alert-error">{closeState.error}</p>}
        </form>
      )}

      {proposal.canModerate && !proposal.hidden && (
        <form action={hideAction} className="form">
          <p className="card-title">Ocultar tema</p>
          <input type="hidden" name="target" value="tema" />
          <input type="hidden" name="targetId" value={proposal.id} />
          <input type="hidden" name="topicId" value={proposal.id} />
          <textarea
            name="reason"
            className="form-textarea"
            rows={2}
            required
            minLength={10}
            maxLength={500}
            placeholder="Motivo (obligatorio)"
          />
          <button className="btn btn-ghost btn-sm" disabled={hiding}>Ocultar tema</button>
          {hideState && 'error' in hideState && <p className="alert alert-error">{hideState.error}</p>}
        </form>
      )}

      {actionError && <p className="alert alert-error mt-2">{actionError}</p>}
    </div>
  );
}
