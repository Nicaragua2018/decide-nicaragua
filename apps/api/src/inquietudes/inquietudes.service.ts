import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { InquietudDetail, InquietudStatusValue, InquietudSummary } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { ForumsService } from '../forums/forums.service';
import { DeliberationService } from '../deliberation/deliberation.service';

const DIA_MS = 86_400_000;
const ESTADOS_ABIERTOS = ['abierta', 'en_plazo'] as const;
const HIDDEN_TITLE = 'Inquietud oculta por moderación';

interface InquietudRow {
  id: string;
  groupId: string;
  authorProfileId: string;
  title: string;
  body: string;
  status: string;
  hidden: boolean;
  deadlineAt: Date | null;
  response: string | null;
  respondedAt: Date | null;
  proposalId: string | null;
  createdAt: Date;
  author: { displayName: string };
}

@Injectable()
export class InquietudesService {
  private readonly logger = new Logger(InquietudesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
    private readonly forums: ForumsService,
    private readonly deliberation: DeliberationService,
  ) {}

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

  /** max(mínimo de personas, ⌈porcentaje % × miembros⌉). */
  async threshold(groupId: string): Promise<number> {
    const [minPeople, pct, members] = await Promise.all([
      this.rules.getInt('inquietud.apoyo_minimo_personas', groupId),
      this.rules.getInt('inquietud.apoyo_minimo_porcentaje', groupId),
      this.prisma.groupMembership.count({ where: { groupId } }),
    ]);
    return Math.max(minPeople, Math.ceil((pct * members) / 100));
  }

  /** Solo cuentan los apoyos de quienes siguen siendo miembros del grupo. */
  private supportCount(inquietudId: string, groupId: string): Promise<number> {
    return this.prisma.inquietudApoyo.count({
      where: { inquietudId, profile: { memberships: { some: { groupId } } } },
    });
  }

  /** Consulta aparte solo por el apoyo de quien mira; nunca se lista a quienes apoyaron. */
  private async supportedBy(inquietudId: string, profileId: string): Promise<boolean> {
    const mine = await this.prisma.inquietudApoyo.findUnique({
      where: { inquietudId_profileId: { inquietudId, profileId } },
      select: { id: true },
    });
    return mine !== null;
  }

  private async summary(row: InquietudRow, viewerProfileId: string, threshold: number): Promise<InquietudSummary> {
    return {
      id: row.id,
      groupId: row.groupId,
      title: row.hidden ? HIDDEN_TITLE : row.title,
      status: row.status as InquietudStatusValue,
      hidden: row.hidden,
      supportCount: await this.supportCount(row.id, row.groupId),
      supportedByMe: await this.supportedBy(row.id, viewerProfileId),
      threshold,
      deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
      proposalId: row.proposalId,
      authorDisplayName: row.author.displayName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(
    profileId: string,
    dto: { groupId: string; title: string; body: string },
    ip: string,
  ): Promise<{ id: string }> {
    await this.requireMembership(dto.groupId, profileId);
    const created = await this.prisma.inquietud.create({
      data: { groupId: dto.groupId, authorProfileId: profileId, title: dto.title, body: dto.body },
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'inquietud.created',
      resource: `inquietud:${created.id}`,
      ip,
      metadata: { groupId: dto.groupId },
    });
    return { id: created.id };
  }

  async list(profileId: string, groupId: string): Promise<InquietudSummary[]> {
    await this.requireMembership(groupId, profileId);
    const rows = (await this.prisma.inquietud.findMany({
      where: { groupId },
      include: { author: { select: { displayName: true } } },
    })) as InquietudRow[];
    const threshold = await this.threshold(groupId);
    const result: InquietudSummary[] = [];
    for (const r of rows) result.push(await this.summary(r, profileId, threshold));
    return result.sort((a, b) => b.supportCount - a.supportCount || a.createdAt.localeCompare(b.createdAt));
  }

  async get(profileId: string, id: string): Promise<InquietudDetail> {
    const row = (await this.prisma.inquietud.findUnique({
      where: { id },
      include: { author: { select: { displayName: true } } },
    })) as InquietudRow | null;
    if (!row) throw new NotFoundException('Inquietud no encontrada');
    await this.requireMembership(row.groupId, profileId);
    const base = await this.summary(row, profileId, await this.threshold(row.groupId));
    const isAuthor = row.authorProfileId === profileId;

    let hiddenReason: string | null = null;
    let moderationId: string | null = null;
    if (row.hidden) {
      const action = await this.prisma.moderationAction.findFirst({
        where: { target: 'inquietud', targetId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, reason: true, status: true },
      });
      hiddenReason = action?.reason ?? null;
      if (action && isAuthor && (action.status as string) === 'oculto') moderationId = action.id;
    }

    return {
      ...base,
      body: row.hidden ? '' : row.body,
      response: row.hidden ? null : row.response,
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      canOrganize: await this.forums.canOrganize(profileId, row.groupId),
      isAuthor,
      hiddenReason,
      moderationId,
    };
  }

  async support(profileId: string, id: string, _ip: string): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({
      where: { id },
      select: { id: true, groupId: true, hidden: true },
    });
    if (!row) throw new NotFoundException('Inquietud no encontrada');
    await this.requireMembership(row.groupId, profileId);
    if (row.hidden) throw new BadRequestException('Esta inquietud está oculta por moderación.');
    await this.prisma.inquietudApoyo.upsert({
      where: { inquietudId_profileId: { inquietudId: id, profileId } },
      create: { inquietudId: id, profileId },
      update: {},
    });
    // Apoyar y retirar el apoyo no se audita: la hora exacta podría delatar a quien apoyó.
    await this.evaluateThreshold(id);
  }

  async unsupport(profileId: string, id: string, _ip: string): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({ where: { id }, select: { id: true, groupId: true } });
    if (!row) throw new NotFoundException('Inquietud no encontrada');
    await this.requireMembership(row.groupId, profileId);
    await this.prisma.inquietudApoyo.deleteMany({ where: { inquietudId: id, profileId } });
  }

