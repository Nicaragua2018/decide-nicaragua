/**
 * Unit tests de VotingService.
 *
 * Estrategia:
 * - Instanciación directa (new VotingService(...)) — sin DI de NestJS.
 * - PrismaService y AuditService mockeados con vi.fn().
 * - El algoritmo Schulze se ejecuta realmente (no mockeado) — está cubierto
 *   por schulze.spec.ts. Aquí se prueba la integración con Prisma.
 */

import 'reflect-metadata';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ElectionStatus } from '@decide/shared';

import { VotingService } from './voting.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GROUP_ID = 'group-uuid-1';
const PROFILE_ID = 'profile-uuid-creator';
const OTHER_PROFILE_ID = 'profile-uuid-other';
const ELECTION_ID = 'election-uuid-1';
const IP = '127.0.0.1';

const CANDIDATE_A = { id: 'cand-a', title: 'Opción A', description: null, position: 1 };
const CANDIDATE_B = { id: 'cand-b', title: 'Opción B', description: null, position: 2 };

const pastDate = new Date(Date.now() - 3_600_000); // hace 1h
const futureDate = new Date(Date.now() + 3_600_000); // en 1h
const farFutureDate = new Date(Date.now() + 7_200_000); // en 2h

const mockElectionOpen = {
  id: ELECTION_ID,
  groupId: GROUP_ID,
  createdByProfileId: PROFILE_ID,
  title: 'Elección de prueba con título suficientemente largo',
  description: null,
  status: 'open',
  startsAt: pastDate,
  endsAt: pastDate,
  createdAt: pastDate,
  updatedAt: pastDate,
  candidates: [CANDIDATE_A, CANDIDATE_B],
  _count: { candidates: 2, ballots: 0 },
  result: null,
};

