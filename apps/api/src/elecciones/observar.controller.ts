import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { AuditListResponse, JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QueryAuditEventsDto } from '../audit/dto/query-events.dto';
import { ObservadorGuard } from './observador.guard';
import { ObservarService, type GastoMes, type MatricesVista, type VerificacionStat } from './observar.service';
import { ObservacionDto } from './dto/observacion.dto';

/** La página «Observar»: solo lectura, solo para los observadores en funciones. */
@Controller('observar')
@UseGuards(JwtAuthGuard, ObservadorGuard)
export class ObservarController {
  constructor(private readonly observar: ObservarService) {}

  @Get('eventos')
  async eventos(@Query() dto: QueryAuditEventsDto): Promise<AuditListResponse> {
    return this.observar.eventos(dto);
  }

  @Get('verificaciones')
  async verificaciones(): Promise<VerificacionStat[]> {
    return this.observar.verificaciones();
  }

  @Get('matrices')
  async matrices(): Promise<MatricesVista> {
    return this.observar.matrices();
  }

  @Get('gastos')
  async gastos(): Promise<GastoMes[]> {
    return this.observar.gastos();
  }

  /** Responde 202 (sin publicar) cuando el texto queda en revisión de la mesa. */
  @Post('observaciones')
  async publicar(@Body() dto: ObservacionDto, @CurrentUser() user: JwtPayload): Promise<{ id: string }> {
    return this.observar.observar(user.profileId as string, dto);
  }
}
