/**
 * Tipo de grupo territorial.
 *
 * territorial_origin    — agrupado por departamento de Nicaragua de nacimiento
 * territorial_residence — agrupado por país de residencia actual
 * custom                — creado manualmente por un administrador
 * trabajo               — grupo de trabajo (subgrupo, comisión o bifurcación) de una comunidad
 */
export enum GroupType {
  territorial_origin = 'territorial_origin',
  territorial_residence = 'territorial_residence',
  custom = 'custom',
  trabajo = 'trabajo',
}

export interface GroupSummary {
  id: string;
  name: string;
  slug: string;
  type: GroupType;
  description: string | null;
}

export interface GroupDetail extends GroupSummary {
  memberCount: number;
  isMember: boolean;
  /** La comunidad tiene los miembros mínimos para elegir coordinadores. */
  activated: boolean;
  minActiveMembers: number;
}

export interface GroupListResponse {
  groups: GroupSummary[];
}

export type TrabajoTipoValue = 'subgrupo' | 'comision' | 'bifurcacion';
export type TrabajoEstadoValue = 'convocando' | 'activo' | 'pausado' | 'cerrado' | 'archivado';

export interface GrupoTrabajoItem {
  id: string;
  name: string;
  proposito: string;
  tipo: TrabajoTipoValue;
  estado: TrabajoEstadoValue;
  miembros: number;
  faltan: number | null;
  convocatoriaEndsAt: string | null;
  soyMiembro: boolean;
}

export interface GrupoTrabajoDetail extends GrupoTrabajoItem {
  ambito: { id: string; name: string; tipo: 'origen' | 'acogida' | 'general' };
  /** displayName de los miembros; vacío para bifurcaciones (3A-4b). */
  miembrosNombres: string[];
  /** null mientras convoca. */
  forumId: string | null;
  puedoEntrar: boolean;
  puedoSalir: boolean;
}

export interface GruposAmbitoResponse {
  ambitos: {
    id: string;
    name: string;
    tipo: 'origen' | 'acogida' | 'general';
    grupos: GrupoTrabajoItem[];
  }[];
}
