import { Body, Controller, ForbiddenException, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { JwtPayload, RevisionTexto } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AsistenteService, type EstadoAsistente } from './asistente.service';
import { ModeracionPreviaService } from './moderacion-previa.service';
import { RevisarTextoDto } from './dto/revisar-texto.dto';

@Controller('asistente')
@UseGuards(JwtAuthGuard)
export class AsistenteController {
  constructor(
    private readonly asistente: AsistenteService,
    private readonly moderacion: ModeracionPreviaService,
  ) {}

  /** Si el asistente funciona y si se alcanzó el tope del mes. Cualquier cuenta con perfil. */
  @Get('estado')
  async estado(@CurrentUser() user: JwtPayload): Promise<EstadoAsistente> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return this.asistente.estado();
  }

  /** Revisión previa de un texto antes de enviarlo. Cualquier cuenta con perfil; 20 por minuto. */
  @Post('revisar')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async revisar(@Body() dto: RevisarTextoDto, @CurrentUser() user: JwtPayload): Promise<RevisionTexto> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return this.moderacion.revisar(dto.texto, dto.tipo);
  }
}
