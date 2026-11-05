import type { DecisionTemaResponse } from '@decide/shared';
import { JuntarSolucion } from './JuntarSolucion';
import { ObjecionPanel, ProponerModo } from './ModoPanel';
import { NuevaSolucionForm } from './NuevaSolucionForm';
import { Papeleta } from './Papeleta';
import { ResultadoDecision } from './ResultadoDecision';

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI');
}

export function SolucionesSection({
  proposalId,
  data,
}: {
  proposalId: string;
  data: DecisionTemaResponse;
}) {
  const { soluciones, decision } = data;
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
                  {s.mergedIntoTitle !== null ? (
                    <p className="text-xs text-muted">Se juntó con «{s.mergedIntoTitle}»</p>
                  ) : (
                    <>
                      <p className="comment-body">{s.description}</p>
                      {data.canOrganize && (
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
          {data.puedeProponer && <NuevaSolucionForm proposalId={proposalId} />}
        </>
      )}

      {decision?.fase === 'modo' && (
        <div className="mt-3">
          {data.canOrganize ? (
            <ProponerModo proposalId={proposalId} />
          ) : (
            <p className="text-sm text-muted">Esperando que se proponga cómo decidir</p>
          )}
        </div>
      )}

      {decision?.fase === 'objecion' && (
        <div className="mt-3">
          <ObjecionPanel
            proposalId={proposalId}
            modoPropuesto={decision.modoPropuesto}
            puedoObjetar={decision.puedoObjetar}
            yoObjete={decision.yoObjete}
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
          <Papeleta
            key={JSON.stringify(decision.miPapeleta)}
            proposalId={proposalId}
            candidatas={decision.candidatas}
            miPapeleta={decision.miPapeleta}
          />
        </div>
      )}

      {decision?.fase === 'contada' && (
        <div className="mt-3">
          {decision.resultado ? (
            <ResultadoDecision resultado={decision.resultado} candidatas={decision.candidatas} />
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
