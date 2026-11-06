import type { GrupoTrabajoItem, TrabajoEstadoValue, TrabajoTipoValue } from '@decide/shared';

/** Campos de un grupo de trabajo que usan las listas (`GET /api/grupos` y el resumen de «Decisiones»). */
export interface GrupoFila {
  id: string;
  name: string;
  type: string;
  parentGroupId: string | null;
  trabajoTipo: string | null;
  trabajoEstado: string | null;
  proposito: string | null;
  convocatoriaEndsAt: Date | null;
  pocosMiembrosDesde: Date | null;
  /** Solución de origen (comisiones y bifurcaciones); las listas no la seleccionan. */
  origenSolucionId?: string | null;
}

/** Regla con las personas mínimas para activarse: la de las bifurcaciones o la de los subgrupos. */
export function claveMinimo(trabajoTipo: string | null): 'bifurcacion.minimo_personas' | 'subgrupo.minimo_personas' {
  return trabajoTipo === 'bifurcacion' ? 'bifurcacion.minimo_personas' : 'subgrupo.minimo_personas';
}

/** Cuántas personas faltan para activarse; solo tiene sentido mientras convoca. */
export function faltanParaActivar(estado: string | null, miembros: number, minimo: number): number | null {
  return estado === 'convocando' ? Math.max(0, minimo - miembros) : null;
}

/** Función pura, sin inyección de Nest: la usan `GruposService` y `DecisionesService` sin depender uno del otro. */
export function grupoTrabajoItem(g: GrupoFila, miembros: number, minimo: number, soyMiembro: boolean): GrupoTrabajoItem {
  return {
    id: g.id,
    name: g.name,
    proposito: g.proposito ?? '',
    tipo: (g.trabajoTipo ?? 'subgrupo') as TrabajoTipoValue,
    estado: (g.trabajoEstado ?? 'convocando') as TrabajoEstadoValue,
    miembros,
    // Una comisión no se activa por número de miembros, sino al cerrar su convocatoria.
    faltan: g.trabajoTipo === 'comision' ? null : faltanParaActivar(g.trabajoEstado, miembros, minimo),
    convocatoriaEndsAt: g.convocatoriaEndsAt ? g.convocatoriaEndsAt.toISOString() : null,
    soyMiembro,
  };
}
