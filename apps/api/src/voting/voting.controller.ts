import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { extractIp } from '../common/utils/ip.util';
import { Throttle } from '@nestjs/throttler';

import { VotingService } from './voting.service';
import { CreateElectionDto } from './dto/create-election.dto';
import { CastBallotDto } from './dto/cast-ballot.dto';
import { UpdateElectionStatusDto } from './dto/update-election-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type {
  JwtPayload,
  ElectionListResponse,
  ElectionDetail,
  ElectionResultResponse,
} from '@decide/shared';

@Controller('voting')
@UseGuards(JwtAuthGuard)
export class VotingController {
  constructor(private readonly votingService: VotingService) {}

  // ─── Elections ─────────────────────────────────────────────────────────────

  /**
   * POST /api/voting/groups/:groupId/elections
   * Crea una elección en el grupo. Solo miembros.
   */
  @Post('groups/:groupId/elections')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async createElection(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateElectionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string }> {
    this.requireProfile(user);
    return this.votingService.createElection(groupId, dto, user.profileId!, extractIp(req));
  }

  /**
   * GET /api/voting/groups/:groupId/elections
   * Lista elecciones del grupo. Solo miembros.
   */
  @Get('groups/:groupId/elections')
  async listGroupElections(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ElectionListResponse> {
    this.requireProfile(user);
    return this.votingService.listGroupElections(groupId, user.profileId!);
  }

  /**
   * GET /api/voting/elections/:id
   * Detalle de una elección: candidatos, si el usuario ha votado.
   */
  @Get('elections/:id')
  async getElectionById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ElectionDetail> {
    this.requireProfile(user);
    return this.votingService.getElectionById(id, user.profileId!);
  }

  /**
   * PATCH /api/voting/elections/:id/status
   * Cambia el estado de la elección (draft→open, open→cancelled). Solo el creador.
   */
  @Patch('elections/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateElectionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateElectionStatusDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    this.requireProfile(user);
    return this.votingService.updateElectionStatus(id, dto, user.profileId!, extractIp(req));
  }

  // ─── Voting ────────────────────────────────────────────────────────────────

  /**
   * POST /api/voting/elections/:id/ballots
   * Emite o actualiza la papeleta del usuario (mientras la elección esté abierta).
   */
  @Post('elections/:id/ballots')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async castBallot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CastBallotDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    this.requireProfile(user);
    return this.votingService.castBallot(id, dto, user.profileId!, extractIp(req));
  }

  // ─── Tally ─────────────────────────────────────────────────────────────────

  /**
   * POST /api/voting/elections/:id/tally
   * Ejecuta el conteo Schulze. Solo el creador, solo cuando endsAt ha pasado.
   */
  @Post('elections/:id/tally')
  @HttpCode(HttpStatus.NO_CONTENT)
  async tallyElection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    this.requireProfile(user);
    return this.votingService.tallyElection(id, user.profileId!, extractIp(req));
  }

  // ─── Results ───────────────────────────────────────────────────────────────

  /**
   * GET /api/voting/elections/:id/results
   * Devuelve el resultado completo con matrices pairwise y Schulze.
   * Solo disponible después del conteo.
   */
  @Get('elections/:id/results')
  async getElectionResults(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ElectionResultResponse> {
    this.requireProfile(user);
    return this.votingService.getElectionResults(id, user.profileId!);
  }

  // ─── Privados ──────────────────────────────────────────────────────────────

  private requireProfile(user: JwtPayload): void {
    if (!user.profileId) {
      throw new ForbiddenException('Profile required to access voting');
    }
  }

}
