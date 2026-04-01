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
import { Throttle } from '@nestjs/throttler';

import { SortitionService } from './sortition.service';
import { CreateDrawDto } from './dto/create-draw.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type {
  JwtPayload,
  SortitionListResponse,
  SortitionDrawDetail,
  SortitionVerificationResult,
} from '@decide/shared';

@Controller('sortition')
@UseGuards(JwtAuthGuard)
export class SortitionController {
  constructor(private readonly sortitionService: SortitionService) {}

  // ─── Draws ─────────────────────────────────────────────────────────────────

  /**
   * POST /api/sortition/groups/:groupId/draws
   * Crea un sorteo pendiente. Solo miembros del grupo.
   */
  @Post('groups/:groupId/draws')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async createDraw(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateDrawDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string }> {
    this.requireProfile(user);
    return this.sortitionService.createDraw(groupId, dto, user.profileId!, this.getIp(req));
  }

  /**
   * GET /api/sortition/groups/:groupId/draws
   * Lista sorteos del grupo. Solo miembros.
   */
  @Get('groups/:groupId/draws')
  async listGroupDraws(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SortitionListResponse> {
    this.requireProfile(user);
    return this.sortitionService.listGroupDraws(groupId, user.profileId!);
  }

  /**
   * GET /api/sortition/draws/:id
   * Detalle del sorteo con miembros seleccionados (si ya fue ejecutado).
   */
  @Get('draws/:id')
  async getDrawById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SortitionDrawDetail> {
    this.requireProfile(user);
    return this.sortitionService.getDrawById(id, user.profileId!);
  }

  // ─── Execute / Cancel ──────────────────────────────────────────────────────

  /**
   * POST /api/sortition/draws/:id/execute
   * Ejecuta el sorteo. Solo el creador, solo si está pendiente.
   * Genera seed pública y almacena el resultado con poolSnapshot.
   */
  @Post('draws/:id/execute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async executeDraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    this.requireProfile(user);
    return this.sortitionService.executeDraw(id, user.profileId!, this.getIp(req));
  }

  /**
   * PATCH /api/sortition/draws/:id/cancel
   * Cancela el sorteo. Solo el creador, solo si está pendiente.
   */
  @Patch('draws/:id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelDraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    this.requireProfile(user);
    return this.sortitionService.cancelDraw(id, user.profileId!, this.getIp(req));
  }

  // ─── Verify ────────────────────────────────────────────────────────────────

  /**
   * GET /api/sortition/draws/:id/verify
   * Verifica el resultado recomputando el algoritmo con la seed almacenada.
   * Solo disponible para sorteos completados. Cualquier miembro puede verificar.
   */
  @Get('draws/:id/verify')
  async verifyDraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SortitionVerificationResult> {
    this.requireProfile(user);
    return this.sortitionService.verifyDraw(id, user.profileId!);
  }

  // ─── Privados ──────────────────────────────────────────────────────────────

  private requireProfile(user: JwtPayload): void {
    if (!user.profileId) {
      throw new ForbiddenException('Profile required to access sortition');
    }
  }

  private getIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip ?? '';
    return req.ip ?? '';
  }
}
