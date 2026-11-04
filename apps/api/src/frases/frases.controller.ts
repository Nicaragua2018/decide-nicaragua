import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  FraseParaVotar,
  FraseResultado,
  FrasesResponse,
  JwtPayload,
  OpinionAnalysisResponse,
} from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { FrasesService } from './frases.service';
import { CreateFraseDto } from './dto/create-frase.dto';
import { VoteFraseDto } from './dto/vote-frase.dto';

@Controller('frases')
@UseGuards(JwtAuthGuard)
export class FrasesController {
  constructor(private readonly frases: FrasesService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  @Post('temas/:proposalId')
  async create(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: CreateFraseDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ id: string }> {
    return this.frases.create(this.perfil(user), proposalId, dto.text, extractIp(req));
  }

  @Get('temas/:proposalId')
  async list(@Param('proposalId', ParseUUIDPipe) proposalId: string, @CurrentUser() user: JwtPayload): Promise<FrasesResponse> {
    return this.frases.list(this.perfil(user), proposalId);
  }

  @Get('temas/:proposalId/siguiente')
  async next(@Param('proposalId', ParseUUIDPipe) proposalId: string, @CurrentUser() user: JwtPayload): Promise<FraseParaVotar | null> {
    return this.frases.next(this.perfil(user), proposalId);
  }

  @Get('temas/:proposalId/mapa')
  async analysis(@Param('proposalId', ParseUUIDPipe) proposalId: string, @CurrentUser() user: JwtPayload): Promise<OpinionAnalysisResponse> {
    return this.frases.analysis(this.perfil(user), proposalId);
  }

  @Put(':fraseId/voto')
  async vote(
    @Param('fraseId', ParseUUIDPipe) fraseId: string,
    @Body() dto: VoteFraseDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FraseResultado> {
    return this.frases.vote(this.perfil(user), fraseId, dto.value);
  }
}
