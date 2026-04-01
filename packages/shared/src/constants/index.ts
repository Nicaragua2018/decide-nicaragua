/** Departamentos de Nicaragua (para perfil de origen) */
export const NICARAGUA_DEPARTMENTS = [
  'Boaco',
  'Carazo',
  'Chinandega',
  'Chontales',
  'Estelí',
  'Granada',
  'Jinotega',
  'León',
  'Madriz',
  'Managua',
  'Masaya',
  'Matagalpa',
  'Nueva Segovia',
  'Río San Juan',
  'Rivas',
  'RACCN',
  'RACCS',
] as const;

export type NicaraguaDepartment = (typeof NICARAGUA_DEPARTMENTS)[number];

/** Duración de los tokens de invitación (72 horas) */
export const INVITE_TOKEN_TTL_HOURS = 72;

/** Intentos de login antes de bloqueo temporal */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Duración del bloqueo temporal por intentos fallidos (minutos) */
export const LOGIN_LOCKOUT_MINUTES = 15;

/** Longitud mínima de contraseña */
export const MIN_PASSWORD_LENGTH = 12;

/** Prefijo de todas las rutas del API */
export const API_PREFIX = 'api';
