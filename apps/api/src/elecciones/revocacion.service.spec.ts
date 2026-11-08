import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RevocacionService } from './revocacion.service';
import { RevocacionDto } from './dto/revocacion.dto';
import { guardiaMock, publicadoresMock } from '../test/guardia-mock';

const DIA = 86_400_000;
const NOW = new Date('2027-03-01T12:00:00Z');
const GEN = 'g-general';
const YO = 'p-yo';
const TITULAR = 'p-titular';
const CARGO = 'c-sec';
const REV = 'r1';
const HASTA = new Date('2027-12-01T00:00:00Z');
const MOTIVO = 'No rindió cuentas en tres meses seguidos.';

function cargo(over: Record<string, unknown> = {}) {
  return {
    id: CARGO, tipo: 'secretario', groupId: GEN, profileId: TITULAR, hasta: HASTA, enFunciones: false, terminadoAt: null,
    profile: { displayName: 'Luis Mora' }, group: { name: 'General' }, ...over,
  };
}

function revocacion(over: Record<string, unknown> = {}) {
  return {
    id: REV, cargoId: CARGO, solicitanteProfileId: 'p-solicitante', motivo: MOTIVO, estado: 'abierta',
    electoradoN: 10, fraccion: 33, umbral: 4, venceAt: new Date(NOW.getTime() + 7 * DIA), createdAt: NOW,
    cargo: cargo(), ...over,
  };
}

function buildPrisma() {
  return {
    cargo: {
      findUnique: vi.fn().mockResolvedValue(cargo()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    eleccion: { findFirst: vi.fn().mockResolvedValue(null) },
    profile: { count: vi.fn().mockResolvedValue(1) },
    revocacion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(revocacion()),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: REV }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    revocacionApoyo: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: REV }]),
    $transaction: vi.fn(),
  };
}

