import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { BoardRole, JwtPayload } from '@decide/shared';
import { BoardService } from './board.service';

export const BOARD_ROLES_KEY = 'boardRoles';

/** Restringe a ciertos cargos de la mesa. Sin argumentos: cualquier cargo. */
export const BoardRoles = (...roles: BoardRole[]) => SetMetadata(BOARD_ROLES_KEY, roles);

/** Debe usarse después de JwtAuthGuard: @UseGuards(JwtAuthGuard, BoardGuard) */
@Injectable()
export class BoardGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly board: BoardService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles =
      this.reflector.getAllAndOverride<BoardRole[] | undefined>(BOARD_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const user = context.switchToHttp().getRequest<Request & { user: JwtPayload }>().user;
    const role = user?.profileId ? await this.board.roleOf(user.profileId) : null;
    if (!role || (roles.length > 0 && !roles.includes(role))) {
      throw new ForbiddenException('Esta sección es solo para la mesa directiva.');
    }
    return true;
  }
}
