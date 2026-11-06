/**
 * Comunidades de acogida: países con más diáspora nicaragüense primero.
 * Cualquier otro país se acepta por su código ISO 3166-1 alfa-2.
 */
export const HOST_COUNTRIES = [
  { code: 'CR', name: 'Costa Rica' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'ES', name: 'España' },
  { code: 'PA', name: 'Panamá' },
  { code: 'HN', name: 'Honduras' },
  { code: 'MX', name: 'México' },
  { code: 'CA', name: 'Canadá' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'SV', name: 'El Salvador' },
] as const;

/** En EE. UU. la comunidad de acogida es el estado (código postal de 2 letras). */
export const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'Distrito de Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawái' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Luisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Míchigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Misisipi' }, { code: 'MO', name: 'Misuri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'Nuevo Hampshire' },
  { code: 'NJ', name: 'Nueva Jersey' }, { code: 'NM', name: 'Nuevo México' }, { code: 'NY', name: 'Nueva York' },
  { code: 'NC', name: 'Carolina del Norte' }, { code: 'ND', name: 'Dakota del Norte' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregón' }, { code: 'PA', name: 'Pensilvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'Carolina del Sur' }, { code: 'SD', name: 'Dakota del Sur' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'Virginia Occidental' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
] as const;

/** Miembros verificados para que una comunidad se active (plan 3 lo hace votable). */
export const MIN_ACTIVE_MEMBERS = 7;

// Las invitaciones pendientes por miembro son la regla de la colmena «invitaciones.pendientes_max».

/** Mientras haya menos cuentas verificadas que esto, una referencia del administrador basta (fundación). */
export const BOOTSTRAP_VERIFIED_LIMIT = 4;

/** Comunidad de toda la plataforma (grupo custom). */
export const GENERAL_GROUP_SLUG = 'general';

/** Nivel general (no es una comunidad): todo el exilio y la diáspora. */
export const GENERAL_GROUP_NAME = 'Exilio y diáspora';
