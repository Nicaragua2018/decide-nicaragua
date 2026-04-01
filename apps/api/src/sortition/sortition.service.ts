import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SortitionStatus } from '@decide/shared';
import type {
  SortitionDrawSummary,
  SortitionDrawDetail,
  SortitionListResponse,
  SortitionVerificationResult,
  SortitionMemberItem,
} from '@decide/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  generateSeed,
  sortPool,
  selectMembers,
  verifySelection,
  ALGORITHM_VERSION,
} from './sortition-algorithm';
import { CreateDrawDto } from './dto/create-draw.dto';

@Injectable()
export class SortitionService {
  private readonly logger = new Logger(SortitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Draws ────────────────────────────────────────────────────────────────

  async createDraw(
    groupId: string,
    dto: CreateDrawDto,
    profileId: string,
    ip: string,
  ): Promise<{ id: string }> {
    await this.requireMembership(groupId, profileId);

    const draw = await this.prisma.sortitionDraw.create({
      data: {
        groupId,
        createdByProfileId: profileId,
        title: dto.title,
        selectionSize: dto.selectionSize,
        ...(dto.description ? { description: dto.description } : {}),
      },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({
          ...base,
          action: 'sortition.draw_created',
          resource: `sortition_draw:${draw.id}`,
          ip,
          metadata: { groupId, title: dto.title, selectionSize: dto.selectionSize },
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );

    return { id: draw.id };
  }

  async listGroupDraws(groupId: string, profileId: string): Promise<SortitionListResponse> {
    await this.requireMembership(groupId, profileId);

    const draws = await this.prisma.sortitionDraw.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });

    return { draws: draws.map(toSummary) };
  }

  async getDrawById(drawId: string, profileId: string): Promise<SortitionDrawDetail> {
    const draw = await this.prisma.sortitionDraw.findUnique({
      where: { id: drawId },
      include: {
        selectedMembers: {
          include: { profile: { select: { displayName: true } } },
          orderBy: { selectionOrder: 'asc' },
        },
      },
    });

    if (!draw) throw new NotFoundException('Sortition draw not found');

    await this.requireMembership(draw.groupId, profileId);

    const selectedMembers: SortitionMemberItem[] = draw.selectedMembers.map((m) => ({
      profileId: m.profileId,
      displayName: m.profile.displayName,
      selectionOrder: m.selectionOrder,
    }));

    const poolSnapshot = draw.poolSnapshot as string[] | null;

    return {
      id: draw.id,
      groupId: draw.groupId,
      title: draw.title,
      description: draw.description,
      status: draw.status as unknown as SortitionStatus,
      selectionSize: draw.selectionSize,
      seed: draw.seed,
      algorithm: draw.algorithm,
      poolSize: poolSnapshot ? poolSnapshot.length : null,
      executedAt: draw.executedAt?.toISOString() ?? null,
      createdAt: draw.createdAt.toISOString(),
      selectedMembers,
    };
  }

  // ─── Execute ──────────────────────────────────────────────────────────────

  async executeDraw(drawId: string, profileId: string, ip: string): Promise<void> {
    const draw = await this.prisma.sortitionDraw.findUnique({ where: { id: drawId } });

    if (!draw) throw new NotFoundException('Sortition draw not found');
    if (draw.createdByProfileId !== profileId) {
      throw new ForbiddenException('Only the creator can execute this draw');
    }
    if ((draw.status as string) !== SortitionStatus.pending) {
      throw new BadRequestException('Only pending draws can be executed');
    }

    // Capturar el pool — todos los perfiles actuales del grupo
    const memberships = await this.prisma.groupMembership.findMany({
      where: { groupId: draw.groupId },
      select: { profileId: true },
    });

    const rawPool = memberships.map((m) => m.profileId);
    const pool = sortPool(rawPool); // orden canónico: lexicográfico ASC

    if (pool.length === 0) {
      throw new BadRequestException('The group has no members to draw from');
    }

    const seed = generateSeed();
    const selectedIds = selectMembers(pool, draw.selectionSize, seed);
    const executedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.sortitionDraw.update({
        where: { id: drawId },
        data: {
          status: SortitionStatus.completed as string as never,
          seed,
          algorithm: ALGORITHM_VERSION,
          poolSnapshot: pool as Prisma.InputJsonValue,
          executedAt,
        },
      });

      for (const [i, selectedProfileId] of selectedIds.entries()) {
        await tx.sortitionMember.create({
          data: {
            drawId,
            profileId: selectedProfileId,
            selectionOrder: i + 1,
          },
        });
      }
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({
          ...base,
          action: 'sortition.draw_executed',
          resource: `sortition_draw:${drawId}`,
          ip,
          metadata: {
            poolSize: pool.length,
            selectionSize: draw.selectionSize,
            actualSelected: selectedIds.length,
            seed,
          },
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  async cancelDraw(drawId: string, profileId: string, ip: string): Promise<void> {
    const draw = await this.prisma.sortitionDraw.findUnique({ where: { id: drawId } });

    if (!draw) throw new NotFoundException('Sortition draw not found');
    if (draw.createdByProfileId !== profileId) {
      throw new ForbiddenException('Only the creator can cancel this draw');
    }
    if ((draw.status as string) !== SortitionStatus.pending) {
      throw new BadRequestException('Only pending draws can be cancelled');
    }

    await this.prisma.sortitionDraw.update({
      where: { id: drawId },
      data: { status: SortitionStatus.cancelled as string as never },
    });

    void this.auditBase(profileId).then((base) =>
      this.audit
        .log({
          ...base,
          action: 'sortition.draw_cancelled',
          resource: `sortition_draw:${drawId}`,
          ip,
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err)),
    );
  }

  // ─── Verify ───────────────────────────────────────────────────────────────

  /**
   * Verifica el resultado de un sorteo completado recomputando el algoritmo.
   * Cualquier miembro del grupo puede verificar independientemente.
   */
  async verifyDraw(drawId: string, profileId: string): Promise<SortitionVerificationResult> {
    const draw = await this.prisma.sortitionDraw.findUnique({
      where: { id: drawId },
      include: {
        selectedMembers: { orderBy: { selectionOrder: 'asc' } },
      },
    });

    if (!draw) throw new NotFoundException('Sortition draw not found');
    if ((draw.status as string) !== SortitionStatus.completed) {
      throw new BadRequestException('Only completed draws can be verified');
    }

    await this.requireMembership(draw.groupId, profileId);

    const pool = draw.poolSnapshot as string[];
    const storedIds = draw.selectedMembers.map((m) => m.profileId);
    const seed = draw.seed!;
    const algorithm = draw.algorithm!;

    const recomputedIds = selectMembers(pool, draw.selectionSize, seed);
    const verified = verifySelection(pool, draw.selectionSize, seed, storedIds);

    return {
      verified,
      seed,
      algorithm,
      poolSize: pool.length,
      selectionSize: draw.selectionSize,
      storedIds,
      recomputedIds,
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
      // silenciar — fire-and-forget
    }
    return {};
  }
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function toSummary(draw: {
  id: string;
  groupId: string;
  title: string;
  status: string;
  selectionSize: number;
  createdAt: Date;
  executedAt: Date | null;
}): SortitionDrawSummary {
  return {
    id: draw.id,
    groupId: draw.groupId,
    title: draw.title,
    status: draw.status as unknown as SortitionStatus,
    selectionSize: draw.selectionSize,
    createdAt: draw.createdAt.toISOString(),
    executedAt: draw.executedAt?.toISOString() ?? null,
  };
}
