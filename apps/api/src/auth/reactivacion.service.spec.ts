import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { ReactivacionService } from './reactivacion.service';
import { JwtStrategy } from './strategies/jwt.strategy';

const SECRETO = 'secreto-de-prueba';
const USER_ID = '00000000-0000-4000-a000-000000000001';
const NOW = new Date('2026-11-20T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;

function buildPrisma() {
  return {
    user: { findUnique: vi.fn() },
    boardAction: { findFirst: vi.fn().mockResolvedValue(null) },
    solicitudReactivacion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
  };
}

const suspendida = { id: USER_ID, status: 'suspended', updatedAt: new Date('2026-11-01T00:00:00Z') };

describe('ReactivacionService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let jwt: JwtService;
  let service: ReactivacionService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    jwt = new JwtService({ secret: SECRETO, signOptions: { expiresIn: '15m' } });
    service = new ReactivacionService(prisma as never, jwt, audit as never);
    prisma.user.findUnique.mockResolvedValue(suspendida);
  });

  describe('token', () => {
    it('firma un JWT con el propósito de reactivación que dura 30 minutos', () => {
      const token = service.firmarToken(USER_ID);
      const payload = jwt.verify<{ sub: string; proposito: string; iat: number; exp: number }>(token);
      expect(payload.sub).toBe(USER_ID);
      expect(payload.proposito).toBe('reactivacion');
      expect(payload.exp - payload.iat).toBe(30 * 60);
    });

    it('verificarToken devuelve el userId de una cuenta suspendida', async () => {
      await expect(service.verificarToken(service.firmarToken(USER_ID))).resolves.toBe(USER_ID);
    });

    it('un token de sesión (sin el propósito) no sirve para reactivar', async () => {
      const sesion = jwt.sign({ sub: USER_ID, email: 'a@x', status: 'suspended' });
      await expect(service.verificarToken(sesion)).rejects.toThrow(UnauthorizedException);
    });

    it('un token firmado con otro secreto da 401', async () => {
      const ajeno = new JwtService({ secret: 'otro' }).sign({ sub: USER_ID, proposito: 'reactivacion' });
      await expect(service.verificarToken(ajeno)).rejects.toThrow(UnauthorizedException);
    });

    it('un token vencido da 401', async () => {
      const vencido = jwt.sign({ sub: USER_ID, proposito: 'reactivacion' }, { expiresIn: '-1s' });
      await expect(service.verificarToken(vencido)).rejects.toThrow(UnauthorizedException);
    });

    it('el token de una cuenta ya reactivada da 401', async () => {
      const token = service.firmarToken(USER_ID);
      prisma.user.findUnique.mockResolvedValue({ ...suspendida, status: 'verified_citizen' });
      const err = await service.verificarToken(token).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as Error).message).toBe('Este enlace ya no sirve. Vuelve a entrar con tu contraseña.');
    });
  });

  describe('JwtStrategy', () => {
    const strategy = new JwtStrategy({ getOrThrow: () => SECRETO } as never);

    it('el token de reactivación no sirve como sesión', () => {
      expect(() => strategy.validate({ sub: USER_ID, proposito: 'reactivacion' } as never)).toThrow(UnauthorizedException);
    });

    it('un token de sesión normal sigue valiendo', () => {
      const p = { sub: USER_ID, email: 'a@x', status: 'verified_citizen' };
      expect(strategy.validate(p as never)).toEqual(p);
    });
  });

  describe('caso()', () => {
    it('caso muestra el motivo de la suspensión', async () => {
      prisma.boardAction.findFirst.mockResolvedValue({ reason: 'Publicó datos personales de otra persona.', resolvedAt: new Date('2026-11-10T00:00:00Z') });
      const caso = await service.caso(service.firmarToken(USER_ID), NOW);
      expect(prisma.boardAction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { type: 'suspend_user', targetUserId: USER_ID, status: 'executed' } }),
      );
      expect(caso).toEqual({
        motivo: 'Publicó datos personales de otra persona.',
        suspendidaAt: '2026-11-10T00:00:00.000Z',
        solicitud: null,
        puedePedirDesde: null,
      });
    });

    it('sin acción de la mesa, dice que no hay motivo', async () => {
      const caso = await service.caso(service.firmarToken(USER_ID), NOW);
      expect(caso.motivo).toBe('La mesa no dejó un motivo.');
      expect(caso.suspendidaAt).toBe(suspendida.updatedAt.toISOString());
    });

    it('muestra la última solicitud y, tras un rechazo reciente, desde cuándo puede pedir', async () => {
      const resueltaAt = new Date(NOW.getTime() - 5 * DIA);
      prisma.solicitudReactivacion.findMany.mockResolvedValue([
        { estado: 'rechazada', motivoRechazo: 'Aún no', createdAt: new Date(NOW.getTime() - 6 * DIA), resueltaAt },
      ]);
      const caso = await service.caso(service.firmarToken(USER_ID), NOW);
      expect(caso.solicitud).toEqual({ estado: 'rechazada', motivoRechazo: 'Aún no', createdAt: new Date(NOW.getTime() - 6 * DIA).toISOString() });
      expect(caso.puedePedirDesde).toBe(new Date(resueltaAt.getTime() + 30 * DIA).toISOString());
    });

    it('pasados los 30 días del rechazo ya puede pedir', async () => {
      prisma.solicitudReactivacion.findMany.mockResolvedValue([
        { estado: 'rechazada', motivoRechazo: 'Aún no', createdAt: new Date(NOW.getTime() - 40 * DIA), resueltaAt: new Date(NOW.getTime() - 31 * DIA) },
      ]);
      const caso = await service.caso(service.firmarToken(USER_ID), NOW);
      expect(caso.puedePedirDesde).toBeNull();
    });

    it('con un token inválido da 401', async () => {
      await expect(service.caso('no-es-un-token', NOW)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('pedir()', () => {
    const TEXTO = 'Fue un error, pido que revisen mi caso.';

    it('crea la solicitud y audita sin el texto', async () => {
      prisma.solicitudReactivacion.create.mockResolvedValue({ id: 's1' });
      await service.pedir(service.firmarToken(USER_ID), TEXTO, NOW);
      expect(prisma.solicitudReactivacion.create).toHaveBeenCalledWith({ data: { userId: USER_ID, texto: TEXTO, createdAt: NOW } });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: USER_ID,
        action: 'reactivacion.pedida',
        resource: `user:${USER_ID}`,
        metadata: { solicitudId: 's1' },
      });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain(TEXTO);
    });

    it('pedir dos veces da 409', async () => {
      prisma.solicitudReactivacion.findFirst.mockResolvedValue({ id: 's0', estado: 'pendiente' });
      const err = await service.pedir(service.firmarToken(USER_ID), TEXTO, NOW).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe('Ya tienes un pedido pendiente.');
      expect(prisma.solicitudReactivacion.create).not.toHaveBeenCalled();
    });

    it('dos pedidos a la vez: el índice único da 409', async () => {
      prisma.solicitudReactivacion.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.pedir(service.firmarToken(USER_ID), TEXTO, NOW)).rejects.toThrow(ConflictException);
    });

    it('tras un rechazo hay que esperar 30 días', async () => {
      prisma.solicitudReactivacion.findMany.mockResolvedValue([
        { estado: 'rechazada', motivoRechazo: 'Aún no', createdAt: new Date(NOW.getTime() - 3 * DIA), resueltaAt: new Date(NOW.getTime() - 2 * DIA) },
      ]);
      await expect(service.pedir(service.firmarToken(USER_ID), TEXTO, NOW)).rejects.toThrow(ConflictException);
      expect(prisma.solicitudReactivacion.create).not.toHaveBeenCalled();
    });

    it('un texto de solo espacios no vale', async () => {
      await expect(service.pedir(service.firmarToken(USER_ID), '            ', NOW)).rejects.toThrow(BadRequestException);
    });

    it('con el token de una cuenta ya reactivada da 401 y no crea nada', async () => {
      const token = service.firmarToken(USER_ID);
      prisma.user.findUnique.mockResolvedValue({ ...suspendida, status: 'verified_citizen' });
      await expect(service.pedir(token, TEXTO, NOW)).rejects.toThrow(UnauthorizedException);
      expect(prisma.solicitudReactivacion.create).not.toHaveBeenCalled();
    });
  });
});
