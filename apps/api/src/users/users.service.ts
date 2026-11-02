import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccountStatus } from '@decide/shared';
import type { UserSummary, UserListResponse } from '@decide/shared';
import type { User, Profile } from '@prisma/client';

export type UserWithProfile = User & { profile: Profile | null };

/**
 * Lo único que el panel de usuarios puede hacer (spec §3): rechazar a quien
 * aún no está verificado. Verificar va por dos referencias; suspender,
 * reactivar o dar estatus de observador o colaborador externo son decisiones
 * de la mesa (2 de 3) o de una elección.
 */
const ALLOWED_STATUS_TRANSITIONS: Partial<Record<AccountStatus, AccountStatus[]>> = {
  [AccountStatus.invited]:              [AccountStatus.rejected],
  [AccountStatus.pending_verification]: [AccountStatus.rejected],
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        ...(statusFilter ? { where: { status: statusFilter } } : {}),
        orderBy: { createdAt: 'desc' },
        include: { profile: true },
      }),
      this.prisma.user.count(
        statusFilter ? { where: { status: statusFilter } } : undefined,
      ),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        status: u.status as AccountStatus,
        displayName: u.profile?.displayName ?? null,
        profileId: u.profile?.id ?? null,
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
  async updateStatus(userId: string, newStatus: AccountStatus, actorId: string, ip: string): Promise<UserSummary> {
    if (newStatus === AccountStatus.verified_citizen) {
      throw new BadRequestException('La verificación se hace con dos referencias, no desde el panel.');
    }
    if (newStatus === AccountStatus.suspended) {
      throw new BadRequestException('Suspender una cuenta requiere la aprobación de 2 de los 3 cargos de la mesa.');
    }

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
        'Desde el panel solo se puede rechazar una cuenta invitada o pendiente de verificación. ' +
          'Cualquier otro cambio necesita una decisión de la mesa directiva (2 de 3) o una elección.',
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
        profile: { select: { id: true, displayName: true } },
      },
    });

    void this.audit.log({
      actorId,
      action: 'user.status_changed',
      resource: `user:${userId}`,
      ip,
      metadata: { from: currentStatus, to: newStatus },
    });

    return {
      id: updated.id,
      email: updated.email,
      status: updated.status as AccountStatus,
      displayName: updated.profile?.displayName ?? null,
      profileId: updated.profile?.id ?? null,
      createdAt: updated.createdAt.toISOString(),
      lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    };
  }
}
