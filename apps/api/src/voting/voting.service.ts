import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ElectionStatus } from '@decide/shared';
import type {
  ElectionSummary,
  ElectionDetail,
  ElectionListResponse,
  ElectionResultResponse,
  CandidateSummary,
} from '@decide/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { runSchulze } from './schulze';
import { CreateElectionDto } from './dto/create-election.dto';
import { CastBallotDto } from './dto/cast-ballot.dto';
import { UpdateElectionStatusDto } from './dto/update-election-status.dto';

@Injectable()
export class VotingService {
  private readonly logger = new Logger(VotingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Elections ────────────────────────────────────────────────────────────

  async createElection(
    groupId: string,
    dto: CreateElectionDto,
    profileId: string,
    ip: string,
  ): Promise<{ id: string }> {
    await this.requireMembership(groupId, profileId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    const election = await this.prisma.election.create({
      data: {
        groupId,
        createdByProfileId: profileId,
        title: dto.title,
        ...(dto.description ? { description: dto.description } : {}),
        startsAt,
        endsAt,
        candidates: {
          create: dto.candidates.map((c, i) => ({
            title: c.title,
            ...(c.description ? { description: c.description } : {}),
            position: i + 1,
          })),
        },
      },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({
          ...base,
          action: 'election.created',
          resource: `election:${election.id}`,
          ip,
          metadata: { groupId, title: dto.title },
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );

    return { id: election.id };
  }

  async listGroupElections(groupId: string, profileId: string): Promise<ElectionListResponse> {
    await this.requireMembership(groupId, profileId);

    const elections = await this.prisma.election.findMany({
      where: { groupId },
      include: {
        _count: { select: { candidates: true, ballots: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      elections: elections.map((e) => this.toSummary(e)),
    };
  }

  async getElectionById(electionId: string, profileId: string): Promise<ElectionDetail> {
    const election = await this.prisma.election.findUnique({
      where: { id: electionId },
      include: {
        candidates: { orderBy: { position: 'asc' } },
        _count: { select: { ballots: true } },
      },
    });

    if (!election) throw new NotFoundException('Election not found');

    // Membresía y voto previo en paralelo — ambos dependen solo de IDs conocidos
    const [, userBallot] = await Promise.all([
      this.requireMembership(election.groupId, profileId),
      this.prisma.ballot.findUnique({
        where: { electionId_profileId: { electionId, profileId } },
      }),
    ]);

    return {
      ...this.toSummary({ ...election, _count: { candidates: election.candidates.length, ballots: election._count.ballots } }),
      description: election.description,
      candidates: election.candidates.map(toCandidateSummary),
      userHasVoted: userBallot !== null,
    };
  }

  async updateElectionStatus(
    electionId: string,
    dto: UpdateElectionStatusDto,
    profileId: string,
    ip: string,
  ): Promise<void> {
    const election = await this.prisma.election.findUnique({ where: { id: electionId } });

    if (!election) throw new NotFoundException('Election not found');

    if (election.createdByProfileId !== profileId) {
      throw new ForbiddenException('Only the creator can change the election status');
    }

    const currentStatus = election.status as string;

    // Transiciones válidas
    if (dto.status === ElectionStatus.open && currentStatus !== ElectionStatus.draft) {
      throw new BadRequestException('Only draft elections can be opened');
    }
    if (
      dto.status === ElectionStatus.cancelled &&
      currentStatus !== ElectionStatus.draft &&
      currentStatus !== ElectionStatus.open
    ) {
      throw new BadRequestException('Only draft or open elections can be cancelled');
    }

    await this.prisma.election.update({
      where: { id: electionId },
      data: { status: dto.status as string as never },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({
          ...base,
          action: 'election.status_changed',
          resource: `election:${electionId}`,
          ip,
          metadata: { newStatus: dto.status },
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );
  }

  // ─── Voting ───────────────────────────────────────────────────────────────

  async castBallot(
    electionId: string,
    dto: CastBallotDto,
    profileId: string,
    ip: string,
  ): Promise<void> {
    const election = await this.prisma.election.findUnique({
      where: { id: electionId },
      include: { candidates: { select: { id: true } } },
    });

    if (!election) throw new NotFoundException('Election not found');
    if ((election.status as string) !== ElectionStatus.open) {
      throw new BadRequestException('Ballots can only be cast in open elections');
    }

    await this.requireMembership(election.groupId, profileId);

    // Validar que todos los candidateIds pertenecen a esta elección
    const validCandidateIds = new Set(election.candidates.map((c) => c.id));
    const providedIds = dto.rankings.map((r) => r.candidateId);
    const invalidIds = providedIds.filter((id) => !validCandidateIds.has(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Candidate IDs not found in this election: ${invalidIds.join(', ')}`,
      );
    }

    // Validar que no hay candidatos duplicados
    if (new Set(providedIds).size !== providedIds.length) {
      throw new BadRequestException('Ballot contains duplicate candidate IDs');
    }

    // Reemplazar la papeleta atómicamente (permite cambiar el voto mientras esté abierta)
    await this.prisma.$transaction(async (tx) => {
      await tx.ballot.deleteMany({ where: { electionId, profileId } });
      await tx.ballot.create({
        data: {
          electionId,
          profileId,
          rankings: {
            create: dto.rankings.map((r) => ({ candidateId: r.candidateId, rank: r.rank })),
          },
        },
      });
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({
          ...base,
          action: 'election.ballot_cast',
          resource: `election:${electionId}`,
          ip,
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );
  }

  // ─── Tally ────────────────────────────────────────────────────────────────

  async tallyElection(electionId: string, profileId: string, ip: string): Promise<void> {
    const election = await this.prisma.election.findUnique({
      where: { id: electionId },
      include: { candidates: { orderBy: { position: 'asc' } } },
    });

    if (!election) throw new NotFoundException('Election not found');
    if (election.createdByProfileId !== profileId) {
      throw new ForbiddenException('Only the creator can tally the election');
    }
    if ((election.status as string) !== ElectionStatus.open) {
      throw new BadRequestException('Only open elections can be tallied');
    }
    if (election.endsAt > new Date()) {
      throw new BadRequestException('Election has not ended yet');
    }

    const ballots = await this.prisma.ballot.findMany({
      where: { electionId },
      include: { rankings: true },
    });

    const candidateIds = election.candidates.map((c) => c.id);
    const ballotData = ballots.map((b) =>
      b.rankings.map((r) => ({ candidateId: r.candidateId, rank: r.rank })),
    );

    const { pairwiseMatrix, schulzeMatrix, winnerIds } = runSchulze(ballotData, candidateIds);

    await this.prisma.$transaction([
      this.prisma.electionResult.create({
        data: {
          electionId,
          winners: winnerIds as Prisma.InputJsonValue,
          candidateOrder: candidateIds as Prisma.InputJsonValue,
          pairwiseMatrix: pairwiseMatrix as Prisma.InputJsonValue,
          schulzeMatrix: schulzeMatrix as Prisma.InputJsonValue,
          totalBallots: ballots.length,
          computedAt: new Date(),
        },
      }),
      this.prisma.election.update({
        where: { id: electionId },
        data: { status: ElectionStatus.tallied as string as never },
      }),
    ]);

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({
          ...base,
          action: 'election.tallied',
          resource: `election:${electionId}`,
          ip,
          metadata: { totalBallots: ballots.length, winnerIds },
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );
  }

  // ─── Results ──────────────────────────────────────────────────────────────

  async getElectionResults(
    electionId: string,
    profileId: string,
  ): Promise<ElectionResultResponse> {
    const election = await this.prisma.election.findUnique({
      where: { id: electionId },
      include: {
        candidates: { orderBy: { position: 'asc' } },
        result: true,
      },
    });

    if (!election) throw new NotFoundException('Election not found');
    if ((election.status as string) !== ElectionStatus.tallied) {
      throw new BadRequestException('Results are only available after tallying');
    }

    await this.requireMembership(election.groupId, profileId);

    const result = election.result!;
    const candidateOrder = result.candidateOrder as string[];
    const winnerIds = new Set(result.winners as string[]);

    const candidateMap = new Map(election.candidates.map((c) => [c.id, c]));

    const candidates: CandidateSummary[] = candidateOrder.map((id) => {
      const c = candidateMap.get(id)!;
      return toCandidateSummary(c);
    });

    const winners: CandidateSummary[] = candidates.filter((c) => winnerIds.has(c.id));

    return {
      electionId,
      winners,
      candidates,
      pairwiseMatrix: result.pairwiseMatrix as number[][],
      schulzeMatrix: result.schulzeMatrix as number[][],
      totalBallots: result.totalBallots,
      computedAt: result.computedAt.toISOString(),
    };
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async requireMembership(groupId: string, profileId: string): Promise<void> {
    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_profileId: { groupId, profileId } },
    });
    if (!membership) {
      throw new ForbiddenException('You must be a member of this group to participate');
    }
  }

  private async auditBase(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { userId: true },
      });
      if (profile?.userId) return { actorId: profile.userId };
    } catch {
      // silenciar — el audit log es fire-and-forget
    }
    return {};
  }

  private toSummary(e: {
    id: string;
    groupId: string;
    title: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    createdAt: Date;
    _count: { candidates: number; ballots: number };
  }): ElectionSummary {
    return {
      id: e.id,
      groupId: e.groupId,
      title: e.title,
      status: e.status as unknown as ElectionStatus,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      candidateCount: e._count.candidates,
      ballotCount: e._count.ballots,
      createdAt: e.createdAt.toISOString(),
    };
  }
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function toCandidateSummary(c: {
  id: string;
  title: string;
  description: string | null;
  position: number;
}): CandidateSummary {
  return { id: c.id, title: c.title, description: c.description, position: c.position };
}
