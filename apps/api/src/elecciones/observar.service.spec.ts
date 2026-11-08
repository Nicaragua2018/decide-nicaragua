import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { ObservarService } from './observar.service';
import { ObservadorGuard } from './observador.guard';
import { ObservacionDto } from './dto/observacion.dto';
import { guardiaMock, publicadoresMock } from '../test/guardia-mock';

const NOW = new Date('2027-03-01T12:00:00Z');
const YO = 'p-obs';
const EVENTO = '11111111-1111-4111-8111-111111111111';
const TEXTO = 'Esto no cuadra con lo anterior.';

function buildPrisma() {
  return {
    cargo: { findFirst: vi.fn().mockResolvedValue({ id: 'c-obs' }) },
    auditEvent: { findUnique: vi.fn().mockResolvedValue({ id: EVENTO }) },
    observacionPublica: { create: vi.fn().mockResolvedValue({ id: 'o1' }) },
    verificationReference: { groupBy: vi.fn().mockResolvedValue([]) },
    profile: { findMany: vi.fn().mockResolvedValue([]) },
    eleccion: { findMany: vi.fn().mockResolvedValue([]) },
    candidatura: { findMany: vi.fn().mockResolvedValue([]) },
    decision: { findMany: vi.fn().mockResolvedValue([]) },
    solucion: { findMany: vi.fn().mockResolvedValue([]) },
    electionResult: { findMany: vi.fn().mockResolvedValue([]) },
    electionCandidate: { findMany: vi.fn().mockResolvedValue([]) },
    sortitionDraw: { findMany: vi.fn().mockResolvedValue([]) },
    usoAsistente: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function contexto(user: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as never;
}

describe('ObservadorGuard', () => {
  it('solo un observador vigente entra: sin cargo o con el cargo terminado da 403', async () => {
    const prisma = buildPrisma();
    prisma.cargo.findFirst.mockResolvedValue(null);
    const guard = new ObservadorGuard(prisma as never);
    await expect(guard.canActivate(contexto({ profileId: YO }))).rejects.toThrow(
      new ForbiddenException('Esta sección es solo para los observadores.'),
    );
    await expect(guard.canActivate(contexto({}))).rejects.toThrow(ForbiddenException);
    // La consulta exige cargo de observador vigente, ya empezado, y la cuenta verificada (relee la base).
    const where = prisma.cargo.findFirst.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      tipo: 'observador',
      profileId: YO,
      terminadoAt: null,
      desde: { lte: expect.any(Date) },
      profile: { user: { status: 'verified_citizen' } },
    });
  });

  it('deja pasar a un observador vigente', async () => {
    const guard = new ObservadorGuard(buildPrisma() as never);
    await expect(guard.canActivate(contexto({ profileId: YO }))).resolves.toBe(true);
  });
});

