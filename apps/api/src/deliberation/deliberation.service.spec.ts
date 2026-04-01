/**
 * Unit tests de DeliberationService.
 *
 * Estrategia:
 * - Instanciación directa (new DeliberationService(...)) — sin DI de NestJS.
 * - PrismaService y AuditService mockeados con vi.fn().
 * - vi.resetAllMocks() en beforeEach; cada test configura solo lo que necesita.
 */

import 'reflect-metadata';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ProposalStatus, SignalType } from '@decide/shared';

import { DeliberationService } from './deliberation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GROUP_ID = 'group-uuid-1';
const PROFILE_ID = 'profile-uuid-1';
const OTHER_PROFILE_ID = 'profile-uuid-2';
const PROPOSAL_ID = 'proposal-uuid-1';
const COMMENT_ID = 'comment-uuid-1';
const IP = '127.0.0.1';

const mockProposal = {
  id: PROPOSAL_ID,
  groupId: GROUP_ID,
  authorProfileId: PROFILE_ID,
  title: 'Propuesta de prueba suficientemente larga',
  body: 'Cuerpo de la propuesta con suficiente texto para pasar la validación.',
  status: 'open',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  closedAt: null,
};

const mockMembership = {
  groupId: GROUP_ID,
  profileId: PROFILE_ID,
  joinedAt: new Date(),
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    proposal: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    proposalComment: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    consensusSignal: {
      upsert: vi.fn(),
    },
    groupMembership: {
      findUnique: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
  };
}

