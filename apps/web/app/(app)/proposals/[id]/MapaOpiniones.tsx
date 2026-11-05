import type { FraseAnalisis, OpinionAnalysisResponse } from '@decide/shared';

function ListaFrases({ frases }: { frases: FraseAnalisis[] }) {
  return (
    <ul className="mt-2">
      {frases.map((f) => (
        <li key={f.fraseId} className="mb-2">
          <p>{f.text}</p>
          <p className="text-xs text-muted">
            {f.acuerdoPorGrupo
              .map((g) => `Grupo ${(g.grupo + 1).toString()}: ${g.acuerdoPct.toString()} % de acuerdo`)
              .join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function MapaOpiniones({ analysis }: { analysis: OpinionAnalysisResponse | null }) {
  if (!analysis) return null;

  return (
    <div className="mt-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
      <p className="card-title">Mapa de opiniones</p>
      {!analysis.available ? (
        <p className="text-sm text-muted mt-2">
          El mapa aparece cuando al menos {analysis.needed} personas hayan votado 3 frases o más (van {analysis.participants}).
        </p>
      ) : (
        <>
          <p className="mt-2">Se formaron {analysis.grupos.length} grupos de opinión</p>
          <p className="text-sm text-muted">Participan alrededor de {analysis.participants} personas</p>
          <ul className="mt-2">
            {analysis.grupos.map((g) => (
              <li key={g.id}>Grupo {g.id + 1}: alrededor de {g.size} personas</li>
            ))}
          </ul>

          <p className="text-sm font-medium mt-3">Frases puente</p>
          <p className="text-xs text-muted">
            En estas frases están de acuerdo personas que en lo demás piensan distinto
          </p>
          {analysis.puentes.length > 0 && <ListaFrases frases={analysis.puentes} />}
          {analysis.puentesSinVer > 0 && (
            <p className="text-sm text-muted mt-2">
              Hay {analysis.puentesSinVer} frases puente más que verás cuando las votes
            </p>
          )}

          {analysis.divisivas.length > 0 && (
            <>
              <p className="text-sm font-medium mt-3">Frases que dividen</p>
              <ListaFrases frases={analysis.divisivas} />
            </>
          )}
        </>
      )}
    </div>
  );
}
