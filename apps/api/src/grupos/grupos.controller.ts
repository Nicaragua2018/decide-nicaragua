import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { LlevarPropuestaDto } from './dto/llevar-propuesta.dto';
import { ComisionesService } from './comisiones.service';
import { VoluntarioDto } from './dto/voluntario.dto';
import { AjustarComisionDto } from './dto/ajustar-comision.dto';
import { PapeletaComisionDto } from './dto/papeleta-comision.dto';
import { InformeComisionDto } from './dto/informe-comision.dto';

@Controller('grupos')
@UseGuards(JwtAuthGuard)
export class GruposController {
  constructor(
    private readonly grupos: GruposService,
    private readonly comisiones: ComisionesService,
  ) {}

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

  @Post(':id/llevar')
  async llevar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LlevarPropuestaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ inquietudId: string }> {
    return this.grupos.llevar(this.perfil(user), id, dto.solucionId, extractIp(req));
  }

  @Post(':id/salir')
  @HttpCode(HttpStatus.OK)
  async salir(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<GrupoTrabajoDetail> {
    return this.grupos.salir(this.perfil(user), id, extractIp(req));
  }

  // ─── Comisiones ───────────────────────────────────────────────────────────

  @Post(':id/voluntario')
  @HttpCode(HttpStatus.OK)
  async ofrecerse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoluntarioDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.comisiones.ofrecerse(profileId, id, dto.experiencia, extractIp(req));
    return this.grupos.detail(profileId, id);
  }

  @Delete(':id/voluntario')
  async retirarse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.comisiones.retirarse(profileId, id, extractIp(req));
    return this.grupos.detail(profileId, id);
  }

  @Patch(':id/comision')
  async ajustar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AjustarComisionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.comisiones.ajustar(profileId, id, {
      ...(dto.tarea !== undefined && { tarea: dto.tarea }),
      ...(dto.puestos !== undefined && { puestos: dto.puestos }),
    });
    return this.grupos.detail(profileId, id);
  }

  @Put(':id/comision/papeleta')
  async votar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PapeletaComisionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.comisiones.votar(profileId, id, dto.orden);
    return this.grupos.detail(profileId, id);
  }

  @Post(':id/informes')
  async informar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InformeComisionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.comisiones.publicarInforme(profileId, id, dto.texto, dto.final === true, extractIp(req));
    return this.grupos.detail(profileId, id);
  }

  @Post(':id/renovacion')
  @HttpCode(HttpStatus.OK)
  async apoyarRenovacion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.comisiones.apoyarRenovacion(profileId, id, extractIp(req));
    return this.grupos.detail(profileId, id);
  }

  @Delete(':id/renovacion')
  async retirarApoyoRenovacion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.comisiones.retirarApoyoRenovacion(profileId, id);
    return this.grupos.detail(profileId, id);
  }

  @Get(':id/comision/verificar')
  async verificar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<{ ok: boolean; elegidos: string[] }> {
    return this.comisiones.verificar(this.perfil(user), id);
  }
}
