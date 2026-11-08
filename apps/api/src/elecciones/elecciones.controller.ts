import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  EleccionDetalle,
  EleccionResumen,
  JwtPayload,
  MiCargoVista,
  RepresentantesVista,
  RevocacionVista,
} from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EleccionesService } from './elecciones.service';
import { RevocacionService } from './revocacion.service';
import { CandidaturaDto } from './dto/candidatura.dto';
import { PapeletaEleccionDto } from './dto/papeleta-eleccion.dto';
import { RevocacionDto } from './dto/revocacion.dto';

@Controller('elecciones')
@UseGuards(JwtAuthGuard)
export class EleccionesController {
  constructor(
    private readonly elecciones: EleccionesService,
    private readonly revocacion: RevocacionService,
  ) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  @Get()
  async listar(@CurrentUser() user: JwtPayload): Promise<EleccionResumen[]> {
    return this.elecciones.listar(this.perfil(user));
  }

  /** Declarada antes de `:id` para que no la capture esa ruta. */
  @Get('mis-cargos')
  async misCargos(@CurrentUser() user: JwtPayload): Promise<MiCargoVista[]> {
    return this.elecciones.misCargos(this.perfil(user));
  }

  @Post('cargos/:cargoId/renuncia')
  @HttpCode(204)
  async renunciar(@Param('cargoId', ParseUUIDPipe) cargoId: string, @CurrentUser() user: JwtPayload): Promise<void> {
    await this.elecciones.renunciar(this.perfil(user), cargoId, new Date());
  }

  // ─── Revocación (rutas fijas, antes de `:id`) ───────────────────────────────

  /** Los pedidos de revocación abiertos que la persona puede ver y apoyar. */
  @Get('revocaciones')
  async revocaciones(@CurrentUser() user: JwtPayload): Promise<RevocacionVista[]> {
    return this.revocacion.listar(this.perfil(user), new Date());
  }

  /** Responde 202 (sin crear el pedido) cuando el motivo queda en revisión de la mesa. */
  @Post('cargos/:cargoId/revocacion')
  async pedirRevocacion(
    @Param('cargoId', ParseUUIDPipe) cargoId: string,
    @Body() dto: RevocacionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ id: string }> {
    return this.revocacion.pedir(this.perfil(user), cargoId, dto.motivo, new Date(), { pedirRevision: dto.pedirRevision });
  }

  @Put('revocaciones/:id/apoyo')
  async apoyarRevocacion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<RevocacionVista> {
    return this.revocacion.apoyar(this.perfil(user), id, new Date());
  }

  @Delete('revocaciones/:id/apoyo')
  async quitarApoyoRevocacion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<RevocacionVista> {
    return this.revocacion.quitarApoyo(this.perfil(user), id, new Date());
  }

  @Get(':id')
  async detalle(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<EleccionDetalle> {
    return this.elecciones.detalle(this.perfil(user), id);
  }

  @Post(':id/candidatura')
  async presentarse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CandidaturaDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ id: string }> {
    return this.elecciones.presentarse(
      this.perfil(user),
      id,
      { presentacion: dto.presentacion, compromisos: dto.compromisos },
      { pedirRevision: dto.pedirRevision },
    );
  }

  /** Cambiar la ficha propia durante el plazo de candidaturas (vuelve a revisarse). */
  @Put(':id/candidatura')
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CandidaturaDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ id: string }> {
    return this.elecciones.editar(
      this.perfil(user),
      id,
      { presentacion: dto.presentacion, compromisos: dto.compromisos },
      { pedirRevision: dto.pedirRevision },
    );
  }

  @Delete(':id/candidatura')
  @HttpCode(204)
  async retirarse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    await this.elecciones.retirarse(this.perfil(user), id);
  }

  @Put(':id/papeleta')
  @HttpCode(204)
  async votar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PapeletaEleccionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.elecciones.votar(this.perfil(user), id, { abstencion: dto.abstencion, orden: dto.orden });
  }
}

/** «Quiénes nos representan»: pública, también para visitantes (sin cuenta). */
@Controller('representantes')
export class RepresentantesController {
  constructor(private readonly elecciones: EleccionesService) {}

  @Get()
  async representantes(): Promise<RepresentantesVista> {
    return this.elecciones.representantes();
  }
}
