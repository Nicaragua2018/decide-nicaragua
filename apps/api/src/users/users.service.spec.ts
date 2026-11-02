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
const ACTOR_ID = 'admin-uuid-1';

const mockDbUser = {
  id: USER_ID,
  email: 'ana@example.com',
  status: AccountStatus.pending_verification,
  createdAt: new Date('2026-01-10T08:00:00Z'),
  lastLoginAt: new Date('2026-01-15T10:00:00Z'),
  profile: { id: 'profile-uuid-1', displayName: 'Ana García' },
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
  let audit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = buildPrismaMock();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new UsersService(prisma as never, audit as never);
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
        profileId: 'profile-uuid-1',
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
        service.updateStatus(USER_ID, AccountStatus.rejected, ACTOR_ID, 'ip'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException on disallowed transition', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockDbUser,
        status: AccountStatus.verified_citizen,
      });

      // verified_citizen → observer is not allowed
      await expect(
        service.updateStatus(USER_ID, AccountStatus.observer, ACTOR_ID, 'ip'),
      ).rejects.toThrow(BadRequestException);
    });

    it('no verifica directamente: verificar va por referencias', async () => {
      prisma.user.findUnique.mockResolvedValue(mockDbUser); // pending_verification
      await expect(service.updateStatus(USER_ID, AccountStatus.verified_citizen, ACTOR_ID, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('no suspende directamente: suspender requiere 2 de 3 de la mesa', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockDbUser, status: AccountStatus.verified_citizen });
      await expect(service.updateStatus(USER_ID, AccountStatus.suspended, ACTOR_ID, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns correct UserSummary shape', async () => {
      const base = { ...mockDbUser, status: AccountStatus.pending_verification };
      const updatedUser = { ...base, status: AccountStatus.rejected };
      prisma.user.findUnique.mockResolvedValue(base);
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateStatus(USER_ID, AccountStatus.rejected, ACTOR_ID, 'ip');

      expect(result).toEqual({
        id: USER_ID,
        email: 'ana@example.com',
        status: AccountStatus.rejected,
        displayName: 'Ana García',
        profileId: 'profile-uuid-1',
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
        service.updateStatus(USER_ID, AccountStatus.verified_citizen, ACTOR_ID, 'ip'),
      ).rejects.toThrow(BadRequestException);
    });

    // ── Solo rechazar desde el panel (spec §3: lo demás es decisión de la mesa) ──

    it('no reactiva a un suspendido como observer: requiere decisión de la mesa', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockDbUser, status: AccountStatus.suspended });
      await expect(
        service.updateStatus(USER_ID, AccountStatus.observer, ACTOR_ID, 'ip'),
      ).rejects.toThrow('decisión de la mesa');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('no reactiva a un suspendido como verified_citizen', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockDbUser, status: AccountStatus.suspended });
      await expect(
        service.updateStatus(USER_ID, AccountStatus.verified_citizen, ACTOR_ID, 'ip'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('no convierte a un pendiente en observer ni en external_collaborator', async () => {
      for (const to of [AccountStatus.observer, AccountStatus.external_collaborator]) {
        prisma.user.findUnique.mockResolvedValue({ ...mockDbUser, status: AccountStatus.pending_verification });
        await expect(service.updateStatus(USER_ID, to, ACTOR_ID, 'ip')).rejects.toThrow('decisión de la mesa');
      }
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rechaza cuentas invitadas o pendientes y lo audita sin datos personales', async () => {
      for (const from of [AccountStatus.invited, AccountStatus.pending_verification]) {
        audit.log.mockClear();
        prisma.user.findUnique.mockResolvedValue({ ...mockDbUser, status: from });
        prisma.user.update.mockResolvedValue({ ...mockDbUser, status: AccountStatus.rejected });

        await service.updateStatus(USER_ID, AccountStatus.rejected, ACTOR_ID, '1.2.3.4');

        expect(audit.log).toHaveBeenCalledWith({
          actorId: ACTOR_ID,
          action: 'user.status_changed',
          resource: `user:${USER_ID}`,
          ip: '1.2.3.4',
          metadata: { from, to: AccountStatus.rejected },
        });
      }
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('no audita un cambio rechazado', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockDbUser, status: AccountStatus.suspended });
      await expect(service.updateStatus(USER_ID, AccountStatus.observer, ACTOR_ID, 'ip')).rejects.toThrow();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
