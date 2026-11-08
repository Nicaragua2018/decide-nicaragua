import { Suspense } from 'react';
import type { DecisionTemaResponse } from '@decide/shared';
import { NuevaSolucionConBorradores } from '@/components/SugerenciasSecciones';
import { ModerarForm } from '@/components/ModerarForm';
import { LlevarALaComunidad } from '../../grupos/[id]/LlevarALaComunidad';
import { JuntarSolucion } from './JuntarSolucion';
import { ObjecionPanel, ProponerModo } from './ModoPanel';
import { NuevaSolucionForm } from './NuevaSolucionForm';
import { Papeleta } from './Papeleta';
import { ResultadoDecision } from './ResultadoDecision';

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI');
}

function Candidatas({ items }: { items: { id: string; title: string; description: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-sm font-medium">Soluciones que se deciden</p>
      {items.map((c) => (
        <div key={c.id} className="comment-thread">
          <p className="font-medium">{c.title}</p>
          {c.description && <p className="comment-body">{c.description}</p>}
        </div>
      ))}
    </div>
  );
}

export function SolucionesSection({
  proposalId,
  data,
  llevarGrupoId = null,
  canModerate = false,
}: {
  proposalId: string;
  data: DecisionTemaResponse;
  /** Id del grupo de trabajo si quien mira es miembro y puede llevar las ganadoras a la comunidad. */
  llevarGrupoId?: string | null;
  /** Moderar no es participar: se ve también para quien solo lee el grupo. */
  canModerate?: boolean;
}) {
  const { soluciones, decision, soloLectura } = data;
  const yaLlevadas = new Set(data.llevadas);
  if (!decision && soluciones.length === 0 && !data.puedeProponer) return null;

  const vivas = soluciones.filter((s) => s.mergedIntoTitle === null);

  return (
    <div className="card mt-4">
      <p className="card-title">Soluciones y decisión</p>

      {!decision && (
        <>
          {soluciones.length === 0 ? (
            <p className="text-sm text-muted mt-2">Todavía no hay soluciones propuestas.</p>
          ) : (
            <div className="mt-2 mb-4">
              {soluciones.map((s) => (
                <div key={s.id} className="comment-thread">
                  <p className="font-medium">{s.title}</p>
                  {s.origen === 'asistente' && (
                    <p className="text-xs text-muted">A partir de una sugerencia del asistente</p>
                  )}
                  {s.mergedIntoTitle !== null ? (
                    <p className="text-xs text-muted">Se juntó con «{s.mergedIntoTitle}»</p>
                  ) : (
                    <>
                      <p className="comment-body">{s.description}</p>
                      {(data.canOrganize || canModerate) && !s.hidden && (
                        <ModerarForm target="solucion" targetId={s.id} topicId={proposalId} colapsable className="comment-reply-form" />
                      )}
                      {data.canOrganize && !soloLectura && (
                        <JuntarSolucion
                          solucionId={s.id}
                          proposalId={proposalId}
                          opciones={vivas.filter((v) => v.id !== s.id).map((v) => ({ id: v.id, title: v.title }))}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {data.debateEndsAt && (
            <p className="text-sm text-muted mb-3">Las soluciones quedan fijas el {fecha(data.debateEndsAt)}</p>
          )}
          {data.puedeProponer && !soloLectura && (
            <Suspense fallback={<NuevaSolucionForm proposalId={proposalId} />}>
              <NuevaSolucionConBorradores proposalId={proposalId} />
            </Suspense>
          )}
        </>
      )}

      {decision?.fase === 'modo' && (
        <div className="mt-3">
          <Candidatas items={decision.candidatas} />
          {data.canOrganize && !soloLectura ? (
            <ProponerModo proposalId={proposalId} />
          ) : (
            <p className="text-sm text-muted">Esperando que se proponga cómo decidir</p>
          )}
        </div>
      )}

      {decision?.fase === 'objecion' && (
        <div className="mt-3">
          <Candidatas items={decision.candidatas} />
          <ObjecionPanel
            proposalId={proposalId}
            modoPropuesto={decision.modoPropuesto}
            puedoObjetar={decision.puedoObjetar && !soloLectura}
            yoObjete={decision.yoObjete}
            fraccionObjecionPct={decision.fraccionObjecionPct}
          />
        </div>
      )}

      {decision?.fase === 'votacion' && (
        <div className="mt-3">
          {decision.votacionEndsAt && (
            <p className="text-sm text-muted mb-3">
              Puedes cambiar tu papeleta hasta el {fecha(decision.votacionEndsAt)}
            </p>
          )}
          {soloLectura ? (
            <Candidatas items={decision.candidatas} />
          ) : (
            <Papeleta
              key={JSON.stringify(decision.miPapeleta)}
              proposalId={proposalId}
              candidatas={decision.candidatas}
              miPapeleta={decision.miPapeleta}
            />
          )}
        </div>
      )}

      {decision?.fase === 'contada' && (
        <div className="mt-3">
          {decision.resultado ? (
            <>
              <ResultadoDecision resultado={decision.resultado} candidatas={decision.candidatas} modo={decision.modo} />
              {llevarGrupoId && decision.resultado.resultado === 'aprobada' && !soloLectura && (
                <div className="mt-3">
                  {decision.resultado.ganadoras.map((gid) => (
                    <div key={gid} className="comment-thread">
                      <p className="font-medium">{decision.candidatas.find((c) => c.id === gid)?.title}</p>
                      {yaLlevadas.has(gid) ? (
                        <p className="text-xs text-muted mt-1">Ya se llevó a la comunidad</p>
                      ) : (
                        <LlevarALaComunidad grupoId={llevarGrupoId} solucionId={gid} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">No se propusieron soluciones</p>
          )}
        </div>
      )}

      {decision?.fase === 'cancelada' && (
        <p className="alert alert-warning mt-3">Decisión cancelada porque el tema se ocultó</p>
      )}
    </div>
  );
}
