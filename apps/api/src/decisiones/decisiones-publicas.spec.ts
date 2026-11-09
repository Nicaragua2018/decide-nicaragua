import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DecisionesService } from './decisiones.service';
import { DecisionesPublicasController } from './decisiones-publicas.controller';
import { GroupAccessService } from '../groups/group-access.service';
import { guardiaMock, publicadoresMock } from '../test/guardia-mock';

const dec = (over: Record<string, unknown> = {}) => ({
  fase: 'contada', resultado: 'aprobada', contadaAt: new Date('2026-11-20T00:00:00Z'),
  updatedAt: new Date('2026-11-20T00:00:00Z'), ...over,
});
const tema = (id: string, over: Record<string, unknown> = {}) => ({
  id, groupId: 'g-general', title: `Tema ${id}`, status: 'closed', hidden: false, electionId: null,
  conclusion: null, closedAt: null, updatedAt: new Date('2026-11-01T00:00:00Z'), decision: null,
  ...over,
});

describe('getPublicasGenerales()', () => {
  let prisma: {
    proposal: { findMany: ReturnType<typeof vi.fn> };
    group: { findUnique: ReturnType<typeof vi.fn> };
  };
  let service: DecisionesService;

  beforeEach(() => {
    prisma = {
      proposal: { findMany: vi.fn().mockResolvedValue([]) },
      group: { findUnique: vi.fn().mockResolvedValue({ id: 'g-general' }) },
    };
    service = new DecisionesService(
      prisma as never,
      { log: vi.fn() } as never,
      {} as never,
      {} as never,
      new GroupAccessService(prisma as never),
      guardiaMock() as never,
      publicadoresMock() as never,
      {} as never,
    );
  });

  it('solo el grupo general', async () => {
    await service.getPublicasGenerales();
    expect(prisma.group.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'general' } }),
    );
    expect(prisma.proposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ groupId: 'g-general', electionId: null }) }),
    );
  });

  it('clasifica aprobadas y rechazadas', async () => {
    prisma.proposal.findMany.mockResolvedValue([
      tema('a', { decision: dec() }),
      tema('b', { decision: dec({ resultado: 'sin_quorum', contadaAt: new Date('2026-11-19T00:00:00Z') }) }),
      tema('c', { conclusion: 'Consenso', closedAt: new Date('2026-11-18T00:00:00Z') }),
    ]);
    const r = await service.getPublicasGenerales();
    expect(r.map((x) => [x.title, x.estado])).toEqual([
      ['Tema a', 'aprobada'], ['Tema b', 'rechazada'], ['Tema c', 'aprobada'],
    ]);
    expect(r[0]?.fecha).toBe('2026-11-20T00:00:00.000Z');
  });

  it('excluye en curso y canceladas', async () => {
    prisma.proposal.findMany.mockResolvedValue(
      ['votacion', 'objecion', 'modo', 'cancelada'].map((fase) =>
        tema(fase, { status: 'open', decision: dec({ fase, resultado: null }) }),
      ),
    );
    expect(await service.getPublicasGenerales()).toEqual([]);
  });

  it('excluye temas ocultos', async () => {
    prisma.proposal.findMany.mockResolvedValue([tema('x', { hidden: true, decision: dec() })]);
    expect(await service.getPublicasGenerales()).toEqual([]);
    expect(prisma.proposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ hidden: false }) }),
    );
  });

  it('sin cifras ni ids', async () => {
    prisma.proposal.findMany.mockResolvedValue([tema('a', { decision: dec() })]);
    const [item] = await service.getPublicasGenerales();
    expect(Object.keys(item ?? {}).sort()).toEqual(['estado', 'fecha', 'title']);
  });

  it('ordena y limita a 6', async () => {
    prisma.proposal.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) =>
        tema(`t${i}`, { decision: dec({ contadaAt: new Date(Date.UTC(2026, 10, 1 + i)) }) }),
      ),
    );
    const r = await service.getPublicasGenerales();
    expect(r).toHaveLength(6);
    expect(r.map((x) => x.title)).toEqual(['Tema t7', 'Tema t6', 'Tema t5', 'Tema t4', 'Tema t3', 'Tema t2']);
  });

  it('sin grupo general devuelve vacío', async () => {
    prisma.group.findUnique.mockResolvedValue(null);
    expect(await service.getPublicasGenerales()).toEqual([]);
    expect(prisma.proposal.findMany).not.toHaveBeenCalled();
  });
});

describe('DecisionesPublicasController', () => {
  it('no exige JwtAuthGuard', () => {
    expect(Reflect.getMetadata('__guards__', DecisionesPublicasController)).toBeUndefined();
    expect(
      Reflect.getMetadata('__guards__', DecisionesPublicasController.prototype.decisiones),
    ).toBeUndefined();
  });

  it('delega en el servicio', async () => {
    const svc = { getPublicasGenerales: vi.fn().mockResolvedValue([]) };
    expect(await new DecisionesPublicasController(svc as never).decisiones()).toEqual([]);
    expect(svc.getPublicasGenerales).toHaveBeenCalled();
  });
});
