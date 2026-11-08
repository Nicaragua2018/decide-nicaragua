import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import { ConvocatoriaService } from './convocatoria.service';

const DIA = 86_400_000;
const NOW = new Date('2026-12-01T12:00:00Z');
const GEN = 'g-general';

const REGLAS: Record<string, number> = {
  'eleccion.minimo_primera': 12,
  'comunidad.minimo_activacion': 7,
  'observadores.numero': 7,
  'eleccion.plazo_candidaturas_dias': 7,
  'eleccion.plazo_votacion_dias': 7,
  'cargos.periodo_mesa_meses': 12,
  'cargos.periodo_coordinadores_meses': 6,
};

function buildPrisma() {
  return {
    group: {
      findFirst: vi.fn().mockResolvedValue({ id: GEN, type: 'custom', slug: GENERAL_GROUP_SLUG }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    profile: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    cargo: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    eleccion: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'e-new', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    candidatura: { count: vi.fn().mockResolvedValue(0) },
  };
}

describe('ConvocatoriaService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let valores: Record<string, number>;
  let service: ConvocatoriaService;

  const creadas = () => prisma.eleccion.create.mock.calls.map((c) => c[0].data as Record<string, unknown>);

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    valores = { ...REGLAS };
    rules = { getInt: vi.fn(async (k: string) => valores[k]) };
    service = new ConvocatoriaService(prisma as never, audit as never, rules as never);
  });

  describe('convocar: primera jornada', () => {
    it('convoca la primera jornada con 4 elecciones al llegar a 12 verificados y no antes', async () => {
      prisma.profile.count.mockResolvedValue(11);
      expect(await service.convocar(NOW)).toBe(0);
      expect(prisma.eleccion.create).not.toHaveBeenCalled();

      prisma.profile.count.mockResolvedValue(12);
      expect(await service.convocar(NOW)).toBe(4);
      const datos = creadas();
      expect(datos.map((d) => d['cargo']).sort()).toEqual(['administrador', 'coordinador_general', 'observador', 'secretario']);
      expect(new Set(datos.map((d) => d['jornadaId'])).size).toBe(1);
      expect(datos[0]!['jornadaId']).toBeTruthy();
      for (const d of datos) {
        expect(d['groupId']).toBe(GEN);
        expect(d['motivo']).toBe('primera');
        expect(d['candidaturasEndsAt']).toEqual(new Date(NOW.getTime() + 7 * DIA));
        expect(d['votacionEndsAt']).toEqual(new Date(NOW.getTime() + 14 * DIA));
      }
      expect(datos.find((d) => d['cargo'] === 'observador')!['puestos']).toBe(7);
      expect(datos.find((d) => d['cargo'] === 'secretario')!['puestos']).toBe(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'eleccion.convocada',
          metadata: expect.objectContaining({ cargo: 'administrador', motivo: 'primera', groupId: GEN }),
        }),
      );
    });

    it('no convoca la primera jornada si ya hay una mesa elegida', async () => {
      prisma.profile.count.mockResolvedValue(50);
      prisma.cargo.count.mockResolvedValue(1);
      expect(await service.convocar(NOW)).toBe(0);
      expect(prisma.eleccion.create).not.toHaveBeenCalled();
    });

    it('no convoca la primera jornada si ya hay una elección de mesa abierta', async () => {
      prisma.profile.count.mockResolvedValue(50);
      prisma.eleccion.count.mockResolvedValue(1);
      expect(await service.convocar(NOW)).toBe(0);
    });
  });

  describe('convocar: comunidades', () => {
    it('activa una comunidad al llegar a 7 y abre su elección de coordinadores', async () => {
      prisma.cargo.count.mockResolvedValue(1); // mesa ya elegida
      prisma.group.findMany.mockResolvedValue([
        { id: 'c1', type: 'territorial_origin' },
        { id: 'c2', type: 'territorial_residence' },
      ]);
      prisma.profile.count.mockImplementation(async (a: { where: { memberships?: { some: { groupId: string } } } }) =>
        a.where.memberships?.some.groupId === 'c1' ? 7 : 6,
      );
      expect(await service.convocar(NOW)).toBe(1);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', activadaAt: null }, data: { activadaAt: NOW } });
      expect(prisma.group.updateMany).toHaveBeenCalledTimes(1);
      const [d] = creadas();
      expect(d).toMatchObject({ groupId: 'c1', cargo: 'coordinador', puestos: 2, motivo: 'primera', jornadaId: null });
      expect(d!['candidaturasEndsAt']).toEqual(new Date(NOW.getTime() + 7 * DIA));
    });

    it('si otra ejecución activó la comunidad antes, no abre una segunda elección', async () => {
      prisma.cargo.count.mockResolvedValue(1);
      prisma.group.findMany.mockResolvedValue([{ id: 'c1', type: 'territorial_origin' }]);
      prisma.profile.count.mockResolvedValue(9);
      prisma.group.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.convocar(NOW)).toBe(0);
    });
  });

  describe('convocar: renovación', () => {
    it('convoca la renovación 21 días antes del fin del período', async () => {
      prisma.cargo.count.mockResolvedValue(1);
      const cerca = new Date(NOW.getTime() + 21 * DIA);
      prisma.cargo.findMany.mockResolvedValue([
        { tipo: 'administrador', groupId: GEN, hasta: cerca },
        { tipo: 'secretario', groupId: GEN, hasta: cerca },
        { tipo: 'coordinador', groupId: 'c1', hasta: cerca },
      ]);
      expect(await service.convocar(NOW)).toBe(3);
      const datos = creadas();
      expect(datos.every((d) => d['motivo'] === 'renovacion')).toBe(true);
      const mesa = datos.filter((d) => d['groupId'] === GEN);
      expect(mesa).toHaveLength(2);
      expect(mesa[0]!['jornadaId']).toBeTruthy();
      expect(mesa[0]!['jornadaId']).toBe(mesa[1]!['jornadaId']);
      expect(datos.find((d) => d['cargo'] === 'coordinador')).toMatchObject({ puestos: 2, jornadaId: null });
      expect(prisma.cargo.findMany.mock.calls[0]![0].where).toMatchObject({
        terminadoAt: null,
        hasta: { lte: new Date(NOW.getTime() + 21 * DIA) },
      });
    });

    it('no renueva si ya hay una elección abierta de ese cargo y ámbito', async () => {
      prisma.cargo.count.mockResolvedValue(1);
      prisma.cargo.findMany.mockResolvedValue([{ tipo: 'secretario', groupId: GEN, hasta: new Date(NOW.getTime() + 5 * DIA) }]);
      prisma.eleccion.findFirst.mockResolvedValue({ id: 'abierta' });
      expect(await service.convocar(NOW)).toBe(0);
    });
  });

  describe('convocar: reintento', () => {
    it('convoca el reintento 30 días después con los puestos que faltan', async () => {
      prisma.cargo.count.mockResolvedValue(1);
      const contadaAt = new Date(NOW.getTime() - 30 * DIA);
      const createdAt = new Date(NOW.getTime() - 45 * DIA);
      prisma.eleccion.findMany.mockResolvedValue([
        { id: 'e1', groupId: GEN, cargo: 'observador', puestos: 7, electas: ['a', 'b', 'c', 'd', 'e'], contadaAt, createdAt },
        { id: 'e2', groupId: GEN, cargo: 'secretario', puestos: 1, electas: ['x'], contadaAt, createdAt },
      ]);
      expect(await service.convocar(NOW)).toBe(1);
      expect(creadas()[0]).toMatchObject({ groupId: GEN, cargo: 'observador', puestos: 2, motivo: 'reintento' });
      expect(prisma.eleccion.findMany.mock.calls[0]![0].where).toMatchObject({ fase: 'contada', contadaAt: { lte: contadaAt } });
    });

    it('no repite el reintento si ya hay otra elección posterior', async () => {
      prisma.cargo.count.mockResolvedValue(1);
      prisma.eleccion.findMany.mockResolvedValue([
        {
          id: 'e1', groupId: GEN, cargo: 'observador', puestos: 7, electas: [],
          contadaAt: new Date(NOW.getTime() - 40 * DIA), createdAt: new Date(NOW.getTime() - 50 * DIA),
        },
      ]);
      prisma.eleccion.findFirst.mockResolvedValue({ id: 'posterior' });
      expect(await service.convocar(NOW)).toBe(0);
    });
  });

  it('un P2002 del índice parcial no rompe la ronda ni duplica', async () => {
    prisma.profile.count.mockResolvedValue(20);
    prisma.eleccion.create
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
      .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'e', ...data }));
    expect(await service.convocar(NOW)).toBe(3);
    expect(audit.log).toHaveBeenCalledTimes(3);
  });

  it('usa los valores de las reglas, no constantes', async () => {
    valores = {
      ...REGLAS,
      'eleccion.minimo_primera': 30,
      'observadores.numero': 9,
      'eleccion.plazo_candidaturas_dias': 10,
      'eleccion.plazo_votacion_dias': 5,
    };
    prisma.profile.count.mockResolvedValue(29);
    expect(await service.convocar(NOW)).toBe(0);
    prisma.profile.count.mockResolvedValue(30);
    expect(await service.convocar(NOW)).toBe(4);
    const datos = creadas();
    expect(datos.find((d) => d['cargo'] === 'observador')!['puestos']).toBe(9);
    expect(datos[0]!['candidaturasEndsAt']).toEqual(new Date(NOW.getTime() + 10 * DIA));
    expect(datos[0]!['votacionEndsAt']).toEqual(new Date(NOW.getTime() + 15 * DIA));
    expect(rules.getInt).toHaveBeenCalledWith('eleccion.minimo_primera', null);
  });

  describe('avanzar', () => {
    const vencida = (over: Record<string, unknown> = {}) => ({
      id: 'e1',
      groupId: GEN,
      cargo: 'secretario',
      puestos: 1,
      prorrogada: false,
      candidaturasEndsAt: new Date(NOW.getTime() - 1000),
      votacionEndsAt: new Date(NOW.getTime() + 6 * DIA),
      ...over,
    });

    it('prorroga 7 días una sola vez con pocas candidaturas', async () => {
      const e = vencida({ puestos: 3 });
      prisma.eleccion.findMany.mockResolvedValue([e]);
      prisma.candidatura.count.mockResolvedValue(2);
      expect(await service.avanzar(NOW)).toBe(1);
      expect(prisma.eleccion.updateMany).toHaveBeenCalledWith({
        where: { id: 'e1', fase: 'candidaturas', prorrogada: false },
        data: {
          candidaturasEndsAt: new Date(e.candidaturasEndsAt.getTime() + 7 * DIA),
          votacionEndsAt: new Date(e.votacionEndsAt.getTime() + 7 * DIA),
          prorrogada: true,
        },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'eleccion.prorrogada' }));
      expect(prisma.candidatura.count).toHaveBeenCalledWith({ where: { eleccionId: 'e1', oculta: false, retiradaAt: null } });
    });

    it('ya prorrogada con alguna candidatura, pasa a votación', async () => {
      prisma.eleccion.findMany.mockResolvedValue([vencida({ puestos: 3, prorrogada: true })]);
      prisma.candidatura.count.mockResolvedValue(1);
      expect(await service.avanzar(NOW)).toBe(1);
      expect(prisma.eleccion.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', fase: 'candidaturas' }, data: { fase: 'votacion' } });
    });

    it('sin candidaturas tras la prórroga cierra sin votación y deja en funciones', async () => {
      prisma.eleccion.findMany.mockResolvedValue([vencida({ prorrogada: true })]);
      prisma.candidatura.count.mockResolvedValue(0);
      const spy = vi.spyOn(service, 'dejarEnFunciones');
      expect(await service.avanzar(NOW)).toBe(1);
      expect(prisma.eleccion.updateMany).toHaveBeenCalledWith({
        where: { id: 'e1', fase: 'candidaturas' },
        data: { fase: 'contada', electas: [], contadaAt: NOW },
      });
      expect(spy).toHaveBeenCalledWith({ groupId: GEN, cargo: 'secretario', puestos: 1 }, NOW);
    });

    it('pasa a votación al terminar las candidaturas', async () => {
      prisma.eleccion.findMany.mockResolvedValue([vencida()]);
      prisma.candidatura.count.mockResolvedValue(1);
      expect(await service.avanzar(NOW)).toBe(1);
      expect(prisma.eleccion.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', fase: 'candidaturas' }, data: { fase: 'votacion' } });
      expect(prisma.eleccion.findMany.mock.calls[0]![0].where).toMatchObject({ fase: 'candidaturas', candidaturasEndsAt: { lte: NOW } });
    });

    it('si otra ejecución ya movió la fase, no cuenta ni deja en funciones', async () => {
      prisma.eleccion.findMany.mockResolvedValue([vencida({ prorrogada: true })]);
      prisma.candidatura.count.mockResolvedValue(0);
      prisma.eleccion.updateMany.mockResolvedValue({ count: 0 });
      const spy = vi.spyOn(service, 'dejarEnFunciones');
      expect(await service.avanzar(NOW)).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('electorado', () => {
    it('el electorado de coordinadores son los verificados actuales de la comunidad', async () => {
      prisma.profile.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      expect(await service.electorado({ groupId: 'c1', cargo: 'coordinador' })).toEqual(['p1', 'p2']);
      expect(prisma.profile.findMany).toHaveBeenCalledWith({
        where: { user: { status: 'verified_citizen' }, memberships: { some: { groupId: 'c1' } } },
        select: { id: true },
      });
    });

    it('el de la mesa y los observadores son todas las personas verificadas', async () => {
      prisma.profile.findMany.mockResolvedValue([{ id: 'p1' }]);
      expect(await service.electorado({ groupId: GEN, cargo: 'observador' })).toEqual(['p1']);
      expect(prisma.profile.findMany).toHaveBeenCalledWith({ where: { user: { status: 'verified_citizen' } }, select: { id: true } });
    });
  });

  describe('dejarEnFunciones', () => {
    it('marca en funciones los cargos vigentes que vencen', async () => {
      prisma.cargo.findMany.mockResolvedValue([{ id: 'c1' }]);
      await service.dejarEnFunciones({ groupId: GEN, cargo: 'secretario', puestos: 1 }, NOW);
      expect(prisma.cargo.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] } }, data: { enFunciones: true } });
      expect(prisma.cargo.findMany.mock.calls[0]![0].where).toMatchObject({ groupId: GEN, tipo: 'secretario', terminadoAt: null });
    });
  });
});
