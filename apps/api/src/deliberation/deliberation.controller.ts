import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { extractIp } from '../common/utils/ip.util';

import { DeliberationService } from './deliberation.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SetSignalDto } from './dto/set-signal.dto';
import { UpdateProposalStatusDto } from './dto/update-proposal-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type {
  JwtPayload,
  ProposalListResponse,
  ProposalDetail,
} from '@decide/shared';

@Controller('deliberation')
@UseGuards(JwtAuthGuard)
export class DeliberationController {
  constructor(private readonly deliberationService: DeliberationService) {}

  // ─── Proposals ─────────────────────────────────────────────────────────────

  /**
   * POST /api/deliberation/groups/:groupId/proposals
   * Crea una propuesta en el grupo. Solo miembros del grupo.
   */
  @Post('groups/:groupId/proposals')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async createProposal(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateProposalDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string }> {
    this.requireProfile(user);
    return this.deliberationService.createProposal(groupId, dto, user.profileId!, extractIp(req));
  }

  /**
   * GET /api/deliberation/groups/:groupId/proposals
   * Lista propuestas del grupo. Solo miembros.
   */
  @Get('groups/:groupId/proposals')
  async listGroupProposals(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProposalListResponse> {
    this.requireProfile(user);
    return this.deliberationService.listGroupProposals(groupId, user.profileId!);
  }

  /**
   * GET /api/deliberation/proposals/:id
   * Detalle completo de una propuesta: cuerpo, comentarios, señales.
   */
  @Get('proposals/:id')
  async getProposalById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProposalDetail> {
    this.requireProfile(user);
    return this.deliberationService.getProposalById(id, user.profileId!);
  }

  /**
   * PATCH /api/deliberation/proposals/:id/status
   * Cambia el estado de la propuesta. Solo el autor puede cerrar/archivar.
   */
  @Patch('proposals/:id/status')
  async updateProposalStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProposalStatusDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    this.requireProfile(user);
    return this.deliberationService.updateProposalStatus(id, dto, user.profileId!, extractIp(req));
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  /**
   * POST /api/deliberation/proposals/:id/comments
   * Agrega un comentario. Solo miembros, solo propuestas abiertas.
   */
  @Post('proposals/:id/comments')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string }> {
    this.requireProfile(user);
    return this.deliberationService.addComment(id, dto, user.profileId!, extractIp(req));
  }

  // ─── Signals ───────────────────────────────────────────────────────────────

  /**
   * PUT /api/deliberation/proposals/:id/signal
   * Establece o actualiza la señal de consenso del usuario.
   * Idempotente — PUT semántico correcto (reemplaza la señal previa).
   */
  @Put('proposals/:id/signal')
  async setSignal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSignalDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    this.requireProfile(user);
    return this.deliberationService.setSignal(id, dto, user.profileId!, extractIp(req));
  }

  // ─── Privados ──────────────────────────────────────────────────────────────

  private requireProfile(user: JwtPayload): void {
    if (!user.profileId) {
      throw new ForbiddenException('Profile required to access deliberation');
    }
  }

}
