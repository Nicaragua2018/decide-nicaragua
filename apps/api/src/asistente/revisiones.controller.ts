import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { JwtPayload, TextoEnRevisionView } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RevisionesService } from './revisiones.service';
import { FirmarRevisionDto } from './dto/firmar-revision.dto';

@Controller('asistente/revisiones')
@UseGuards(JwtAuthGuard)
export class RevisionesController {
  constructor(private readonly revisiones: RevisionesService) {}

  private perfil(user: JwtPayload): string {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    return user.profileId;
  }

  /** Los textos que la persona pidió revisar. */
  @Get('mias')
  mias(@CurrentUser() user: JwtPayload): Promise<TextoEnRevisionView[]> {
    return this.revisiones.misRevisiones(this.perfil(user));
  }

  /** Solo la mesa: las revisiones pendientes. */
  @Get()
  pendientes(@CurrentUser() user: JwtPayload): Promise<{ mesaSuficiente: boolean; revisiones: TextoEnRevisionView[] }> {
    return this.revisiones.listarPendientes(this.perfil(user));
  }

  /** Solo la mesa: aprobar o rechazar. Una firma por persona. */
  @Post(':id/firmar')
  @HttpCode(200)
  firmar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FirmarRevisionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TextoEnRevisionView> {
    return this.revisiones.firmar(this.perfil(user), id, dto.aprobar);
  }
}