  async evaluateThreshold(id: string): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({
      where: { id },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (!row || row.hidden || (row.status as string) !== 'abierta') return;
    const [count, threshold] = await Promise.all([this.supportCount(id, row.groupId), this.threshold(row.groupId)]);
    if (count < threshold) return;
    const days = await this.rules.getInt('inquietud.plazo_respuesta_dias', row.groupId);
    const now = new Date();
    const res = await this.prisma.inquietud.updateMany({
      where: { id, status: 'abierta', hidden: false, thresholdReachedAt: null },
      data: { status: 'en_plazo', thresholdReachedAt: now, deadlineAt: new Date(now.getTime() + days * DIA_MS) },
    });
    if (res.count > 0) {
      void this.audit.log({
        action: 'inquietud.threshold_reached',
        resource: `inquietud:${id}`,
        metadata: { inquietudId: id },
      });
    }
  }
  private async requireOrganizer(profileId: string, groupId: string): Promise<void> {
    if (!(await this.forums.canOrganize(profileId, groupId))) {
      throw new ForbiddenException('Solo quien organiza la agenda puede hacer esto.');
    }
  }

  /** Inquietudes que la mesa debe atender: en plazo, o abiertas con al menos un apoyo. */
  async agenda(profileId: string): Promise<InquietudSummary[]> {
    // Con la regla actual (mesa directiva) organizar no depende de la comunidad.
    if (!(await this.forums.canOrganize(profileId, ''))) {
      throw new ForbiddenException('Solo quien organiza la agenda puede verla.');
    }
    const rows = (await this.prisma.inquietud.findMany({
      where: {
        hidden: false,
        OR: [{ status: 'en_plazo' }, { status: 'abierta', apoyos: { some: {} } }],
      },
      include: { author: { select: { displayName: true } } },
    })) as InquietudRow[];
    const organiza = new Map<string, boolean>();
    const thresholds = new Map<string, number>();
    const result: InquietudSummary[] = [];
    for (const r of rows) {
      if (!organiza.has(r.groupId)) organiza.set(r.groupId, await this.forums.canOrganize(profileId, r.groupId));
      if (!organiza.get(r.groupId)) continue;
      if (!thresholds.has(r.groupId)) thresholds.set(r.groupId, await this.threshold(r.groupId));
      const s = await this.summary(r, profileId, thresholds.get(r.groupId) ?? 0);
      if (s.status === 'abierta' && s.supportCount < 1) continue;
      result.push(s);
    }
    return result.sort((a, b) => {
      if (a.deadlineAt === b.deadlineAt) return 0;
      if (a.deadlineAt === null) return 1;
      if (b.deadlineAt === null) return -1;
      return a.deadlineAt.localeCompare(b.deadlineAt);
    });
  }

  async openDebate(
    profileId: string,
    dto: { groupId: string; inquietudIds: string[]; title: string; body: string },
    ip: string,
  ): Promise<{ proposalId: string }> {
    await this.requireOrganizer(profileId, dto.groupId);
    const ids = [...new Set(dto.inquietudIds)];
    const rows = await this.prisma.inquietud.findMany({
      where: { id: { in: ids } },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (rows.length !== ids.length) throw new BadRequestException('Alguna inquietud no existe.');
    if (rows.some((r) => r.groupId !== dto.groupId)) {
      throw new BadRequestException('Todas las inquietudes deben ser de la misma comunidad.');
    }
    if (rows.some((r) => r.hidden || !(ESTADOS_ABIERTOS as readonly string[]).includes(r.status as string))) {
      throw new BadRequestException('Solo se pueden juntar inquietudes abiertas o en plazo.');
    }

    const proposalId = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inquietud.updateMany({
        where: { id: { in: ids }, groupId: dto.groupId, hidden: false, status: { in: [...ESTADOS_ABIERTOS] } },
        data: { status: 'en_debate' },
      });
      if (res.count !== ids.length) throw new ConflictException('Alguna inquietud ya cambió de estado.');
      const topic = await this.deliberation.createTopicInDefaultForum(tx, {
        groupId: dto.groupId,
        authorProfileId: profileId,
        title: dto.title,
        body: dto.body,
        abiertoPorComunidad: false,
      });
      await tx.inquietud.updateMany({ where: { id: { in: ids } }, data: { proposalId: topic.id } });
      return topic.id;
    });

    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'inquietud.debate_opened',
      resource: `proposal:${proposalId}`,
      ip,
      metadata: { proposalId, count: ids.length },
    });
    return { proposalId };
  }

  async respond(profileId: string, id: string, text: string, ip: string): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({
      where: { id },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (!row) throw new NotFoundException('Inquietud no encontrada');
    await this.requireOrganizer(profileId, row.groupId);
    if (row.hidden || !(ESTADOS_ABIERTOS as readonly string[]).includes(row.status as string)) {
      throw new BadRequestException('Esta inquietud ya no admite respuesta.');
    }
    const res = await this.prisma.inquietud.updateMany({
      where: { id, hidden: false, status: { in: [...ESTADOS_ABIERTOS] } },
      data: { status: 'respondida', response: text, respondedAt: new Date(), respondedByProfileId: profileId },
    });
    if (res.count === 0) throw new ConflictException('Esta inquietud ya cambió de estado.');
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'inquietud.responded',
      resource: `inquietud:${id}`,
      ip,
      metadata: { inquietudId: id },
    });
  }

  /** Abre como debate las inquietudes en plazo vencido sin respuesta. Devuelve cuántas abrió. */
  async processDeadlines(now: Date): Promise<number> {
    const due = await this.prisma.inquietud.findMany({
      where: { status: 'en_plazo', hidden: false, deadlineAt: { lte: now } },
      select: { id: true, groupId: true, authorProfileId: true, title: true, body: true },
    });
    let opened = 0;
    for (const i of due) {
      try {
        const proposalId = await this.prisma.$transaction(async (tx) => {
          const res = await tx.inquietud.updateMany({
            where: { id: i.id, status: 'en_plazo', hidden: false, deadlineAt: { lte: now } },
            data: { status: 'abierta_por_la_comunidad' },
          });
          if (res.count !== 1) return null;
          const topic = await this.deliberation.createTopicInDefaultForum(tx, {
            groupId: i.groupId,
            authorProfileId: i.authorProfileId,
            title: i.title,
            body: i.body,
            abiertoPorComunidad: true,
          });
          await tx.inquietud.updateMany({ where: { id: i.id }, data: { proposalId: topic.id } });
          return topic.id;
        });
        if (!proposalId) continue;
        opened += 1;
        void this.audit.log({
          action: 'inquietud.opened_by_community',
          resource: `inquietud:${i.id}`,
          metadata: { inquietudId: i.id, proposalId },
        });
      } catch (err) {
        this.logger.error(`No se pudo abrir la inquietud ${i.id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return opened;
  }
}
