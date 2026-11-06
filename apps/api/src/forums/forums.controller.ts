import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { ForumDetail, ForumSummary, JwtPayload, ModeracionPorConfirmar, ModerationAppeal } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { ForumsService } from './forums.service';
import { CreateForumDto } from './dto/create-forum.dto';
import { CloseTopicDto } from './dto/close-topic.dto';
import { ModerateDto } from './dto/moderate.dto';
import { AppealDto } from './dto/appeal.dto';
import { ResolveAppealDto } from './dto/resolve-appeal.dto';
import { ConfirmarModeracionDto } from './dto/confirmar-moderacion.dto';

@Controller('forums')
@UseGuards(JwtAuthGuard)
export class ForumsController {
  constructor(private readonly forums: ForumsService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  @Get()
  async mine(@CurrentUser() user: JwtPayload): Promise<ForumSummary[]> {
    return this.forums.listMine(this.perfil(user));
  }

  // Rutas de moderación antes de ':id' para que no las capture.
  @Get('moderation/appeals')
  async appeals(@CurrentUser() user: JwtPayload): Promise<ModerationAppeal[]> {
    return this.forums.listAppeals(this.perfil(user));
  }

  @Get('moderation/por-confirmar')
  async porConfirmar(@CurrentUser() user: JwtPayload): Promise<ModeracionPorConfirmar[]> {
    return this.forums.listPorConfirmar(this.perfil(user));
  }

  @Get(':id')
  async one(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<ForumDetail> {
    return this.forums.getForum(this.perfil(user), id);
  }

  @Post()
  async create(@Body() dto: CreateForumDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ id: string }> {
    return this.forums.createForum(this.perfil(user), dto, extractIp(req));
  }

  @Post('topics/:id/formalize')
  @HttpCode(HttpStatus.OK)
  async formalize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.forums.formalize(this.perfil(user), id, extractIp(req));
    return { ok: true };
  }

  @Post('topics/:id/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseTopicDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.forums.closeWithConsensus(this.perfil(user), id, dto, extractIp(req));
    return { ok: true };
  }

  @Post('moderation/hide')
  async hide(
    @Body() dto: ModerateDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string; estado: 'oculto' | 'provisional' | 'pendiente' }> {
    return this.forums.hide(this.perfil(user), dto, extractIp(req));
  }

  @Post('moderation/:id/confirmar')
  @HttpCode(HttpStatus.OK)
  async confirmar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmarModeracionDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.forums.confirmar(this.perfil(user), id, dto.aprobar, extractIp(req));
    return { ok: true };
  }

  @Post('moderation/:id/appeal')
  @HttpCode(HttpStatus.OK)
  async appeal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AppealDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.forums.appeal(this.perfil(user), id, dto.text, extractIp(req));
    return { ok: true };
  }

  @Post('moderation/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveAppealDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.forums.resolveAppeal(this.perfil(user), id, dto.restore, extractIp(req));
    return { ok: true };
  }
}
