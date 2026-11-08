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
import type { EleccionDetalle, EleccionResumen, JwtPayload, RepresentantesVista } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EleccionesService } from './elecciones.service';
import { CandidaturaDto } from './dto/candidatura.dto';
import { PapeletaEleccionDto } from './dto/papeleta-eleccion.dto';

@Controller('elecciones')
@UseGuards(JwtAuthGuard)
export class EleccionesController {
  constructor(private readonly elecciones: EleccionesService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  @Get()
  async listar(@CurrentUser() user: JwtPayload): Promise<EleccionResumen[]> {
    return this.elecciones.listar(this.perfil(user));
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
