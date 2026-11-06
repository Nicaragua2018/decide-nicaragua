import type { DecisionModoValue, DecisionResultadoView } from '@decide/shared';
import { ImpulsarSolucion } from './ImpulsarSolucion';

type Candidata = { id: string; title: string; puedoIniciarBifurcacion?: boolean; bifurcacionId?: string | null };

function frase(r: DecisionResultadoView, candidatas: Candidata[], modo: DecisionModoValue | null): string {
  switch (r.resultado) {
    case 'aprobada': {
      const titulos = r.ganadoras.map((id) => candidatas.find((c) => c.id === id)?.title ?? '').filter(Boolean);
      return `Aprobada: ${titulos.join('; ')}`;
    }
    case 'ninguna':
      // Con una sola candidata se vota en compatibles aunque se hubiera propuesto excluyentes.
      return modo === 'excluyentes' && candidatas.length > 1
        ? 'La solución preferida no obtuvo más de la mitad de las papeletas: no se aprueba ninguna'
        : 'Ninguna solución obtuvo más de la mitad';
    case 'empate':
      return 'Empate: sin decisión';
    case 'sin_quorum':
      return 'Sin decisión: no se alcanzó la participación mínima';
    case 'sin_soluciones':
      return 'No se propusieron soluciones';
  }
}

function Matriz({ nombre, m, candidatas }: { nombre: string; m: number[][]; candidatas: Candidata[] }) {
  if (m.length === 0) return null;
  return (
    <div className="mt-3" style={{ overflowX: 'auto' }}>
      <p className="text-sm font-medium">{nombre}</p>
      <table className="text-xs">
        <thead>
          <tr>
            <th><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Solución</span></th>
            {candidatas.map((c) => (
              <th key={c.id} scope="col" style={{ padding: '0.25rem 0.5rem', textAlign: 'left' }}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.map((fila, i) => (
            <tr key={candidatas[i]?.id ?? i}>
              <th scope="row" style={{ padding: '0.25rem 0.5rem', textAlign: 'left' }}>{candidatas[i]?.title}</th>
              {fila.map((v, j) => (
                <td key={candidatas[j]?.id ?? j} style={{ padding: '0.25rem 0.5rem' }}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultadoDecision({
  resultado,
  candidatas,
  modo,
}: {
  resultado: DecisionResultadoView;
  candidatas: Candidata[];
  modo: DecisionModoValue | null;
}) {
  return (
    <div>
      <p className="font-medium">{frase(resultado, candidatas, modo)}</p>

      {resultado.resultado !== 'sin_soluciones' && (
        <>
          <ul className="mt-3">
            {candidatas.map((c) => {
              const incluyen = resultado.aprobaciones.find((a) => a.solucionId === c.id)?.incluyen ?? 0;
              const pct = resultado.validas > 0 ? Math.round((100 * incluyen) / resultado.validas) : 0;
              return (
                <li key={c.id} className="mb-2">
                  <span className="font-medium">{c.title}</span>
                  <br />
                  <span className="text-sm text-muted">
                    la incluyó el {pct} % de las papeletas válidas ({incluyen} de {resultado.validas})
                  </span>
                  {/* Solo quien puede iniciar ve el botón; a las demás personas no se les insinúa nada. */}
                  {/* Si ya existe la iniciativa, quien la apoyó se suma desde aquí (todavía no la puede leer). */}
                  {c.puedoIniciarBifurcacion === true && (
                    <ImpulsarSolucion solucionId={c.id} bifurcacionId={c.bifurcacionId ?? null} />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted">
            Abstenciones: {resultado.abstenciones}. Total de papeletas: {resultado.papeletasTotal}.
          </p>
          <details className="mt-3">
            <summary className="text-sm">Ver matrices (para verificar)</summary>
            <Matriz nombre="Comparaciones de a pares" m={resultado.pairwiseMatrix} candidatas={candidatas} />
            <Matriz nombre="Caminos más fuertes (Schulze)" m={resultado.schulzeMatrix} candidatas={candidatas} />
          </details>
        </>
      )}
    </div>
  );
}
