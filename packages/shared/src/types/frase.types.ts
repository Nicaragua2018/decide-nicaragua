/** Frases sobre una propuesta y mapa de opiniones (plan 3A-2). */

export type FraseVotoValue = 'de_acuerdo' | 'en_desacuerdo' | 'paso';

/** Resultado de una frase; el porcentaje va redondeado a múltiplos de 5. */
export interface FraseResultado {
  deAcuerdo: number;
  enDesacuerdo: number;
  paso: number;
  total: number;
  acuerdoPct: number;
}

/** Siguiente frase ofrecida para votar (sin resultados: independencia). */
export interface FraseParaVotar {
  id: string;
  text: string;
}

export interface FraseItem {
  id: string;
  text: string;
  hidden: boolean;
  isAuthor: boolean;
  myVote: FraseVotoValue | null;
  /** Solo existe si la persona ya votó la frase (myVote !== null). */
  resultado: FraseResultado | null;
  hiddenReason: string | null;
  moderationId: string | null;
}

export interface FrasesResponse {
  items: FraseItem[];
  /** Cuántas frases visibles aún no votó la persona. */
  pendientes: number;
}

export interface GrupoOpinion {
  id: number;
  size: number;
}

export interface FraseAnalisis {
  fraseId: string;
  text: string;
  acuerdoPorGrupo: { grupo: number; acuerdoPct: number }[];
}

export type OpinionAnalysisResponse =
  | { available: false; participants: number; needed: number }
  | {
      available: true;
      participants: number;
      grupos: GrupoOpinion[];
      puentes: FraseAnalisis[];
      divisivas: FraseAnalisis[];
      puentesSinVer: number;
    };
