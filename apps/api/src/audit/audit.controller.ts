import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';

import { AuditService } from './audit.service';
import { QueryAuditEventsDto } from './dto/query-events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedCitizenGuard } from '../auth/guards/verified-citizen.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload, AuditListResponse, AuditEventSummary } from '@decide/shared';

@Controller('audit')
@UseGuards(JwtAuthGuard, VerifiedCitizenGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/audit/events
   *
   * Lista paginada de eventos de auditoría.
   * Solo accesible para ciudadanos verificados (VerifiedCitizenGuard).
   * Razón: el audit log contiene información sensible de actividad de usuarios
   * (logins, cambios de rol, votes) — no debe exponerse a observers ni colaboradores.
   *
   * Query params:
   *   action   — prefijo de acción (ej: "user.", "vote.cast")
   *   resource — recurso exacto (ej: "proposal:uuid-xxx")
   *   from     — fecha inicio ISO 8601
   *   to       — fecha fin ISO 8601
   *   page     — número de página (default 1)
   *   limit    — eventos por página (default 50, max 100)
   */
  @Get('events')
  async getEvents(
    @Query() dto: QueryAuditEventsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AuditListResponse> {
    this.requireProfile(user);
    return this.auditService.getEvents(dto);
  }

  /**
   * GET /api/audit/events/:id
   *
   * Detalle de un único evento de auditoría.
   * Solo accesible para ciudadanos verificados (VerifiedCitizenGuard).
   */
  @Get('events/:id')
  async getEventById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AuditEventSummary> {
    this.requireProfile(user);
    return this.auditService.getEventById(id);
  }

  // ─── Privados ──────────────────────────────────────────────────────────────

  private requireProfile(user: JwtPayload): void {
    if (!user.profileId) {
      throw new ForbiddenException('Profile required to access audit log');
    }
  }
}
