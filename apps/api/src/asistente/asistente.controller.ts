import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AlDiaView, CrecerView, JwtPayload, RespuestaPanel, RevisionTexto } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AsistenteService, type EstadoAsistente } from './asistente.service';
import { ModeracionPreviaService } from './moderacion-previa.service';
import { PanelService } from './panel.service';
import { AlDiaService, VISTA_VACIA } from './al-dia.service';
import { CrecerService } from './crecer.service';
import { RevisarTextoDto } from './dto/revisar-texto.dto';
import { PreguntarDto } from './dto/preguntar.dto';

@Controller('asistente')
@UseGuards(JwtAuthGuard)
export class AsistenteController {
  constructor(
    private readonly asistente: AsistenteService,
    private readonly moderacion: ModeracionPreviaService,
    private readonly panel: PanelService,
    private readonly alDiaServicio: AlDiaService,
    private readonly crecerServicio: CrecerService,
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

  /** «Desde tu última visita». Solo cuentas verificadas; las demás reciben la tarjeta apagada sin tocar su perfil. */
  @Get('al-dia')
  async alDia(@CurrentUser() user: JwtPayload): Promise<AlDiaView> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    if (user.status !== 'verified_citizen') return { ...VISTA_VACIA };
    return this.alDiaServicio.ver(user.profileId);
  }

  /** Cierra la tarjeta «Desde tu última visita». Sin efecto en cuentas sin verificar. */
  @Post('al-dia/cerrar')
  @HttpCode(204)
  async cerrarAlDia(@CurrentUser() user: JwtPayload): Promise<void> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    if (user.status !== 'verified_citizen') return;
    await this.alDiaServicio.cerrar(user.profileId);
  }

  /** Tarjeta para hacer crecer la comunidad. Solo cuentas verificadas. */
  @Get('crecer/:groupId')
  async crecer(@Param('groupId', new ParseUUIDPipe()) groupId: string, @CurrentUser() user: JwtPayload): Promise<CrecerView> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    if (user.status !== 'verified_citizen') return { mostrar: false };
    return this.crecerServicio.ver(groupId, user.profileId);
  }

  /** Oculta la tarjeta durante 7 días. Sin efecto en cuentas sin verificar. */
  @Post('crecer/:groupId/cerrar')
  @HttpCode(204)
  async cerrarCrecer(@Param('groupId', new ParseUUIDPipe()) groupId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    if (user.status !== 'verified_citizen') return;
    await this.crecerServicio.cerrar(groupId, user.profileId);
  }
}
