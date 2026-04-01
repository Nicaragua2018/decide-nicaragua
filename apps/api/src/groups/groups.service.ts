import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { GroupType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify.util';
import type { GroupSummary, GroupDetail, GroupListResponse } from '@decide/shared';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ────────────────────────────────────────────────────────────

  /**
   * Devuelve todos los grupos a los que pertenece un perfil.
   */
  async getMyGroups(profileId: string): Promise<GroupListResponse> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { profileId },
      include: { group: true },
      orderBy: { group: { name: 'asc' } },
    });

    const groups: GroupSummary[] = memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      slug: m.group.slug,
      type: m.group.type as unknown as import('@decide/shared').GroupType,
      description: m.group.description,
    }));

    return { groups };
  }

  /**
   * Devuelve los detalles de un grupo, incluyendo cantidad de miembros
   * y si el perfil actual es miembro.
   */
  async getGroupById(groupId: string, profileId: string): Promise<GroupDetail> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        _count: { select: { memberships: true } },
      },
    });

    if (!group || !group.isActive) {
      throw new NotFoundException('Group not found');
    }

    const membership = await this.prisma.groupMembership.findUnique({
      where: {
        groupId_profileId: { groupId, profileId },
      },
    });

    return {
      id: group.id,
      name: group.name,
      slug: group.slug,
      type: group.type as unknown as import('@decide/shared').GroupType,
      description: group.description,
      memberCount: group._count.memberships,
      isMember: membership !== null,
    };
  }

  // ─── Sincronización de membresías ─────────────────────────────────────────

  /**
   * Crea o asegura las membresías territoriales de un usuario.
   * Se llama tras `acceptInvite`. Es idempotente — puede llamarse varias veces.
   *
   * Grupos asignados:
   *  - territorial_origin:    basado en birthDepartment del perfil
   *  - territorial_residence: basado en currentCountry del perfil
   */
  async syncMemberships(
    userId: string,
    birthDepartment: string | null,
    currentCountry: string | null,
  ): Promise<void> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });

    if (!profile) {
      this.logger.warn(`syncMemberships called for userId=${userId} but profile not found`);
      return;
    }

    const operations: Promise<unknown>[] = [];

    if (birthDepartment) {
      operations.push(
        this.upsertMembership(profile.id, {
          name: birthDepartment,
          slug: slugify(birthDepartment),
          type: GroupType.territorial_origin,
          description: `Ciudadanos originarios del departamento de ${birthDepartment}`,
        }),
      );
    }

    if (currentCountry) {
      const countryCode = currentCountry.toUpperCase();
      operations.push(
        this.upsertMembership(profile.id, {
          name: countryCode,
          slug: `country-${currentCountry.toLowerCase()}`,
          type: GroupType.territorial_residence,
          description: `Ciudadanos residentes en ${countryCode}`,
        }),
      );
    }

    await Promise.all(operations);
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  private async upsertMembership(
    profileId: string,
    groupData: {
      name: string;
      slug: string;
      type: GroupType;
      description: string;
    },
  ): Promise<void> {
    // Encontrar o crear el grupo
    const group = await this.prisma.group.upsert({
      where: { slug: groupData.slug },
      create: {
        name: groupData.name,
        slug: groupData.slug,
        type: groupData.type,
        description: groupData.description,
      },
      update: {},
    });

    // Crear la membresía si no existe
    await this.prisma.groupMembership.upsert({
      where: {
        groupId_profileId: { groupId: group.id, profileId },
      },
      create: { groupId: group.id, profileId },
      update: {},
    });
  }
}
