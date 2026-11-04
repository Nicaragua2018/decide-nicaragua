import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

const HIDDEN_TOPIC_TITLE = 'Tema oculto por moderación';

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

    let forumId: string;
    if (dto.forumId) {
      const forum = await this.prisma.forum.findUnique({ where: { id: dto.forumId } });
      if (!forum || forum.groupId !== groupId) {
        throw new BadRequestException('Ese foro no pertenece a esta comunidad.');
      }
      forumId = forum.id;
    } else {
      forumId = (await this.defaultForum(groupId)).id;
    }

    const proposal = await this.prisma.proposal.create({
      data: {
        groupId,
        forumId,
        kind: 'tema',
        authorProfileId: profileId,
        title: dto.title,
        body: dto.body,
        status: (dto.status ?? ProposalStatus.open) as string as never,
      },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({ ...base, action: 'proposal.created', resource: `proposal:${proposal.id}`, ip, metadata: { groupId } })
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
        title: p.hidden ? HIDDEN_TOPIC_TITLE : p.title,
        status: p.status as unknown as ProposalStatus,
        authorDisplayName: p.author.displayName,
        signalCounts: computeSignalCounts(p.signals.map((s) => s.signal as string)),
        commentCount: p._count.comments,
        createdAt: p.createdAt.toISOString(),
        kind: p.kind,
        hidden: p.hidden,
        forumId: p.forumId,
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

    // Una consulta por comentario oculto (la escala es pequeña). De un tema oculto no se lee nada.
    const comments: CommentItem[] = [];
    for (const c of proposal.hidden ? [] : proposal.comments) {
      const cm = c.hidden ? await this.hiddenInfo('respuesta', c.id, c.authorProfileId, profileId) : null;
      comments.push({
        id: c.id,
        authorDisplayName: c.author.displayName,
        body: c.hidden ? '' : c.body,
        parentId: c.parentId,
        createdAt: c.createdAt.toISOString(),
        hidden: c.hidden,
        hiddenReason: cm?.reason ?? null,
        moderationId: cm?.moderationId ?? null,
      });
    }

    const topicInfo = proposal.hidden
      ? await this.hiddenInfo('tema', proposal.id, proposal.authorProfileId, profileId)
      : null;

    const electionStatus =
      proposal.electionId && !proposal.hidden
        ? (((await this.prisma.election.findUnique({
            where: { id: proposal.electionId },
            select: { status: true },
          }))?.status ?? null) as ProposalDetail['electionStatus'])
        : null;

    const detail: ProposalDetail = {
      id: proposal.id,
      groupId: proposal.groupId,
      title: proposal.title,
      body: proposal.body,
      status: proposal.status as unknown as ProposalStatus,
      authorDisplayName: proposal.author.displayName,
      authorProfileId: proposal.authorProfileId,
      isAuthor: proposal.authorProfileId === profileId,
      signalCounts: computeSignalCounts(proposal.signals.map((s) => s.signal as string)),
      commentCount: proposal._count.comments,
      createdAt: proposal.createdAt.toISOString(),
      comments,
      userSignal: userSignalRow ? (userSignalRow.signal as unknown as SignalType) : null,
      kind: proposal.kind,
      hidden: proposal.hidden,
      forumId: proposal.forumId,
      deliberationEndsAt: proposal.deliberationEndsAt?.toISOString() ?? null,
      electionId: proposal.electionId,
      electionStatus,
      conclusion: proposal.conclusion,
      objections: proposal.objections,
      hiddenReason: topicInfo?.reason ?? null,
      moderationId: topicInfo?.moderationId ?? null,
      // Lo calcula ForumsService (Tarea 4/5); este servicio no conoce los permisos de moderación.
      canModerate: false,
      abiertoPorComunidad: proposal.abiertoPorComunidad,
      inquietudes: [],
    };

    return proposal.hidden ? redactHiddenTopic(detail) : detail;
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

    // Una persona suspendida pierde sus membresías: ya no gestiona sus temas.
    await this.requireMembership(proposal.groupId, profileId);

    this.requireNotHidden(proposal.hidden);

    if ((proposal.status as string) === 'closed') {
      throw new BadRequestException('Un tema cerrado con consenso ya no cambia de estado.');
    }

    if ((dto.status as string) === 'closed') {
      throw new BadRequestException('Para cerrar un tema usa «Cerrar con consenso».');
    }

    if ((dto.status as string) === 'archived' && (proposal.kind as string) === 'propuesta') {
      const election = proposal.electionId
        ? await this.prisma.election.findUnique({ where: { id: proposal.electionId }, select: { status: true } })
        : null;
      const contada = election !== null && ['tallied', 'cancelled'].includes(election.status as string);
      if (!contada) {
        throw new BadRequestException('Una propuesta formal no se archiva antes de que se cuente su votación.');
      }
    }

    const newStatus = dto.status as string as never;

    await this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: newStatus },
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
    this.requireNotHidden(proposal.hidden);
    this.requireMutableStatus(proposal.status as string);

    if (dto.parentId) {
      const parent = await this.prisma.proposalComment.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent || parent.proposalId !== proposalId) {
        throw new BadRequestException('Parent comment not found in this proposal');
      }

      if (parent.hidden) {
        throw new BadRequestException('No se puede responder a una respuesta oculta.');
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
    this.requireNotHidden(proposal.hidden);
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

  private requireNotHidden(hidden: boolean): void {
    if (hidden) {
      throw new BadRequestException('Este tema está oculto por moderación.');
    }
  }

  /** Foro por defecto del grupo; se crea al vuelo la primera vez. */
  private async defaultForum(groupId: string): Promise<{ id: string }> {
    const existing = await this.prisma.forum.findFirst({ where: { groupId, isDefault: true } });
    if (existing) return existing;
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    try {
      return await this.prisma.forum.create({
        data: { groupId, title: `Foro de ${group?.name ?? 'la comunidad'}`, isDefault: true },
      });
    } catch (err) {
      // Otra petición lo creó a la vez (índice único parcial): se relee.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
      const creado = await this.prisma.forum.findFirst({ where: { groupId, isDefault: true } });
      if (!creado) throw err;
      return creado;
    }
  }

  /**
   * Motivo de la acción de moderación más reciente sobre un tema o respuesta y, solo si quien
   * consulta es el autor y la acción sigue sin apelar ('oculto'), el id para apelarla.
   */
  private async hiddenInfo(
    target: 'tema' | 'respuesta',
    targetId: string,
    authorProfileId: string,
    viewerProfileId: string,
  ): Promise<{ reason: string | null; moderationId: string | null }> {
    const action = await this.prisma.moderationAction.findFirst({
      where: { target, targetId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reason: true, status: true },
    });
    const canAppeal =
      action !== null && authorProfileId === viewerProfileId && (action.status as string) === 'oculto';
    return { reason: action?.reason ?? null, moderationId: canAppeal ? action.id : null };
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

/**
 * Único lugar donde se borra todo lo que un tema oculto podría revelar. Todo campo nuevo
 * con texto del tema (o que apunte a él) debe vaciarse aquí. La mesa ve el original en
 * la cola de apelaciones.
 */
function redactHiddenTopic(detail: ProposalDetail): ProposalDetail {
  return {
    ...detail,
    title: HIDDEN_TOPIC_TITLE,
    body: '',
    conclusion: null,
    objections: null,
    electionId: null,
    electionStatus: null,
    comments: [],
  };
}

function computeSignalCounts(signals: string[]): SignalCounts {
  const counts = { support: 0, neutral: 0, object: 0 };
  for (const s of signals) {
    if (s === SignalType.support) counts.support++;
    else if (s === SignalType.neutral) counts.neutral++;
    else if (s === SignalType.object) counts.object++;
  }
  return counts;
}
