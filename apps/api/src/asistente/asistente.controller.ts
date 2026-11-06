import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AsistenteService, type EstadoAsistente } from './asistente.service';

@Controller('asistente')
@UseGuards(JwtAuthGuard)
export class AsistenteController {
  constructor(private readonly asistente: AsistenteService) {}

  /** Si el asistente funciona y si se alcanzó el tope del mes. Cualquier cuenta con perfil. */
  @Get('estado')
  async estado(@CurrentUser() user: JwtPayload): Promise<EstadoAsistente> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return this.asistente.estado();
  }
}
