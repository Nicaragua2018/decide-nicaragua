import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { DecisionTemaResponse, JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { DecisionesService } from './decisiones.service';
import { CreateSolucionDto } from './dto/create-solucion.dto';
import { MergeSolucionDto } from './dto/merge-solucion.dto';

@Controller('decisiones')
@UseGuards(JwtAuthGuard)
export class DecisionesController {
  constructor(private readonly decisiones: DecisionesService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  @Get('temas/:proposalId')
  async getTema(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<DecisionTemaResponse> {
    return this.decisiones.getTema(this.perfil(user), proposalId);
  }

  @Post('temas/:proposalId/soluciones')
  async createSolucion(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: CreateSolucionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string }> {
    return this.decisiones.createSolucion(this.perfil(user), proposalId, dto, extractIp(req));
  }

  @Post('soluciones/:id/juntar')
  async mergeSolucion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeSolucionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.decisiones.mergeSolucion(this.perfil(user), id, dto.intoId, extractIp(req));
  }
}
