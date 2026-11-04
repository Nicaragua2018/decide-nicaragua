export type RuleLevel = 'colmena' | 'local';

export interface RuleDefinition {
  key: string;
  level: RuleLevel;
  label: string;
  type: 'int' | 'choice';
  default: string;
  min?: number;
  max?: number;
  options?: string[];
  unit?: 'personas' | 'porcentaje' | 'dias' | 'meses';
}

type IntUnit = NonNullable<RuleDefinition['unit']>;

function int(
  key: string,
  level: RuleLevel,
  label: string,
  def: number,
  min: number,
  max: number,
  unit: IntUnit,
): RuleDefinition {
  return { key, level, label, type: 'int', default: String(def), min, max, unit };
}

export const RULE_DEFINITIONS: readonly RuleDefinition[] = [
  int('inquietud.apoyo_minimo_personas', 'local', 'Apoyo mínimo para que una inquietud pida respuesta (personas)', 3, 2, 50, 'personas'),
  int('inquietud.apoyo_minimo_porcentaje', 'local', 'Apoyo mínimo para que una inquietud pida respuesta (% del grupo)', 10, 1, 50, 'porcentaje'),
  int('inquietud.plazo_respuesta_dias', 'local', 'Plazo para responder una inquietud (días)', 7, 1, 30, 'dias'),
  int('debate.plazo_dias', 'local', 'Duración del debate (días)', 7, 3, 60, 'dias'),
  int('debate.plazo_objecion_modo_dias', 'local', 'Plazo para objetar el modo de decisión (días)', 3, 1, 14, 'dias'),
  int('debate.fraccion_objecion_modo', 'local', 'Objeciones necesarias para cambiar el modo de decisión (%)', 33, 10, 50, 'porcentaje'),
  int('debate.minimo_para_grupos', 'local', 'Participantes mínimos para formar grupos de debate (personas)', 7, 5, 50, 'personas'),
  int('votacion.plazo_dias', 'local', 'Duración de la votación (días)', 7, 3, 30, 'dias'),
  int('votacion.quorum_porcentaje', 'local', 'Participación mínima para validar una votación (%)', 20, 10, 100, 'porcentaje'),
  int('bifurcacion.plazo_dias', 'local', 'Plazo para reunir apoyos a una bifurcación (días)', 14, 7, 60, 'dias'),
  int('bifurcacion.minimo_personas', 'local', 'Personas mínimas para una bifurcación (personas)', 7, 3, 100, 'personas'),
  int('comision.puestos_min', 'local', 'Puestos mínimos de una comisión (personas)', 3, 1, 20, 'personas'),
  int('comision.puestos_max', 'local', 'Puestos máximos de una comisión (personas)', 7, 1, 50, 'personas'),
  int('comision.plazo_convocatoria_dias', 'local', 'Plazo de convocatoria de una comisión (días)', 7, 3, 30, 'dias'),
  int('comision.informe_cada_dias', 'local', 'Cada cuántos días informa la comisión (días)', 30, 7, 90, 'dias'),
  {
    key: 'comision.forma',
    level: 'local',
    label: 'Forma de elegir a la comisión',
    type: 'choice',
    default: 'sorteo',
    options: ['sorteo', 'preferencias'],
  },
  int('reglas.participacion_minima', 'colmena', 'Participación mínima para cambiar las reglas (%)', 30, 10, 100, 'porcentaje'),
  int('observadores.numero', 'colmena', 'Número de observadores (personas)', 7, 3, 15, 'personas'),
  int('comunidad.minimo_activacion', 'colmena', 'Personas mínimas para activar una comunidad (personas)', 7, 3, 50, 'personas'),
  int('eleccion.minimo_primera', 'colmena', 'Personas mínimas para la primera elección (personas)', 12, 5, 100, 'personas'),
  int('invitaciones.pendientes_max', 'colmena', 'Invitaciones pendientes por persona (máximo)', 5, 1, 20, 'personas'),
  int('revocacion.fraccion', 'colmena', 'Apoyos necesarios para revocar un cargo (%)', 33, 10, 50, 'porcentaje'),
  int('cargos.periodo_mesa_meses', 'colmena', 'Duración del cargo en la mesa (meses)', 12, 6, 24, 'meses'),
  int('cargos.periodo_coordinadores_meses', 'colmena', 'Duración del cargo de coordinación (meses)', 6, 3, 12, 'meses'),
  int('eleccion.plazo_candidaturas_dias', 'colmena', 'Plazo para presentar candidaturas (días)', 7, 3, 30, 'dias'),
  int('eleccion.plazo_votacion_dias', 'colmena', 'Plazo de votación de una elección (días)', 7, 3, 30, 'dias'),
];

export function ruleDefinition(key: string): RuleDefinition {
  const def = RULE_DEFINITIONS.find((d) => d.key === key);
  if (!def) throw new Error(`Regla desconocida: ${key}`);
  return def;
}

export interface RuleView {
  key: string;
  level: RuleLevel;
  label: string;
  type: 'int' | 'choice';
  unit?: 'personas' | 'porcentaje' | 'dias' | 'meses';
  value: string;
  default: string;
  min?: number;
  max?: number;
  options?: string[];
  isDefault: boolean;
}
