import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { InquietudDetail, InquietudStatusValue, InquietudSummary } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';

const DIA_MS = 86_400_000;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
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
      canOrganize: false, // Task 5 lo completa con ForumsService.canOrganize.
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
}
