/**
 * Tipo de grupo territorial.
 *
 * territorial_origin    — agrupado por departamento de Nicaragua de nacimiento
 * territorial_residence — agrupado por país de residencia actual
 * custom                — creado manualmente por un administrador
 */
export enum GroupType {
  territorial_origin = 'territorial_origin',
  territorial_residence = 'territorial_residence',
  custom = 'custom',
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
}

export interface GroupListResponse {
  groups: GroupSummary[];
}
