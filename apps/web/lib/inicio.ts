import type { EleccionResumen, GroupSummary } from '@decide/shared';

export type Cifras = {
  miembros: number | null;
  preguntas: number | null;
  elecciones: number | null;
  activada: boolean | null;
};

/**
 * Qué paso de «Lo que toca ahora» se resalta:
 * comunidad sin activar → 1; sin preguntas abiertas → 2; sin elección en curso → 3; si no → 4.
 * Con datos ausentes (null) no se cumplen las dos primeras condiciones.
 */
export function pasoQueToca(c: Cifras): 1 | 2 | 3 | 4 {
  if (c.activada === false) return 1;
  if (c.preguntas === 0) return 2;
  if ((c.elecciones ?? 0) === 0) return 3;
  return 4;
}

/** Elecciones de una comunidad que aún no están contadas (las que la lista llama «de tu comunidad»). */
export function contarEleccionesEnCurso(
  elecciones: Pick<EleccionResumen, 'ambito' | 'fase'>[],
  ambitoId: string,
): number {
  return elecciones.filter((e) => e.ambito.id === ambitoId && e.fase !== 'contada').length;
}

/** La comunidad principal: el primer grupo `custom`; si no hay, el primero; si no hay grupos, null. */
export function comunidadPrincipal(groups: GroupSummary[]): GroupSummary | null {
  return groups.find((x) => x.type === 'custom') ?? groups[0] ?? null;
}

export function agruparGrupos(groups: GroupSummary[]): {
  origen: GroupSummary[];
  acogida: GroupSummary[];
  otras: GroupSummary[];
} {
  const origen: GroupSummary[] = [];
  const acogida: GroupSummary[] = [];
  const otras: GroupSummary[] = [];
  for (const x of groups) {
    if (x.type === 'territorial_origin') origen.push(x);
    else if (x.type === 'territorial_residence') acogida.push(x);
    else otras.push(x);
  }
  return { origen, acogida, otras };
}
