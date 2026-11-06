import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { DecisionesResumenResponse, DecisionTemaResponse, JwtPayload, PapeletaValue } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { DecisionesService } from './decisiones.service';
import { CreateSolucionDto } from './dto/create-solucion.dto';
import { MergeSolucionDto } from './dto/merge-solucion.dto';
import { ProposeModoDto } from './dto/propose-modo.dto';
import { ObjecionDto } from './dto/objecion.dto';
import { PapeletaDto } from './dto/papeleta.dto';

@Controller('decisiones')
@UseGuards(JwtAuthGuard)
export class DecisionesController {
  constructor(private readonly decisiones: DecisionesService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  /** Página «Decisiones»: aprobadas, rechazadas y en curso de cada comunidad propia. */
  @Get('resumen')
  async getResumen(@CurrentUser() user: JwtPayload): Promise<DecisionesResumenResponse> {
    return this.decisiones.getResumen(this.perfil(user));
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

  @Post('temas/:proposalId/modo')
  async proposeModo(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: ProposeModoDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.decisiones.proposeModo(this.perfil(user), proposalId, dto.modo, extractIp(req));
  }

  @Put('temas/:proposalId/objecion')
  async setObjecion(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: ObjecionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ yoObjete: boolean }> {
    return this.decisiones.setObjecion(this.perfil(user), proposalId, dto.objeto);
  }

  @Put('temas/:proposalId/papeleta')
  async castPapeleta(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: PapeletaDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PapeletaValue> {
    return this.decisiones.castPapeleta(this.perfil(user), proposalId, { abstencion: dto.abstencion, orden: dto.orden });
  }
}
