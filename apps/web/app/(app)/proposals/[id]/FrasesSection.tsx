import { Suspense } from 'react';
import { serverFetch } from '@/lib/api';
import { MapaAsistenteSeccion } from '@/components/SugerenciasSecciones';
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

/** Distingue un fallo (ok: false) de una respuesta vacía (ok: true, data: null). */
async function fetchJson<T>(path: string): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await serverFetch(path);
    if (!res.ok) return { ok: false, data: null };
    const text = await res.text();
    return { ok: true, data: text ? (JSON.parse(text) as T) : null };
  } catch {
    return { ok: false, data: null };
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  return (await fetchJson<T>(path)).data;
}

function ResultadoBarra({ item }: { item: FraseItem }) {
  const r = item.resultado;
  if (!r) return null;
  if (!r.suficiente) {
    return <p className="text-xs text-muted mt-2">Todavía hay pocas respuestas para mostrar resultados.</p>;
  }
  const a = r.deAcuerdoPct ?? 0;
  const d = r.enDesacuerdoPct ?? 0;
  const p = r.pasoPct ?? 0;
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
  const [lista, sig, mapa] = await Promise.all([
    getJson<FrasesResponse>(base),
    isOpen
      ? fetchJson<FraseParaVotar>(`${base}/siguiente`)
      : Promise.resolve({ ok: true, data: null as FraseParaVotar | null }),
    getJson<OpinionAnalysisResponse>(`${base}/mapa`),
  ]);
  const siguiente = sig.data;

  const items = lista?.items ?? [];
  const pendientes = lista?.pendientes ?? 0;
  const votadas = items.filter((i) => i.hidden || i.myVote !== null);
  // La moderación ve todas las frases visibles (solo el texto, sin resultados).
  const visibles = items.filter((i) => !i.hidden);

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
            </>
          ) : sig.ok ? (
            <p className="text-sm text-muted mt-2">Ya votaste todas las frases. ¡Gracias!</p>
          ) : (
            <p className="alert alert-error mt-2">No pudimos cargar la siguiente frase.</p>
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
                    Tu frase fue ocultada por la moderación.{item.hiddenReason ? ` Motivo: ${item.hiddenReason}.` : ''}
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
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canModerate && visibles.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium">Moderación de frases</p>
          {visibles.map((item) => (
            <div key={item.id} className="comment-thread">
              <p className="comment-body">{item.text}</p>
              <OcultarFrase fraseId={item.id} proposalId={proposalId} />
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
      <Suspense fallback={null}>
        <MapaAsistenteSeccion proposalId={proposalId} />
      </Suspense>
    </div>
  );
}
