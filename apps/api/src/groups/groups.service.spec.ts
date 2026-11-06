/**
 * Unit tests de GroupsService.
 *
 * Estrategia:
 * - Instanciación directa (new GroupsService(...)) — sin DI de NestJS.
 * - PrismaService mockeada con vi.fn() por método.
 * - vi.resetAllMocks() en beforeEach; cada test configura solo lo que necesita.
 */

import 'reflect-metadata';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROFILE_ID = 'profile-uuid-1';
const USER_ID = 'user-uuid-1';
const GROUP_ID = 'group-uuid-1';

const mockGroup = {
  id: GROUP_ID,
  name: 'Managua',
  slug: 'managua',
  type: 'territorial_origin',
  description: 'Ciudadanos originarios del departamento de Managua',
  isActive: true,
  createdAt: new Date(),
  _count: { memberships: 5 },
};

const mockMembership = {
  profileId: PROFILE_ID,
  groupId: GROUP_ID,
  group: mockGroup,
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    groupMembership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    group: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = buildPrismaMock();
    vi.mocked(prisma.groupMembership.deleteMany).mockResolvedValue({ count: 0 } as never);
    service = new GroupsService(prisma as unknown as PrismaService);
  });

  // ─── getMyGroups ─────────────────────────────────────────────────────────

  describe('getMyGroups', () => {
    it('returns mapped group list for a profile', async () => {
      vi.mocked(prisma.groupMembership.findMany).mockResolvedValue([mockMembership] as never);

      const result = await service.getMyGroups(PROFILE_ID);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toMatchObject({
        id: GROUP_ID,
        name: 'Managua',
        slug: 'managua',
        type: 'territorial_origin',
      });
      expect(prisma.groupMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { profileId: PROFILE_ID, group: { type: { not: 'trabajo' } } } }),
      );
    });

    it('no muestra los grupos de trabajo', async () => {
      vi.mocked(prisma.groupMembership.findMany).mockResolvedValue([] as never);

      await service.getMyGroups(PROFILE_ID);

      const arg = vi.mocked(prisma.groupMembership.findMany).mock.calls[0]![0] as { where: unknown };
      expect(arg.where).toEqual({ profileId: PROFILE_ID, group: { type: { not: 'trabajo' } } });
    });

    it('returns empty list when profile has no memberships', async () => {
      vi.mocked(prisma.groupMembership.findMany).mockResolvedValue([] as never);

      const result = await service.getMyGroups(PROFILE_ID);

      expect(result.groups).toHaveLength(0);
    });
  });

  // ─── getGroupById ─────────────────────────────────────────────────────────

  describe('getGroupById', () => {
    it('returns group detail with membership status true', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue(mockGroup as never);
      vi.mocked(prisma.groupMembership.findUnique).mockResolvedValue(mockMembership as never);

      const result = await service.getGroupById(GROUP_ID, PROFILE_ID);

      expect(result).toMatchObject({
        id: GROUP_ID,
        name: 'Managua',
        memberCount: 5,
        isMember: true,
        activated: false,
        minActiveMembers: 7,
      });
    });

    it('returns isMember false when profile is not a member', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue(mockGroup as never);
      vi.mocked(prisma.groupMembership.findUnique).mockResolvedValue(null as never);

      const result = await service.getGroupById(GROUP_ID, PROFILE_ID);

      expect(result.isMember).toBe(false);
    });

    it('throws NotFoundException when group does not exist', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue(null as never);

      await expect(service.getGroupById(GROUP_ID, PROFILE_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when group is inactive', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({
        ...mockGroup,
        isActive: false,
      } as never);

      await expect(service.getGroupById(GROUP_ID, PROFILE_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── syncMemberships ─────────────────────────────────────────────────────

  describe('syncMemberships', () => {
    it('returns early with warning when profile not found', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue(null as never);

      // Should not throw — fire-and-forget from caller
      await expect(service.syncMemberships(USER_ID, 'Managua', 'NI')).resolves.toBeUndefined();

      expect(prisma.group.upsert).not.toHaveBeenCalled();
    });

    it('upserts one group for birthDepartment only', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, 'Managua', null);

      expect(prisma.group.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'managua' },
          create: expect.objectContaining({ name: 'Managua', type: 'territorial_origin' }),
        }),
      );
      expect(prisma.groupMembership.upsert).toHaveBeenCalledTimes(2);
    });

    it('upserts one group for currentCountry only', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, null, 'cr');

      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'country-cr' },
          create: expect.objectContaining({ name: 'Costa Rica', type: 'territorial_residence' }),
        }),
      );
    });

    it('upserts two groups when both birthDepartment and currentCountry are set', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, 'León', 'ES');

      expect(prisma.group.upsert).toHaveBeenCalledTimes(3);
      expect(prisma.groupMembership.upsert).toHaveBeenCalledTimes(3);
    });

    it('is idempotent — calling twice does not throw', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, 'Managua', null);
      await service.syncMemberships(USER_ID, 'Managua', null);

      expect(prisma.group.upsert).toHaveBeenCalledTimes(4);
    });

    it('handles departments with diacritics correctly (slugify)', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, 'Río San Juan', null);

      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'rio-san-juan' },
        }),
      );
    });
  });

  describe('syncMemberships() — comunidad general', () => {
    it('une a la comunidad general sin borrar otras membresías', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: 'p1' } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: 'g-x' } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships('u1', 'León', 'CR', null);

      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'general' },
          create: expect.objectContaining({ name: 'Exilio y diáspora', type: 'custom' }),
        }),
      );
      // La comunidad general es 'custom': el borrado por tipo nunca la toca.
      const deletes = vi
        .mocked(prisma.groupMembership.deleteMany)
        .mock.calls.map((c: unknown[]) => JSON.stringify(c[0]));
      expect(deletes.some((d: string) => d.includes('"custom"'))).toBe(false);
    });
  });

  describe('syncMemberships() — comunidades de acogida', () => {
    it('EE. UU. con estado: une a la comunidad del estado con nombre en español', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: 'p1' } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: 'g-fl' } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships('u1', null, 'US', 'FL');

      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'country-us-fl' },
          create: expect.objectContaining({ name: 'Florida, EE. UU.', type: 'territorial_residence' }),
        }),
      );
    });

    it('al cambiar de comunidad de acogida quita la membresía anterior del mismo tipo', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: 'p1' } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: 'g-cr' } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships('u1', null, 'CR', null);

      expect(prisma.groupMembership.deleteMany).toHaveBeenCalledWith({
        where: {
          profileId: 'p1',
          group: { is: { type: 'territorial_residence', NOT: { slug: 'country-cr' } } },
        },
      });
    });

    it('al cambiar de acogida no borra la membresía de un subgrupo (grupo de trabajo)', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: 'p1' } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: 'g-cr' } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships('u1', 'Managua', 'CR', null);

      // Cada borrado se limita al tipo de la comunidad que se sincroniza: nunca alcanza a `trabajo`.
      const llamadas = vi.mocked(prisma.groupMembership.deleteMany).mock.calls;
      const tipos = llamadas.map((c) => (c[0] as { where: { group: { is: { type: string } } } }).where.group.is.type);
      expect(tipos.sort()).toEqual(['territorial_origin', 'territorial_residence']);
      for (const c of llamadas) {
        expect((c[0] as { where: Record<string, unknown> }).where).toEqual({
          profileId: 'p1',
          group: { is: { type: expect.stringMatching(/^territorial_/), NOT: { slug: expect.any(String) } } },
        });
      }
    });
  });

  describe('getGroupById() — activación', () => {
    it('activated es true desde MIN_ACTIVE_MEMBERS miembros', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({
        id: 'g1', name: 'León', slug: 'leon', type: 'territorial_origin', description: null,
        isActive: true, _count: { memberships: 7 },
      } as never);
      vi.mocked(prisma.groupMembership.findUnique).mockResolvedValue({ id: 'm1' } as never);

      const detail = await service.getGroupById('g1', 'p1');
      expect(detail.activated).toBe(true);
      expect(detail.minActiveMembers).toBe(7);
    });

    it('activated es false con menos miembros', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({
        id: 'g1', name: 'León', slug: 'leon', type: 'territorial_origin', description: null,
        isActive: true, _count: { memberships: 6 },
      } as never);
      vi.mocked(prisma.groupMembership.findUnique).mockResolvedValue(null as never);

      expect((await service.getGroupById('g1', 'p1')).activated).toBe(false);
    });
  });
});
