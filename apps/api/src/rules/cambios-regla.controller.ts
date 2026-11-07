import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { CambiosReglaService } from './cambios-regla.service';
import { ProponerCambioDto } from './dto/proponer-cambio.dto';

@Controller('rules')
@UseGuards(JwtAuthGuard)
export class CambiosReglaController {
  constructor(private readonly cambios: CambiosReglaService) {}

  @Post('cambios')
  async proponer(
    @Body() dto: ProponerCambioDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string; proposalId: string }> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return this.cambios.proponer(user.profileId, dto, extractIp(req), { pedirRevision: dto.pedirRevision });
  }
}
