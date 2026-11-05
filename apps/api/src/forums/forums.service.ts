import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VOTING_DAYS,
  type ForumDetail,
  type ForumSummary,
  type ModerationAppeal,
  type PublicConsensus,
  type ProposalSummary,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BoardService } from '../board/board.service';
import { RulesService } from '../rules/rules.service';
import type { CreateForumDto } from './dto/create-forum.dto';
import type { CloseTopicDto } from './dto/close-topic.dto';
import type { ModerateDto } from './dto/moderate.dto';

const DIA_MS = 86_400_000;

/** Título que toma la votación de un tema oculto, para que no repita el título del tema. */
const HIDDEN_VOTE_TITLE = 'Votación de un tema oculto';

/** Título neutro de una votación cancelada que queda huérfana al abrir otra. */
const ORPHAN_VOTE_TITLE = 'Votación anterior (cancelada)';

type ModTarget = 'tema' | 'respuesta' | 'inquietud' | 'frase' | 'solucion';

/** Cada tipo de contenido tiene su propia rama: ninguno cae en otro por descarte. */
function checkTarget(target: string): ModTarget {
  if (target === 'tema' || target === 'respuesta' || target === 'inquietud' || target === 'frase' || target === 'solucion') return target;
  throw new BadRequestException('Tipo de contenido no válido.');
}

const voteTitle = (topicTitle: string): string => `Votación: ${topicTitle}`.slice(0, 200);

/** Motivo de la moderación que oculta el debate abierto por la comunidad junto con su inquietud. */
export const LINKED_TOPIC_REASON = 'Oculto junto con la inquietud de origen.';

