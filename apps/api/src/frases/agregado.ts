import { isDivisiva, isPuente, type OpinionResult } from './opinion-groups';

/** Un grupo de menos de 3 personas ni se muestra ni cuenta para puentes o divisivas. */
export const MIN_GRUPO = 3;
/** Por debajo de 5 votantes una frase no muestra porcentaje en ese grupo. */
export const MIN_VOTANTES_PCT = 5;

/** Múltiplo de 5 más cercano. */
export function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

export function pct(parte: number, total: number): number {
  return total > 0 ? round5((100 * parte) / total) : 0;
}

/** Solo cuentan los votos de quienes siguen siendo miembros del grupo (la suspensión quita la membresía). */
export function currentMembers(groupId: string) {
  return { profile: { memberships: { some: { groupId } } } };
}

export interface AgregadoPublico {
  participantes: number;
  grupos: { id: number; tamano: number }[];
  frases: {
    fraseId: string;
    texto: string;
    acuerdoPorGrupo: { grupo: number; acuerdoPct: number | null }[];
    puente: boolean;
    divisiva: boolean;
  }[];
}

/**
 * Lo único del análisis de opiniones que se puede mostrar o enviar fuera: sin miembros,
 * solo grupos de 3 o más, tamaños de 5 en 5 (mínimo 5) y porcentajes con 5 o más votantes.
 */
export function agregadoPublico(result: OpinionResult, textos: Map<string, string>): AgregadoPublico {
  const visibles = new Set(result.grupos.filter((g) => g.size >= MIN_GRUPO).map((g) => g.id));
  return {
    participantes: round5(result.participants),
    grupos: result.grupos.filter((g) => visibles.has(g.id)).map((g) => ({ id: g.id, tamano: Math.max(5, round5(g.size)) })),
    frases: result.frases.map((f) => {
      const analizada = { ...f, porGrupo: f.porGrupo.filter((g) => visibles.has(g.grupo)) };
      return {
        fraseId: f.fraseId,
        texto: textos.get(f.fraseId) ?? '',
        acuerdoPorGrupo: analizada.porGrupo.map((g) => ({
          grupo: g.grupo,
          acuerdoPct: g.votantes < MIN_VOTANTES_PCT ? null : pct(g.deAcuerdo, g.total),
        })),
        puente: isPuente(analizada),
        divisiva: isDivisiva(analizada),
      };
    }),
  };
}