describe('RevocacionService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let convocatoria: { anticipada: ReturnType<typeof vi.fn> };
  let guardia: ReturnType<typeof guardiaMock>;
  let publicadores: ReturnType<typeof publicadoresMock>;
  let service: RevocacionService;

  /** El electorado es `miembros`; `profile.count` responde según el filtro de ids. */
  const electorado = (miembros: string[]) =>
    prisma.profile.count.mockImplementation(async (a: { where: { id?: string | { in: string[] } } }) => {
      const id = a.where.id;
      if (id === undefined) return miembros.length;
      if (typeof id === 'string') return miembros.includes(id) ? 1 : 0;
      return id.in.filter((x) => miembros.includes(x)).length;
    });
  const apoyan = (ids: string[]) =>
    prisma.revocacionApoyo.findMany.mockResolvedValue(ids.map((profileId) => ({ profileId })));

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    rules = { getInt: vi.fn().mockResolvedValue(33) };
    convocatoria = { anticipada: vi.fn().mockResolvedValue('e-ant') };
    guardia = guardiaMock();
    publicadores = publicadoresMock();
    service = new RevocacionService(
      prisma as never, audit as never, rules as never, convocatoria as never, guardia as never, publicadores as never,
    );
    electorado([YO, TITULAR, 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
  });

  it('pedir fija electorado, fracción y umbral', async () => {
    const r = await service.pedir(YO, CARGO, MOTIVO, NOW);
    expect(r).toEqual({ id: REV });
    expect(rules.getInt).toHaveBeenCalledWith('revocacion.fraccion', null);
    const data = prisma.revocacion.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      cargoId: CARGO, solicitanteProfileId: YO, motivo: MOTIVO, electoradoN: 10, fraccion: 33, umbral: 4,
      venceAt: new Date(NOW.getTime() + 14 * DIA),
      apoyos: { create: { profileId: YO } },
    });
    expect(guardia.antesDePublicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'revocacion', texto: MOTIVO, autorProfileId: YO, args: { cargoId: CARGO, motivo: MOTIVO } }),
    );
    const abierta = audit.log.mock.calls.map((c) => c[0]).find((a) => a.action === 'revocacion.abierta');
    expect(abierta).toEqual({
      action: 'revocacion.abierta', resource: `revocacion:${REV}`, metadata: { tipo: 'secretario', groupId: GEN, umbral: 4 },
    });
    expect(abierta).not.toHaveProperty('actorId');
    expect(publicadores.registrar).not.toHaveBeenCalled();
    service.onModuleInit();
    expect(publicadores.registrar).toHaveBeenCalledWith('revocacion', expect.any(Function));
  });

  it('un pedido publicado sin revisión del asistente entra en la cola de la revisión posterior', async () => {
    guardia.antesDePublicar.mockResolvedValue({ revisado: false });
    await service.pedir(YO, CARGO, MOTIVO, NOW);
    expect(guardia.despuesDePublicar).toHaveBeenCalledWith('revocacion', REV, false);
    expect(guardia.despuesDePublicar.mock.invocationCallOrder[0]!).toBeGreaterThan(
      prisma.revocacion.create.mock.invocationCallOrder[0]!,
    );
  });

  it('el publicador aprobado repite las comprobaciones y falla si ya no se cumplen', async () => {
    service.onModuleInit();
    const fn = publicadores.registrar.mock.calls[0]![1] as (a: string, args: unknown, o: unknown) => Promise<unknown>;
    prisma.cargo.findUnique.mockResolvedValueOnce(cargo({ enFunciones: true }));
    await expect(fn(YO, { cargoId: CARGO, motivo: MOTIVO }, { sinModeracion: true })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.revocacion.create).not.toHaveBeenCalled();
    await expect(fn(YO, { cargoId: CARGO, motivo: MOTIVO }, { sinModeracion: true })).resolves.toEqual({ id: REV });
  });

  it('pedir con una elección abierta da 409', async () => {
    prisma.eleccion.findFirst.mockResolvedValue({ id: 'e-abierta' });
    await expect(service.pedir(YO, CARGO, MOTIVO, NOW)).rejects.toThrow('Ya hay una elección abierta para este cargo.');
    expect(prisma.eleccion.findFirst.mock.calls[0]![0].where).toMatchObject({
      groupId: GEN, cargo: 'secretario', fase: { in: ['candidaturas', 'votacion'] },
    });
    expect(guardia.antesDePublicar).not.toHaveBeenCalled();
    expect(prisma.revocacion.create).not.toHaveBeenCalled();
  });

  it('pedir sobre un cargo inexistente, terminado o en funciones da 404/409', async () => {
    prisma.cargo.findUnique.mockResolvedValueOnce(null);
    await expect(service.pedir(YO, CARGO, MOTIVO, NOW)).rejects.toBeInstanceOf(NotFoundException);
    prisma.cargo.findUnique.mockResolvedValueOnce(cargo({ enFunciones: true }));
    await expect(service.pedir(YO, CARGO, MOTIVO, NOW)).rejects.toThrow('Este cargo ya está en elección.');
    prisma.cargo.findUnique.mockResolvedValueOnce(cargo({ terminadoAt: NOW }));
    await expect(service.pedir(YO, CARGO, MOTIVO, NOW)).rejects.toBeInstanceOf(ConflictException);
  });

  it('pedir otra vez antes de 60 días da 409', async () => {
    prisma.revocacion.findFirst.mockResolvedValue({ createdAt: new Date(NOW.getTime() - 20 * DIA) });
    const err = await service.pedir(YO, CARGO, MOTIVO, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as { desde: string };
    expect(body.desde).toBe(new Date(NOW.getTime() + 40 * DIA).toISOString());
    expect(prisma.revocacion.findFirst.mock.calls[0]![0].where).toMatchObject({
      solicitanteProfileId: YO, cargoId: CARGO, createdAt: { gt: new Date(NOW.getTime() - 60 * DIA) },
    });
    expect(guardia.antesDePublicar).not.toHaveBeenCalled();
  });

  it('un pedido abierto ya existente (P2002) da 409', async () => {
    prisma.revocacion.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.pedir(YO, CARGO, MOTIVO, NOW)).rejects.toThrow('Ya hay un pedido abierto para este cargo.');
  });

  it('fuera del electorado no puede pedir ni apoyar', async () => {
    electorado([TITULAR, 'p2']);
    await expect(service.pedir(YO, CARGO, MOTIVO, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.apoyar(YO, REV, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.quitarApoyo(YO, REV, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.revocacionApoyo.createMany).not.toHaveBeenCalled();
    expect(prisma.revocacionApoyo.deleteMany).not.toHaveBeenCalled();
  });

  it('quien ocupa el cargo no puede pedir ni apoyar su propia revocación', async () => {
    await expect(service.pedir(TITULAR, CARGO, MOTIVO, NOW)).rejects.toThrow('No puedes pedir tu propia revocación.');
    await expect(service.apoyar(TITULAR, REV, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('apoyar un pedido vencido o ya cerrado da 409', async () => {
    prisma.revocacion.findUnique.mockResolvedValueOnce(revocacion({ venceAt: NOW }));
    await expect(service.apoyar(YO, REV, NOW)).rejects.toBeInstanceOf(ConflictException);
    prisma.revocacion.findUnique.mockResolvedValueOnce(revocacion({ estado: 'lograda' }));
    await expect(service.apoyar(YO, REV, NOW)).rejects.toBeInstanceOf(ConflictException);
  });

  it('apoyar un pedido cuyo cargo ya terminó (renuncia o suspensión) da 409 y no abre anticipada', async () => {
    apoyan(['p2', 'p3', 'p4', YO]);
    prisma.revocacion.findUnique.mockResolvedValue(revocacion({ cargo: cargo({ terminadoAt: new Date(NOW.getTime() - DIA) }) }));
    await expect(service.apoyar(YO, REV, NOW)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.quitarApoyo(YO, REV, NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.revocacionApoyo.createMany).not.toHaveBeenCalled();
    expect(prisma.revocacion.update).not.toHaveBeenCalled();
    expect(convocatoria.anticipada).not.toHaveBeenCalled();
  });

  it('si el cargo terminó entre la lectura y el bloqueo, el pedido no queda lograda ni abre anticipada', async () => {
    apoyan(['p2', 'p3', 'p4', YO]);
    prisma.cargo.updateMany.mockResolvedValue({ count: 0 });
    await service.apoyar(YO, REV, NOW);
    expect(prisma.revocacion.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'lograda' }) }),
    );
    expect(convocatoria.anticipada).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'revocacion.lograda' }));
  });

  it('listar y resumenPorCargo esconden los pedidos de cargos ya terminados', async () => {
    prisma.revocacion.findMany.mockResolvedValue([]);
    await service.listar(YO, NOW);
    await service.resumenPorCargo();
    expect(prisma.revocacion.findMany).toHaveBeenCalledTimes(2);
    for (const call of prisma.revocacion.findMany.mock.calls) {
      expect(call[0].where).toMatchObject({ estado: 'abierta', cargo: { terminadoAt: null } });
    }
  });

  it('apoyar bloquea el pedido y guarda el apoyo una sola vez', async () => {
    apoyan(['p-solicitante', 'p2']);
    await service.apoyar(YO, REV, NOW);
    const sql = (prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql;
    expect(sql).toContain('FOR UPDATE');
    expect(prisma.revocacionApoyo.createMany).toHaveBeenCalledWith({
      data: [{ revocacionId: REV, profileId: YO }], skipDuplicates: true,
    });
  });

  it('al llegar al umbral se abre la anticipada con lo que faltaba del mandato', async () => {
    apoyan(['p2', 'p3', 'p4', YO]);
    await service.apoyar(YO, REV, NOW);
    expect(prisma.revocacion.update).toHaveBeenCalledWith({
      where: { id: REV }, data: { estado: 'lograda', logradaAt: NOW },
    });
    expect(prisma.cargo.updateMany).toHaveBeenCalledWith({
      where: { id: CARGO, terminadoAt: null }, data: { enFunciones: true },
    });
    expect(convocatoria.anticipada).toHaveBeenCalledWith({ groupId: GEN, cargo: 'secretario', mandatoHasta: HASTA }, NOW);
    // Sin transacción: la anticipada se abre después del commit.
    expect(convocatoria.anticipada.mock.calls[0]).toHaveLength(2);
    expect(prisma.revocacion.update).toHaveBeenCalledWith({ where: { id: REV }, data: { eleccionId: 'e-ant' } });
    expect(audit.log).toHaveBeenCalledWith({
      action: 'revocacion.lograda', resource: `revocacion:${REV}`,
      metadata: { tipo: 'secretario', groupId: GEN, umbral: 4, apoyos: 4 },
    });
  });

  it('si la anticipada no se abre, el pedido queda lograda sin elección', async () => {
    convocatoria.anticipada.mockResolvedValue(null);
    apoyan(['p2', 'p3', 'p4', YO]);
    await service.apoyar(YO, REV, NOW);
    expect(prisma.revocacion.update).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'revocacion.lograda' }));
  });

  it('un apoyo de quien salió del electorado no cuenta', async () => {
    // p-fuera apoyó y ya no está en el electorado: 3 de 4.
    apoyan(['p2', 'p3', 'p-fuera', YO]);
    const v = await service.apoyar(YO, REV, NOW);
    expect(v.apoyos).toBe(3);
    expect(prisma.revocacion.update).not.toHaveBeenCalled();
    expect(convocatoria.anticipada).not.toHaveBeenCalled();
  });

  it('ninguna respuesta expone quién apoyó ni quién pidió', async () => {
    apoyan(['p2', 'p3']);
    prisma.revocacion.findMany.mockResolvedValue([revocacion()]);
    prisma.revocacionApoyo.findUnique.mockResolvedValue({ id: 'a1' });
    const lista = await service.listar(YO, NOW);
    const vista = await service.apoyar(YO, REV, NOW);
    const quitada = await service.quitarApoyo(YO, REV, NOW);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: REV, cargoId: CARGO, tipo: 'secretario', persona: 'Luis Mora', comunidad: null, motivo: MOTIVO,
      apoyos: 2, umbral: 4, apoyaste: true, puedoApoyar: true,
    });
    const todo = JSON.stringify([lista, vista, quitada]);
    for (const id of ['p-solicitante', 'p2', 'p3', YO, TITULAR]) expect(todo).not.toContain(id);
  });

  it('listar solo muestra los pedidos de cargos en cuyo electorado está la persona', async () => {
    electorado([YO]);
    prisma.revocacion.findMany.mockResolvedValue([
      revocacion(),
      revocacion({ id: 'r2', cargo: cargo({ id: 'c-coo', tipo: 'coordinador', groupId: 'g-leon', group: { name: 'León' } }) }),
    ]);
    prisma.profile.count.mockImplementation(async (a: { where: Record<string, unknown> }) =>
      a.where['memberships'] ? 0 : a.where['id'] === YO ? 1 : 0,
    );
    const lista = await service.listar(YO, NOW);
    expect(lista.map((r) => r.id)).toEqual([REV]);
    expect(prisma.revocacion.findMany.mock.calls[0]![0].where).toMatchObject({ estado: 'abierta', venceAt: { gt: NOW } });
  });

  it('apoyar no audita', async () => {
    apoyan(['p2']);
    await service.apoyar(YO, REV, NOW);
    await service.quitarApoyo(YO, REV, NOW);
    const acciones = audit.log.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(acciones.filter((a) => a.startsWith('revocacion.apoyo'))).toEqual([]);
    expect(acciones).toEqual([]);
    expect(prisma.revocacionApoyo.deleteMany).toHaveBeenCalledWith({ where: { revocacionId: REV, profileId: YO } });
  });

  it('resumenPorCargo da apoyos válidos, umbral y vencimiento por cargo', async () => {
    apoyan(['p2', 'p-fuera']);
    prisma.revocacion.findMany.mockResolvedValue([revocacion()]);
    const m = await service.resumenPorCargo();
    expect(m.get(CARGO)).toEqual({ apoyos: 1, umbral: 4, venceAt: revocacion().venceAt.toISOString() });
  });

  it('vencer cierra los pedidos vencidos', async () => {
    prisma.revocacion.updateMany.mockResolvedValue({ count: 2 });
    expect(await service.vencer(NOW)).toBe(2);
    expect(prisma.revocacion.updateMany).toHaveBeenCalledWith({
      where: { estado: 'abierta', venceAt: { lte: NOW } }, data: { estado: 'vencida' },
    });
  });

  it('el DTO pide un motivo de 10 a 600 caracteres', async () => {
    expect(await validate(plainToInstance(RevocacionDto, { motivo: `  ${MOTIVO}  ` }))).toHaveLength(0);
    expect(await validate(plainToInstance(RevocacionDto, { motivo: 'corto' }))).toHaveLength(1);
    expect(await validate(plainToInstance(RevocacionDto, { motivo: 'x'.repeat(601) }))).toHaveLength(1);
    expect(await validate(plainToInstance(RevocacionDto, { motivo: MOTIVO, pedirRevision: 'sí' }))).toHaveLength(1);
  });
});
