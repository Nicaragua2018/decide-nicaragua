/** Frases sobre una propuesta y mapa de opiniones (plan 3A-2). */

export type FraseVotoValue = 'de_acuerdo' | 'en_desacuerdo' | 'paso';

/**
 * Resultado de una frase. Nunca lleva recuentos exactos: los porcentajes y el
 * total van redondeados a múltiplos de 5, y con menos de 5 votos no hay
 * porcentajes (suficiente: false), para que no se pueda deducir el voto de nadie.
 */
export interface FraseResultado {
  deAcuerdoPct: number | null;
  enDesacuerdoPct: number | null;
  pasoPct: number | null;
  /** Total aproximado: 0 si no hay votos; si no, múltiplo de 5 y al menos 5. */
  totalAprox: number;
  suficiente: boolean;
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