describe('ObservarService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn>; getEvents: ReturnType<typeof vi.fn> };
  let guardia: ReturnType<typeof guardiaMock>;
  let publicadores: ReturnType<typeof publicadoresMock>;
  let service: ObservarService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = {
      log: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockResolvedValue({ events: [], total: 0, page: 1, limit: 50 }),
    };
    guardia = guardiaMock();
    service = new ObservarService(prisma as never, audit as never, guardia as never, (publicadores = publicadoresMock()) as never);
  });

  it('los eventos salen del registro con los mismos filtros', async () => {
    const dto = { action: 'voto.', page: 2 };
    await expect(service.eventos(dto as never)).resolves.toEqual({ events: [], total: 0, page: 1, limit: 50 });
    expect(audit.getEvents).toHaveBeenCalledWith(dto);
  });

  it('los eventos que ve un observador no traen correos', async () => {
    const pr = { auditEvent: { findMany: vi.fn().mockResolvedValue([
      { id: 'e', createdAt: NOW, action: 'user.invited', resource: 'user:1', metadata: { invitedEmail: 'a@b.org' }, actor: null },
    ]), count: vi.fn().mockResolvedValue(1) } };
    const real = new AuditService(pr as never, {} as never);
    const s = new ObservarService(prisma as never, real, guardia as never, publicadores as never);
    expect(JSON.stringify(await s.eventos({}))).not.toContain('@');
  });

  it('las estadísticas de verificación cuentan por quien confirma, con el nombre visible', async () => {
    prisma.verificationReference.groupBy.mockResolvedValue([
      { refereeProfileId: 'a', kind: 'invitador', _count: { _all: 3 } },
      { refereeProfileId: 'a', kind: 'segunda', _count: { _all: 1 } },
      { refereeProfileId: 'b', kind: 'segunda', _count: { _all: 5 } },
    ]);
    prisma.profile.findMany.mockResolvedValue([
      { id: 'a', displayName: 'Ana Ruiz' },
      { id: 'b', displayName: 'Luis Mora' },
    ]);
    const r = await service.verificaciones();
    expect(r).toEqual([
      { nombre: 'Luis Mora', invitador: 0, segunda: 5 },
      { nombre: 'Ana Ruiz', invitador: 3, segunda: 1 },
    ]);
    expect(prisma.profile.findMany.mock.calls[0]![0].select).toEqual({ id: true, displayName: true });
  });

  it('las matrices no exponen papeletas ni votantes', async () => {
    prisma.eleccion.findMany.mockResolvedValue([
      {
        id: 'e1', cargo: 'secretario', group: { name: 'General' }, contadaAt: NOW, candidatasOrden: ['k1', 'k2'],
        pairwiseMatrix: [[0, 3], [2, 0]], schulzeMatrix: [[0, 3], [0, 0]], semilla: 'abc', electas: ['k1'], ordenFinal: ['k1', 'k2'],
        papeletasTotal: 5, miembros: 9, sinQuorum: false,
      },
    ]);
    prisma.candidatura.findMany.mockResolvedValue([
      { id: 'k1', profile: { displayName: 'Ana Ruiz' } },
      { id: 'k2', profile: { displayName: 'Luis Mora' } },
    ]);
    prisma.sortitionDraw.findMany.mockResolvedValue([
      { id: 's1', title: 'Jurado', executedAt: NOW, seed: 'ff', algorithm: 'fisher-yates-sha256-v1', selectionSize: 3 },
    ]);
    const r = await service.matrices();

    expect(r.elecciones[0]).toMatchObject({
      id: 'e1',
      candidaturas: [{ id: 'k1', nombre: 'Ana Ruiz' }, { id: 'k2', nombre: 'Luis Mora' }],
      pairwiseMatrix: [[0, 3], [2, 0]],
      semilla: 'abc',
    });
    expect(r.sorteos[0]).toMatchObject({ id: 's1', semilla: 'ff' });

    const consultas = [prisma.eleccion.findMany, prisma.decision.findMany, prisma.electionResult.findMany, prisma.sortitionDraw.findMany].map(
      (f) => f.mock.calls[0]![0],
    );
    for (const c of consultas) {
      expect(c.take).toBe(50);
      expect(c.include).toBeUndefined();
      expect(JSON.stringify(c.select)).not.toMatch(/"(papeletas|ballots|votes|poolSnapshot|selectedMembers)"/);
    }
    expect(prisma.eleccion.findMany.mock.calls[0]![0].where).toMatchObject({ fase: 'contada' });
    expect(prisma.sortitionDraw.findMany.mock.calls[0]![0].where).toMatchObject({ status: 'completed' });
    expect(JSON.stringify(r)).not.toMatch(/profileId/);
  });

  it('los gastos pasan de microdólares a dólares, el mes más nuevo primero', async () => {
    prisma.usoAsistente.findMany.mockResolvedValue([
      { mes: '2027-03', costoMicrodolares: 12_345_678n },
      { mes: '2027-02', costoMicrodolares: 500_000n },
    ]);
    expect(await service.gastos()).toEqual([{ mes: '2027-03', usd: 12.35 }, { mes: '2027-02', usd: 0.5 }]);
    expect(prisma.usoAsistente.findMany.mock.calls[0]![0].orderBy).toEqual({ mes: 'desc' });
  });

  describe('observación', () => {
    it('sobre un evento que no existe da 404 y no llega a la guardia', async () => {
      prisma.auditEvent.findUnique.mockResolvedValue(null);
      await expect(service.observar(YO, { auditEventId: EVENTO, texto: TEXTO })).rejects.toThrow(
        new NotFoundException('Ese evento no existe.'),
      );
      expect(guardia.antesDePublicar).not.toHaveBeenCalled();
      expect(prisma.observacionPublica.create).not.toHaveBeenCalled();
    });

    it('pasa por la guardia, se publica y se audita sin texto libre', async () => {
      const r = await service.observar(YO, { auditEventId: EVENTO, texto: `  ${TEXTO}  `, pedirRevision: true });
      expect(r).toEqual({ id: 'o1' });
      expect(guardia.antesDePublicar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'observacion', texto: TEXTO, autorProfileId: YO, pedirRevision: true }),
      );
      expect(prisma.observacionPublica.create.mock.calls[0]![0].data).toEqual({
        autorProfileId: YO, auditEventId: EVENTO, texto: TEXTO,
      });
      expect(audit.log).toHaveBeenCalledWith({
        action: 'observacion.publicada', resource: 'observacion:o1', metadata: { auditEventId: EVENTO },
      });
    });

    it('el publicador vuelve a comprobar al autor y el evento, y lanza si ya no valen', async () => {
      service.onModuleInit();
      expect(publicadores.registrar).toHaveBeenCalledWith('observacion', expect.any(Function));
      const publicar = publicadores.registrar.mock.calls[0]![1] as (a: string, args: unknown, o: unknown) => Promise<unknown>;
      const args = { auditEventId: EVENTO, texto: TEXTO };
      await expect(publicar(YO, args, { sinModeracion: true })).resolves.toEqual({ id: 'o1' });

      prisma.cargo.findFirst.mockResolvedValue(null);
      await expect(publicar(YO, args, { sinModeracion: true })).rejects.toThrow(ForbiddenException);
      prisma.cargo.findFirst.mockResolvedValue({ id: 'c' });
      prisma.auditEvent.findUnique.mockResolvedValue(null);
      await expect(publicar(YO, args, { sinModeracion: true })).rejects.toThrow(NotFoundException);
    });
  });

  it('el DTO pide un evento válido y un texto de 10 a 1000 caracteres', async () => {
    const ok = plainToInstance(ObservacionDto, { auditEventId: EVENTO, texto: '  Esto no cuadra  ' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.texto).toBe('Esto no cuadra');
    expect(await validate(plainToInstance(ObservacionDto, { auditEventId: 'x', texto: 'Esto no cuadra' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ObservacionDto, { auditEventId: EVENTO, texto: 'corto' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ObservacionDto, { auditEventId: EVENTO, texto: 'x'.repeat(1001) }))).not.toHaveLength(0);
  });
});
