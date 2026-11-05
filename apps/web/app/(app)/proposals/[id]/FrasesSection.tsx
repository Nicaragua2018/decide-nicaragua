import { serverFetch } from '@/lib/api';
import type {
  FraseItem,
  FraseParaVotar,
  FrasesResponse,
  OpinionAnalysisResponse,
} from '@decide/shared';
import { AppealForm } from './AppealForm';
import { MapaOpiniones } from './MapaOpiniones';
import { NuevaFraseForm } from './NuevaFraseForm';
import { OcultarFrase, VotarFrase } from './VotarFrase';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await serverFetch(path);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function ResultadoBarra({ item }: { item: FraseItem }) {
  const r = item.resultado;
  if (!r || r.total === 0) return null;
  const pct = (n: number) => Math.round((n / r.total) * 100);
  const a = pct(r.deAcuerdo);
  const d = pct(r.enDesacuerdo);
  const p = pct(r.paso);
  return (
    <div className="consensus-block mt-2">
      <div className="consensus-bar">
        {a > 0 && <div className="consensus-seg consensus-seg--support" style={{ width: `${a}%` }} />}
        {d > 0 && <div className="consensus-seg consensus-seg--object" style={{ width: `${d}%` }} />}
        {p > 0 && <div className="consensus-seg consensus-seg--neutral" style={{ width: `${p}%` }} />}
      </div>
      <div className="consensus-legend">
        <span className="signal-count signal-support">De acuerdo {a} %</span>
        <span className="signal-count signal-object">En desacuerdo {d} %</span>
        <span className="signal-count signal-neutral">Paso {p} %</span>
      </div>
    </div>
  );
}

const MI_VOTO: Record<string, string> = {
  de_acuerdo: 'De acuerdo',
  en_desacuerdo: 'En desacuerdo',
  paso: 'Paso',
};

export async function FrasesSection({
  proposalId,
  isOpen,
  canModerate,
}: {
  proposalId: string;
  isOpen: boolean;
  canModerate: boolean;
}) {
  const base = `/api/frases/temas/${proposalId}`;
  const [lista, siguiente, mapa] = await Promise.all([
    getJson<FrasesResponse>(base),
    isOpen ? getJson<FraseParaVotar>(`${base}/siguiente`) : Promise.resolve(null),
    getJson<OpinionAnalysisResponse>(`${base}/mapa`),
  ]);

  const items = lista?.items ?? [];
  const pendientes = lista?.pendientes ?? 0;
  const votadas = items.filter((i) => i.hidden || i.myVote !== null);

  return (
    <div className="card mt-4">
      <p className="card-title">Frases</p>
      <p className="text-sm text-muted mt-1 mb-3">
        Escribe frases cortas sobre el tema y marca si estás de acuerdo. Verás cómo opinan los demás después de dar tu opinión.
      </p>

      {isOpen && (
        <div className="card mb-4">
          <p className="text-sm font-medium">Vota esta frase</p>
          {siguiente ? (
            <>
              <p className="mt-2 mb-3" style={{ lineHeight: 1.6 }}>{siguiente.text}</p>
              <VotarFrase fraseId={siguiente.id} proposalId={proposalId} />
              {canModerate && <OcultarFrase fraseId={siguiente.id} proposalId={proposalId} />}
            </>
          ) : (
            <p className="text-sm text-muted mt-2">Ya votaste todas las frases. ¡Gracias!</p>
          )}
        </div>
      )}

      {isOpen && (
        <div className="mb-4">
          <NuevaFraseForm proposalId={proposalId} />
        </div>
      )}

      {votadas.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium">Frases que ya votaste</p>
          {votadas.map((item) => (
            <div key={item.id} className="comment-thread">
              {item.hidden ? (
                <>
                  <p className="comment-body text-muted">
                    Tu frase fue ocultada por la moderación. Motivo: {item.hiddenReason}.
                  </p>
                  {item.moderationId && (
                    <AppealForm moderationId={item.moderationId} topicId={proposalId} />
                  )}
                </>
              ) : (
                <>
                  <p className="comment-body">{item.text}</p>
                  {item.myVote && (
                    <p className="text-xs text-muted">Tu voto: {MI_VOTO[item.myVote]}</p>
                  )}
                  <ResultadoBarra item={item} />
                  {canModerate && <OcultarFrase fraseId={item.id} proposalId={proposalId} />}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {pendientes > 0 && (
        <p className="text-sm text-muted">
          {pendientes === 1 ? 'Te falta 1 frase por votar' : `Te faltan ${pendientes.toString()} frases por votar`}
        </p>
      )}

      <MapaOpiniones analysis={mapa} />
    </div>
  );
}
