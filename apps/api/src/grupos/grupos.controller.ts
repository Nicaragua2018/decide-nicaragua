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
import type { GrupoTrabajoDetail, GruposAmbitoResponse, JwtPayload, PausaApeladaItem } from '@decide/shared';
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
import { BifurcacionesService } from './bifurcaciones.service';
import { ApelarPausaDto, IniciarBifurcacionDto, PausarBifurcacionDto, ResolverPausaDto } from './dto/bifurcacion.dto';

@Controller('grupos')
@UseGuards(JwtAuthGuard)
export class GruposController {
  constructor(
    private readonly grupos: GruposService,
    private readonly comisiones: ComisionesService,
    private readonly bifurcaciones: BifurcacionesService,
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
    return this.grupos.proponer(this.perfil(user), dto, extractIp(req), undefined, { pedirRevision: dto.pedirRevision });
  }

  // ─── Bifurcaciones ────────────────────────────────────────────────────────

  /** Inicia la bifurcación de una solución perdedora (solo quien la apoyó). Sin ip: delataría el voto. */
  @Post('bifurcaciones')
  async iniciarBifurcacion(@Body() dto: IniciarBifurcacionDto, @CurrentUser() user: JwtPayload): Promise<{ id: string }> {
    return this.bifurcaciones.iniciar(this.perfil(user), dto.solucionId);
  }

  /** Cola de la mesa: pausas de bifurcaciones apeladas y pendientes. */
  @Get('pausas/apeladas')
  async pausasApeladas(@CurrentUser() user: JwtPayload): Promise<PausaApeladaItem[]> {
    return this.bifurcaciones.apeladas(this.perfil(user));
  }

  @Post(':id/pausa')
  @HttpCode(HttpStatus.OK)
  async pausar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PausarBifurcacionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.bifurcaciones.pausar(this.perfil(user), id, dto.causa, dto.detalle, extractIp(req));
    return { ok: true };
  }

  @Post(':id/pausa/apelacion')
  @HttpCode(HttpStatus.OK)
  async apelarPausa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApelarPausaDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<GrupoTrabajoDetail> {
    const profileId = this.perfil(user);
    await this.bifurcaciones.apelar(profileId, id, dto.texto);
    return this.grupos.detail(profileId, id);
  }

  @Post(':id/pausa/resolver')
  @HttpCode(HttpStatus.OK)
  async resolverPausa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolverPausaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.bifurcaciones.resolver(this.perfil(user), id, dto.reanudar, extractIp(req));
    return { ok: true };
  }

  /** Un miembro pide la comisión propia de su bifurcación. */
  @Post(':id/comision')
  async pedirComision(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<{ id: string }> {
    return this.bifurcaciones.pedirComision(this.perfil(user), id);
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
    await this.comisiones.publicarInforme(profileId, id, dto.texto, dto.final === true, extractIp(req), undefined, { pedirRevision: dto.pedirRevision });
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
