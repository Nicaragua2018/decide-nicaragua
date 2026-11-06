import { GENERAL_GROUP_SLUG } from '@decide/shared';
import type { RuleDefinition } from '@decide/shared';

/** Estados de un cambio abierto: como mucho uno por regla y ámbito (índice parcial único). */
export const CAMBIO_ABIERTO = ['en_votacion', 'pendiente_mesa'] as const;

/**
 * Comunidad donde se cambian reglas: origen, acogida o el nivel general «Exilio y diáspora».
 * Los grupos de trabajo y las demás comunidades no cambian reglas.
 */
export function esAmbitoDeReglas(g: { type: string; slug: string }): boolean {
  return g.type === 'territorial_origin' || g.type === 'territorial_residence' || esNivelGeneral(g);
}

export function esNivelGeneral(g: { type: string; slug: string }): boolean {
  return g.type === 'custom' && g.slug === GENERAL_GROUP_SLUG;
}

/** Un valor con su unidad, para los textos del tema: «30 %», «10 días», «sorteo». */
export function conUnidad(def: RuleDefinition, valor: string): string {
  const uno = valor === '1';
  switch (def.unit) {
    case 'porcentaje':
      return `${valor} %`;
    case 'dias':
      return uno ? '1 día' : `${valor} días`;
    case 'personas':
      return uno ? '1 persona' : `${valor} personas`;
    case 'meses':
      return uno ? '1 mes' : `${valor} meses`;
    default:
      return valor;
  }
}
