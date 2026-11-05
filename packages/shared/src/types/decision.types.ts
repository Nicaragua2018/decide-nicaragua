export type DecisionFaseValue = 'modo' | 'objecion' | 'votacion' | 'contada' | 'cancelada';
export type DecisionModoValue = 'excluyentes' | 'compatibles';
export type DecisionResultadoValue = 'aprobada' | 'ninguna' | 'empate' | 'sin_quorum' | 'sin_soluciones';

export interface SolucionItem {
  id: string;
  title: string;
  description: string;
  origen: 'persona' | 'asistente';
  hidden: boolean;
  mergedIntoTitle: string | null;
  isAuthor: boolean;
  createdAt: string;
}

export interface PapeletaValue {
  abstencion: boolean;
  orden: string[];
}

export interface DecisionResultadoView {
  resultado: DecisionResultadoValue;
  /** Ids de solución. */
  ganadoras: string[];
  aprobaciones: { solucionId: string; incluyen: number }[];
  papeletasTotal: number;
  abstenciones: number;
  validas: number;
  miembros: number;
  pairwiseMatrix: number[][];
  schulzeMatrix: number[][];
  contadaAt: string;
}

export interface DecisionView {
  fase: DecisionFaseValue;
  modo: DecisionModoValue | null;
  modoPropuesto: DecisionModoValue | null;
  objecionEndsAt: string | null;
  votacionEndsAt: string | null;
  candidatas: { id: string; title: string; description: string; hidden: boolean }[];
  miPapeleta: PapeletaValue | null;
  yoObjete: boolean;
  puedoObjetar: boolean;
  resultado: DecisionResultadoView | null;
}

export interface DecisionTemaResponse {
  /** = proposal.deliberationEndsAt */
  debateEndsAt: string | null;
  /** Fase de debate y miembro. */
  puedeProponer: boolean;
  canOrganize: boolean;
  soluciones: SolucionItem[];
  decision: DecisionView | null;
}
