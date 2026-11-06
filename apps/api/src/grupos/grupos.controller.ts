import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { GrupoTrabajoDetail, GruposAmbitoResponse, JwtPayload } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractIp } from '../common/utils/ip.util';
import { GruposService } from './grupos.service';
import { ProponerGrupoDto } from './dto/proponer-grupo.dto';

@Controller('grupos')
@UseGuards(JwtAuthGuard)
export class GruposController {
  constructor(private readonly grupos: GruposService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload): Promise<GruposAmbitoResponse> {
    return this.grupos.list(this.perfil(user));
  }

  @Post()
  async proponer(@Body() dto: ProponerGrupoDto, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<{ id: string }> {
    return this.grupos.proponer(this.perfil(user), dto, extractIp(req));
  }

  @Get(':id')
  async one(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<GrupoTrabajoDetail> {
    return this.grupos.detail(this.perfil(user), id);
  }

  @Post(':id/entrar')
  @HttpCode(HttpStatus.OK)
  async entrar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<GrupoTrabajoDetail> {
    return this.grupos.entrar(this.perfil(user), id, extractIp(req));
  }

  @Post(':id/salir')
  @HttpCode(HttpStatus.OK)
  async salir(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<GrupoTrabajoDetail> {
    return this.grupos.salir(this.perfil(user), id, extractIp(req));
  }
}
