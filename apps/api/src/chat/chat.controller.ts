import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { ChatAvisoMesa, ChatMensajeVista, ChatNovedades, ChatPagina, JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService, type Quien } from './chat.service';
import { PublicarDto } from './dto/publicar.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Un cursor que no es un id se ignora: la sala carga la página reciente. */
const cursor = (v: unknown): string | undefined => (typeof v === 'string' && UUID.test(v) ? v : undefined);

/**
 * El límite general es por IP, y la web llama al API desde una sola: con la sala consultando cada
 * 10 segundos, unas pocas pestañas abiertas lo agotarían para todos. Aquí se exige sesión y
 * membresía en cada llamada, y escribir se limita por persona (ChatService.frenar).
 */
@Controller('chat')
@UseGuards(JwtAuthGuard)
@SkipThrottle()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private quien(user: JwtPayload): Quien {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return { userId: user.sub, profileId: user.profileId };
  }

  // Antes de ':groupId' para que no la capture.
  @Get('novedades')
  async novedades(@CurrentUser() user: JwtPayload): Promise<ChatNovedades> {
    return this.chat.novedades(this.quien(user));
  }

  /** Mensajes de los que algún miembro avisó, para la mesa. Antes de ':groupId'. */
  @Get('avisos')
  async avisos(@CurrentUser() user: JwtPayload): Promise<ChatAvisoMesa[]> {
    return this.chat.avisosParaMesa(this.quien(user));
  }

  @Get(':groupId')
  async listar(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query('antes') antes: string | undefined,
    @Query('despues') despues: string | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChatPagina> {
    const a = cursor(antes);
    const d = cursor(despues);
    return this.chat.listar(groupId, this.quien(user), { ...(a ? { antes: a } : {}), ...(d ? { despues: d } : {}) });
  }

  @Post(':groupId')
  async publicar(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: PublicarDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChatMensajeVista> {
    return this.chat.publicar(groupId, this.quien(user), dto.texto, dto.llamarGuardian === true);
  }

  @Delete('mensajes/:id')
  @HttpCode(200)
  async borrar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<{ ok: true }> {
    await this.chat.borrarPropio(id, this.quien(user));
    return { ok: true };
  }

  @Post('mensajes/:id/avisar')
  @HttpCode(200)
  async avisar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<{ ok: true }> {
    await this.chat.avisar(id, this.quien(user));
    return { ok: true };
  }
}
