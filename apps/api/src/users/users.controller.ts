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
} from '@nestjs/common';

import { UsersService } from './users.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedCitizenGuard } from '../auth/guards/verified-citizen.guard';
import { AccountStatus } from '@decide/shared';
import type { UserListResponse, UserSummary } from '@decide/shared';

@Controller('users')
@UseGuards(JwtAuthGuard, VerifiedCitizenGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users
   * Lista todos los usuarios con perfil.
   * Filtrable por ?status=pending_verification
   * Solo ciudadanos verificados.
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
   * Cambia el estado de un usuario.
   * Valida que la transición sea permitida (ver UsersService).
   * Solo ciudadanos verificados.
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserSummary> {
    return this.usersService.updateStatus(id, dto.status);
  }
}
