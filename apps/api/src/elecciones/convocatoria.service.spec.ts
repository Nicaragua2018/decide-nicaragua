import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import { ConvocatoriaService } from './convocatoria.service';

const DIA = 86_400_000;
const NOW = new Date('2026-12-01T12:00:00Z');
const GEN = 'g-general';
const CREADA = new Date(NOW.getTime() - 8 * DIA);

const REGLAS: Record<string, number> = {
  'eleccion.minimo_primera': 12,
  'comunidad.minimo_activacion': 7,
  'observadores.numero': 7,
  'eleccion.plazo_candidaturas_dias': 7,
  'eleccion.plazo_votacion_dias': 7,
  'cargos.periodo_mesa_meses': 12,
  'cargos.periodo_coordinadores_meses': 6,
  'votacion.quorum_porcentaje': 20,
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
      groupBy: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'e-new', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    candidatura: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(),
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
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
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
        expect(d['quorumPct']).toBe(20);
        expect(d['periodoMeses']).toBe(12);
      }
      expect(datos.find((d) => d['cargo'] === 'observador')!['puestos']).toBe(7);
      expect(datos.find((d) => d['cargo'] === 'secretario')!['puestos']).toBe(1);
      // Los puestos plenos quedan fijados al convocar.
      expect(datos.find((d) => d['cargo'] === 'observador')!['plenos']).toBe(7);
      expect(datos.find((d) => d['cargo'] === 'secretario')!['plenos']).toBe(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'eleccion.convocada',
          metadata: expect.objectContaining({ cargo: 'administrador', motivo: 'primera', groupId: GEN }),
        }),
      );
    });

    it('no convoca la primera jornada si ya hubo elecciones de mesa, en cualquier fase', async () => {
      prisma.profile.count.mockResolvedValue(50);
      prisma.eleccion.count.mockResolvedValue(1);
      expect(await service.convocar(NOW)).toBe(0);
      expect(prisma.eleccion.create).not.toHaveBeenCalled();
      expect(prisma.eleccion.count.mock.calls[0]![0].where).not.toHaveProperty('fase');
    });
  });

  describe('convocar: comunidades', () => {
    it('activa una comunidad al llegar a 7 y abre su elección de coordinadores', async () => {
      prisma.eleccion.count.mockResolvedValue(1); // mesa ya elegida
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
      expect(d).toMatchObject({ quorumPct: 20, periodoMeses: 6, plenos: 2 });
      expect(d!['candidaturasEndsAt']).toEqual(new Date(NOW.getTime() + 7 * DIA));
    });

    it('la activación y la elección van en una transacción; si algo falla, no se escribe nada', async () => {
      prisma.eleccion.count.mockResolvedValue(1);
      prisma.group.findMany.mockResolvedValue([{ id: 'c1', type: 'territorial_origin' }]);
      prisma.profile.count.mockResolvedValue(9);
      prisma.eleccion.create.mockRejectedValue(new Error('base caída'));
      await expect(service.convocar(NOW)).rejects.toThrow('base caída');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.group.updateMany).toHaveBeenCalledTimes(1);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('un P2002 al abrir la elección de coordinadores deja la comunidad activada sin duplicar', async () => {
      prisma.eleccion.count.mockResolvedValue(1);
      prisma.group.findMany.mockResolvedValue([{ id: 'c1', type: 'territorial_origin' }]);
      prisma.profile.count.mockResolvedValue(9);
      prisma.eleccion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      expect(await service.convocar(NOW)).toBe(0);
      expect(prisma.group.updateMany).toHaveBeenLastCalledWith({ where: { id: 'c1', activadaAt: null }, data: { activadaAt: NOW } });
    });

    it('si otra ejecución activó la comunidad antes, no abre una segunda elección', async () => {
      prisma.eleccion.count.mockResolvedValue(1);
      prisma.group.findMany.mockResolvedValue([{ id: 'c1', type: 'territorial_origin' }]);
      prisma.profile.count.mockResolvedValue(9);
      prisma.group.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.convocar(NOW)).toBe(0);
    });
  });

  describe('convocar: una sola convocatoria por cargo y ámbito (renovación y vacantes)', () => {
    /** Un cargo vigente que termina dentro de `dias` días. */
    const cargo = (tipo: string, groupId: string, dias: number, enFunciones = false) => ({
      tipo, groupId, hasta: new Date(NOW.getTime() + dias * DIA), enFunciones,
    });
    /** La última elección contada de ese cargo y ámbito, hace `dias` días. */
    const contada = (cargo: string, groupId: string, dias: number) => ({
      groupId, cargo, _max: { contadaAt: new Date(NOW.getTime() - dias * DIA) },
    });

    beforeEach(() => {
      prisma.eleccion.count.mockResolvedValue(1); // la primera jornada ya pasó
    });

    it('convoca la renovación 21 días antes del fin del período, con las vacantes incluidas', async () => {
      const cerca = 21;
      prisma.cargo.findMany.mockResolvedValue([
        cargo('administrador', GEN, cerca),
        cargo('secretario', GEN, cerca),
        cargo('coordinador', 'c1', cerca),
      ]);
      prisma.eleccion.groupBy.mockResolvedValue([contada('administrador', GEN, 300), contada('coordinador', 'c1', 150)]);
      expect(await service.convocar(NOW)).toBe(3);
      const datos = creadas();
      expect(datos.every((d) => d['motivo'] === 'renovacion')).toBe(true);
      const mesa = datos.filter((d) => d['groupId'] === GEN);
      expect(mesa).toHaveLength(2);
      expect(mesa[0]!['jornadaId']).toBeTruthy();
      expect(mesa[0]!['jornadaId']).toBe(mesa[1]!['jornadaId']);
      // c1 tenía un solo coordinador: la renovación pide su puesto y la vacante.
      expect(datos.find((d) => d['cargo'] === 'coordinador')).toMatchObject({ puestos: 2, jornadaId: null });
      expect(prisma.cargo.findMany.mock.calls[0]![0].where).toMatchObject({ terminadoAt: null });
      expect(prisma.eleccion.groupBy.mock.calls[0]![0]).toMatchObject({
        by: ['groupId', 'cargo'], where: { fase: 'contada' }, _max: { contadaAt: true },
      });
    });

    it('a 22 días del fin todavía no convoca', async () => {
      prisma.cargo.findMany.mockResolvedValue([cargo('secretario', GEN, 22)]);
      prisma.eleccion.groupBy.mockResolvedValue([contada('secretario', GEN, 300)]);
      expect(await service.convocar(NOW)).toBe(0);
    });

    it('pide los puestos plenos menos los cargos que siguen', async () => {
      prisma.cargo.findMany.mockResolvedValue([
        ...[10, 10, 10, 100, 100, 100, 100].map((d) => cargo('observador', GEN, d)),
        cargo('coordinador', 'c1', 10),
        cargo('coordinador', 'c1', 100),
      ]);
      expect(await service.convocar(NOW)).toBe(2);
      const datos = creadas();
      expect(datos.find((d) => d['cargo'] === 'observador')).toMatchObject({ puestos: 3, motivo: 'renovacion', plenos: 7 });
      expect(datos.find((d) => d['cargo'] === 'coordinador')).toMatchObject({ puestos: 1, groupId: 'c1', plenos: 2 });
    });

    it('nunca convoca sin puestos: si los que siguen ya llenan el cargo, no hay elección', async () => {
      valores = { ...REGLAS, 'observadores.numero': 5 };
      prisma.cargo.findMany.mockResolvedValue([
        ...[100, 100, 100, 100, 100, 100].map((d) => cargo('observador', GEN, d)),
        cargo('observador', GEN, 5),
      ]);
      expect(await service.convocar(NOW)).toBe(0);
      expect(prisma.eleccion.create).not.toHaveBeenCalled();
    });

    it('no convoca si ya hay una elección abierta de ese cargo y ámbito', async () => {
      prisma.cargo.findMany.mockResolvedValue([cargo('secretario', GEN, 5)]);
      prisma.eleccion.findMany.mockResolvedValue([{ groupId: GEN, cargo: 'secretario' }]);
      expect(await service.convocar(NOW)).toBe(0);
      expect(prisma.eleccion.findMany.mock.calls[0]![0].where).toEqual({ fase: { in: ['candidaturas', 'votacion'] } });
    });

    it('vacantes sin nadie que salga: reintento 30 días después de la última elección contada, no antes', async () => {
      prisma.cargo.findMany.mockResolvedValue(Array.from({ length: 5 }, () => cargo('observador', GEN, 300)));
      prisma.eleccion.groupBy.mockResolvedValue([contada('observador', GEN, 29)]);
      expect(await service.convocar(NOW)).toBe(0);

      prisma.eleccion.groupBy.mockResolvedValue([contada('observador', GEN, 30)]);
      expect(await service.convocar(NOW)).toBe(1);
      expect(creadas()[0]).toMatchObject({ groupId: GEN, cargo: 'observador', puestos: 2, motivo: 'reintento', jornadaId: null });
    });

    it('tras una primera jornada contada sin secretario elegido, el reintento vuelve a los 30 días', async () => {
      prisma.eleccion.groupBy.mockResolvedValue([contada('secretario', GEN, 31)]);
      expect(await service.convocar(NOW)).toBe(1);
      expect(creadas()[0]).toMatchObject({ cargo: 'secretario', puestos: 1, motivo: 'reintento' });
    });

    it('I1: una cadena de reintentos fallidos no bloquea la renovación de quien sale', async () => {
      // c1 eligió 1 de 2; el último reintento se contó hace 5 días sin nadie. C1 entra en la ventana.
      prisma.cargo.findMany.mockResolvedValue([cargo('coordinador', 'c1', 20)]);
      prisma.eleccion.groupBy.mockResolvedValue([contada('coordinador', 'c1', 5)]);
      expect(await service.convocar(NOW)).toBe(1);
      expect(creadas()[0]).toMatchObject({ groupId: 'c1', cargo: 'coordinador', puestos: 2, motivo: 'renovacion' });
    });

    it('I1: un mandato vencido que sigue en funciones con reintentos fallidos se renueva con las vacantes', async () => {
      prisma.cargo.findMany.mockResolvedValue([cargo('coordinador', 'c1', -40, true)]);
      // Tras el último intento fallido, espera 30 días (no vuelve a convocar en cada ronda).
      prisma.eleccion.groupBy.mockResolvedValue([contada('coordinador', 'c1', 10)]);
      expect(await service.convocar(NOW)).toBe(0);

      prisma.eleccion.groupBy.mockResolvedValue([contada('coordinador', 'c1', 31)]);
      expect(await service.convocar(NOW)).toBe(1);
      expect(creadas()[0]).toMatchObject({ groupId: 'c1', cargo: 'coordinador', puestos: 2, motivo: 'renovacion' });
    });

    it('la mesa y los observadores que tocan a la vez van en una sola jornada, cada una con su motivo', async () => {
      prisma.cargo.findMany.mockResolvedValue([
        cargo('secretario', GEN, 10),
        ...Array.from({ length: 6 }, () => cargo('observador', GEN, 300)),
      ]);
      prisma.eleccion.groupBy.mockResolvedValue([contada('secretario', GEN, 340), contada('observador', GEN, 40)]);
      expect(await service.convocar(NOW)).toBe(2);
      const datos = creadas();
      expect(datos.find((d) => d['cargo'] === 'secretario')).toMatchObject({ puestos: 1, motivo: 'renovacion' });
      expect(datos.find((d) => d['cargo'] === 'observador')).toMatchObject({ puestos: 1, motivo: 'reintento' });
      expect(datos[0]!['jornadaId']).toBeTruthy();
      expect(datos[0]!['jornadaId']).toBe(datos[1]!['jornadaId']);
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
      createdAt: CREADA,
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
      expect(spy).toHaveBeenCalledWith({ groupId: GEN, cargo: 'secretario', convocadaAt: CREADA });
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

    it('enElectorado aplica la misma regla a una sola persona', async () => {
      prisma.profile.count.mockResolvedValue(1);
      expect(await service.enElectorado('p1', { groupId: 'c1', cargo: 'coordinador' })).toBe(true);
      expect(prisma.profile.count).toHaveBeenCalledWith({
        where: { id: 'p1', user: { status: 'verified_citizen' }, memberships: { some: { groupId: 'c1' } } },
      });
      prisma.profile.count.mockResolvedValue(0);
      expect(await service.enElectorado('p1', { groupId: GEN, cargo: 'secretario' })).toBe(false);
    });
  });

  describe('dejarEnFunciones', () => {
    it('marca en funciones solo los cargos que ya salían al convocar (nunca uno con mandato por delante)', async () => {
      const convocadaAt = new Date(NOW.getTime() - 20 * DIA);
      await service.dejarEnFunciones({ groupId: GEN, cargo: 'secretario', convocadaAt });
      expect(prisma.cargo.updateMany).toHaveBeenCalledWith({
        where: {
          groupId: GEN, tipo: 'secretario', terminadoAt: null, enFunciones: false,
          hasta: { lte: new Date(convocadaAt.getTime() + 21 * DIA) },
        },
        data: { enFunciones: true },
      });
    });
  });
});
