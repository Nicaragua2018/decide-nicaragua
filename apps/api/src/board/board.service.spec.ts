import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BoardService } from './board.service';

function buildPrisma() {
  return {
    boardSeat: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
    profile: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    boardAction: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    boardApproval: { create: vi.fn(), findMany: vi.fn() },
  };
}

const ADMIN = { sub: 'u-admin', email: 'a@x', status: 'verified_citizen', profileId: 'p-admin' } as never;
const SECRE = { sub: 'u-sec', email: 's@x', status: 'verified_citizen', profileId: 'p-sec' } as never;

describe('BoardService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let groups: { syncMemberships: ReturnType<typeof vi.fn> };
  let service: BoardService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    groups = { syncMemberships: vi.fn().mockResolvedValue(undefined) };
    service = new BoardService(prisma as never, audit as never, groups as never);
  });

  describe('assignFounderSeat()', () => {
    it('solo el administrador asigna cargos fundadores', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'secretario' });
      await expect(service.assignFounderSeat(SECRE, 'coordinador_general' as never, 'p-x', 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('no se asignan cargos fundadores después de una elección', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });
      prisma.boardSeat.count.mockResolvedValue(1);
      await expect(service.assignFounderSeat(ADMIN, 'secretario' as never, 'p-x', 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('solo un miembro verificado sin otro cargo puede ocupar un cargo', async () => {
      prisma.boardSeat.findFirst
        .mockResolvedValueOnce({ role: 'administrador' }) // rol del actor
        .mockResolvedValueOnce(null); // otro cargo del destinatario
      prisma.boardSeat.count.mockResolvedValue(0);
      prisma.profile.findUnique.mockResolvedValue({ id: 'p-x', user: { status: 'pending_verification' } });
      await expect(service.assignFounderSeat(ADMIN, 'secretario' as never, 'p-x', 'ip')).rejects.toThrow(BadRequestException);
    });

    it('asigna el cargo y lo audita', async () => {
      prisma.boardSeat.findFirst
        .mockResolvedValueOnce({ role: 'administrador' })
        .mockResolvedValueOnce(null);
      prisma.boardSeat.count.mockResolvedValue(0);
      prisma.profile.findUnique.mockResolvedValue({ id: 'p-x', user: { status: 'verified_citizen' } });
      prisma.boardSeat.upsert.mockResolvedValue({});

      await service.assignFounderSeat(ADMIN, 'secretario' as never, 'p-x', 'ip');

      expect(prisma.boardSeat.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'secretario' } }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'board.seat_assigned' }));
    });
  });

  describe('proposeAction()', () => {
    it('solo un cargo de la mesa propone', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(null);
      await expect(
        service.proposeAction(SECRE, { type: 'suspend_user' as never, targetUserId: 'u-t', reason: 'spam', params: {} }, 'ip'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cambio de origen exige un departamento válido', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'secretario' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u-t' });
      await expect(
        service.proposeAction(SECRE, { type: 'change_origin' as never, targetUserId: 'u-t', reason: 'error', params: { birthDepartment: 'Atlántida' } }, 'ip'),
      ).rejects.toThrow(BadRequestException);
    });

    it('la propuesta cuenta como la primera aprobación', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'secretario' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u-t' });
      prisma.boardAction.create.mockResolvedValue({ id: 'a1' });

      await service.proposeAction(SECRE, { type: 'suspend_user' as never, targetUserId: 'u-t', reason: 'spam', params: {} }, 'ip');

      expect(prisma.boardAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvals: { create: { profileId: 'p-sec', role: 'secretario', approve: true } },
          }),
        }),
      );
    });
  });

  describe('voteAction()', () => {
    const accion = { id: 'a1', type: 'suspend_user', targetUserId: 'u-t', params: {}, status: 'pending' };

    it('una persona no vota dos veces la misma acción', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'secretario' });
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      await expect(service.voteAction(SECRE, 'a1', true, 'ip')).rejects.toThrow(ConflictException);
    });

    it('con 2 aprobaciones de personas distintas se ejecuta la suspensión', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.boardAction.update.mockResolvedValue({});

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-t' }, data: { status: 'suspended' } });
      expect(prisma.boardAction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'executed' }) }),
      );
    });

    it('con 2 rechazos la acción queda rechazada y no se ejecuta', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });
      prisma.boardAction.findUnique.mockResolvedValue({
        ...accion,
        approvals: [{ profileId: 'p-sec', approve: true }, { profileId: 'p-coord', approve: false }],
      });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.boardAction.update.mockResolvedValue({});

      await service.voteAction(ADMIN, 'a1', false, 'ip');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.boardAction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'rejected' }) }),
      );
    });

    it('el cambio de origen aprobado actualiza el perfil y las comunidades', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });
      prisma.boardAction.findUnique.mockResolvedValue({
        ...accion,
        type: 'change_origin',
        params: { birthDepartment: 'Managua' },
        approvals: [{ profileId: 'p-sec', approve: true }],
      });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.profile.update.mockResolvedValue({ currentCountry: 'CR', currentRegion: null });
      prisma.boardAction.update.mockResolvedValue({});

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-t' }, data: { birthDepartment: 'Managua' } }),
      );
      expect(groups.syncMemberships).toHaveBeenCalledWith('u-t', 'Managua', 'CR', null);
    });
  });
});