function buildAuditMock() {
  return { log: vi.fn() };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DeliberationService', () => {
  let service: DeliberationService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let audit: ReturnType<typeof buildAuditMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = buildPrismaMock();
    audit = buildAuditMock();
    audit.log.mockResolvedValue(undefined);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'user-uuid-1' });
    service = new DeliberationService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  // ─── createProposal ───────────────────────────────────────────────────────

  describe('createProposal', () => {
    const dto = {
      title: 'Propuesta de prueba suficientemente larga',
      body: 'Cuerpo de la propuesta con suficiente texto para pasar la validación.',
    };

    it('crea una propuesta cuando el usuario es miembro del grupo', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.create.mockResolvedValue({ id: PROPOSAL_ID });

      const result = await service.createProposal(GROUP_ID, dto, PROFILE_ID, IP);

      expect(result).toEqual({ id: PROPOSAL_ID });
      expect(prisma.proposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            groupId: GROUP_ID,
            authorProfileId: PROFILE_ID,
            title: dto.title,
          }),
        }),
      );
    });

    it('lanza ForbiddenException si el usuario no es miembro del grupo', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.createProposal(GROUP_ID, dto, PROFILE_ID, IP)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.proposal.create).not.toHaveBeenCalled();
    });

    it('usa status open por defecto cuando no se especifica', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.create.mockResolvedValue({ id: PROPOSAL_ID });

      await service.createProposal(GROUP_ID, { ...dto }, PROFILE_ID, IP);

      expect(prisma.proposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ProposalStatus.open }),
        }),
      );
    });

    it('respeta status draft cuando se especifica explícitamente', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.create.mockResolvedValue({ id: PROPOSAL_ID });

      await service.createProposal(
        GROUP_ID,
        { ...dto, status: ProposalStatus.draft },
        PROFILE_ID,
        IP,
      );

      expect(prisma.proposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ProposalStatus.draft }),
        }),
      );
    });
  });

  // ─── listGroupProposals ───────────────────────────────────────────────────

  describe('listGroupProposals', () => {
    it('devuelve propuestas del grupo con conteos de señales', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findMany.mockResolvedValue([
        {
          ...mockProposal,
          author: { displayName: 'Usuario Test' },
          signals: [{ signal: 'support' }, { signal: 'support' }, { signal: 'object' }],
          _count: { comments: 5 },
        },
      ]);

      const result = await service.listGroupProposals(GROUP_ID, PROFILE_ID);

      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0]?.signalCounts).toEqual({ support: 2, neutral: 0, object: 1 });
      expect(result.proposals[0]?.commentCount).toBe(5);
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.listGroupProposals(GROUP_ID, PROFILE_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── getProposalById ──────────────────────────────────────────────────────

  describe('getProposalById', () => {
    const fullProposal = {
      ...mockProposal,
      author: { displayName: 'Usuario Test' },
      signals: [{ signal: 'support', profileId: PROFILE_ID }],
      comments: [],
      _count: { comments: 0 },
    };

    it('devuelve detalle completo de la propuesta con userSignal del usuario', async () => {
      prisma.proposal.findUnique.mockResolvedValue(fullProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.getProposalById(PROPOSAL_ID, PROFILE_ID);

      expect(result.id).toBe(PROPOSAL_ID);
      expect(result.userSignal).toBe('support');
      expect(result.signalCounts).toEqual({ support: 1, neutral: 0, object: 0 });
    });

    it('devuelve userSignal null cuando el usuario no ha señalado', async () => {
      prisma.proposal.findUnique.mockResolvedValue({
        ...fullProposal,
        signals: [{ signal: 'support', profileId: OTHER_PROFILE_ID }],
      });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.getProposalById(PROPOSAL_ID, PROFILE_ID);

      expect(result.userSignal).toBeNull();
    });

    it('lanza NotFoundException si la propuesta no existe', async () => {
      prisma.proposal.findUnique.mockResolvedValue(null);

      await expect(service.getProposalById(PROPOSAL_ID, PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si el usuario no es miembro del grupo', async () => {
      prisma.proposal.findUnique.mockResolvedValue(fullProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.getProposalById(PROPOSAL_ID, PROFILE_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── updateProposalStatus ─────────────────────────────────────────────────

  describe('updateProposalStatus', () => {
    it('el autor puede cerrar su propuesta', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.proposal.update.mockResolvedValue({});

      await service.updateProposalStatus(
        PROPOSAL_ID,
        { status: ProposalStatus.closed },
        PROFILE_ID,
        IP,
      );

      expect(prisma.proposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ProposalStatus.closed }),
        }),
      );
    });

    it('lanza ForbiddenException si quien cierra no es el autor', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);

      await expect(
        service.updateProposalStatus(
          PROPOSAL_ID,
          { status: ProposalStatus.closed },
          OTHER_PROFILE_ID,
          IP,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si la propuesta no existe', async () => {
      prisma.proposal.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProposalStatus(
          PROPOSAL_ID,
          { status: ProposalStatus.closed },
          PROFILE_ID,
          IP,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addComment ───────────────────────────────────────────────────────────

  describe('addComment', () => {
    const dto = { body: 'Este es un comentario de prueba.' };

    it('agrega un comentario a una propuesta abierta', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposalComment.create.mockResolvedValue({ id: COMMENT_ID });

      const result = await service.addComment(PROPOSAL_ID, dto, PROFILE_ID, IP);

      expect(result).toEqual({ id: COMMENT_ID });
    });

    it('lanza BadRequestException en propuesta cerrada', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, status: 'closed' });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      await expect(service.addComment(PROPOSAL_ID, dto, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el parentId pertenece a otro proposal', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposalComment.findUnique.mockResolvedValue({
        id: COMMENT_ID,
        proposalId: 'other-proposal-id',
        parentId: null,
      });

      await expect(
        service.addComment(PROPOSAL_ID, { ...dto, parentId: COMMENT_ID }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException al intentar responder a una respuesta (threading > 1 nivel)', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposalComment.findUnique.mockResolvedValue({
        id: COMMENT_ID,
        proposalId: PROPOSAL_ID,
        parentId: 'some-other-comment-id', // ya es una respuesta
      });

      await expect(
        service.addComment(PROPOSAL_ID, { ...dto, parentId: COMMENT_ID }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── setSignal ────────────────────────────────────────────────────────────

  describe('setSignal', () => {
    it('crea o actualiza la señal del usuario', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.consensusSignal.upsert.mockResolvedValue({});

      await service.setSignal(PROPOSAL_ID, { signal: SignalType.support }, PROFILE_ID, IP);

      expect(prisma.consensusSignal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { proposalId_profileId: { proposalId: PROPOSAL_ID, profileId: PROFILE_ID } },
          create: expect.objectContaining({ signal: SignalType.support }),
          update: expect.objectContaining({ signal: SignalType.support }),
        }),
      );
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.setSignal(PROPOSAL_ID, { signal: SignalType.support }, PROFILE_ID, IP),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException en propuesta cerrada', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, status: 'closed' });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      await expect(
        service.setSignal(PROPOSAL_ID, { signal: SignalType.neutral }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si la propuesta no existe', async () => {
      prisma.proposal.findUnique.mockResolvedValue(null);

      await expect(
        service.setSignal(PROPOSAL_ID, { signal: SignalType.object }, PROFILE_ID, IP),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
