import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ProposalStatus, SignalType } from '@decide/shared';
import type {
  ProposalSummary,
  ProposalDetail,
  ProposalListResponse,
  SignalCounts,
  CommentItem,
} from '@decide/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SetSignalDto } from './dto/set-signal.dto';
import { UpdateProposalStatusDto } from './dto/update-proposal-status.dto';

/** Estados que aceptan nuevos comentarios y señales */
const MUTABLE_STATUSES: string[] = [ProposalStatus.open];

@Injectable()
export class DeliberationService {
  private readonly logger = new Logger(DeliberationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Proposals ────────────────────────────────────────────────────────────

  async createProposal(
    groupId: string,
    dto: CreateProposalDto,
    profileId: string,
    ip: string,
  ): Promise<{ id: string }> {
    await this.requireMembership(groupId, profileId);

    const proposal = await this.prisma.proposal.create({
      data: {
        groupId,
        authorProfileId: profileId,
        title: dto.title,
        body: dto.body,
        status: (dto.status ?? ProposalStatus.open) as string as never,
      },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({ ...base, action: 'proposal.created', resource: `proposal:${proposal.id}`, ip, metadata: { groupId, title: dto.title } })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );

    return { id: proposal.id };
  }

  async listGroupProposals(groupId: string, profileId: string): Promise<ProposalListResponse> {
    await this.requireMembership(groupId, profileId);

    const proposals = await this.prisma.proposal.findMany({
      where: { groupId },
      include: {
        author: { select: { displayName: true } },
        signals: { select: { signal: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      proposals: proposals.map((p) => ({
        id: p.id,
        groupId: p.groupId,
        title: p.title,
        status: p.status as unknown as ProposalStatus,
        authorDisplayName: p.author.displayName,
        signalCounts: computeSignalCounts(p.signals.map((s) => s.signal as string)),
        commentCount: p._count.comments,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async getProposalById(proposalId: string, profileId: string): Promise<ProposalDetail> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        author: { select: { displayName: true } },
        signals: { select: { signal: true, profileId: true } },
        comments: {
          include: { author: { select: { displayName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { comments: true } },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    await this.requireMembership(proposal.groupId, profileId);

    const userSignalRow = proposal.signals.find((s) => s.profileId === profileId);

    const comments: CommentItem[] = proposal.comments.map((c) => ({
      id: c.id,
      authorDisplayName: c.author.displayName,
      body: c.body,
      parentId: c.parentId,
      createdAt: c.createdAt.toISOString(),
    }));

    return {
      id: proposal.id,
      groupId: proposal.groupId,
      title: proposal.title,
      body: proposal.body,
      status: proposal.status as unknown as ProposalStatus,
      authorDisplayName: proposal.author.displayName,
      signalCounts: computeSignalCounts(proposal.signals.map((s) => s.signal as string)),
      commentCount: proposal._count.comments,
      createdAt: proposal.createdAt.toISOString(),
      comments,
      userSignal: userSignalRow ? (userSignalRow.signal as unknown as SignalType) : null,
    };
  }

  async updateProposalStatus(
    proposalId: string,
    dto: UpdateProposalStatusDto,
    profileId: string,
    ip: string,
  ): Promise<void> {
    const proposal = await this.prisma.proposal.findUnique({ where: { id: proposalId } });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.authorProfileId !== profileId) {
      throw new ForbiddenException('Only the author can change the proposal status');
    }

    const newStatus = dto.status as string as never;

    await this.prisma.proposal.update({
      where: { id: proposalId },
      data: {
        status: newStatus,
        closedAt: new Date(),
      },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({ ...base, action: 'proposal.status_changed', resource: `proposal:${proposalId}`, ip, metadata: { newStatus: dto.status } })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );
  }

  // ─── Comments ─────────────────────────────────────────────────────────────

  async addComment(
    proposalId: string,
    dto: CreateCommentDto,
    profileId: string,
    ip: string,
  ): Promise<{ id: string }> {
    const proposal = await this.prisma.proposal.findUnique({ where: { id: proposalId } });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    await this.requireMembership(proposal.groupId, profileId);
    this.requireMutableStatus(proposal.status as string);

    if (dto.parentId) {
      const parent = await this.prisma.proposalComment.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent || parent.proposalId !== proposalId) {
        throw new BadRequestException('Parent comment not found in this proposal');
      }

      // Solo un nivel de threading — no se permite responder a una respuesta
      if (parent.parentId !== null) {
        throw new BadRequestException('Replies can only be one level deep');
      }
    }

    const comment = await this.prisma.proposalComment.create({
      data: {
        proposalId,
        authorProfileId: profileId,
        body: dto.body,
        parentId: dto.parentId ?? null,
      },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({ ...base, action: 'proposal.comment_added', resource: `proposal:${proposalId}`, ip })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );

    return { id: comment.id };
  }

  // ─── Signals ──────────────────────────────────────────────────────────────

  async setSignal(
    proposalId: string,
    dto: SetSignalDto,
    profileId: string,
    ip: string,
  ): Promise<void> {
    const proposal = await this.prisma.proposal.findUnique({ where: { id: proposalId } });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    await this.requireMembership(proposal.groupId, profileId);
    this.requireMutableStatus(proposal.status as string);

    await this.prisma.consensusSignal.upsert({
      where: { proposalId_profileId: { proposalId, profileId } },
      create: {
        proposalId,
        profileId,
        signal: dto.signal as string as never,
      },
      update: {
        signal: dto.signal as string as never,
      },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({ ...base, action: 'proposal.signal_set', resource: `proposal:${proposalId}`, ip, metadata: { signal: dto.signal } })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );
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

  private requireMutableStatus(status: string): void {
    if (!MUTABLE_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Proposal is ${status} and does not accept new interactions`,
      );
    }
  }

  /**
   * Construye el objeto base para audit.log incluyendo actorId solo si está disponible.
   * Usa spread condicional para respetar `exactOptionalPropertyTypes`.
   */
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
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function computeSignalCounts(signals: string[]): SignalCounts {
  const counts = { support: 0, neutral: 0, object: 0 };
  for (const s of signals) {
    if (s === SignalType.support) counts.support++;
    else if (s === SignalType.neutral) counts.neutral++;
    else if (s === SignalType.object) counts.object++;
  }
  return counts;
}