/** Una ocultación vinculada sigue a su inquietud: no se apela ni se resuelve por separado. */
function rejectLinkedTopicAction(action: { target: string; reason: string }): void {
  if (action.target === 'tema' && action.reason === LINKED_TOPIC_REASON) {
    throw new BadRequestException('Esta ocultación se apela desde la inquietud de origen.');
  }
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class ForumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly board: BoardService,
    private readonly rules: RulesService,
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

  /** Organizar la agenda de inquietudes; igual a canModerate hasta que existan los roles de 3C. */
  async canOrganize(profileId: string, groupId: string): Promise<boolean> {
    return this.canModerate(profileId, groupId);
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
      try {
        await this.prisma.forum.create({ data: { groupId, title: `Foro de ${groupName}`, isDefault: true } });
      } catch (err) {
        // Otra petición lo creó a la vez (índice único parcial): basta con releerlo.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
        await this.prisma.forum.findFirst({ where: { groupId, isDefault: true } });
      }
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
    const dias = await this.rules.getInt('debate.plazo_dias', topic.groupId);
    await this.prisma.$transaction(async (tx) => {
      // Condicionado: dos envíos a la vez no siembran dos veces ni mueven el plazo.
      const r = await tx.proposal.updateMany({
        where: { id: topicId, kind: { not: 'propuesta' }, status: 'open', hidden: false },
        data: { kind: 'propuesta', deliberationEndsAt: new Date(Date.now() + dias * DIA_MS) },
      });
      if (r.count === 0) throw new ConflictException('Este tema ya es una propuesta formal.');
      // Si nadie propuso soluciones, el propio tema pasa a ser la primera.
      const visibles = await tx.solucion.count({ where: { proposalId: topicId, hidden: false, mergedIntoId: null } });
      if (visibles === 0) {
        // Hereda el título del tema: puede tener menos de 10 caracteres (el mínimo del DTO solo rige las propuestas manuales).
        const title = topic.title.slice(0, 140);
        await tx.solucion.create({
          data: {
            proposalId: topicId,
            authorProfileId: topic.authorProfileId,
            title,
            description: (topic.body.length > 0 ? topic.body : title).slice(0, 2000),
            origen: 'persona',
          },
        });
      }
    });
    void this.audit.log({ ...(await this.actorId(profileId)), action: 'proposal.formalized', resource: `proposal:${topicId}`, ip });
  }

  async openVote(profileId: string, topicId: string, ip: string): Promise<{ electionId: string }> {
    const topic = await this.topicForAction(profileId, topicId);
    if ((topic.kind as string) !== 'propuesta') throw new BadRequestException('Primero hay que convertir el tema en propuesta formal.');
    if (topic.electionId) {
      // Solo si la votación anterior fue cancelada (al ocultar el tema) se puede abrir otra.
      const previa = await this.prisma.election.findUnique({ where: { id: topic.electionId }, select: { status: true } });
      if ((previa?.status as string | undefined) !== 'cancelled') {
        throw new ConflictException('La votación de esta propuesta ya está abierta.');
      }
    }
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
          title: voteTitle(topic.title),
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
      const vinculada = await tx.proposal.updateMany({
        where: { id: topicId, electionId: topic.electionId ?? null, status: 'open', hidden: false },
        data: { electionId: e.id },
      });
      if (vinculada.count === 0) throw new ConflictException('La votación de esta propuesta ya está abierta.');
      if (topic.electionId) {
        // La votación cancelada queda sin tema: que no conserve su título.
        await tx.election.update({ where: { id: topic.electionId }, data: { title: ORPHAN_VOTE_TITLE } });
      }
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
    if ((topic.kind as string) === 'propuesta') {
      const election = topic.electionId
        ? await this.prisma.election.findUnique({ where: { id: topic.electionId }, select: { status: true } })
        : null;
      if (!election || !['tallied', 'cancelled'].includes(election.status as string)) {
        throw new BadRequestException('Una propuesta formal se cierra cuando su votación ya fue contada.');
      }
    }
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
    const target = checkTarget(dto.target);
    let groupId: string;
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id: dto.targetId } });
      if (!t) throw new NotFoundException('Tema no encontrado');
      if (t.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = t.groupId;
    } else if (target === 'inquietud') {
      const q = await this.prisma.inquietud.findUnique({ where: { id: dto.targetId } });
      if (!q) throw new NotFoundException('Inquietud no encontrada');
      if (q.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = q.groupId;
    } else if (target === 'frase') {
      const f = await this.prisma.frase.findUnique({
        where: { id: dto.targetId },
        include: { proposal: { select: { groupId: true } } },
      });
      if (!f) throw new NotFoundException('Frase no encontrada');
      if (f.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = f.proposal.groupId;
    } else if (target === 'solucion') {
      const so = await this.prisma.solucion.findUnique({
        where: { id: dto.targetId },
        include: { proposal: { select: { groupId: true } } },
      });
      if (!so) throw new NotFoundException('Solución no encontrada');
      if (so.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = so.proposal.groupId;
    } else {
      const c = await this.prisma.proposalComment.findUnique({
        where: { id: dto.targetId },
        include: { proposal: { select: { groupId: true } } },
      });
      if (!c) throw new NotFoundException('Respuesta no encontrada');
      if (c.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = c.proposal.groupId;
    }
    if (!(await this.canModerate(profileId, groupId))) {
      throw new ForbiddenException('No tienes permiso para moderar en esta comunidad.');
    }
    const action = await this.prisma.$transaction(async (tx) => {
      let linkedTopicId: string | null = null;
      if (target === 'tema') {
        await this.hideTopicTx(tx, dto.targetId);
      } else if (target === 'inquietud') {
        const q = await tx.inquietud.update({ where: { id: dto.targetId }, data: { hidden: true } });
        // El debate que abrió la comunidad copia el título y el texto de la inquietud: se oculta con ella.
        // Un debate abierto a mano por quien organiza tiene su propio texto y no se toca.
        const proposalId = (q as { proposalId?: string | null } | undefined)?.proposalId ?? null;
        if (proposalId) {
          const p = await tx.proposal.findUnique({
            where: { id: proposalId },
            select: { abiertoPorComunidad: true, hidden: true },
          });
          if (p?.abiertoPorComunidad === true && p.hidden === false) {
            await this.hideTopicTx(tx, proposalId);
            linkedTopicId = proposalId;
          }
        }
      } else if (target === 'frase') {
        await tx.frase.update({ where: { id: dto.targetId }, data: { hidden: true } });
      } else if (target === 'solucion') {
        await tx.solucion.update({ where: { id: dto.targetId }, data: { hidden: true } });
      } else {
        await tx.proposalComment.update({ where: { id: dto.targetId }, data: { hidden: true } });
      }
      const created = await tx.moderationAction.create({
        data: { target, targetId: dto.targetId, reason: dto.reason, moderatorProfileId: profileId },
      });
      if (linkedTopicId) {
        await tx.moderationAction.create({
          data: { target: 'tema', targetId: linkedTopicId, reason: LINKED_TOPIC_REASON, moderatorProfileId: profileId },
        });
      }
      return created;
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'moderation.hidden',
      resource: `${target}:${dto.targetId}`,
      ip,
      metadata: { moderationId: action.id },
    });
    return { id: action.id };
  }

  async appeal(profileId: string, moderationId: string, text: string, ip: string): Promise<void> {
    const action = await this.prisma.moderationAction.findUnique({ where: { id: moderationId } });
    if (!action) throw new NotFoundException('Moderación no encontrada');
    rejectLinkedTopicAction(action);
    const contenido = await this.authorOf(checkTarget(action.target), action.targetId);
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
        target: checkTarget(a.target),
        targetId: a.targetId,
        reason: a.reason,
        appealText: a.appealText ?? '',
        originalText: await this.textOf(checkTarget(a.target), a.targetId),
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
    rejectLinkedTopicAction(action);
    const target = checkTarget(action.target);
    await this.prisma.$transaction(async (tx) => {
      if (restore) {
        if (target === 'tema') {
          await this.restoreTopicTx(tx, action.targetId);
        } else if (target === 'inquietud') {
          // El estado y el umbral los reevalúa InquietudesService al leerla (sin ciclo entre módulos).
          const q = await tx.inquietud.update({ where: { id: action.targetId }, data: { hidden: false } });
          const proposalId = (q as { proposalId?: string | null } | undefined)?.proposalId ?? null;
          if (proposalId) await this.restoreLinkedTopicTx(tx, proposalId);
        } else if (target === 'frase') {
          await tx.frase.update({ where: { id: action.targetId }, data: { hidden: false } });
        } else if (target === 'solucion') {
          await tx.solucion.update({ where: { id: action.targetId }, data: { hidden: false } });
        } else {
          await tx.proposalComment.update({ where: { id: action.targetId }, data: { hidden: false } });
        }
      }
      await tx.moderationAction.update({
        where: { id: moderationId },
        data: { status: restore ? 'restaurado' : 'confirmado', resolvedAt: new Date() },
      });
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: restore ? 'moderation.restored' : 'moderation.confirmed',
      resource: `moderation:${moderationId}`,
      ip,
    });
  }

  /** Oculta un tema; su votación pierde el título y, si sigue activa, se cancela. */
  private async hideTopicTx(tx: Tx, topicId: string): Promise<void> {
    // electionId se relee dentro de la transacción: así se ve una votación abierta justo antes.
    const t = await tx.proposal.update({ where: { id: topicId }, data: { hidden: true } });
    const electionId = t?.electionId ?? null;
    if (electionId) {
      // La votación repetía el título del tema: se le quita y, si sigue activa, se cancela.
      const e = await tx.election.findUnique({ where: { id: electionId }, select: { status: true } });
      const activa = ['draft', 'open'].includes((e?.status as string | undefined) ?? '');
      await tx.election.update({
        where: { id: electionId },
        data: activa ? { title: HIDDEN_VOTE_TITLE, status: 'cancelled' } : { title: HIDDEN_VOTE_TITLE },
      });
    }
  }

  /** Vuelve a mostrar un tema; su votación recupera el título, pero una cancelada no se reabre. */
  private async restoreTopicTx(tx: Tx, topicId: string): Promise<void> {
    const t = await tx.proposal.update({ where: { id: topicId }, data: { hidden: false } });
    if (t?.electionId) {
      await tx.election.update({ where: { id: t.electionId }, data: { title: voteTitle(t.title) } });
    }
  }

  /**
   * Al restaurar una inquietud, su debate abierto por la comunidad vuelve solo si se ocultó
   * junto con ella (última moderación del tema = la vinculada, aún en «oculto»). Si se ocultó
   * por su propio motivo, sigue oculto.
   */
  private async restoreLinkedTopicTx(tx: Tx, topicId: string): Promise<void> {
    const p = await tx.proposal.findUnique({
      where: { id: topicId },
      select: { abiertoPorComunidad: true, hidden: true },
    });
    if (p?.abiertoPorComunidad !== true || p.hidden !== true) return;
    const latest = await tx.moderationAction.findFirst({
      where: { target: 'tema', targetId: topicId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reason: true, status: true },
    });
    if (!latest || latest.reason !== LINKED_TOPIC_REASON || (latest.status as string) !== 'oculto') return;
    await tx.moderationAction.update({
      where: { id: latest.id },
      data: { status: 'restaurado', resolvedAt: new Date() },
    });
    await this.restoreTopicTx(tx, topicId);
  }

  private async authorOf(
    target: ModTarget,
    id: string,
  ): Promise<{ authorProfileId: string; groupId: string } | null> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id } });
      return t ? { authorProfileId: t.authorProfileId, groupId: t.groupId } : null;
    }
    if (target === 'inquietud') {
      const q = await this.prisma.inquietud.findUnique({ where: { id } });
      return q ? { authorProfileId: q.authorProfileId, groupId: q.groupId } : null;
    }
    if (target === 'frase') {
      const f = await this.prisma.frase.findUnique({
        where: { id },
        include: { proposal: { select: { groupId: true } } },
      });
      return f ? { authorProfileId: f.authorProfileId, groupId: f.proposal.groupId } : null;
    }
    if (target === 'solucion') {
      const so = await this.prisma.solucion.findUnique({
        where: { id },
        include: { proposal: { select: { groupId: true } } },
      });
      return so ? { authorProfileId: so.authorProfileId, groupId: so.proposal.groupId } : null;
    }
    const c = await this.prisma.proposalComment.findUnique({
      where: { id },
      include: { proposal: { select: { groupId: true } } },
    });
    return c ? { authorProfileId: c.authorProfileId, groupId: c.proposal.groupId } : null;
  }

  private async textOf(target: ModTarget, id: string): Promise<string> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id } });
      return t ? `${t.title}\n\n${t.body}` : '';
    }
    if (target === 'inquietud') {
      const q = await this.prisma.inquietud.findUnique({ where: { id } });
      return q ? `${q.title}\n\n${q.body}` : '';
    }
    if (target === 'frase') {
      return (await this.prisma.frase.findUnique({ where: { id } }))?.text ?? '';
    }
    if (target === 'solucion') {
      const so = await this.prisma.solucion.findUnique({ where: { id } });
      return so ? `${so.title}\n\n${so.description}` : '';
    }
    return (await this.prisma.proposalComment.findUnique({ where: { id } }))?.body ?? '';
  }

  /** Consensos publicados para cualquier visitante (spec §3 y §7). Sin nombres. */
  async publicConsensus(): Promise<PublicConsensus[]> {
    const topics = await this.prisma.proposal.findMany({
      where: { status: 'closed', hidden: false, conclusion: { not: null } },
      select: {
        id: true, title: true, kind: true, conclusion: true, objections: true, closedAt: true, electionId: true,
        group: { select: { name: true } },
        signals: { select: { signal: true } },
      },
      orderBy: { closedAt: 'desc' },
      take: 100,
    });
    const result: PublicConsensus[] = [];
    for (const t of topics) {
      const counts = { support: 0, neutral: 0, object: 0 };
      for (const s of t.signals) counts[s.signal as keyof typeof counts] += 1;
      let winningOption: string | null = null;
      if (t.electionId) {
        const res = await this.prisma.electionResult.findUnique({ where: { electionId: t.electionId } });
        const winners = (res?.winners as string[] | undefined) ?? [];
        const winnerId = winners[0];
        if (winners.length === 1 && winnerId) {
          winningOption = (await this.prisma.electionCandidate.findUnique({ where: { id: winnerId } }))?.title ?? null;
        }
      }
      result.push({
        id: t.id,
        title: t.title,
        communityName: t.group.name,
        kind: t.kind as unknown as PublicConsensus['kind'],
        conclusion: t.conclusion ?? '',
        objections: t.objections,
        signalCounts: counts,
        closedAt: (t.closedAt ?? new Date(0)).toISOString(),
        winningOption,
        approvedSolutions: [],
      });
    }
    return result;
  }
}
