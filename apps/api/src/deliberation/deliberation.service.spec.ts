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
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProposalStatus, SignalType } from '@decide/shared';

import { DeliberationService } from './deliberation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GroupAccessService } from '../groups/group-access.service';
import { guardiaMock, publicadoresMock } from '../test/guardia-mock';

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
    forum: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    group: {
      findUnique: vi.fn(),
    },
    moderationAction: {
      findFirst: vi.fn(),
    },
    election: {
      findUnique: vi.fn(),
    },
    decision: {
      findUnique: vi.fn(),
    },
  };
}

/** Deja correr las promesas «fire-and-forget» (auditoría). */
const flush = () => new Promise((r) => setTimeout(r, 0));

function buildAuditMock() {
  return { log: vi.fn() };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DeliberationService', () => {
  let service: DeliberationService;
  let guardia: ReturnType<typeof guardiaMock>;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let audit: ReturnType<typeof buildAuditMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = buildPrismaMock();
    audit = buildAuditMock();
    guardia = guardiaMock();
    audit.log.mockResolvedValue(undefined);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'user-uuid-1' });
    service = new DeliberationService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      new GroupAccessService(prisma as unknown as PrismaService),
      guardia as never,
      publicadoresMock() as never,
    );
  });

  // ─── createProposal ───────────────────────────────────────────────────────

  describe('createProposal', () => {
    const dto = {
      title: 'Propuesta de prueba suficientemente larga',
      body: 'Cuerpo de la propuesta con suficiente texto para pasar la validación.',
    };

    beforeEach(() => {
      prisma.forum.findFirst.mockResolvedValue({ id: 'forum-uuid-1', groupId: GROUP_ID });
    });

    it('guardia: revisa título y cuerpo como tema y encola con su id', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.create.mockResolvedValue({ id: PROPOSAL_ID });
      guardia.antesDePublicar.mockResolvedValue({ revisado: false });
      await service.createProposal(GROUP_ID, dto, PROFILE_ID, IP, { pedirRevision: true });
      expect(guardia.antesDePublicar).toHaveBeenCalledWith({
        tipo: 'tema',
        texto: `${dto.title}\n\n${dto.body}`,
        autorProfileId: PROFILE_ID,
        args: { groupId: GROUP_ID, dto: { title: dto.title, body: dto.body } },
        pedirRevision: true,
      });
      expect(guardia.antesDePublicar.mock.invocationCallOrder[0]).toBeLessThan(prisma.proposal.create.mock.invocationCallOrder[0] ?? 0);
      expect(guardia.despuesDePublicar).toHaveBeenCalledWith('tema', PROPOSAL_ID, false);
    });

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

    it('un tema llegado desde una bifurcación no muestra a quien lo llevó; el detalle tampoco da su id', async () => {
      const p = prisma as unknown as Record<string, unknown>;
      p['inquietud'] = {
        findMany: vi.fn().mockResolvedValue([{ proposalId: 'tema-bif', origenSolucionId: 's-bif' }]),
      };
      p['group'] = { ...prisma.group, findMany: vi.fn().mockResolvedValue([{ origenSolucionId: 's-bif' }]) };
      p['solucion'] = { findMany: vi.fn().mockResolvedValue([]) };
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      const base = { ...mockProposal, signals: [], _count: { comments: 0 } };
      prisma.proposal.findMany.mockResolvedValue([
        { ...base, id: 'tema-bif', abiertoPorComunidad: true, authorProfileId: 'p-secreta', author: { displayName: 'Zoe Secreta' } },
        { ...base, id: 'tema-otro', abiertoPorComunidad: false, author: { displayName: 'Ana' } },
      ]);
      const lista = await service.listGroupProposals(GROUP_ID, PROFILE_ID);
      expect(lista.proposals.map((x) => x.authorDisplayName)).toEqual(['Iniciativa de un grupo', 'Ana']);

      prisma.proposal.findUnique.mockResolvedValue({
        ...base, id: 'tema-bif', abiertoPorComunidad: true, authorProfileId: 'p-secreta',
        author: { displayName: 'Zoe Secreta' }, comments: [], inquietudes: [],
      });
      const d = await service.getProposalById('tema-bif', PROFILE_ID);
      expect(d.authorDisplayName).toBe('Iniciativa de un grupo');
      expect(JSON.stringify(d)).not.toContain('p-secreta');
      expect(JSON.stringify(d)).not.toContain('Zoe');
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

    it('un tema sin autor se muestra con «Asistente» y nadie es su autor', async () => {
      prisma.proposal.findUnique.mockResolvedValue({
        ...fullProposal,
        authorProfileId: null,
        author: null,
        origen: 'asistente',
      });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.getProposalById(PROPOSAL_ID, PROFILE_ID);

      expect(result.authorDisplayName).toBe('Asistente');
      expect(result.isAuthor).toBe(false);
      expect(result.origen).toBe('asistente');
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

  // ─── Auditoría dentro de una bifurcación ──────────────────────────────────

  describe('auditoría dentro de una bifurcación (reservada)', () => {
    const BIF = { type: 'trabajo', parentGroupId: 'g-ambito', trabajoEstado: 'activo', trabajoTipo: 'bifurcacion' };
    const sinRastro = () => {
      expect(audit.log).toHaveBeenCalled();
      for (const [e] of audit.log.mock.calls as [Record<string, unknown>][]) {
        expect(e).not.toHaveProperty('actorId');
        expect(e).not.toHaveProperty('ip');
        expect(JSON.stringify(e)).not.toContain(GROUP_ID);
      }
    };

    beforeEach(() => {
      prisma.group.findUnique.mockResolvedValue(BIF);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
    });

    it('crear un tema no deja actor, ip ni el id del grupo', async () => {
      prisma.forum.findFirst.mockResolvedValue({ id: 'forum-uuid-1', groupId: GROUP_ID });
      prisma.proposal.create.mockResolvedValue({ id: PROPOSAL_ID });
      await service.createProposal(GROUP_ID, { title: 'Un tema dentro de la iniciativa', body: 'Cuerpo del tema.' }, PROFILE_ID, IP);
      await flush();
      sinRastro();
    });

    it('comentar y dar una señal tampoco', async () => {
      prisma.proposalComment.create.mockResolvedValue({ id: COMMENT_ID });
      await service.addComment(PROPOSAL_ID, { body: 'Un comentario dentro.' }, PROFILE_ID, IP);
      prisma.consensusSignal.upsert.mockResolvedValue({});
      await service.setSignal(PROPOSAL_ID, { signal: SignalType.support }, PROFILE_ID, IP);
      await flush();
      sinRastro();
    });

    it('archivar un tema tampoco', async () => {
      prisma.proposal.update.mockResolvedValue({});
      await service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP);
      await flush();
      sinRastro();
    });

    it('fuera de lo reservado se audita con actor e ip, como siempre', async () => {
      prisma.group.findUnique.mockResolvedValue({ type: 'territorial_origin', parentGroupId: null, trabajoEstado: null, trabajoTipo: null });
      prisma.proposalComment.create.mockResolvedValue({ id: COMMENT_ID });
      await service.addComment(PROPOSAL_ID, { body: 'Un comentario fuera.' }, PROFILE_ID, IP);
      await flush();
      expect(audit.log.mock.calls[0]![0]).toMatchObject({ actorId: 'user-uuid-1', ip: IP });
    });
  });

  // ─── updateProposalStatus ─────────────────────────────────────────────────

  describe('updateProposalStatus', () => {
    it('cambiar el estado de un tema sin autor responde 403', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, authorProfileId: null, origen: 'asistente' });
      // La persona es miembro: si se llegara a comparar con el autor nulo como «dueño», pasaría.
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP),
      ).rejects.toThrow('Only the author can change the proposal status');
      expect(prisma.proposal.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.groupMembership.findUnique).not.toHaveBeenCalled();
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('el autor puede archivar su propuesta', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.update.mockResolvedValue({});

      await service.updateProposalStatus(
        PROPOSAL_ID,
        { status: ProposalStatus.archived },
        PROFILE_ID,
        IP,
      );

      expect(prisma.proposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ProposalStatus.archived }),
        }),
      );
    });

    it('un debate abierto por la comunidad no cambia de estado desde aquí', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, abiertoPorComunidad: true });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      const p = service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP);
      await expect(p).rejects.toThrow(BadRequestException);
      await expect(p).rejects.toThrow('Este debate lo abrió la comunidad y no se archiva desde aquí.');
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('un autor sin membresía (suspendido) no cambia el estado', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('una propuesta formal sin votación, o con la votación sin contar, no se archiva', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, kind: 'propuesta', electionId: null });
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP),
      ).rejects.toThrow('Una propuesta formal no se archiva antes de que se cuente su votación.');

      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, kind: 'propuesta', electionId: 'e1' });
      prisma.election.findUnique.mockResolvedValue({ status: 'open' });
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('una propuesta formal sin votación del plan 2 se archiva si su decisión quedó contada o cancelada', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, kind: 'propuesta', electionId: null });
      prisma.proposal.update.mockResolvedValue({});
      for (const fase of ['contada', 'cancelada']) {
        prisma.decision.findUnique.mockResolvedValue({ fase });
        await service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP);
      }
      expect(prisma.decision.findUnique).toHaveBeenCalledWith({ where: { proposalId: PROPOSAL_ID }, select: { fase: true } });
      expect(prisma.proposal.update).toHaveBeenCalledTimes(2);
    });

    it('una propuesta formal con la decisión aún en curso no se archiva', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, kind: 'propuesta', electionId: null });
      prisma.decision.findUnique.mockResolvedValue({ fase: 'votacion' });
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('una propuesta formal con la votación contada sí se archiva', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, kind: 'propuesta', electionId: 'e1' });
      prisma.election.findUnique.mockResolvedValue({ status: 'tallied' });
      prisma.proposal.update.mockResolvedValue({});
      await service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP);
      expect(prisma.proposal.update).toHaveBeenCalled();
    });

    it('no cambia el estado de un tema oculto', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, hidden: true });
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('un tema cerrado con consenso no se reabre ni se archiva', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, status: 'closed' });
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.open }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('PATCH status ya no cierra: el cierre necesita conclusión', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: 'closed' } as never, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('lanza ForbiddenException si quien cierra no es el autor', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);

      await expect(
        service.updateProposalStatus(
          PROPOSAL_ID,
          { status: ProposalStatus.archived },
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
          { status: ProposalStatus.archived },
          PROFILE_ID,
          IP,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addComment ───────────────────────────────────────────────────────────

  describe('addComment', () => {
    const dto = { body: 'Este es un comentario de prueba.' };

    it('guardia: revisa el comentario y lo encola como respuesta', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposalComment.create.mockResolvedValue({ id: COMMENT_ID });
      guardia.antesDePublicar.mockResolvedValue({ revisado: false });
      await service.addComment(PROPOSAL_ID, dto, PROFILE_ID, IP);
      expect(guardia.antesDePublicar).toHaveBeenCalledWith({
        tipo: 'comentario',
        texto: dto.body,
        autorProfileId: PROFILE_ID,
        args: { proposalId: PROPOSAL_ID, body: dto.body },
      });
      expect(guardia.antesDePublicar.mock.invocationCallOrder[0]).toBeLessThan(prisma.proposalComment.create.mock.invocationCallOrder[0] ?? 0);
      expect(guardia.despuesDePublicar).toHaveBeenCalledWith('respuesta', COMMENT_ID, false);
    });

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

    it('lanza BadRequestException al responder a un comentario oculto', async () => {
      prisma.proposal.findUnique.mockResolvedValue(mockProposal);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposalComment.findUnique.mockResolvedValue({
        id: COMMENT_ID,
        proposalId: PROPOSAL_ID,
        parentId: null,
        hidden: true,
      });

      await expect(
        service.addComment(PROPOSAL_ID, { ...dto, parentId: COMMENT_ID }, PROFILE_ID, IP),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proposalComment.create).not.toHaveBeenCalled();
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

  // ─── Grupos de trabajo ────────────────────────────────────────────────────

  describe('grupo de trabajo (GROUP_ID es subgrupo de g-ambito)', () => {
    const NO_PARTICIPA = 'Solo los miembros de este grupo pueden participar.';
    /** PROFILE_ID es miembro solo de los grupos de `de`. */
    function miembroDe(de: string[], trabajoEstado = 'activo'): void {
      prisma.groupMembership.findUnique.mockImplementation(({ where }: { where: { groupId_profileId: { groupId: string } } }) =>
        Promise.resolve(de.includes(where.groupId_profileId.groupId) ? mockMembership : null),
      );
      prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === GROUP_ID
            ? { type: 'trabajo', parentGroupId: 'g-ambito', trabajoEstado }
            : { type: 'territorial_residence', parentGroupId: null, trabajoEstado: null },
        ),
      );
    }
    const detalle = {
      ...mockProposal,
      hidden: false,
      author: { displayName: 'Usuario Test' },
      signals: [{ signal: 'support', profileId: PROFILE_ID }],
      comments: [],
      _count: { comments: 0 },
      inquietudes: [],
    };

    it('un miembro del ámbito lee la lista y el tema, como solo lectura', async () => {
      miembroDe(['g-ambito']);
      prisma.proposal.findMany.mockResolvedValue([]);
      await expect(service.listGroupProposals(GROUP_ID, PROFILE_ID)).resolves.toEqual({ proposals: [] });
      prisma.proposal.findUnique.mockResolvedValue(detalle);
      const r = await service.getProposalById(PROPOSAL_ID, PROFILE_ID);
      expect(r.soloLectura).toBe(true);
      expect(r.isAuthor).toBe(false);
      expect(r.userSignal).toBeNull();
    });

    it('quien lee no recibe datos de apelación de sus comentarios ni de su tema ocultos', async () => {
      miembroDe(['g-ambito']);
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma1', causa: null, reason: 'x', status: 'oculto' });
      prisma.proposal.findUnique.mockResolvedValue({
        ...detalle,
        comments: [
          { id: COMMENT_ID, authorProfileId: PROFILE_ID, author: { displayName: 'Yo' }, body: 'texto', parentId: null, createdAt: new Date(), hidden: true },
        ],
      });
      let r = await service.getProposalById(PROPOSAL_ID, PROFILE_ID);
      expect(r.comments[0]!.moderationId).toBeNull();
      prisma.proposal.findUnique.mockResolvedValue({ ...detalle, hidden: true });
      r = await service.getProposalById(PROPOSAL_ID, PROFILE_ID);
      expect(r.moderationId).toBeNull();
    });

    it('un miembro del subgrupo no es solo lectura', async () => {
      miembroDe([GROUP_ID]);
      prisma.proposal.findUnique.mockResolvedValue(detalle);
      const r = await service.getProposalById(PROPOSAL_ID, PROFILE_ID);
      expect(r.soloLectura).toBe(false);
      expect(r.isAuthor).toBe(true);
      expect(r.userSignal).toBe('support');
    });

    it('un miembro del ámbito no abre temas, no comenta, no señala ni cambia el estado (403)', async () => {
      miembroDe(['g-ambito']);
      await expect(
        service.createProposal(GROUP_ID, { title: 'Propuesta de prueba suficientemente larga', body: 'Cuerpo suficiente' }, PROFILE_ID, IP),
      ).rejects.toThrow(NO_PARTICIPA);
      prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, hidden: false });
      await expect(service.addComment(PROPOSAL_ID, { body: 'Un comentario' }, PROFILE_ID, IP)).rejects.toThrow(NO_PARTICIPA);
      await expect(service.setSignal(PROPOSAL_ID, { signal: SignalType.support }, PROFILE_ID, IP)).rejects.toThrow(NO_PARTICIPA);
      await expect(
        service.updateProposalStatus(PROPOSAL_ID, { status: ProposalStatus.archived }, PROFILE_ID, IP),
      ).rejects.toThrow(NO_PARTICIPA);
      expect(prisma.proposal.create).not.toHaveBeenCalled();
      expect(prisma.proposalComment.create).not.toHaveBeenCalled();
      expect(prisma.consensusSignal.upsert).not.toHaveBeenCalled();
    });

    it('un miembro del subgrupo no escribe si el grupo está convocando o archivado (409)', async () => {
      for (const estado of ['convocando', 'archivado']) {
        miembroDe([GROUP_ID], estado);
        await expect(
          service.createProposal(GROUP_ID, { title: 'Propuesta de prueba suficientemente larga', body: 'Cuerpo suficiente' }, PROFILE_ID, IP),
        ).rejects.toThrow(ConflictException);
        prisma.proposal.findUnique.mockResolvedValue({ ...mockProposal, hidden: false });
        await expect(service.addComment(PROPOSAL_ID, { body: 'Un comentario' }, PROFILE_ID, IP)).rejects.toThrow(
          'Este grupo de trabajo no está activo.',
        );
        await expect(service.setSignal(PROPOSAL_ID, { signal: SignalType.support }, PROFILE_ID, IP)).rejects.toThrow(
          ConflictException,
        );
      }
      expect(prisma.proposal.create).not.toHaveBeenCalled();
      expect(prisma.proposalComment.create).not.toHaveBeenCalled();
      expect(prisma.consensusSignal.upsert).not.toHaveBeenCalled();
    });

    it('un miembro del subgrupo activo sí abre temas', async () => {
      miembroDe([GROUP_ID], 'activo');
      prisma.forum.findFirst.mockResolvedValue({ id: 'forum-uuid-1', groupId: GROUP_ID });
      prisma.proposal.create.mockResolvedValue({ id: PROPOSAL_ID });
      await expect(
        service.createProposal(GROUP_ID, { title: 'Propuesta de prueba suficientemente larga', body: 'Cuerpo suficiente' }, PROFILE_ID, IP),
      ).resolves.toBeDefined();
      expect(prisma.proposal.create).toHaveBeenCalled();
    });

    it('quien no es del ámbito no lee ni por id directo', async () => {
      miembroDe(['g-otra']);
      await expect(service.listGroupProposals(GROUP_ID, PROFILE_ID)).rejects.toThrow('Solo los miembros de esta comunidad pueden ver esto.');
      prisma.proposal.findUnique.mockResolvedValue(detalle);
      await expect(service.getProposalById(PROPOSAL_ID, PROFILE_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── Foros y contenido oculto ─────────────────────────────────────────────

  describe('temas dentro de foros', () => {
    it('rechaza un forumId de otro grupo', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.forum.findUnique.mockResolvedValue({ id: 'f-otro', groupId: 'g-otro' });
      await expect(
        service.createProposal(
          GROUP_ID,
          { title: 'Tema de prueba', body: 'Cuerpo del tema', forumId: 'f-otro' } as never,
          PROFILE_ID,
          IP,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.create).not.toHaveBeenCalled();
    });

    it('sin forumId usa el foro por defecto del grupo', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.forum.findFirst.mockResolvedValue({ id: 'f-def', groupId: GROUP_ID });
      prisma.proposal.create.mockResolvedValue({ id: 't1' });
      await service.createProposal(
        GROUP_ID,
        { title: 'Tema de prueba', body: 'Cuerpo del tema' } as never,
        PROFILE_ID,
        IP,
      );
      expect(prisma.proposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ forumId: 'f-def', kind: 'tema' }) }),
      );
    });

    it('crea el foro por defecto si todavía no existe', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.forum.findFirst.mockResolvedValue(null);
      prisma.group.findUnique.mockResolvedValue({ name: 'Mi comunidad' });
      prisma.forum.create.mockResolvedValue({ id: 'f-nuevo' });
      prisma.proposal.create.mockResolvedValue({ id: 't1' });
      await service.createProposal(
        GROUP_ID,
        { title: 'Tema de prueba', body: 'Cuerpo del tema' } as never,
        PROFILE_ID,
        IP,
      );
      expect(prisma.forum.create).toHaveBeenCalledWith({
        data: { groupId: GROUP_ID, title: 'Foro de Mi comunidad', isDefault: true },
      });
      expect(prisma.proposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ forumId: 'f-nuevo' }) }),
      );
    });

    it('si otra petición creó el foro por defecto a la vez (P2002), lo relee', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.forum.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'f-otro' });
      prisma.group.findUnique.mockResolvedValue({ name: 'Mi comunidad' });
      prisma.forum.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      prisma.proposal.create.mockResolvedValue({ id: 't1' });
      await service.createProposal(GROUP_ID, { title: 'Tema de prueba', body: 'Cuerpo del tema' } as never, PROFILE_ID, IP);
      expect(prisma.proposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ forumId: 'f-otro' }) }),
      );
    });
  });

  describe('contenido oculto', () => {
    const base = {
      id: 't1', groupId: GROUP_ID, title: 'Título', body: 'texto secreto', status: 'open', kind: 'tema',
      hidden: false, forumId: 'f1', deliberationEndsAt: null, electionId: null, conclusion: null,
      objections: null, authorProfileId: OTHER_PROFILE_ID, author: { displayName: 'X' }, signals: [],
      comments: [], _count: { comments: 0 }, createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('hiddenReason usa la etiqueta de la causa, más el detalle si lo hay', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...base, hidden: true });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma1', causa: 'spam', reason: 'Vende celulares', status: 'oculto' });
      const d = await service.getProposalById('t1', PROFILE_ID);
      expect(d.hiddenReason).toBe('Correo basura o publicidad ajena al tema: Vende celulares');
      expect(prisma.moderationAction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.objectContaining({ causa: true, reason: true }) }),
      );
    });

    it('el detalle de un tema oculto no devuelve su texto', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...base, hidden: true });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.moderationAction.findFirst.mockResolvedValue({ reason: 'Insultos' });
      const d = await service.getProposalById('t1', PROFILE_ID);
      expect(d.body).toBe('');
      expect(d.title).toBe('Tema oculto por moderación');
      expect(d.hidden).toBe(true);
      expect(d.hiddenReason).toBe('Insultos');
      expect(prisma.moderationAction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { target: 'tema', targetId: 't1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('un tema oculto no filtra conclusión, objeciones, votación ni respuestas', async () => {
      prisma.proposal.findUnique.mockResolvedValue({
        ...base,
        hidden: true,
        status: 'closed',
        conclusion: 'conclusión secreta',
        objections: 'objeción secreta',
        electionId: 'e1',
        comments: [
          { id: 'c1', body: 'respuesta visible', hidden: false, parentId: null, createdAt: new Date(), authorProfileId: 'p9', author: { displayName: 'Z' } },
        ],
        _count: { comments: 1 },
      });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.moderationAction.findFirst.mockResolvedValue({ reason: 'Insultos' });
      prisma.election.findUnique.mockResolvedValue({ status: 'tallied' });
      const d = await service.getProposalById('t1', PROFILE_ID);
      expect(d.conclusion).toBeNull();
      expect(d.objections).toBeNull();
      expect(d.electionId).toBeNull();
      expect(d.electionStatus).toBeNull();
      expect(d.comments).toEqual([]);
      expect(JSON.stringify(d)).not.toMatch(/secret|respuesta visible|Título/);
    });

    it('el detalle lista las inquietudes de origen no ocultas y un tema oculto no las devuelve', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...base, inquietudes: [{ id: 'i1', title: 'Arreglar el local' }] });
      const d = await service.getProposalById('t1', PROFILE_ID);
      expect(d.inquietudes).toEqual([{ id: 'i1', title: 'Arreglar el local' }]);
      expect(prisma.proposal.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            inquietudes: { where: { hidden: false }, select: { id: true, title: true } },
          }),
        }),
      );
      prisma.proposal.findUnique.mockResolvedValue({
        ...base,
        hidden: true,
        inquietudes: [{ id: 'i1', title: 'Arreglar el local' }],
      });
      prisma.moderationAction.findFirst.mockResolvedValue({ reason: 'x' });
      expect((await service.getProposalById('t1', PROFILE_ID)).inquietudes).toEqual([]);
    });

    it('el detalle informa el estado de la votación vinculada', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...base, kind: 'propuesta', electionId: 'e1' });
      prisma.election.findUnique.mockResolvedValue({ status: 'open' });
      const d = await service.getProposalById('t1', PROFILE_ID);
      expect(d.electionStatus).toBe('open');
      expect(prisma.election.findUnique).toHaveBeenCalledWith({ where: { id: 'e1' }, select: { status: true } });

      prisma.proposal.findUnique.mockResolvedValue(base);
      expect((await service.getProposalById('t1', PROFILE_ID)).electionStatus).toBeNull();
    });

    it('la auditoría de un tema nuevo no guarda su título', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.forum.findFirst.mockResolvedValue({ id: 'f-def', groupId: GROUP_ID });
      prisma.proposal.create.mockResolvedValue({ id: 't1' });
      await service.createProposal(GROUP_ID, { title: 'Título delicado', body: 'Cuerpo del tema' } as never, PROFILE_ID, IP);
      await flush();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'proposal.created', metadata: { groupId: GROUP_ID } }),
      );
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('Título delicado');
    });

    it('un comentario oculto no devuelve su texto', async () => {
      prisma.proposal.findUnique.mockResolvedValue({
        ...base,
        comments: [
          { id: 'c1', body: 'ofensa', hidden: true, parentId: null, createdAt: new Date(), author: { displayName: 'Y' } },
          { id: 'c2', body: 'bien', hidden: false, parentId: null, createdAt: new Date(), author: { displayName: 'Z' } },
        ],
        _count: { comments: 2 },
      });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.moderationAction.findFirst.mockResolvedValue({ reason: 'Ofensa' });
      const d = await service.getProposalById('t1', PROFILE_ID);
      expect(d.comments[0]).toEqual(expect.objectContaining({ body: '', hidden: true, hiddenReason: 'Ofensa' }));
      expect(d.comments[1]).toEqual(expect.objectContaining({ body: 'bien', hidden: false, hiddenReason: null }));
      expect(prisma.moderationAction.findFirst).toHaveBeenCalledTimes(1);
    });

    it('el autor de una respuesta oculta recibe el id de la moderación para apelar; otros no', async () => {
      const topic = {
        ...base,
        comments: [{ id: 'c1', body: 'x', hidden: true, parentId: null, createdAt: new Date(), authorProfileId: PROFILE_ID, author: { displayName: 'Y' } }],
        _count: { comments: 1 },
      };
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma1', reason: 'Ofensa', status: 'oculto' });
      prisma.proposal.findUnique.mockResolvedValue(topic);
      expect((await service.getProposalById('t1', PROFILE_ID)).comments[0]?.moderationId).toBe('ma1');
      prisma.proposal.findUnique.mockResolvedValue(topic);
      expect((await service.getProposalById('t1', 'p3')).comments[0]?.moderationId).toBeNull();
    });

    it('el autor de un tema oculto recibe el id de la moderación; si ya fue apelada, no', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...base, hidden: true, authorProfileId: PROFILE_ID });
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma2', reason: 'Ofensa', status: 'oculto' });
      expect((await service.getProposalById('t1', PROFILE_ID)).moderationId).toBe('ma2');
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma2', reason: 'Ofensa', status: 'apelado' });
      expect((await service.getProposalById('t1', PROFILE_ID)).moderationId).toBeNull();
    });

    it('la ocultación vinculada a una inquietud no da moderationId ni al autor', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findUnique.mockResolvedValue({ ...base, hidden: true, authorProfileId: PROFILE_ID });
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma3', reason: 'Oculto junto con la inquietud de origen.', status: 'oculto' });
      const d = await service.getProposalById('t1', PROFILE_ID);
      expect(d.moderationId).toBeNull();
      expect(d.hiddenReason).toBe('Oculto junto con la inquietud de origen.');
    });

    it('la lista muestra un título neutro para un tema oculto', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.proposal.findMany.mockResolvedValue([{ ...base, hidden: true }]);
      const r = await service.listGroupProposals(GROUP_ID, PROFILE_ID);
      expect(r.proposals[0]?.title).toBe('Tema oculto por moderación');
      expect(r.proposals[0]?.hidden).toBe(true);
    });

    it('no se comenta ni se señala un tema oculto', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: GROUP_ID, status: 'open', hidden: true });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      await expect(service.addComment('t1', { body: 'hola hola' } as never, PROFILE_ID, IP)).rejects.toThrow(BadRequestException);
      await expect(service.setSignal('t1', { signal: 'support' } as never, PROFILE_ID, IP)).rejects.toThrow(BadRequestException);
    });
  });
  describe('createTopicInDefaultForum', () => {
    it('ensureDefaultForum crea el foro con el manejo de P2002 sobre el cliente normal', async () => {
      prisma.forum.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'f-otro' });
      prisma.group.findUnique.mockResolvedValue({ name: 'G' });
      prisma.forum.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      expect(await service.ensureDefaultForum('g1')).toEqual({ id: 'f-otro' });
    });

    it('lanza si el foro por defecto no existe dentro de la transacción', async () => {
      const tx = { forum: { findFirst: vi.fn().mockResolvedValue(null) }, proposal: { create: vi.fn() } };
      await expect(
        service.createTopicInDefaultForum(tx as never, { groupId: 'g1', authorProfileId: 'p', title: 't', body: 'b', abiertoPorComunidad: false }),
      ).rejects.toThrow();
      expect(tx.proposal.create).not.toHaveBeenCalled();
    });

    it('usa el foro por defecto existente dentro de la transacción y crea el tema abierto', async () => {
      const tx = {
        forum: { findFirst: vi.fn().mockResolvedValue({ id: 'f-def' }), create: vi.fn() },
        group: { findUnique: vi.fn() },
        proposal: { create: vi.fn().mockResolvedValue({ id: 'nuevo' }) },
      };
      const r = await service.createTopicInDefaultForum(tx as never, {
        groupId: 'g1',
        authorProfileId: 'p1',
        title: 'T',
        body: 'B',
        abiertoPorComunidad: true,
      });
      expect(r).toEqual({ id: 'nuevo' });
      expect(tx.forum.findFirst).toHaveBeenCalledWith({ where: { groupId: 'g1', isDefault: true } });
      expect(tx.forum.create).not.toHaveBeenCalled();
      expect(prisma.forum.findFirst).not.toHaveBeenCalled();
      expect(tx.group.findUnique).not.toHaveBeenCalled();
      expect(tx.proposal.create).toHaveBeenCalledWith({
        data: {
          groupId: 'g1',
          forumId: 'f-def',
          kind: 'tema',
          authorProfileId: 'p1',
          origen: 'persona',
          title: 'T',
          body: 'B',
          status: 'open',
          abiertoPorComunidad: true,
        },
      });
    });
  });
});
