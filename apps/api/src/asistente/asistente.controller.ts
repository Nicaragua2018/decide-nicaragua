import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { JwtPayload, RespuestaPanel, RevisionTexto } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AsistenteService, type EstadoAsistente } from './asistente.service';
import { ModeracionPreviaService } from './moderacion-previa.service';
import { PanelService } from './panel.service';
import { RevisarTextoDto } from './dto/revisar-texto.dto';
import { PreguntarDto } from './dto/preguntar.dto';

@Controller('asistente')
@UseGuards(JwtAuthGuard)
export class AsistenteController {
  constructor(
    private readonly asistente: AsistenteService,
    private readonly moderacion: ModeracionPreviaService,
    private readonly panel: PanelService,
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
    const r = await this.moderacion.revisar(dto.texto, dto.tipo, { profileId: user.profileId, paraWeb: true });
    // Para la web, apagado es lo mismo que «no revisado»: se publica sin aviso.
    if (r.apagado) return { nivel: 0, revisado: false };
    return r;
  }

  /** Pregunta al asistente desde el panel. Cualquier cuenta con perfil, también en verificación; 10 por minuto. */
  @Post('preguntar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async preguntar(@Body() dto: PreguntarDto, @CurrentUser() user: JwtPayload): Promise<RespuestaPanel> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    if (dto.mensajes[dto.mensajes.length - 1]!.rol !== 'persona') {
      throw new BadRequestException('La última línea debe ser tu pregunta.');
    }
    return this.panel.preguntar({ userId: user.sub, profileId: user.profileId, status: user.status }, dto.mensajes);
  }
}
