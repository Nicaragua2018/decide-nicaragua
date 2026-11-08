import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { BoardRole, type BoardActionSummary, type BoardSeatSummary, type JwtPayload, type ReactivacionPendiente } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { BoardService } from './board.service';
import { BoardGuard, BoardRoles } from './board.guard';
import { AssignSeatDto } from './dto/assign-seat.dto';
import { ProposeActionDto } from './dto/propose-action.dto';
import { VoteActionDto } from './dto/vote-action.dto';

@Controller('board')
@UseGuards(JwtAuthGuard)
export class BoardController {
  constructor(private readonly board: BoardService) {}

  /** GET /api/board/seats — quién ocupa cada cargo (lo ve cualquier usuario con sesión). */
  @Get('seats')
  async seats(): Promise<BoardSeatSummary[]> {
    return this.board.getSeats();
  }

  /** GET /api/board/me — el cargo del usuario actual, o null. */
  @Get('me')
  async me(@CurrentUser() user: JwtPayload): Promise<{ role: string | null }> {
    return { role: user.profileId ? await this.board.roleOf(user.profileId) : null };
  }

  /** POST /api/board/seats — asignar un cargo fundador (solo administrador, antes de la primera elección). */
  @Post('seats')
  @UseGuards(BoardGuard)
  @BoardRoles(BoardRole.administrador)
  async assign(@Body() dto: AssignSeatDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ ok: true }> {
    await this.board.assignFounderSeat(user, dto.role, dto.profileId, extractIp(req));
    return { ok: true };
  }

  @Get('actions')
  @UseGuards(BoardGuard)
  async actions(): Promise<BoardActionSummary[]> {
    return this.board.listActions();
  }

  /** GET /api/board/reactivaciones — pedidos de reactivación pendientes (nombre visible, nunca el correo). */
  @Get('reactivaciones')
  @UseGuards(BoardGuard)
  async reactivaciones(): Promise<ReactivacionPendiente[]> {
    return this.board.listarReactivaciones();
  }

  @Post('actions')
  @UseGuards(BoardGuard)
  async propose(@Body() dto: ProposeActionDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ id: string }> {
    return this.board.proposeAction(user, dto, extractIp(req));
  }

  @Post('actions/:id/vote')
  @UseGuards(BoardGuard)
  async vote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoteActionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.board.voteAction(user, id, dto.approve, extractIp(req));
    return { ok: true };
  }
}
