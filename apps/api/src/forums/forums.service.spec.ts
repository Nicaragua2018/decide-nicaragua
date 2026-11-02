import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ForumsService } from './forums.service';

function buildPrisma() {
  return {
    groupMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    group: { findUnique: vi.fn() },
    forum: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    proposal: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    proposalComment: { findUnique: vi.fn(), update: vi.fn() },
    election: { create: vi.fn() },
    moderationAction: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
}

const YO = 'p-yo';

describe('ForumsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let board: { roleOf: ReturnType<typeof vi.fn> };
  let service: ForumsService;

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    board = { roleOf: vi.fn().mockResolvedValue(null) };
    service = new ForumsService(prisma as never, audit as never, board as never);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u-yo' });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
  });

  describe('canModerate()', () => {
    it('la mesa y el administrador moderan; un miembro común no', async () => {
      board.roleOf.mockResolvedValueOnce('administrador');
      expect(await service.canModerate(YO, 'g1')).toBe(true);
      board.roleOf.mockResolvedValueOnce('secretario');
      expect(await service.canModerate(YO, 'g1')).toBe(true);
      board.roleOf.mockResolvedValueOnce(null);
      expect(await service.canModerate(YO, 'g1')).toBe(false);
    });
  });

  describe('createForum()', () => {
    it('solo quien puede moderar crea foros', async () => {
      await expect(service.createForum(YO, { groupId: 'g1', title: 'Salud y migración' }, 'ip')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('formalize()', () => {
    it('solo el autor o quien modera convierte en propuesta', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: 'p-otro', status: 'open', kind: 'tema', hidden: false });
      await expect(service.formalize(YO, 't1', 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('el autor la convierte y queda con plazo de deliberación de 7 días', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false });
      prisma.proposal.update.mockResolvedValue({});
      const antes = Date.now();
      await service.formalize(YO, 't1', 'ip');
      const data = prisma.proposal.update.mock.calls[0]![0].data;
      expect(data.kind).toBe('propuesta');
      const plazo = (data.deliberationEndsAt as Date).getTime() - antes;
      expect(plazo).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
      expect(plazo).toBeLessThanOrEqual(7 * 86_400_000 + 1000);
    });

    it('un autor sin membresía (suspendido) no puede formalizar', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false });
      await expect(service.formalize(YO, 't1', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('no se formaliza dos veces', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'propuesta', hidden: false });
      await expect(service.formalize(YO, 't1', 'ip')).rejects.toThrow(ConflictException);
    });
  });

  describe('openVote()', () => {
    const propuesta = (over = {}) => ({
      id: 't1', groupId: 'g1', title: 'Fondo común', authorProfileId: YO, status: 'open', kind: 'propuesta',
      hidden: false, electionId: null, deliberationEndsAt: new Date(Date.now() - 1000), ...over,
    });

    it('no se abre antes de que termine la deliberación', async () => {
      prisma.proposal.findUnique.mockResolvedValue(propuesta({ deliberationEndsAt: new Date(Date.now() + 86_400_000) }));
      await expect(service.openVote(YO, 't1', 'ip')).rejects.toThrow(BadRequestException);
    });

    it('no se abre dos veces', async () => {
      prisma.proposal.findUnique.mockResolvedValue(propuesta({ electionId: 'e1' }));
      await expect(service.openVote(YO, 't1', 'ip')).rejects.toThrow(ConflictException);
    });

    it('un tema que no es propuesta formal no se vota', async () => {
      prisma.proposal.findUnique.mockResolvedValue(propuesta({ kind: 'tema' }));
      await expect(service.openVote(YO, 't1', 'ip')).rejects.toThrow(BadRequestException);
    });

    it('un tema cerrado no se vota', async () => {
      prisma.proposal.findUnique.mockResolvedValue(propuesta({ status: 'closed' }));
      await expect(service.openVote(YO, 't1', 'ip')).rejects.toThrow(BadRequestException);
    });

    it('crea la elección con A favor, En contra, Abstención y la vincula', async () => {
      prisma.proposal.findUnique.mockResolvedValue(propuesta());
      prisma.election.create.mockResolvedValue({ id: 'e1' });
      prisma.proposal.update.mockResolvedValue({});
      const r = await service.openVote(YO, 't1', 'ip');
      expect(r).toEqual({ electionId: 'e1' });
      const data = prisma.election.create.mock.calls[0]![0].data;
      expect(data.groupId).toBe('g1');
      expect(data.createdByProfileId).toBe(YO);
      expect(data.status).toBe('open');
      expect(data.candidates.create.map((c: { title: string }) => c.title)).toEqual(['A favor', 'En contra', 'Abstención']);
      expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { electionId: 'e1' } });
    });
  });

  describe('closeWithConsensus()', () => {
    it('exige ser autor o moderar', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: 'p-otro', status: 'open', hidden: false });
      await expect(service.closeWithConsensus(YO, 't1', { conclusion: 'Acordamos crear una mesa de salud.' }, 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('cierra con conclusión y objeciones', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', hidden: false });
      prisma.proposal.update.mockResolvedValue({});
      await service.closeWithConsensus(YO, 't1', { conclusion: 'Acordamos crear una mesa de salud.', objections: 'Dos personas prefieren esperar.' }, 'ip');
      expect(prisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({
          status: 'closed',
          conclusion: 'Acordamos crear una mesa de salud.',
          objections: 'Dos personas prefieren esperar.',
        }),
      });
    });

    it('un tema oculto no se cierra con consenso', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', hidden: true });
      await expect(service.closeWithConsensus(YO, 't1', { conclusion: 'Conclusión larga suficiente.' }, 'ip')).rejects.toThrow(BadRequestException);
    });
  });

  describe('moderación', () => {
    it('solo quien modera oculta', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1' });
      await expect(service.hide(YO, { target: 'tema', targetId: 't1', reason: 'Lenguaje ofensivo' }, 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('ocultar marca el contenido y registra el motivo', async () => {
      board.roleOf.mockResolvedValue('administrador');
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', proposal: { groupId: 'g1' } });
      prisma.proposalComment.update.mockResolvedValue({});
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      await service.hide(YO, { target: 'respuesta', targetId: 'c1', reason: 'Lenguaje ofensivo' }, 'ip');
      expect(prisma.proposalComment.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { hidden: true } });
      expect(prisma.moderationAction.create).toHaveBeenCalledWith({
        data: { target: 'respuesta', targetId: 'c1', reason: 'Lenguaje ofensivo', moderatorProfileId: YO },
      });
    });

    it('solo el autor apela, una vez', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', status: 'oculto' });
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', authorProfileId: 'p-otro', proposal: { groupId: 'g1' } });
      await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);

      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', status: 'apelado' });
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', authorProfileId: YO, proposal: { groupId: 'g1' } });
      await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ConflictException);
    });

    it('el autor que ya no es miembro no puede apelar', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', status: 'oculto' });
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', authorProfileId: YO, proposal: { groupId: 'g1' } });
      await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.moderationAction.update).not.toHaveBeenCalled();
    });

    it('restaurar devuelve el contenido a la vista', async () => {
      board.roleOf.mockResolvedValue('secretario');
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'tema', targetId: 't1', status: 'apelado' });
      prisma.proposal.update.mockResolvedValue({});
      prisma.moderationAction.update.mockResolvedValue({});
      await service.resolveAppeal(YO, 'ma1', true, 'ip');
      expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: false } });
      expect(prisma.moderationAction.update).toHaveBeenCalledWith({
        where: { id: 'ma1' },
        data: expect.objectContaining({ status: 'restaurado' }),
      });
    });

    it('resolver apelaciones es solo de la mesa', async () => {
      board.roleOf.mockResolvedValue(null);
      await expect(service.resolveAppeal(YO, 'ma1', true, 'ip')).rejects.toThrow(ForbiddenException);
    });
  });
});
