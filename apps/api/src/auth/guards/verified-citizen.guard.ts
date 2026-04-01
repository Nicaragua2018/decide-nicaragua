import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AccountStatus } from '@decide/shared';
import type { JwtPayload } from '@decide/shared';
import type { Request } from 'express';

/**
 * Guard de autorización: solo usuarios con status 'verified_citizen'.
 *
 * En el MVP, los ciudadanos verificados son quienes pueden invitar a otros
 * y administrar la plataforma. En Fase 2 se reemplazará por un sistema
 * de roles más granular.
 *
 * Debe usarse después de JwtAuthGuard:
 * @UseGuards(JwtAuthGuard, VerifiedCitizenGuard)
 */
@Injectable()
export class VerifiedCitizenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (user?.status !== AccountStatus.verified_citizen) {
      throw new ForbiddenException('Verified citizen status required');
    }

    return true;
  }
}
