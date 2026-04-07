import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountStatus } from '@decide/shared';
import type { UserSummary, UserListResponse } from '@decide/shared';
import type { User, Profile } from '@prisma/client';

export type UserWithProfile = User & { profile: Profile | null };

/** Estados a los que se puede transicionar desde el panel de admin */
const ALLOWED_STATUS_TRANSITIONS: Partial<Record<AccountStatus, AccountStatus[]>> = {
  [AccountStatus.invited]:               [AccountStatus.rejected],
  [AccountStatus.pending_verification]:  [
    AccountStatus.verified_citizen,
    AccountStatus.observer,
    AccountStatus.external_collaborator,
    AccountStatus.rejected,
  ],
  [AccountStatus.verified_citizen]:      [AccountStatus.suspended],
  [AccountStatus.observer]:              [AccountStatus.verified_citizen, AccountStatus.suspended],
  [AccountStatus.external_collaborator]: [AccountStatus.verified_citizen, AccountStatus.suspended],
  [AccountStatus.suspended]:             [AccountStatus.observer, AccountStatus.verified_citizen],
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserWithProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException(`User not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByEmailWithProfile(email: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  /**
   * Lista todos los usuarios con su perfil.
   * Filtrables por status. Ordenados por fecha de creación descendente.
   */
  async listUsers(statusFilter?: AccountStatus): Promise<UserListResponse> {
    const whereClause = statusFilter ? { where: { status: statusFilter } } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        ...whereClause,
        orderBy: { createdAt: 'desc' },
        include: { profile: true },
      }),
      this.prisma.user.count(whereClause),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        status: u.status as AccountStatus,
        displayName: u.profile?.displayName ?? null,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      total,
    };
  }

  /**
   * Cambia el estado de un usuario.
   * Valida que la transición sea permitida según el flujo del ciclo de vida.
   */
  async updateStatus(userId: string, newStatus: AccountStatus): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException(`User not found`);
    }

    const currentStatus = user.status as AccountStatus;
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transition from '${currentStatus}' to '${newStatus}' is not allowed`,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
      select: {
        id: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { displayName: true } },
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      status: updated.status as AccountStatus,
      displayName: updated.profile?.displayName ?? null,
      createdAt: updated.createdAt.toISOString(),
      lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    };
  }
}
