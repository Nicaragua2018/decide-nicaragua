import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '@decide/shared';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export const SOLO_OBSERVADORES = 'Esta sección es solo para los observadores.';

/**
 * ¿Tiene la persona hoy un cargo de observador en curso y su cuenta sigue verificada?
 * Se lee de la base de datos, no del token: un cargo terminado o una suspensión valen al instante.
 */
export async function esObservadorVigente(
  prisma: Pick<PrismaService, 'cargo'>,
  profileId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const cargo = await prisma.cargo.findFirst({
    where: {
      tipo: 'observador',
      profileId,
      terminadoAt: null,
      desde: { lte: now },
      profile: { user: { status: 'verified_citizen' } },
    },
    select: { id: true },
  });
  return cargo !== null;
}

/** Va después de `JwtAuthGuard`: deja pasar solo a quien es observador vigente. */
@Injectable()
export class ObservadorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>().user;
    if (!user?.profileId || !(await esObservadorVigente(this.prisma, user.profileId))) {
      throw new ForbiddenException(SOLO_OBSERVADORES);
    }
    return true;
  }
}
