import type { AccountStatus } from './user.types.js';

/** Payload almacenado en el JWT access token */
export interface JwtPayload {
  sub: string;          // user.id
  email: string;
  status: AccountStatus;
  profileId?: string;   // profile.id — disponible una vez que el usuario completó el registro
  iat?: number;
  exp?: number;
}

/** Respuesta del endpoint de login (no incluye tokens; van en cookies) */
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    status: AccountStatus;
    displayName: string | null;
  };
}

/** Body del endpoint de aceptación de invitación */
export interface AcceptInviteDto {
  token: string;
  password: string;
  displayName: string;
  birthDepartment?: string;
  currentCountry?: string;
}
