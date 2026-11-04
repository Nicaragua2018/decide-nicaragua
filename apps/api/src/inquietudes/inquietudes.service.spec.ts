import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { InquietudesService } from './inquietudes.service';
import { CreateInquietudDto } from './dto/create-inquietud.dto';

function buildPrisma() {
  return {
    groupMembership: { findUnique: vi.fn(), count: vi.fn() },
    inquietud: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    inquietudApoyo: { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    moderationAction: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
  };
}

const YO = 'p-yo';
const OTRO = 'p-otro-que-apoyo';
const G = 'g1';

function fila(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    groupId: G,
    authorProfileId: 'p-autor',
    title: 'Arreglar el local de reuniones',
    body: 'Texto de la explicación',
    status: 'abierta',
    hidden: false,
    thresholdReachedAt: null,
    deadlineAt: null,
    response: null,
    respondedAt: null,
    proposalId: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    author: { displayName: 'Ana' },
    ...over,
  };
}

describe('InquietudesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let service: InquietudesService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    rules = {
      getInt: vi.fn(async (key: string) =>
        key === 'inquietud.apoyo_minimo_personas' ? 3 : key === 'inquietud.apoyo_minimo_porcentaje' ? 10 : 7,
      ),
    };
    service = new InquietudesService(prisma as never, audit as never, rules as never);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u-yo' });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.groupMembership.count.mockResolvedValue(5);
    prisma.inquietudApoyo.count.mockResolvedValue(0);
    prisma.inquietudApoyo.findUnique.mockResolvedValue(null);
    prisma.inquietud.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('DTO', () => {
    it('rechaza un título de 9 caracteres con mensaje en español', async () => {
      const dto = Object.assign(new CreateInquietudDto(), {
        groupId: '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e6f',
        title: '123456789',
        body: 'ok',
      });
      const errors = await validate(dto);
      expect(errors[0]?.constraints).toEqual(
        expect.objectContaining({ minLength: 'El título necesita entre 10 y 140 caracteres.' }),
      );
    });
    it('rechaza una explicación de más de 2000 caracteres y acepta una válida', async () => {
      const base = { groupId: '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e6f', title: 'Un título válido' };
      const largo = await validate(Object.assign(new CreateInquietudDto(), { ...base, body: 'x'.repeat(2001) }));
      expect(largo[0]?.constraints?.maxLength).toBe('La explicación admite hasta 2000 caracteres.');
      expect(await validate(Object.assign(new CreateInquietudDto(), { ...base, body: 'x'.repeat(2000) }))).toEqual([]);
    });
  });

  describe('membresía', () => {
    it('un no miembro no crea ni lista', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.create(YO, { groupId: G, title: 'Título largo ok', body: '' }, '1.1.1.1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.list(YO, G)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.inquietud.create).not.toHaveBeenCalled();
    });
  });

  describe('create()', () => {
    it('crea y audita con solo el id del grupo', async () => {
      prisma.inquietud.create.mockResolvedValue({ id: 'i9' });
      expect(await service.create(YO, { groupId: G, title: 'Título largo ok', body: 'b' }, '1.1.1.1')).toEqual({ id: 'i9' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inquietud.created', metadata: { groupId: G } }),
      );
    });
  });

  describe('threshold()', () => {
    it.each([
      [5, 3],
      [100, 10],
      [101, 11],
    ])('con %i miembros = %i', async (miembros, esperado) => {
      prisma.groupMembership.count.mockResolvedValue(miembros);
      expect(await service.threshold(G)).toBe(esperado);
    });
  });

  describe('support() / unsupport()', () => {
    beforeEach(() => {
      prisma.inquietud.findUnique.mockResolvedValue(fila());
    });

    it('support dos veces es idempotente (upsert) y no lanza', async () => {
      await service.support(YO, 'i1', '1.1.1.1');
      await service.support(YO, 'i1', '1.1.1.1');
      expect(prisma.inquietudApoyo.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.inquietudApoyo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inquietudId_profileId: { inquietudId: 'i1', profileId: YO } }, update: {} }),
      );
    });

    it('support sobre una oculta se rechaza', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true }));
      await expect(service.support(YO, 'i1', 'ip')).rejects.toEqual(
        new BadRequestException('Esta inquietud está oculta por moderación.'),
      );
      expect(prisma.inquietudApoyo.upsert).not.toHaveBeenCalled();
    });

    it('unsupport sin apoyo previo no lanza', async () => {
      prisma.inquietudApoyo.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unsupport(YO, 'i1', 'ip')).resolves.toBeUndefined();
    });

    it('un no miembro no apoya', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.support(YO, 'i1', 'ip')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('la auditoría de apoyar y retirar no lleva actorId ni ip', async () => {
      await service.support(YO, 'i1', '9.9.9.9');
      await service.unsupport(YO, 'i1', '9.9.9.9');
      const calls = audit.log.mock.calls.map((c) => c[0]);
      for (const accion of ['inquietud.supported', 'inquietud.unsupported']) {
        const c = calls.find((x) => x.action === accion);
        expect(c).toBeDefined();
        expect(c).not.toHaveProperty('actorId');
        expect(c).not.toHaveProperty('ip');
        expect(JSON.stringify(c)).not.toContain(YO);
        expect(JSON.stringify(c)).not.toContain('u-yo');
      }
    });
  });

  describe('evaluateThreshold()', () => {
    beforeEach(() => {
      prisma.inquietud.findUnique.mockResolvedValue(fila());
    });

    it('al llegar al umbral pasa a en_plazo con plazo a 7 días', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(3);
      const antes = Date.now();
      await service.evaluateThreshold('i1');
      const arg = prisma.inquietud.updateMany.mock.calls[0]![0];
      expect(arg.where).toEqual({ id: 'i1', status: 'abierta', hidden: false });
      expect(arg.data.status).toBe('en_plazo');
      const dias = (arg.data.deadlineAt.getTime() - arg.data.thresholdReachedAt.getTime()) / 86_400_000;
      expect(dias).toBe(7);
      expect(Math.abs(arg.data.thresholdReachedAt.getTime() - antes)).toBeLessThan(1000);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'inquietud.threshold_reached' }));
    });

    it('por debajo del umbral no cambia nada', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(2);
      await service.evaluateThreshold('i1');
      expect(prisma.inquietud.updateMany).not.toHaveBeenCalled();
    });

    it('una respondida o una oculta no se mueve', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(9);
      prisma.inquietud.findUnique.mockResolvedValue(fila({ status: 'respondida' }));
      await service.evaluateThreshold('i1');
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true }));
      await service.evaluateThreshold('i1');
      expect(prisma.inquietud.updateMany).not.toHaveBeenCalled();
    });

    it('es idempotente: si otra petición ya la movió, no audita de nuevo', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(3);
      prisma.inquietud.updateMany.mockResolvedValue({ count: 0 });
      await service.evaluateThreshold('i1');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('solo cuenta apoyos de miembros actuales del grupo', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(0);
      await service.evaluateThreshold('i1');
      expect(prisma.inquietudApoyo.count).toHaveBeenCalledWith({
        where: { inquietudId: 'i1', profile: { memberships: { some: { groupId: G } } } },
      });
    });
  });

  describe('lectura sin revelar quién apoyó', () => {
    it('la lista ordena por apoyos y luego antigüedad, sin ids de quienes apoyaron', async () => {
      prisma.inquietud.findMany.mockResolvedValue([
        fila({ id: 'a', createdAt: new Date('2026-11-02T00:00:00Z') }),
        fila({ id: 'b', createdAt: new Date('2026-11-03T00:00:00Z') }),
        fila({ id: 'c', createdAt: new Date('2026-11-01T00:00:00Z') }),
      ]);
      prisma.inquietudApoyo.count.mockImplementation(async ({ where }: { where: { inquietudId: string } }) =>
        where.inquietudId === 'b' ? 5 : 1,
      );
      // El perfil OTRO apoyó, pero solo se consulta si YO apoyó.
      prisma.inquietudApoyo.findUnique.mockImplementation(
        async ({ where }: { where: { inquietudId_profileId: { profileId: string } } }) =>
          where.inquietudId_profileId.profileId === YO ? { id: 'x' } : null,
      );
      const lista = await service.list(YO, G);
      expect(lista.map((i) => i.id)).toEqual(['b', 'c', 'a']);
      expect(lista[0]).toEqual(expect.objectContaining({ supportCount: 5, supportedByMe: true, threshold: 3 }));
      expect(JSON.stringify(lista)).not.toContain(OTRO);
    });

    it('el detalle no contiene ids de quienes apoyaron y canOrganize es falso por ahora', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila());
      prisma.inquietudApoyo.count.mockResolvedValue(2);
      const d = await service.get(YO, 'i1');
      expect(d.supportCount).toBe(2);
      expect(d.canOrganize).toBe(false);
      expect(JSON.stringify(d)).not.toContain(OTRO);
    });

    it('el detalle de una oculta tiene texto neutro, motivo y moderationId solo para el autor', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true, authorProfileId: YO }));
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'mod1', reason: 'Insultos', status: 'oculto' });
      const d = await service.get(YO, 'i1');
      expect(d.title).toBe('Inquietud oculta por moderación');
      expect(d.body).toBe('');
      expect(d.hiddenReason).toBe('Insultos');
      expect(d.moderationId).toBe('mod1');
      expect(JSON.stringify(d)).not.toContain('Arreglar el local');

      const otro = await service.get('p-otro', 'i1');
      expect(otro.hiddenReason).toBe('Insultos');
      expect(otro.moderationId).toBeNull();

      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'mod1', reason: 'Insultos', status: 'apelado' });
      expect((await service.get(YO, 'i1')).moderationId).toBeNull();
    });
  });
});
