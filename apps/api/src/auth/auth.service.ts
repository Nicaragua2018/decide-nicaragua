import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';
import {
  AccountStatus,
  ACTIVE_STATUSES,
  INVITE_TOKEN_TTL_HOURS,
  type JwtPayload,
  type AuthResponse,
} from '@decide/shared';

/** Duración del refresh token en segundos (30 días) */
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Prefijo de clave en Redis para refresh tokens */
const RT_PREFIX = 'rt:';

/** Bcrypt cost factor — no bajar de 12 en producción */
const BCRYPT_ROUNDS = 12;

export interface LoginResult {
  user: AuthResponse['user'];
  accessToken: string;
  refreshTokenId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly groups: GroupsService,
  ) {}

  // ─── Invitación ────────────────────────────────────────────────────────────

  /**
   * Crea un usuario en estado 'invited' y envía el email de invitación.
   * Solo los ciudadanos verificados pueden invitar (enforzado en el controller).
   *
   * En entornos que no sean producción, si el email falla el proceso no se
   * interrumpe: se registra el error y se devuelve la URL para uso manual.
   */
  async inviteUser(
    dto: InviteUserDto,
    actorId: string,
    ip: string,
  ): Promise<{ inviteUrl: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      // No revelar si el email existe o no — mismo mensaje genérico
      throw new ConflictException('An account with this email already exists');
    }

    const inviteToken = randomUUID();
    const inviteExpiresAt = new Date(
      Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        status: AccountStatus.invited as string as never,
        invitedById: actorId,
        inviteToken,
        inviteExpiresAt,
      },
    });

    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const inviteUrl = `${appUrl}/invite/${inviteToken}`;
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    try {
      await this.email.sendInvite({ to: dto.email, inviteUrl });
    } catch (err: unknown) {
      if (isProduction) throw err;
      // En desarrollo: loguear prominentemente para uso manual
      this.logger.warn(
        `[DEV] Email no enviado. Link de invitación manual:\n  ${inviteUrl}`,
      );
    }

    void this.audit
      .log({
        actorId,
        action: 'user.invited',
        resource: `user:${user.id}`,
        ip,
        metadata: { invitedEmail: dto.email },
      })
      .catch((err: unknown) => this.logger.error('Audit log failed', err));

    return { inviteUrl };
  }

  // ─── Aceptar invitación ─────────────────────────────────────────────────────

  /**
   * El usuario acepta la invitación: establece contraseña y crea su perfil.
   * El estado queda en 'pending_verification' hasta revisión manual.
   */
  async acceptInvite(dto: AcceptInviteDto, ip: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { inviteToken: dto.token },
    });

    if (!user || !user.inviteExpiresAt || user.inviteExpiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    if ((user.status as string) !== AccountStatus.invited) {
      throw new BadRequestException('Invitation has already been used');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: AccountStatus.pending_verification as string as never,
          inviteToken: null,
          inviteExpiresAt: null,
        },
      }),
      this.prisma.profile.create({
        data: {
          userId: user.id,
          displayName: dto.displayName,
          birthDepartment: dto.birthDepartment ?? null,
          currentCountry: dto.currentCountry ?? null,
        },
      }),
    ]);

    // Sincronizar membresías de grupos (idempotente, no bloquea el flujo)
    void this.groups
      .syncMemberships(user.id, dto.birthDepartment ?? null, dto.currentCountry ?? null)
      .catch((err: unknown) => this.logger.error('Group sync failed after registration', err));

    void this.audit
      .log({
        action: 'user.registered',
        resource: `user:${user.id}`,
        ip,
      })
      .catch((err: unknown) => this.logger.error('Audit log failed', err));
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ip: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { profile: true },
    });

    // Misma duración de respuesta independientemente de si el usuario existe.
    // bcrypt.compare con hash falso previene timing attacks en la rama de "no encontrado".
    const DUMMY_HASH = '$2b$12$invalidhashusedfortimingattackprevention000000000000000';
    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const passwordValid = await bcrypt.compare(dto.password, passwordHash);

    if (!user || !user.passwordHash || !passwordValid) {
      void this.audit
        .log({
          action: 'user.login_failed',
          ip,
          metadata: { email: dto.email },
        })
        .catch((err: unknown) => this.logger.error('Audit log failed', err));

      throw new UnauthorizedException('Invalid credentials');
    }

    const status = user.status as unknown as AccountStatus;

    if (!ACTIVE_STATUSES.includes(status)) {
      throw new ForbiddenException(`Account not active (status: ${user.status as string})`);
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      status,
      ...(user.profile?.id ? { profileId: user.profile.id } : {}),
    };

    const accessToken = this.jwt.sign(payload);
    const refreshTokenId = randomUUID();

    await this.redis.set(
      `${RT_PREFIX}${refreshTokenId}`,
      user.id,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    void this.audit
      .log({
        actorId: user.id,
        action: 'user.login',
        resource: `user:${user.id}`,
        ip,
      })
      .catch((err: unknown) => this.logger.error('Audit log failed', err));

    return {
      user: {
        id: user.id,
        email: user.email,
        status,
        displayName: user.profile?.displayName ?? null,
      },
      accessToken,
      refreshTokenId,
    };
  }

  // ─── Refresh ────────────────────────────────────────────────────────────────

  /**
   * Rota ambos tokens. El refresh token anterior se invalida inmediatamente.
   * Si el token no existe en Redis, la sesión ha expirado o fue revocada.
   */
  async refreshTokens(refreshTokenId: string, ip: string): Promise<LoginResult> {
    const userId = await this.redis.get(`${RT_PREFIX}${refreshTokenId}`);

    if (!userId) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    const status = user?.status as unknown as AccountStatus | undefined;

    if (!user || !status || !ACTIVE_STATUSES.includes(status)) {
      // Revocar el token aunque el usuario no sea válido
      await this.redis.del(`${RT_PREFIX}${refreshTokenId}`);
      throw new UnauthorizedException('Session invalid');
    }

    // Rotación: eliminar el anterior, crear uno nuevo
    await this.redis.del(`${RT_PREFIX}${refreshTokenId}`);
    const newRefreshTokenId = randomUUID();
    await this.redis.set(
      `${RT_PREFIX}${newRefreshTokenId}`,
      user.id,
      REFRESH_TOKEN_TTL_SECONDS,
    );

    const payload: JwtPayload = { sub: user.id, email: user.email, status };
    const accessToken = this.jwt.sign(payload);

    void this.audit
      .log({
        actorId: user.id,
        action: 'user.token_refreshed',
        resource: `user:${user.id}`,
        ip,
      })
      .catch((err: unknown) => this.logger.error('Audit log failed', err));

    return {
      user: {
        id: user.id,
        email: user.email,
        status,
        displayName: user.profile?.displayName ?? null,
      },
      accessToken,
      refreshTokenId: newRefreshTokenId,
    };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async logout(userId: string, refreshTokenId: string | undefined, ip: string): Promise<void> {
    if (refreshTokenId) {
      await this.redis.del(`${RT_PREFIX}${refreshTokenId}`);
    }

    void this.audit
      .log({
        actorId: userId,
        action: 'user.logout',
        resource: `user:${userId}`,
        ip,
      })
      .catch((err: unknown) => this.logger.error('Audit log failed', err));
  }
}
