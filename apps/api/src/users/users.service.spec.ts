/**
 * Unit tests de UsersService — listUsers() y updateStatus().
 *
 * Estrategia:
 * - Instanciación directa — sin DI de NestJS.
 * - PrismaService mockeado con vi.fn().
 */

import 'reflect-metadata';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { UsersService } from './users.service';
import { AccountStatus } from '@decide/shared';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';

const mockDbUser = {
  id: USER_ID,
  email: 'ana@example.com',
  status: AccountStatus.pending_verification,
  createdAt: new Date('2026-01-10T08:00:00Z'),
  lastLoginAt: new Date('2026-01-15T10:00:00Z'),
  profile: { displayName: 'Ana García' },
};

const mockDbUserNoProfile = {
  id: 'user-uuid-2',
  email: 'bob@example.com',
  status: AccountStatus.invited,
  createdAt: new Date('2026-01-12T09:00:00Z'),
  lastLoginAt: null,
  profile: null,
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new UsersService(prisma as never);
  });

  // ── listUsers ──────────────────────────────────────────────────────────────

  describe('listUsers()', () => {
    it('returns all users with correct shape when no filter', async () => {
      prisma.user.findMany.mockResolvedValue([mockDbUser, mockDbUserNoProfile]);
      prisma.user.count.mockResolvedValue(2);

      const result = await service.listUsers();

      expect(result.total).toBe(2);
      expect(result.users).toHaveLength(2);
      expect(result.users[0]).toEqual({
        id: USER_ID,
        email: 'ana@example.com',
        status: AccountStatus.pending_verification,
        displayName: 'Ana García',
        createdAt: '2026-01-10T08:00:00.000Z',
        lastLoginAt: '2026-01-15T10:00:00.000Z',
      });
    });

    it('maps null profile to displayName: null', async () => {
      prisma.user.findMany.mockResolvedValue([mockDbUserNoProfile]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers();

      expect(result.users).toHaveLength(1);
      expect(result.users[0]!.displayName).toBeNull();
    });

    it('maps null lastLoginAt to null', async () => {
      prisma.user.findMany.mockResolvedValue([mockDbUserNoProfile]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers();

      expect(result.users).toHaveLength(1);
      expect(result.users[0]!.lastLoginAt).toBeNull();
    });

    it('passes status filter to prisma when provided', async () => {
      prisma.user.findMany.mockResolvedValue([mockDbUser]);
      prisma.user.count.mockResolvedValue(1);

      await service.listUsers(AccountStatus.pending_verification);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: AccountStatus.pending_verification },
        }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { status: AccountStatus.pending_verification },
      });
    });

    it('passes no where clause when no filter', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ where: expect.anything() }),
      );
    });
  });

  // ── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(USER_ID, AccountStatus.verified_citizen),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException on disallowed transition', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockDbUser,
        status: AccountStatus.verified_citizen,
      });

      // verified_citizen → observer is not allowed
      await expect(
        service.updateStatus(USER_ID, AccountStatus.observer),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows pending_verification → verified_citizen', async () => {
      const updatedUser = {
        ...mockDbUser,
        status: AccountStatus.verified_citizen,
      };
      prisma.user.findUnique.mockResolvedValue(mockDbUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateStatus(USER_ID, AccountStatus.verified_citizen);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { status: AccountStatus.verified_citizen },
        }),
      );
      expect(result.status).toBe(AccountStatus.verified_citizen);
    });

    it('allows verified_citizen → suspended', async () => {
      const base = { ...mockDbUser, status: AccountStatus.verified_citizen };
      prisma.user.findUnique.mockResolvedValue(base);
      prisma.user.update.mockResolvedValue({ ...base, status: AccountStatus.suspended });

      const result = await service.updateStatus(USER_ID, AccountStatus.suspended);

      expect(result.status).toBe(AccountStatus.suspended);
    });

    it('allows suspended → verified_citizen', async () => {
      const base = { ...mockDbUser, status: AccountStatus.suspended };
      prisma.user.findUnique.mockResolvedValue(base);
      prisma.user.update.mockResolvedValue({ ...base, status: AccountStatus.verified_citizen });

      const result = await service.updateStatus(USER_ID, AccountStatus.verified_citizen);

      expect(result.status).toBe(AccountStatus.verified_citizen);
    });

    it('returns correct UserSummary shape', async () => {
      const updatedUser = { ...mockDbUser, status: AccountStatus.verified_citizen };
      prisma.user.findUnique.mockResolvedValue(mockDbUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateStatus(USER_ID, AccountStatus.verified_citizen);

      expect(result).toEqual({
        id: USER_ID,
        email: 'ana@example.com',
        status: AccountStatus.verified_citizen,
        displayName: 'Ana García',
        createdAt: '2026-01-10T08:00:00.000Z',
        lastLoginAt: '2026-01-15T10:00:00.000Z',
      });
    });

    it('throws BadRequestException when target state has no transition map entry', async () => {
      // invited → verified_citizen is not in the allowed map for 'invited'
      // (invited can only go to rejected)
      prisma.user.findUnique.mockResolvedValue({
        ...mockDbUser,
        status: AccountStatus.invited,
      });

      await expect(
        service.updateStatus(USER_ID, AccountStatus.verified_citizen),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
