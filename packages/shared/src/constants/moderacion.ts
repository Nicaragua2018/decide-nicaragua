/** Causas cerradas por las que la mesa oculta un contenido. */
export type ModeracionCausaValue =
  | 'datos_personales'
  | 'insultos_amenazas'
  | 'spam'
  | 'ilegal_violencia'
  | 'suplantacion'
  | 'odio';

export interface ModeracionCausa {
  value: ModeracionCausaValue;
  label: string;
  /** Urgente: en soluciones y propuestas se oculta ya y se confirma después. */
  urgente: boolean;
}

export const MODERACION_CAUSAS: readonly ModeracionCausa[] = [
  { value: 'datos_personales', label: 'Datos que identifican o ponen en riesgo a una persona', urgente: true },
  { value: 'insultos_amenazas', label: 'Insultos, amenazas o acoso', urgente: false },
  { value: 'spam', label: 'Correo basura o publicidad ajena al tema', urgente: false },
  { value: 'ilegal_violencia', label: 'Contenido ilegal o que incita a la violencia', urgente: true },
  { value: 'suplantacion', label: 'Suplantación de una persona u organización', urgente: false },
  { value: 'odio', label: 'Incita al odio o ataca a un grupo por lo que es (origen, etnia, color, religión, sexo, orientación, discapacidad)', urgente: false },
];
