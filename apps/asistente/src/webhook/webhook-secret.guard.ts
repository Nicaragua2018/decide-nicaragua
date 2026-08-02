import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

// El webhook solo acepta llamadas de n8n (mismo VPS) autenticadas con un
// secreto compartido en el header x-webhook-secret. Comparación en tiempo
// constante para no filtrar información por timing.
@Injectable()
export class WebhookSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env['WEBHOOK_SECRET'];
    if (!secret) {
      throw new UnauthorizedException('WEBHOOK_SECRET is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-webhook-secret'];
    if (typeof provided !== 'string') {
      throw new UnauthorizedException();
    }

    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
