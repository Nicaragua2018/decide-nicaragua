import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@decide/shared';
import type { Request } from 'express';

/**
 * Extrae el usuario autenticado del request.
 * Solo disponible en rutas protegidas por JwtAuthGuard.
 *
 * @example
 * async myEndpoint(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
