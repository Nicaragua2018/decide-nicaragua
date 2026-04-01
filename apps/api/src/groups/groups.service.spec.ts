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
        expect.objectContaining({ where: { profileId: PROFILE_ID } }),
      );
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

      expect(prisma.group.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'managua' },
          create: expect.objectContaining({ name: 'Managua', type: 'territorial_origin' }),
        }),
      );
      expect(prisma.groupMembership.upsert).toHaveBeenCalledTimes(1);
    });

    it('upserts one group for currentCountry only', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, null, 'cr');

      expect(prisma.group.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'country-cr' },
          create: expect.objectContaining({ name: 'CR', type: 'territorial_residence' }),
        }),
      );
    });

    it('upserts two groups when both birthDepartment and currentCountry are set', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, 'León', 'ES');

      expect(prisma.group.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.groupMembership.upsert).toHaveBeenCalledTimes(2);
    });

    it('is idempotent — calling twice does not throw', async () => {
      vi.mocked(prisma.profile.findUnique).mockResolvedValue({ id: PROFILE_ID } as never);
      vi.mocked(prisma.group.upsert).mockResolvedValue({ id: GROUP_ID } as never);
      vi.mocked(prisma.groupMembership.upsert).mockResolvedValue({} as never);

      await service.syncMemberships(USER_ID, 'Managua', null);
      await service.syncMemberships(USER_ID, 'Managua', null);

      expect(prisma.group.upsert).toHaveBeenCalledTimes(2);
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
});
