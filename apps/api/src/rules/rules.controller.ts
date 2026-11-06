import { Controller, ForbiddenException, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload, RuleView } from '@decide/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from './rules.service';

@Controller('rules')
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(
    private readonly rules: RulesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('groupId', new ParseUUIDPipe({ optional: true })) groupId?: string,
  ): Promise<RuleView[]> {
    if (!user.profileId) throw new ForbiddenException('Perfil requerido');
    if (groupId) {
      const member = await this.prisma.groupMembership.findUnique({
        where: { groupId_profileId: { groupId, profileId: user.profileId } },
      });
      if (!member) throw new ForbiddenException('Solo los miembros de esta comunidad pueden ver sus reglas.');
    }
    return this.rules.list(groupId ?? null, user.profileId);
  }
}
