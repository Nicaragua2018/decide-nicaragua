import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import type { ChatMensajeVista, ChatNovedades, ChatPagina, JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { ChatService, type Quien } from './chat.service';
import { PublicarDto } from './dto/publicar.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Un cursor que no es un id se ignora: la sala carga la página reciente. */
const cursor = (v: unknown): string | undefined => (typeof v === 'string' && UUID.test(v) ? v : undefined);

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private quien(user: JwtPayload): Quien {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return { userId: user.sub, profileId: user.profileId, status: user.status as Quien['status'] };
  }

  // Antes de ':groupId' para que no la capture.
  @Get('novedades')
  async novedades(@CurrentUser() user: JwtPayload): Promise<ChatNovedades> {
    return this.chat.novedades(this.quien(user));
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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async publicar(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: PublicarDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<ChatMensajeVista> {
    return this.chat.publicar(groupId, this.quien(user), dto.texto, dto.llamarGuardian === true, extractIp(req));
  }

  @Delete('mensajes/:id')
  @HttpCode(200)
  async borrar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.chat.borrarPropio(id, this.quien(user), extractIp(req));
    return { ok: true };
  }

  @Post('mensajes/:id/avisar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async avisar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<{ ok: true }> {
    await this.chat.avisar(id, this.quien(user));
    return { ok: true };
  }
}
