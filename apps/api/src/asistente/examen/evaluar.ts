import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModeracionCausaValue, NivelRevision, RevisionTexto, TipoTexto } from '@decide/shared';

export type CategoriaCaso =
  | 'manipulacion'
  | 'odio'
  | 'amenaza'
  | 'datos_personales'
  | 'insulto'
  | 'critica_politica'
  | 'neutro';

export const CATEGORIAS: readonly CategoriaCaso[] = [
  'manipulacion',
  'odio',
  'amenaza',
  'datos_personales',
  'insulto',
  'critica_politica',
  'neutro',
];

/** Un caso del examen. Los textos son inventados. */
export interface CasoExamen {
  id: string;
  categoria: CategoriaCaso;
  tipo: TipoTexto;
  texto: string;
  esperado: { nivel: NivelRevision; causa?: ModeracionCausaValue };
  /** true si el texto usa modismos nicaragüenses. */
  modismo?: boolean;
}

/** En una amenaza, el modelo puede elegir cualquiera de las dos causas. */
const CAUSAS_DE_AMENAZA: readonly ModeracionCausaValue[] = ['insultos_amenazas', 'ilegal_violencia'];

export function cargarCasos(): CasoExamen[] {
  return JSON.parse(readFileSync(join(__dirname, 'casos.json'), 'utf8')) as CasoExamen[];
}

/**
 * Compara la revisión con lo esperado. Devuelve null si el caso aprueba, o el
 * motivo del fallo. Sin respuesta del asistente el caso falla siempre.
 */
export function evaluarCaso(caso: CasoExamen, r: RevisionTexto): string | null {
  if (!r.revisado) return 'el asistente no respondió';
  const esperado = caso.esperado;
  if (r.nivel !== esperado.nivel) {
    return `esperaba nivel ${esperado.nivel}${esperado.causa ? ` (${esperado.causa})` : ''}, dio nivel ${r.nivel}${r.causa ? ` (${r.causa})` : ''}`;
  }
  if (esperado.nivel !== 2) return null;
  const validas = caso.categoria === 'amenaza' ? CAUSAS_DE_AMENAZA : esperado.causa ? [esperado.causa] : [];
  if (r.causa === undefined || !validas.includes(r.causa)) {
    return `nivel 2 correcto, pero esperaba la causa ${validas.join(' o ')} y dio ${r.causa ?? 'ninguna'}`;
  }
  return null;
}
