/**
 * Unit tests de AuthService.
 *
 * Estrategia:
 * - Instanciación directa (new AuthService(...)) en lugar de Test.createTestingModule.
 *   Esto evita dependencia de reflect-metadata + DI de NestJS en unit tests.
 * - vi.mock('bcrypt') reemplaza el módulo antes de que cualquier import lo use.
 * - Cada test configura solo lo que necesita; vi.resetAllMocks() limpia entre tests.
 */

// reflect-metadata debe cargarse antes que cualquier decorador de NestJS
import 'reflect-metadata';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// vi.mock es hoisted por Vitest antes de los imports — bcrypt queda reemplazado
// en auth.service.ts cuando este módulo se carga.
vi.mock('bcrypt', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AccountStatus } from '@decide/shared';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = '00000000-0000-4000-a000-000000000001';
const INVITE_TOKEN = '00000000-0000-4000-a000-000000000002';

const baseUser = {
  id: USER_ID,
  email: 'test@example.com',
  passwordHash: '$2b$12$mockedHashValue',
  status: AccountStatus.verified_citizen,
  invitedById: null,
  inviteToken: null,
  inviteExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  profile: {
    id: 'profile-id',
    userId: USER_ID,
    displayName: 'Test User',
    birthDepartment: null,
    currentCountry: null,
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const invitedUser = {
  ...baseUser,
  status: AccountStatus.invited,
  passwordHash: null,
  inviteToken: INVITE_TOKEN,
  inviteExpiresAt: new Date(Date.now() + 3_600_000), // +1h
};

// ─── Mocks (module-level para poder referenciarlos en los tests) ──────────────

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  profile: {
    create: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

const redisMock = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

const emailMock = {
  sendInvite: vi.fn(),
};

const auditMock = {
  log: vi.fn(),
};

const jwtMock = {
  sign: vi.fn(),
};

const configMock = {
  get: vi.fn(),
  getOrThrow: vi.fn(),
};

const groupsMock = {
  syncMemberships: vi.fn(),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    // Resetea implementaciones y llamadas de todos los mocks
    vi.resetAllMocks();

    // Implementaciones por defecto (las que no cambia cada test)
    redisMock.set.mockResolvedValue('OK');
    redisMock.del.mockResolvedValue(1);
    emailMock.sendInvite.mockResolvedValue(undefined);
    auditMock.log.mockResolvedValue(undefined);
    jwtMock.sign.mockReturnValue('signed.jwt.token');
    prismaMock.auditEvent.create.mockResolvedValue({});
    prismaMock.$transaction.mockResolvedValue([baseUser, {}]);

    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$newHashedPassword' as never);

    configMock.get.mockImplementation((key: string) => {
      const cfg: Record<string, string> = {
        NODE_ENV: 'test',
        IP_HASH_SALT: 'test-salt',
      };
      return cfg[key];
    });

    configMock.getOrThrow.mockImplementation((key: string) => {
      const cfg: Record<string, string> = {
        APP_URL: 'http://localhost:3000',
        IP_HASH_SALT: 'test-salt',
      };
      const value = cfg[key];
      if (value === undefined) throw new Error(`Config key missing: ${key}`);
      return value;
    });

    // Instanciación directa — sin NestJS DI, sin reflect-metadata en runtime
    groupsMock.syncMemberships.mockResolvedValue(undefined);
    service = new AuthService(
      prismaMock as unknown as PrismaService,
      redisMock as unknown as RedisService,
      jwtMock as unknown as JwtService,
      emailMock as unknown as EmailService,
      auditMock as unknown as AuditService,
      configMock as unknown as ConfigService,
      groupsMock as never,
    );
  });

  // ─── inviteUser ─────────────────────────────────────────────────────────────

  describe('inviteUser', () => {
    const dto = { email: 'nuevo@example.com' };
    const ip = '127.0.0.1';

    it('crea usuario con status invited y envía email de invitación', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({ ...baseUser, email: dto.email });

      await service.inviteUser(dto, USER_ID, ip);

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: dto.email,
            status: AccountStatus.invited,
            invitedById: USER_ID,
          }) as unknown,
        }),
      );
      expect(emailMock.sendInvite).toHaveBeenCalledOnce();
      expect(emailMock.sendInvite).toHaveBeenCalledWith(
        expect.objectContaining({ to: dto.email }) as unknown,
      );
    });

    it('la URL de invitación apunta al endpoint de accept-invite', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({ ...baseUser, email: dto.email, inviteToken: INVITE_TOKEN });

      await service.inviteUser(dto, USER_ID, ip);

      const arg = emailMock.sendInvite.mock.calls[0]?.[0] as { inviteUrl: string };
      expect(arg.inviteUrl).toContain('http://localhost:3000');
      expect(arg.inviteUrl).toContain('accept-invite?token=');
    });

    it('lanza ConflictException si el email ya está registrado', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);

      await expect(service.inviteUser(dto, USER_ID, ip)).rejects.toThrow(ConflictException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(emailMock.sendInvite).not.toHaveBeenCalled();
    });
  });

  // ─── acceptInvite ────────────────────────────────────────────────────────────

  describe('acceptInvite', () => {
    const dto = {
      token: INVITE_TOKEN,
      password: 'contraseña-segura-12345',
      displayName: 'Nuevo Usuario',
      birthDepartment: 'Managua',
      currentCountry: 'CR',
    };
    const ip = '127.0.0.1';

    it('actualiza usuario a pending_verification y crea el perfil en una transacción', async () => {
      prismaMock.user.findUnique.mockResolvedValue(invitedUser);

      await service.acceptInvite(dto, ip);

      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    });

    it('lanza BadRequestException si el token no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvite(dto, ip)).rejects.toThrow(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si el token está expirado', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...invitedUser,
        inviteExpiresAt: new Date(Date.now() - 1000), // 1s en el pasado
      });

      await expect(service.acceptInvite(dto, ip)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si la invitación ya fue usada', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...invitedUser,
        status: AccountStatus.pending_verification,
      });

      await expect(service.acceptInvite(dto, ip)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: baseUser.email, password: 'correcta-password' };
    const ip = '127.0.0.1';

    it('devuelve tokens y datos del usuario con credenciales correctas', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      prismaMock.user.update.mockResolvedValue(baseUser);

      const result = await service.login(dto, ip);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshTokenId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.user.email).toBe(baseUser.email);
      expect(result.user.status).toBe(AccountStatus.verified_citizen);
    });

    it('almacena el refresh token en Redis con TTL de 30 días', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      prismaMock.user.update.mockResolvedValue(baseUser);

      const result = await service.login(dto, ip);

      expect(redisMock.set).toHaveBeenCalledWith(
        `rt:${result.refreshTokenId}`,
        USER_ID,
        30 * 24 * 60 * 60,
      );
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.login(dto, ip)).rejects.toThrow(UnauthorizedException);
    });

    it('llama a bcrypt.compare aunque el usuario no exista (mitiga timing attacks)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.login(dto, ip)).rejects.toThrow(UnauthorizedException);

      // La mitigación consiste en que siempre se llama bcrypt.compare,
      // independientemente de si el usuario existe, para igualar tiempos de respuesta.
      expect(bcrypt.compare).toHaveBeenCalledOnce();
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.login(dto, ip)).rejects.toThrow(UnauthorizedException);
    });

    it('el mensaje de error es idéntico para email inexistente y contraseña incorrecta', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      prismaMock.user.findUnique.mockResolvedValue(null);
      let msgA = '';
      await service.login(dto, ip).catch((e: unknown) => { msgA = (e as Error).message; });

      prismaMock.user.findUnique.mockResolvedValue(baseUser);
      let msgB = '';
      await service.login(dto, ip).catch((e: unknown) => { msgB = (e as Error).message; });

      expect(msgA).toBe(msgB);
    });

    it('lanza ForbiddenException si la cuenta está en pending_verification', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        status: AccountStatus.pending_verification,
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(service.login(dto, ip)).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException si la cuenta está suspendida', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        status: AccountStatus.suspended,
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(service.login(dto, ip)).rejects.toThrow(ForbiddenException);
    });

    it('permite login a observer y external_collaborator', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      prismaMock.user.update.mockResolvedValue(baseUser);

      for (const status of [AccountStatus.observer, AccountStatus.external_collaborator]) {
        prismaMock.user.findUnique.mockResolvedValue({ ...baseUser, status });
        const result = await service.login(dto, ip);
        expect(result.user.status).toBe(status);
      }
    });

    it('registra evento de auditoría en login exitoso', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      prismaMock.user.update.mockResolvedValue(baseUser);

      await service.login(dto, ip);
      await Promise.resolve(); // esperar el fire-and-forget

      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.login', actorId: USER_ID }) as unknown,
      );
    });

    it('registra evento de auditoría en login fallido', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await service.login(dto, ip).catch(() => undefined);
      await Promise.resolve();

      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.login_failed' }) as unknown,
      );
    });
  });

  // ─── refreshTokens ────────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const ip = '127.0.0.1';

    it('rota los tokens: elimina el anterior y crea uno nuevo en Redis', async () => {
      redisMock.get.mockResolvedValue(USER_ID);
      prismaMock.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.refreshTokens(INVITE_TOKEN, ip);

      // El nuevo refreshTokenId es diferente al anterior
      expect(result.refreshTokenId).not.toBe(INVITE_TOKEN);

      // El token anterior fue eliminado
      expect(redisMock.del).toHaveBeenCalledWith(`rt:${INVITE_TOKEN}`);

      // El nuevo token fue almacenado
      expect(redisMock.set).toHaveBeenCalledWith(
        `rt:${result.refreshTokenId}`,
        USER_ID,
        30 * 24 * 60 * 60,
      );
    });

    it('devuelve un nuevo access token firmado', async () => {
      redisMock.get.mockResolvedValue(USER_ID);
      prismaMock.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.refreshTokens(INVITE_TOKEN, ip);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(jwtMock.sign).toHaveBeenCalledOnce();
    });

    it('lanza UnauthorizedException si el token no existe en Redis', async () => {
      redisMock.get.mockResolvedValue(null);

      await expect(service.refreshTokens(INVITE_TOKEN, ip)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(redisMock.del).not.toHaveBeenCalled();
    });

    it('revoca el token y lanza UnauthorizedException si el usuario está suspendido', async () => {
      redisMock.get.mockResolvedValue(USER_ID);
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        status: AccountStatus.suspended,
      });

      await expect(service.refreshTokens(INVITE_TOKEN, ip)).rejects.toThrow(
        UnauthorizedException,
      );

      // El token debe ser revocado aunque el usuario no sea válido
      expect(redisMock.del).toHaveBeenCalledWith(`rt:${INVITE_TOKEN}`);
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────────

  describe('logout', () => {
    const ip = '127.0.0.1';

    it('elimina el refresh token de Redis', async () => {
      await service.logout(USER_ID, INVITE_TOKEN, ip);

      expect(redisMock.del).toHaveBeenCalledWith(`rt:${INVITE_TOKEN}`);
    });

    it('funciona sin refresh token (sesión expirada o cookie ya borrada)', async () => {
      await expect(service.logout(USER_ID, undefined, ip)).resolves.not.toThrow();
      expect(redisMock.del).not.toHaveBeenCalled();
    });

    it('registra evento de auditoría', async () => {
      await service.logout(USER_ID, INVITE_TOKEN, ip);
      await Promise.resolve();

      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: 'user.logout',
        }) as unknown,
      );
    });
  });
});
