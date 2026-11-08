import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtPayload } from '@decide/shared';

/**
 * Extrae el JWT del cookie HttpOnly 'access_token'.
 * No se acepta Authorization header para evitar ataques CSRF clásicos.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          return (req?.cookies as Record<string, string> | undefined)?.['access_token'] ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * El payload validado se adjunta al request como req.user. Un token con `proposito` (p. ej. el
   * de reactivación, firmado con el mismo secreto) nunca vale como sesión.
   */
  validate(payload: JwtPayload): JwtPayload {
    if ((payload as JwtPayload & { proposito?: unknown }).proposito !== undefined) {
      throw new UnauthorizedException('Sesión no válida');
    }
    return payload;
  }
}