const mockMembership = { groupId: GROUP_ID, profileId: PROFILE_ID };

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    election: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    electionCandidate: {
      findMany: vi.fn(),
    },
    ballot: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    electionResult: {
      create: vi.fn(),
    },
    groupMembership: {
      findUnique: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function buildAuditMock() {
  return { log: vi.fn() };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VotingService', () => {
  let service: VotingService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let audit: ReturnType<typeof buildAuditMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = buildPrismaMock();
    audit = buildAuditMock();
    audit.log.mockResolvedValue(undefined);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'user-uuid-1' });
    service = new VotingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  // ─── createElection ───────────────────────────────────────────────────────

  describe('createElection', () => {
    const dto = {
      title: 'Elección de prueba con título suficientemente largo',
      startsAt: pastDate.toISOString(),
      endsAt: farFutureDate.toISOString(),
      candidates: [{ title: 'Opción A' }, { title: 'Opción B' }],
    };

    it('crea una elección cuando el usuario es miembro', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.election.create.mockResolvedValue({ id: ELECTION_ID });

      const result = await service.createElection(GROUP_ID, dto, PROFILE_ID, IP);

      expect(result).toEqual({ id: ELECTION_ID });
      expect(prisma.election.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            groupId: GROUP_ID,
            createdByProfileId: PROFILE_ID,
          }),
        }),
      );
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.createElection(GROUP_ID, dto, PROFILE_ID, IP)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza BadRequestException si endsAt <= startsAt', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      await expect(
        service.createElection(
          GROUP_ID,
          { ...dto, startsAt: farFutureDate.toISOString(), endsAt: futureDate.toISOString() },
          PROFILE_ID,
          IP,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getElectionById ──────────────────────────────────────────────────────

  describe('getElectionById', () => {
    it('devuelve detalle de la elección con userHasVoted=false', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.ballot.findUnique.mockResolvedValue(null);

      const result = await service.getElectionById(ELECTION_ID, PROFILE_ID);

      expect(result.id).toBe(ELECTION_ID);
      expect(result.userHasVoted).toBe(false);
      expect(result.candidates).toHaveLength(2);
    });

    it('devuelve userHasVoted=true cuando ya votó', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.ballot.findUnique.mockResolvedValue({ id: 'ballot-1' });

      const result = await service.getElectionById(ELECTION_ID, PROFILE_ID);

      expect(result.userHasVoted).toBe(true);
    });

    it('lanza NotFoundException si la elección no existe', async () => {
      prisma.election.findUnique.mockResolvedValue(null);

      await expect(service.getElectionById(ELECTION_ID, PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateElectionStatus ─────────────────────────────────────────────────

  describe('updateElectionStatus', () => {
    it('el creador puede abrir una elección en draft', async () => {
      prisma.election.findUnique.mockResolvedValue({ ...mockElectionOpen, status: 'draft' });
      prisma.election.update.mockResolvedValue({});

      await service.updateElectionStatus(
        ELECTION_ID,
        { status: ElectionStatus.open },
        PROFILE_ID,
        IP,
      );

      expect(prisma.election.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ElectionStatus.open },
        }),
      );
    });

    it('lanza ForbiddenException si quien cambia el estado no es el creador', async () => {
      prisma.election.findUnique.mockResolvedValue({ ...mockElectionOpen, status: 'draft' });

      await expect(
        service.updateElectionStatus(
          ELECTION_ID,
          { status: ElectionStatus.open },
          OTHER_PROFILE_ID,
          IP,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException al intentar abrir una elección ya abierta', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen); // status: open

      await expect(
        service.updateElectionStatus(
          ELECTION_ID,
          { status: ElectionStatus.open },
          PROFILE_ID,
          IP,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('el creador puede cancelar una elección abierta', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.election.update.mockResolvedValue({});

      await service.updateElectionStatus(
        ELECTION_ID,
        { status: ElectionStatus.cancelled },
        PROFILE_ID,
        IP,
      );

      expect(prisma.election.update).toHaveBeenCalled();
    });
  });

  // ─── castBallot ───────────────────────────────────────────────────────────

  describe('castBallot', () => {
    const dto = {
      rankings: [
        { candidateId: 'cand-a', rank: 1 },
        { candidateId: 'cand-b', rank: 2 },
      ],
    };

    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const txMock = {
          ballot: {
            deleteMany: vi.fn().mockResolvedValue({}),
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(txMock);
      });
    });

    it('emite la papeleta correctamente en una elección abierta', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      await service.castBallot(ELECTION_ID, dto, PROFILE_ID, IP);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('lanza BadRequestException si la elección no está abierta', async () => {
      prisma.election.findUnique.mockResolvedValue({ ...mockElectionOpen, status: 'tallied' });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      await expect(service.castBallot(ELECTION_ID, dto, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.castBallot(ELECTION_ID, dto, PROFILE_ID, IP)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza BadRequestException si un candidateId no pertenece a la elección', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const badDto = {
        rankings: [{ candidateId: 'cand-a', rank: 1 }, { candidateId: 'cand-invalid', rank: 2 }],
      };

      await expect(service.castBallot(ELECTION_ID, badDto, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si hay candidatos duplicados en la papeleta', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const badDto = {
        rankings: [{ candidateId: 'cand-a', rank: 1 }, { candidateId: 'cand-a', rank: 2 }],
      };

      await expect(service.castBallot(ELECTION_ID, badDto, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── tallyElection ────────────────────────────────────────────────────────

  describe('tallyElection', () => {
    const electionReadyToTally = {
      ...mockElectionOpen,
      endsAt: pastDate, // ya terminó
    };

    beforeEach(() => {
      prisma.$transaction.mockResolvedValue([{}, {}]);
    });

    it('ejecuta el conteo y guarda el resultado', async () => {
      prisma.election.findUnique.mockResolvedValue(electionReadyToTally);
      prisma.ballot.findMany.mockResolvedValue([
        {
          id: 'b1',
          rankings: [
            { candidateId: 'cand-a', rank: 1 },
            { candidateId: 'cand-b', rank: 2 },
          ],
        },
        {
          id: 'b2',
          rankings: [
            { candidateId: 'cand-a', rank: 1 },
            { candidateId: 'cand-b', rank: 2 },
          ],
        },
      ]);

      await service.tallyElection(ELECTION_ID, PROFILE_ID, IP);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('lanza ForbiddenException si quien talla no es el creador', async () => {
      prisma.election.findUnique.mockResolvedValue(electionReadyToTally);

      await expect(service.tallyElection(ELECTION_ID, OTHER_PROFILE_ID, IP)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza BadRequestException si la elección no ha terminado (endsAt en futuro)', async () => {
      prisma.election.findUnique.mockResolvedValue({
        ...mockElectionOpen,
        endsAt: farFutureDate,
      });

      await expect(service.tallyElection(ELECTION_ID, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si la elección no está abierta', async () => {
      prisma.election.findUnique.mockResolvedValue({
        ...electionReadyToTally,
        status: 'tallied',
      });

      await expect(service.tallyElection(ELECTION_ID, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── getElectionResults ───────────────────────────────────────────────────

  describe('getElectionResults', () => {
    const talliedElection = {
      ...mockElectionOpen,
      status: 'tallied',
      result: {
        winners: ['cand-a'],
        candidateOrder: ['cand-a', 'cand-b'],
        pairwiseMatrix: [[0, 2], [0, 0]],
        schulzeMatrix: [[0, 2], [0, 0]],
        totalBallots: 2,
        computedAt: pastDate,
      },
    };

    it('devuelve el resultado completo con matrices', async () => {
      prisma.election.findUnique.mockResolvedValue(talliedElection);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.getElectionResults(ELECTION_ID, PROFILE_ID);

      expect(result.electionId).toBe(ELECTION_ID);
      expect(result.winners).toHaveLength(1);
      expect(result.winners[0]!.id).toBe('cand-a');
      expect(result.totalBallots).toBe(2);
      expect(result.pairwiseMatrix).toBeDefined();
      expect(result.schulzeMatrix).toBeDefined();
    });

    it('lanza BadRequestException si la elección no está tallied', async () => {
      prisma.election.findUnique.mockResolvedValue(mockElectionOpen);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      await expect(service.getElectionResults(ELECTION_ID, PROFILE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.election.findUnique.mockResolvedValue(talliedElection);
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.getElectionResults(ELECTION_ID, PROFILE_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
