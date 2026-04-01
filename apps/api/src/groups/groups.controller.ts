import {
  Controller,
  Get,
  Param,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload, GroupListResponse, GroupDetail } from '@decide/shared';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * GET /api/groups
   * Devuelve los grupos a los que pertenece el usuario autenticado.
   */
  @Get()
  async getMyGroups(@CurrentUser() user: JwtPayload): Promise<GroupListResponse> {
    this.requireProfile(user);
    return this.groupsService.getMyGroups(user.profileId!);
  }

  /**
   * GET /api/groups/:id
   * Devuelve detalles de un grupo: nombre, tipo, descripción, miembros.
   */
  @Get(':id')
  async getGroupById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<GroupDetail> {
    this.requireProfile(user);
    return this.groupsService.getGroupById(id, user.profileId!);
  }

  /**
   * Verifica que el usuario tiene un perfil activo.
   * Un usuario en pending_verification no debería llegar aquí (no tiene access token activo)
   * pero la verificación es una defensa adicional.
   */
  private requireProfile(user: JwtPayload): void {
    if (!user.profileId) {
      throw new ForbiddenException('Profile required to access groups');
    }
  }
}
