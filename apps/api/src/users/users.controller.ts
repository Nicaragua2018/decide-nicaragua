import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { UsersService } from './users.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BoardGuard, BoardRoles } from '../board/board.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { AccountStatus, BoardRole } from '@decide/shared';
import type { JwtPayload, UserListResponse, UserSummary } from '@decide/shared';

@Controller('users')
@UseGuards(JwtAuthGuard, BoardGuard)
@BoardRoles(BoardRole.administrador)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users
   * Lista todos los usuarios con perfil.
   * Filtrable por ?status=pending_verification
   * Solo el administrador de la mesa.
   */
  @Get()
  async listUsers(
    @Query('status') status?: string,
  ): Promise<UserListResponse> {
    const statusFilter = Object.values(AccountStatus).includes(status as AccountStatus)
      ? (status as AccountStatus)
      : undefined;

    return this.usersService.listUsers(statusFilter);
  }

  /**
   * PATCH /api/users/:id/status
   * Rechaza una cuenta invitada o pendiente (lo único que permite el panel).
   * Valida la transición y la audita (ver UsersService).
   * Solo el administrador de la mesa.
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<UserSummary> {
    return this.usersService.updateStatus(id, dto.status, user.sub, extractIp(req));
  }
}
