import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DELIBERATION_DAYS,
  VOTING_DAYS,
  type ForumDetail,
  type ForumSummary,
  type ModerationAppeal,
  type ProposalSummary,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BoardService } from '../board/board.service';
import type { CreateForumDto } from './dto/create-forum.dto';
import type { CloseTopicDto } from './dto/close-topic.dto';
import type { ModerateDto } from './dto/moderate.dto';

const DIA_MS = 86_400_000;

@Injectable()
export class ForumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly board: BoardService,
  ) {}

  // ─── Permisos ─────────────────────────────────────────────────────────────

  /**
   * Quién puede crear foros y moderar en un grupo. Plan 2: la mesa directiva,
   * incluido el administrador del sitio (cargo `administrador`), con titular
   * verificado. El plan 3 agrega a los coordinadores de la comunidad.
   */
  async canModerate(profileId: string, _groupId: string): Promise<boolean> {
    return (await this.board.roleOf(profileId)) !== null;
  }

  private async esMesa(profileId: string): Promise<boolean> {
    return (await this.board.roleOf(profileId)) !== null;
  }

  private async requireMembership(groupId: string, profileId: string): Promise<void> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_profileId: { groupId, profileId } },
    });
    if (!m) throw new ForbiddenException('Solo los miembros de esta comunidad pueden participar.');
  }

  private async actorId(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
    return p?.userId ? { actorId: p.userId } : {};
  }

  // ─── Foros ────────────────────────────────────────────────────────────────

  async listMine(profileId: string): Promise<ForumSummary[]> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { profileId },
      include: { group: true },
    });
    const result: ForumSummary[] = [];
    for (const m of memberships) {
      await this.ensureDefault(m.groupId, m.group.name);
      const forums = await this.prisma.forum.findMany({
        where: { groupId: m.groupId },
        include: { _count: { select: { proposals: true } } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      for (const f of forums) {
        result.push({
          id: f.id,
          groupId: f.groupId,
          groupName: m.group.name,
          title: f.title,
          description: f.description,
          isDefault: f.isDefault,
          topicCount: f._count.proposals,
        });
      }
    }
    return result;
  }

  private async ensureDefault(groupId: string, groupName: string): Promise<void> {
    const existing = await this.prisma.forum.findFirst({ where: { groupId, isDefault: true } });
    if (!existing) {
      await this.prisma.forum.create({ data: { groupId, title: `Foro de ${groupName}`, isDefault: true } });
    }
  }

  async getForum(profileId: string, forumId: string): Promise<ForumDetail> {
    const forum = await this.prisma.forum.findUnique({
      where: { id: forumId },
      include: { group: true, _count: { select: { proposals: true } } },
    });
    if (!forum) throw new NotFoundException('Foro no encontrado');
    await this.requireMembership(forum.groupId, profileId);

    const topics = await this.prisma.proposal.findMany({
      where: { forumId },
      include: {
        author: { select: { displayName: true } },
        signals: { select: { signal: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: forum.id,
      groupId: forum.groupId,
      groupName: forum.group.name,
      title: forum.title,
      description: forum.description,
      isDefault: forum.isDefault,
      topicCount: forum._count.proposals,
      canModerate: await this.canModerate(profileId, forum.groupId),
      topics: topics.map((t): ProposalSummary => {
        const counts = { support: 0, neutral: 0, object: 0 };
        for (const s of t.signals) counts[s.signal as keyof typeof counts] += 1;
        return {
          id: t.id,
          groupId: t.groupId,
          forumId: t.forumId,
          title: t.hidden ? 'Tema oculto por moderación' : t.title,
          status: t.status as unknown as ProposalSummary['status'],
          kind: t.kind as unknown as ProposalSummary['kind'],
          hidden: t.hidden,
          authorDisplayName: t.author.displayName,
          signalCounts: counts,
          commentCount: t._count.comments,
          createdAt: t.createdAt.toISOString(),
        };
      }),
    };
  }

  async createForum(profileId: string, dto: CreateForumDto, ip: string): Promise<{ id: string }> {
    if (!(await this.canModerate(profileId, dto.groupId))) {
      throw new ForbiddenException('Solo la mesa directiva o el administrador pueden abrir foros por ahora.');
    }
    const group = await this.prisma.group.findUnique({ where: { id: dto.groupId } });
    if (!group) throw new NotFoundException('Comunidad no encontrada');
    const forum = await this.prisma.forum.create({
      data: {
        groupId: dto.groupId,
        title: dto.title,
        description: dto.description ?? null,
        createdByProfileId: profileId,
      },
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'forum.created',
      resource: `forum:${forum.id}`,
      ip,
      metadata: { groupId: dto.groupId },
    });
    return { id: forum.id };
  }

  // ─── Propuesta formal, votación y consenso ────────────────────────────────

  private async topicForAction(profileId: string, topicId: string) {
    const topic = await this.prisma.proposal.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException('Tema no encontrado');
    if (topic.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    const esAutor = topic.authorProfileId === profileId;
    if (!(await this.canModerate(profileId, topic.groupId))) {
      if (!esAutor) throw new ForbiddenException('Solo quien abrió el tema o la moderación pueden hacer esto.');
      // Como autor (no como moderador) hay que seguir siendo miembro: una persona suspendida pierde sus membresías.
      await this.requireMembership(topic.groupId, profileId);
    }
    return topic;
  }

  async formalize(profileId: string, topicId: string, ip: string): Promise<void> {
    const topic = await this.topicForAction(profileId, topicId);
    if ((topic.kind as string) === 'propuesta') throw new ConflictException('Este tema ya es una propuesta formal.');
    if ((topic.status as string) !== 'open') throw new BadRequestException('Solo un tema abierto puede convertirse en propuesta.');
    await this.prisma.proposal.update({
      where: { id: topicId },
      data: { kind: 'propuesta', deliberationEndsAt: new Date(Date.now() + DELIBERATION_DAYS * DIA_MS) },
    });
    void this.audit.log({ ...(await this.actorId(profileId)), action: 'proposal.formalized', resource: `proposal:${topicId}`, ip });
  }

  async openVote(profileId: string, topicId: string, ip: string): Promise<{ electionId: string }> {
    const topic = await this.topicForAction(profileId, topicId);
    if ((topic.kind as string) !== 'propuesta') throw new BadRequestException('Primero hay que convertir el tema en propuesta formal.');
    if (topic.electionId) throw new ConflictException('La votación de esta propuesta ya está abierta.');
    if ((topic.status as string) !== 'open') throw new BadRequestException('Solo un tema abierto puede votarse.');
    if (!topic.deliberationEndsAt || topic.deliberationEndsAt.getTime() > Date.now()) {
      throw new BadRequestException('La votación se abre cuando termina el plazo de deliberación.');
    }
    const ahora = new Date();
    const election = await this.prisma.$transaction(async (tx) => {
      const e = await tx.election.create({
        data: {
          groupId: topic.groupId,
          createdByProfileId: profileId,
          title: `Votación: ${topic.title}`.slice(0, 200),
          description: 'Votación de una propuesta formal del foro.',
          status: 'open',
          startsAt: ahora,
          endsAt: new Date(ahora.getTime() + VOTING_DAYS * DIA_MS),
          candidates: {
            create: [
              { title: 'A favor', position: 1 },
              { title: 'En contra', position: 2 },
              { title: 'Abstención', position: 3 },
            ],
          },
        },
      });
      await tx.proposal.update({ where: { id: topicId }, data: { electionId: e.id } });
      return e;
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'proposal.vote_opened',
      resource: `proposal:${topicId}`,
      ip,
      metadata: { electionId: election.id },
    });
    return { electionId: election.id };
  }

  async closeWithConsensus(profileId: string, topicId: string, dto: CloseTopicDto, ip: string): Promise<void> {
    const topic = await this.topicForAction(profileId, topicId);
    if ((topic.status as string) !== 'open') throw new BadRequestException('Solo se cierra un tema abierto.');
    await this.prisma.proposal.update({
      where: { id: topicId },
      data: {
        status: 'closed',
        closedAt: new Date(),
        conclusion: dto.conclusion,
        objections: dto.objections ?? null,
      },
    });
    void this.audit.log({ ...(await this.actorId(profileId)), action: 'proposal.closed_with_consensus', resource: `proposal:${topicId}`, ip });
  }

  // ─── Moderación ───────────────────────────────────────────────────────────

  async hide(profileId: string, dto: ModerateDto, ip: string): Promise<{ id: string }> {
    let groupId: string;
    if (dto.target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id: dto.targetId } });
      if (!t) throw new NotFoundException('Tema no encontrado');
      groupId = t.groupId;
    } else {
      const c = await this.prisma.proposalComment.findUnique({
        where: { id: dto.targetId },
        include: { proposal: { select: { groupId: true } } },
      });
      if (!c) throw new NotFoundException('Respuesta no encontrada');
      groupId = c.proposal.groupId;
    }
    if (!(await this.canModerate(profileId, groupId))) {
      throw new ForbiddenException('No tienes permiso para moderar en esta comunidad.');
    }
    if (dto.target === 'tema') {
      await this.prisma.proposal.update({ where: { id: dto.targetId }, data: { hidden: true } });
    } else {
      await this.prisma.proposalComment.update({ where: { id: dto.targetId }, data: { hidden: true } });
    }
    const action = await this.prisma.moderationAction.create({
      data: { target: dto.target, targetId: dto.targetId, reason: dto.reason, moderatorProfileId: profileId },
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'moderation.hidden',
      resource: `${dto.target}:${dto.targetId}`,
      ip,
      metadata: { moderationId: action.id },
    });
    return { id: action.id };
  }

  async appeal(profileId: string, moderationId: string, text: string, ip: string): Promise<void> {
    const action = await this.prisma.moderationAction.findUnique({ where: { id: moderationId } });
    if (!action) throw new NotFoundException('Moderación no encontrada');
    const contenido = await this.authorOf(action.target as 'tema' | 'respuesta', action.targetId);
    if (!contenido || contenido.authorProfileId !== profileId) {
      throw new ForbiddenException('Solo quien escribió el contenido puede apelar.');
    }
    await this.requireMembership(contenido.groupId, profileId);
    if ((action.status as string) !== 'oculto') throw new ConflictException('Esta moderación ya fue apelada o resuelta.');
    await this.prisma.moderationAction.update({
      where: { id: moderationId },
      data: { status: 'apelado', appealText: text, appealedAt: new Date() },
    });
    void this.audit.log({ ...(await this.actorId(profileId)), action: 'moderation.appealed', resource: `moderation:${moderationId}`, ip });
  }

  async listAppeals(profileId: string): Promise<ModerationAppeal[]> {
    if (!(await this.esMesa(profileId))) throw new ForbiddenException('Solo la mesa directiva resuelve apelaciones.');
    const actions = await this.prisma.moderationAction.findMany({
      where: { status: 'apelado' },
      orderBy: { appealedAt: 'asc' },
    });
    const result: ModerationAppeal[] = [];
    for (const a of actions) {
      result.push({
        id: a.id,
        target: a.target as 'tema' | 'respuesta',
        targetId: a.targetId,
        reason: a.reason,
        appealText: a.appealText ?? '',
        originalText: await this.textOf(a.target as 'tema' | 'respuesta', a.targetId),
        appealedAt: (a.appealedAt ?? a.createdAt).toISOString(),
      });
    }
    return result;
  }

  async resolveAppeal(profileId: string, moderationId: string, restore: boolean, ip: string): Promise<void> {
    if (!(await this.esMesa(profileId))) throw new ForbiddenException('Solo la mesa directiva resuelve apelaciones.');
    const action = await this.prisma.moderationAction.findUnique({ where: { id: moderationId } });
    if (!action) throw new NotFoundException('Moderación no encontrada');
    if ((action.status as string) !== 'apelado') throw new BadRequestException('Esta moderación no tiene una apelación pendiente.');
    if (restore) {
      if ((action.target as string) === 'tema') {
        await this.prisma.proposal.update({ where: { id: action.targetId }, data: { hidden: false } });
      } else {
        await this.prisma.proposalComment.update({ where: { id: action.targetId }, data: { hidden: false } });
      }
    }
    await this.prisma.moderationAction.update({
      where: { id: moderationId },
      data: { status: restore ? 'restaurado' : 'confirmado', resolvedAt: new Date() },
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: restore ? 'moderation.restored' : 'moderation.confirmed',
      resource: `moderation:${moderationId}`,
      ip,
    });
  }

  private async authorOf(
    target: 'tema' | 'respuesta',
    id: string,
  ): Promise<{ authorProfileId: string; groupId: string } | null> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id } });
      return t ? { authorProfileId: t.authorProfileId, groupId: t.groupId } : null;
    }
    const c = await this.prisma.proposalComment.findUnique({
      where: { id },
      include: { proposal: { select: { groupId: true } } },
    });
    return c ? { authorProfileId: c.authorProfileId, groupId: c.proposal.groupId } : null;
  }

  private async textOf(target: 'tema' | 'respuesta', id: string): Promise<string> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id } });
      return t ? `${t.title}\n\n${t.body}` : '';
    }
    return (await this.prisma.proposalComment.findUnique({ where: { id } }))?.body ?? '';
  }
}
