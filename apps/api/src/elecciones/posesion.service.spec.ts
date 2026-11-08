import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PosesionService, sumarMeses } from './posesion.service';
import { ConvocatoriaService } from './convocatoria.service';
import { contarEleccion } from './conteo';

const DIA = 86_400_000;
const NOW = new Date('2027-01-20T12:00:00Z');
const GEN = 'g-general';
const REGLAS: Record<string, number> = {
  'votacion.quorum_porcentaje': 20,
  'cargos.periodo_mesa_meses': 12,
  'cargos.periodo_coordinadores_meses': 6,
};

type Cand = { id: string; profileId: string; oculta?: boolean; retiradaAt?: Date | null; status?: string };

function eleccion(over: Record<string, unknown> = {}) {
  return {
    id: 'e1', groupId: GEN, cargo: 'secretario', puestos: 1, fase: 'votacion',
    votacionEndsAt: new Date(NOW.getTime() - DIA), ...over,
  };
}

function buildPrisma() {
  return {
    eleccion: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(eleccion()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    candidatura: { findMany: vi.fn().mockResolvedValue([]) },
    papeletaEleccion: { findMany: vi.fn().mockResolvedValue([]) },
    cargo: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
    boardSeat: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(),
  };
}

describe('sumarMeses', () => {
  it('respeta el fin de mes', () => {
    expect(sumarMeses(new Date('2026-08-31T10:00:00Z'), 6).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(sumarMeses(new Date('2027-01-20T12:00:00Z'), 12).toISOString()).toBe('2028-01-20T12:00:00.000Z');
  });
});

describe('PosesionService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let convocatoria: { electorado: ReturnType<typeof vi.fn>; dejarEnFunciones: ReturnType<typeof vi.fn> };
  let service: PosesionService;

  const preparar = (
    cands: Cand[],
    papeletas: { profileId: string; abstencion: boolean; orden: string[] }[],
    electorado: string[],
  ) => {
    prisma.candidatura.findMany.mockResolvedValue(
      cands.map((c) => ({
        id: c.id, profileId: c.profileId, oculta: c.oculta ?? false, retiradaAt: c.retiradaAt ?? null,
        profile: { user: { status: c.status ?? 'verified_citizen' } },
      })),
    );
    prisma.papeletaEleccion.findMany.mockResolvedValue(papeletas);
    convocatoria.electorado.mockResolvedValue(electorado);
  };
  /** El findMany de cargos con `take` es el de los que salen; el otro, el de incompatibilidades. */
  const salenCargos = (salen: unknown[], titulares: unknown[] = []) =>
    prisma.cargo.findMany.mockImplementation(async (a: { take?: number }) => (a.take ? salen : titulares));
  const voto = (n: number, orden: string[]) =>
    Array.from({ length: n }, (_, i) => ({ profileId: `v${i}`, abstencion: false, orden }));
  const votantes = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
  const guardado = () =>
    prisma.eleccion.updateMany.mock.calls[0]![0] as { where: Record<string, unknown>; data: Record<string, any> };

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    rules = { getInt: vi.fn(async (k: string) => REGLAS[k]) };
    convocatoria = { electorado: vi.fn(), dejarEnFunciones: vi.fn().mockResolvedValue(undefined) };
    service = new PosesionService(
      prisma as never, audit as never, rules as never, convocatoria as unknown as ConvocatoriaService,
    );
  });

  it('cuenta solo las papeletas del electorado actual', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    await service.contar('e1', NOW);
    const where = prisma.papeletaEleccion.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ eleccionId: 'e1', profileId: { in: votantes(10) } });
    expect(guardado().data['miembros']).toBe(10);
    expect(guardado().data['papeletasTotal']).toBe(10);
  });

  it('una candidatura oculta o de una cuenta suspendida no queda elegida', async () => {
    preparar(
      [
        { id: 'c1', profileId: 'p1', oculta: true },
        { id: 'c2', profileId: 'p2', status: 'suspended' },
        { id: 'c3', profileId: 'p3' },
      ],
      voto(10, ['c1', 'c2', 'c3']),
      votantes(10),
    );
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ puestos: 3 }));
    await service.contar('e1', NOW);
    expect(guardado().data['electas']).toEqual(['c3']);
    expect(prisma.cargo.create).toHaveBeenCalledTimes(1);
    expect(prisma.cargo.create.mock.calls[0]![0].data.profileId).toBe('p3');
  });

  it('da posesión: termina el cargo anterior, crea el nuevo y actualiza el asiento de la mesa', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    salenCargos([{ id: 'old1' }]);
    expect(await service.contar('e1', NOW)).toBe(true);

    expect(guardado().where).toMatchObject({ id: 'e1', fase: 'votacion' });
    expect(guardado().data).toMatchObject({ fase: 'contada', contadaAt: NOW, sinQuorum: false });
    const busca = prisma.cargo.findMany.mock.calls.map((c) => c[0]).find((a) => a.take)!;
    expect(busca.where).toMatchObject({ groupId: GEN, tipo: 'secretario', terminadoAt: null });
    expect(busca.orderBy).toEqual([{ enFunciones: 'desc' }, { hasta: 'asc' }]);
    expect(busca.take).toBe(1);
    expect(prisma.cargo.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old1'] } },
      data: { terminadoAt: NOW, enFunciones: false },
    });
    expect(prisma.cargo.create).toHaveBeenCalledWith({
      data: { tipo: 'secretario', groupId: GEN, profileId: 'p1', eleccionId: 'e1', desde: NOW, hasta: sumarMeses(NOW, 12) },
    });
    expect(prisma.boardSeat.upsert).toHaveBeenCalledWith({
      where: { role: 'secretario' },
      update: { profileId: 'p1', source: 'eleccion', since: NOW },
      create: { role: 'secretario', profileId: 'p1', source: 'eleccion', since: NOW },
    });
    expect(convocatoria.dejarEnFunciones).toHaveBeenCalledWith(
      { groupId: GEN, cargo: 'secretario', puestos: 0 }, NOW, prisma,
    );
  });

  it('coordinadores no tocan la mesa y usan su período', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ cargo: 'coordinador', groupId: 'g-com', puestos: 2 }));
    await service.contar('e1', NOW);
    expect(prisma.boardSeat.upsert).not.toHaveBeenCalled();
    expect(prisma.cargo.create.mock.calls[0]![0].data.hasta).toEqual(sumarMeses(NOW, 6));
    expect(convocatoria.dejarEnFunciones).toHaveBeenCalledWith(
      { groupId: 'g-com', cargo: 'coordinador', puestos: 1 }, NOW, prisma,
    );
  });

  it('observadores usan el período de la mesa y se terminan tantos como electas', async () => {
    preparar(
      [{ id: 'c1', profileId: 'p1' }, { id: 'c2', profileId: 'p2' }],
      voto(10, ['c1', 'c2']),
      votantes(10),
    );
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ cargo: 'observador', puestos: 3 }));
    salenCargos([{ id: 'o1' }, { id: 'o2' }]);
    await service.contar('e1', NOW);
    expect(prisma.cargo.findMany.mock.calls.map((c) => c[0]).find((a) => a.take)!.take).toBe(2);
    expect(prisma.cargo.create.mock.calls[0]![0].data.hasta).toEqual(sumarMeses(NOW, 12));
    expect(prisma.boardSeat.upsert).not.toHaveBeenCalled();
    expect(convocatoria.dejarEnFunciones).toHaveBeenCalledWith(
      { groupId: GEN, cargo: 'observador', puestos: 1 }, NOW, prisma,
    );
  });

  it('un coordinador con cargo vigente no queda elegido para la mesa', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }, { id: 'c2', profileId: 'p2' }], voto(10, ['c1', 'c2']), votantes(10));
    salenCargos([], [{ profileId: 'p1', tipo: 'coordinador', groupId: 'g-com' }]);
    await service.contar('e1', NOW);
    expect(guardado().data['electas']).toEqual(['c2']);
    expect(prisma.cargo.create.mock.calls[0]![0].data.profileId).toBe('p2');
  });

  it('repetir el mismo cargo (reelección) no excluye', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    salenCargos([{ id: 'old' }], [{ profileId: 'p1', tipo: 'secretario', groupId: GEN }]);
    prisma.boardSeat.findMany.mockResolvedValue([{ profileId: 'p1', role: 'secretario' }]);
    await service.contar('e1', NOW);
    expect(guardado().data['electas']).toEqual(['c1']);
  });

  it('un asiento de la mesa elegido para otro rol excluye; para observar, cualquiera', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    prisma.boardSeat.findMany.mockResolvedValue([{ profileId: 'p1', role: 'administrador' }]);
    await service.contar('e1', NOW);
    expect(guardado().data['electas']).toEqual([]);
    expect(prisma.boardSeat.findMany.mock.calls[0]![0].where).toMatchObject({ source: 'eleccion' });

    prisma.eleccion.updateMany.mockClear();
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ cargo: 'observador' }));
    prisma.boardSeat.findMany.mockResolvedValue([{ profileId: 'p1', role: 'secretario' }]);
    await service.contar('e1', NOW);
    expect(guardado().data['electas']).toEqual([]);
  });

  it('un fundador elegido para otro asiento libera su asiento fundador', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ cargo: 'administrador' }));
    prisma.boardSeat.findMany.mockResolvedValue([]); // los fundadores no excluyen
    await service.contar('e1', NOW);
    expect(guardado().data['electas']).toEqual(['c1']);
    expect(prisma.boardSeat.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'p1', source: 'fundador', NOT: { role: 'administrador' } },
    });
    expect(prisma.boardSeat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'administrador' } }),
    );
    expect(prisma.boardSeat.deleteMany.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.boardSeat.upsert.mock.invocationCallOrder[0]!,
    );
  });

  it('un fundador elegido observador libera cualquier asiento fundador', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ cargo: 'observador', puestos: 2 }));
    await service.contar('e1', NOW);
    expect(prisma.boardSeat.deleteMany).toHaveBeenCalledWith({ where: { profileId: 'p1', source: 'fundador' } });
  });

  it('las candidaturas retiradas no cuentan ni en las papeletas', async () => {
    preparar(
      [{ id: 'c1', profileId: 'p1', retiradaAt: NOW }, { id: 'c2', profileId: 'p2' }],
      voto(10, ['c1', 'c2']),
      votantes(10),
    );
    await service.contar('e1', NOW);
    expect(guardado().data['candidatasOrden']).toEqual(['c2']);
    expect(guardado().data['electas']).toEqual(['c2']);
  });

  it('las reglas quedan fijadas al convocar: un cambio posterior no afecta ni al quórum ni al período', async () => {
    // La regla actual pediría 80 % y 24 meses; la elección se convocó con 20 % y 3 meses.
    rules.getInt.mockImplementation(async (k: string) => (k.includes('quorum') ? 80 : 24));
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ quorumPct: 20, periodoMeses: 3 }));
    preparar([{ id: 'c1', profileId: 'p1' }], voto(30, ['c1']), votantes(100));
    await service.contar('e1', NOW);
    expect(guardado().data['sinQuorum']).toBe(false);
    expect(prisma.cargo.create.mock.calls[0]![0].data.hasta).toEqual(sumarMeses(NOW, 3));
    expect(rules.getInt).not.toHaveBeenCalled();
  });
  it('un puesto sin elegir deja al anterior en funciones y no cambia el asiento', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, []), votantes(10));
    await service.contar('e1', NOW);
    expect(guardado().data['electas']).toEqual([]);
    expect(prisma.cargo.create).not.toHaveBeenCalled();
    expect(prisma.boardSeat.upsert).not.toHaveBeenCalled();
    expect(convocatoria.dejarEnFunciones).toHaveBeenCalledWith(
      { groupId: GEN, cargo: 'secretario', puestos: 1 }, NOW, prisma,
    );
  });

  it('contar dos veces la misma elección no da posesión dos veces', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    prisma.eleccion.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await service.contar('e1', NOW)).toBe(true);
    expect(await service.contar('e1', NOW)).toBe(false);
    expect(prisma.cargo.create).toHaveBeenCalledTimes(1);
    expect(prisma.boardSeat.upsert).toHaveBeenCalledTimes(1);
    expect(convocatoria.dejarEnFunciones).toHaveBeenCalledTimes(1);
  });

  it('una elección que ya no está en votación no se cuenta', async () => {
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ fase: 'contada' }));
    expect(await service.contar('e1', NOW)).toBe(false);
    expect(prisma.eleccion.updateMany).not.toHaveBeenCalled();
  });

  it('primera jornada con administrador sin elegir: el fundador sigue en funciones', async () => {
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ cargo: 'administrador' }));
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, []), votantes(10));
    await service.contar('e1', NOW);
    expect(prisma.boardSeat.upsert).not.toHaveBeenCalled();
    expect(prisma.cargo.create).not.toHaveBeenCalled();
    expect(prisma.cargo.updateMany).not.toHaveBeenCalled();
  });

  it('guarda la semilla y las matrices; desempate reproducible', async () => {
    const cands = [{ id: 'c1', profileId: 'p1' }, { id: 'c2', profileId: 'p2' }];
    const papeletas = [
      ...voto(5, ['c1', 'c2']),
      ...Array.from({ length: 5 }, (_, i) => ({ profileId: `v${i + 5}`, abstencion: false, orden: ['c2', 'c1'] })),
    ];
    preparar(cands, papeletas, votantes(10));
    await service.contar('e1', NOW);
    const d = guardado().data;
    expect(d['semilla']).toMatch(/^[0-9a-f]{64}$/);
    expect(d['candidatasOrden']).toEqual(['c1', 'c2']);
    expect(d['pairwiseMatrix']).toHaveLength(2);
    expect(d['schulzeMatrix']).toHaveLength(2);
    expect(d['ordenFinal']).toHaveLength(2);
    const otra = contarEleccion({
      candidatas: d['candidatasOrden'], puestos: 1, papeletas, miembros: 10, quorumPct: 20,
      excluidas: [], semilla: d['semilla'],
    });
    expect(otra.electas).toEqual(d['electas']);
    expect(otra.electas).toHaveLength(1);
  });

  it('sin participación mínima: nadie elegido, todos en funciones', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(1, ['c1']), votantes(100));
    await service.contar('e1', NOW);
    expect(guardado().data).toMatchObject({ sinQuorum: true, electas: [], fase: 'contada' });
    expect(prisma.cargo.create).not.toHaveBeenCalled();
    expect(prisma.boardSeat.upsert).not.toHaveBeenCalled();
    expect(convocatoria.dejarEnFunciones).toHaveBeenCalledWith(
      { groupId: GEN, cargo: 'secretario', puestos: 1 }, NOW, prisma,
    );
  });

  it('la auditoría no lleva el contenido de ningún voto', async () => {
    preparar([{ id: 'c1', profileId: 'p1' }], voto(10, ['c1']), votantes(10));
    await service.contar('e1', NOW);
    const acciones = audit.log.mock.calls.map((c) => c[0].action);
    expect(acciones).toEqual(['eleccion.contada', 'cargo.posesion']);
    expect(audit.log.mock.calls[0]![0].metadata).toEqual({ electas: 1, vacantes: 0 });
    expect(audit.log.mock.calls[1]![0].metadata).toEqual({ tipo: 'secretario', groupId: GEN });
    const texto = JSON.stringify(audit.log.mock.calls);
    expect(texto).not.toContain('p1');
    expect(texto).not.toContain('c1');
    expect(texto).not.toContain('v0');
  });

  it('contarVencidas cuenta las que se contaron y sigue si una falla', async () => {
    prisma.eleccion.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const contar = vi
      .spyOn(service, 'contar')
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce(true);
    expect(await service.contarVencidas(NOW)).toBe(2);
    expect(contar).toHaveBeenCalledTimes(3);
    expect(prisma.eleccion.findMany.mock.calls[0]![0].where).toEqual({
      fase: 'votacion',
      votacionEndsAt: { lte: NOW },
    });
  });
});
