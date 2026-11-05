import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DecisionesService } from './decisiones.service';
import { CreateSolucionDto } from './dto/create-solucion.dto';
import { MergeSolucionDto } from './dto/merge-solucion.dto';
import { ProposeModoDto } from './dto/propose-modo.dto';
import { ObjecionDto } from './dto/objecion.dto';

const YO = 'p-yo';
const G = 'g1';
const T = 't1';

function buildPrisma() {
  return {
    proposal: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    groupMembership: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    solucion: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), updateMany: vi.fn() },
    decision: {
      findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'd1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    objecionModo: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), deleteMany: vi.fn() },
    proposalComment: { findMany: vi.fn().mockResolvedValue([]) },
    consensusSignal: { findMany: vi.fn().mockResolvedValue([]) },
    frase: { findMany: vi.fn().mockResolvedValue([]) },
    fraseVoto: { findMany: vi.fn().mockResolvedValue([]) },
    profile: { findUnique: vi.fn() },
  };
}

function sol(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    proposalId: T,
    authorProfileId: 'p-autor',
    title: `Solución ${id} de prueba`,
    description: `Descripción de ${id}`,
    origen: 'persona',
    hidden: false,
    mergedIntoId: null,
    proposal: { id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: null },
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...over,
  };
}

describe('DecisionesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let forums: { canOrganize: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let service: DecisionesService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    forums = { canOrganize: vi.fn().mockResolvedValue(false) };
    rules = { getInt: vi.fn().mockResolvedValue(7) };
    prisma.proposal.findUnique.mockResolvedValue({
      id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: new Date('2099-11-12T00:00:00Z'),
    });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u1' });
    prisma.decision.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    service = new DecisionesService(prisma as never, audit as never, forums as never, rules as never);
  });

  describe('DTOs', () => {
    it('rechazan títulos de 9 y de 141 caracteres y aceptan 10 y 140', async () => {
      const mk = (title: string) => plainToInstance(CreateSolucionDto, { title, description: 'Algo' });
      expect(await validate(mk('a'.repeat(9)))).toHaveLength(1);
      expect(await validate(mk('a'.repeat(141)))).toHaveLength(1);
      expect(await validate(mk('a'.repeat(10)))).toHaveLength(0);
      expect(await validate(mk('a'.repeat(140)))).toHaveLength(0);
    });
    it('recortan los espacios antes de validar', async () => {
      const dto = plainToInstance(CreateSolucionDto, { title: '  123456789  ', description: '  Algo  ' });
      expect(dto.title).toBe('123456789');
      expect(dto.description).toBe('Algo');
      expect(await validate(dto)).toHaveLength(1);
      expect(await validate(plainToInstance(CreateSolucionDto, { title: '  1234567890  ', description: ' x ' }))).toHaveLength(0);
    });
    it('la descripción va de 1 a 2000', async () => {
      const mk = (description: string) => plainToInstance(CreateSolucionDto, { title: 'a'.repeat(10), description });
      expect(await validate(mk('   '))).toHaveLength(1);
      expect(await validate(mk('a'.repeat(2001)))).toHaveLength(1);
      expect(await validate(mk('a'.repeat(2000)))).toHaveLength(0);
    });
    it('intoId debe ser un UUID', async () => {
      expect(await validate(Object.assign(new MergeSolucionDto(), { intoId: 'nada' }))).toHaveLength(1);
      expect(await validate(Object.assign(new MergeSolucionDto(), { intoId: '3f0f6a7e-5c1d-4b8a-9d2e-1a2b3c4d5e6f' }))).toHaveLength(0);
    });
  });

  describe('createSolucion()', () => {
    const dto = { title: 'Crear una mesa de salud', description: 'Con voluntarios.' };

    it('crea la solución como persona y audita sin texto', async () => {
      prisma.solucion.create.mockResolvedValue({ id: 's1' });
      expect(await service.createSolucion(YO, T, dto, 'ip')).toEqual({ id: 's1' });
      expect(prisma.solucion.create).toHaveBeenCalledWith({
        data: { proposalId: T, authorProfileId: YO, title: dto.title, description: dto.description, origen: 'persona' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'solucion.created', resource: 'solucion:s1', metadata: { proposalId: T } }),
      );
    });
    it('un no miembro no propone', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.solucion.create).not.toHaveBeenCalled();
    });
    it('tema oculto o cerrado: 400', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: true, deliberationEndsAt: null });
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow('Este tema está oculto por moderación.');
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'closed', hidden: false, deliberationEndsAt: null });
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.solucion.create).not.toHaveBeenCalled();
    });
    it('con una fila en decisiones responde que ya quedaron fijas', async () => {
      prisma.decision.findUnique.mockResolvedValue({ id: 'd1' });
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow('Las soluciones ya quedaron fijas.');
      expect(prisma.solucion.create).not.toHaveBeenCalled();
    });
    it('tema inexistente: 404', async () => {
      prisma.proposal.findUnique.mockResolvedValue(null);
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow(NotFoundException);
    });
    it('con el plazo del debate vencido (aunque el programador aún no pase): ya quedaron fijas', async () => {
      prisma.proposal.findUnique.mockResolvedValue({
        id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: new Date(Date.now() - 1000),
      });
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow('Las soluciones ya quedaron fijas.');
      expect(prisma.solucion.create).not.toHaveBeenCalled();
    });
  });

  describe('mergeSolucion()', () => {
    beforeEach(() => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
        if (where.id === 's1') return sol('s1');
        if (where.id === 's2') return sol('s2');
        return null;
      });
      prisma.solucion.updateMany.mockResolvedValue({ count: 1 });
    });

    it('sin canOrganize: 403', async () => {
      forums.canOrganize.mockResolvedValue(false);
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
    });
    it('junta con un updateMany condicionado y audita', async () => {
      await service.mergeSolucion(YO, 's1', 's2', 'ip');
      expect(prisma.solucion.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', mergedIntoId: null, hidden: false },
        data: { mergedIntoId: 's2' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'solucion.merged', resource: 'solucion:s1', metadata: { proposalId: T } }),
      );
    });
    it('consigo misma: 400', async () => {
      await expect(service.mergeSolucion(YO, 's1', 's1', 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
    });
    it('entre temas distintos: 400', async () => {
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 's1' ? sol('s1') : sol('s2', { proposalId: 't-otro' }));
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
    });
    it('si la de destino ya está juntada: 400', async () => {
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 's1' ? sol('s1') : sol('s2', { mergedIntoId: 's3' }));
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
    });
    it('si alguna está oculta o la origen ya juntada: 400', async () => {
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 's1' ? sol('s1', { hidden: true }) : sol('s2'));
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(BadRequestException);
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 's1' ? sol('s1', { mergedIntoId: 's9' }) : sol('s2'));
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(BadRequestException);
    });
    it('con decisión abierta: 400 «ya quedaron fijas»', async () => {
      prisma.decision.findUnique.mockResolvedValue({ id: 'd1' });
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow('Las soluciones ya quedaron fijas.');
    });
    it('si el updateMany no toca nada (carrera): 400 y sin auditar', async () => {
      prisma.solucion.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });
    it('dentro de la transacción vuelve a leer: destino ya juntado por otra petición → 400 sin auditar', async () => {
      let lecturas = 0;
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
        if (where.id === 's1') return sol('s1');
        lecturas += 1;
        // 1.ª lectura (fuera de la transacción): limpia; siguientes: ya juntada.
        return lecturas === 1 ? sol('s2') : sol('s2', { mergedIntoId: 's3' });
      });
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
    it('con el plazo del debate vencido: ya quedaron fijas', async () => {
      const vencido = { id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: new Date(Date.now() - 1000) };
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        sol(where.id, { proposal: vencido }));
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow('Las soluciones ya quedaron fijas.');
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
    });
    it('solución inexistente: 404', async () => {
      await expect(service.mergeSolucion(YO, 'nope', 's2', 'ip')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTema()', () => {
    const lista = () => [
      sol('s1', { authorProfileId: YO }),
      sol('s2', { hidden: true, title: 'Texto secreto de s2', description: 'Detalle secreto' }),
      sol('s3', { mergedIntoId: 's2' }),
    ];
    beforeEach(() => prisma.solucion.findMany.mockResolvedValue(lista()));

    it('exige ser miembro y un tema no oculto', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.getTema(YO, T)).rejects.toThrow(ForbiddenException);
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: true, deliberationEndsAt: null });
      await expect(service.getTema(YO, T)).rejects.toThrow('Este tema está oculto por moderación.');
      expect(prisma.solucion.findMany).not.toHaveBeenCalled();
    });
    it('un miembro ve las ocultas enmascaradas, también como destino de una juntada', async () => {
      const r = await service.getTema(YO, T);
      expect(r.canOrganize).toBe(false);
      expect(r.puedeProponer).toBe(true);
      expect(r.debateEndsAt).toBe('2099-11-12T00:00:00.000Z');
      expect(r.decision).toBeNull();
      expect(r.soluciones[1]).toMatchObject({ id: 's2', title: 'Solución oculta por moderación', description: '', hidden: true });
      expect(r.soluciones[2]!.mergedIntoTitle).toBe('Solución oculta por moderación');
      expect(r.soluciones[0]).toMatchObject({ isAuthor: true, mergedIntoTitle: null, hidden: false });
      expect(JSON.stringify(r)).not.toContain('secreto');
    });
    it('quien organiza ve el texto de las ocultas', async () => {
      forums.canOrganize.mockResolvedValue(true);
      const r = await service.getTema(YO, T);
      expect(r.canOrganize).toBe(true);
      expect(r.soluciones[1]).toMatchObject({ title: 'Texto secreto de s2', description: 'Detalle secreto', hidden: true });
      expect(r.soluciones[2]!.mergedIntoTitle).toBe('Texto secreto de s2');
    });
    it('con decisión: no se puede proponer y se arma la vista sin papeleta ni resultado', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'modo', modo: null, modoPropuesto: null,
        objecionEndsAt: null, votacionEndsAt: null, candidatas: ['s1', 's2'],
      });
      const r = await service.getTema(YO, T);
      expect(r.puedeProponer).toBe(false);
      expect(r.decision).toEqual({
        fase: 'modo', modo: null, modoPropuesto: null, objecionEndsAt: null, votacionEndsAt: null,
        candidatas: [
          { id: 's1', title: 'Solución s1 de prueba', description: 'Descripción de s1', hidden: false },
          { id: 's2', title: 'Solución oculta por moderación', description: '', hidden: true },
        ],
        miPapeleta: null, yoObjete: false, puedoObjetar: false, resultado: null,
      });
    });
    it('un tema cerrado no permite proponer', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'closed', hidden: false, deliberationEndsAt: null });
      const r = await service.getTema(YO, T);
      expect(r.puedeProponer).toBe(false);
      expect(r.debateEndsAt).toBeNull();
    });
    it('con el plazo del debate vencido no se puede proponer', async () => {
      prisma.proposal.findUnique.mockResolvedValue({
        id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: new Date(Date.now() - 1000),
      });
      const r = await service.getTema(YO, T);
      expect(r.puedeProponer).toBe(false);
    });
  });

  describe('DTOs de modo y objeción', () => {
    it('modo solo acepta excluyentes o compatibles', async () => {
      expect(await validate(plainToInstance(ProposeModoDto, { modo: 'otro' }))).toHaveLength(1);
      expect(await validate(plainToInstance(ProposeModoDto, { modo: 'excluyentes' }))).toHaveLength(0);
      expect(await validate(plainToInstance(ProposeModoDto, { modo: 'compatibles' }))).toHaveLength(0);
    });
    it('objeto debe ser booleano', async () => {
      expect(await validate(plainToInstance(ObjecionDto, { objeto: 'sí' }))).toHaveLength(1);
      expect(await validate(plainToInstance(ObjecionDto, { objeto: true }))).toHaveLength(0);
      expect(await validate(plainToInstance(ObjecionDto, { objeto: false }))).toHaveLength(0);
    });
  });

  describe('processDeadlines() — fin del debate', () => {
    const NOW = new Date('2026-11-20T12:00:00Z');
    const DIA = 86_400_000;
    beforeEach(() => {
      prisma.proposal.findMany.mockResolvedValue([{ id: T, groupId: G }]);
      prisma.$queryRaw.mockResolvedValue([{ id: T }]);
    });

    it('busca propuestas abiertas, visibles, con el plazo vencido y sin decisión', async () => {
      prisma.proposal.findMany.mockResolvedValue([]);
      await service.processDeadlines(NOW);
      expect(prisma.proposal.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { kind: 'propuesta', status: 'open', hidden: false, deliberationEndsAt: { lte: NOW }, decision: null },
      }));
    });

    it('con 0 soluciones visibles: contada sin_soluciones y audita decision.counted', async () => {
      prisma.solucion.findMany.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.solucion.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { proposalId: T, hidden: false, mergedIntoId: null },
        orderBy: { createdAt: 'asc' },
      }));
      expect(prisma.decision.create).toHaveBeenCalledWith({
        data: { proposalId: T, fase: 'contada', resultado: 'sin_soluciones', contadaAt: NOW },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.counted', metadata: { proposalId: T, resultado: 'sin_soluciones' },
      }));
    });

    it('con 1 solución visible (la oculta no cuenta: el filtro la excluye): votación compatible directa', async () => {
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(rules.getInt).toHaveBeenCalledWith('votacion.plazo_dias', G);
      expect(prisma.decision.create).toHaveBeenCalledWith({
        data: {
          proposalId: T, fase: 'votacion', modo: 'compatibles', candidatas: ['s1'],
          votacionStartsAt: NOW, votacionEndsAt: new Date(NOW.getTime() + 7 * DIA),
        },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.vote_opened', metadata: { proposalId: T },
      }));
    });

    it('con 2 o más soluciones: fase modo, sin auditar', async () => {
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.create).toHaveBeenCalledWith({ data: { proposalId: T, fase: 'modo' } });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('si el tema dejó de estar abierto o visible al bloquearlo, no crea nada', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(prisma.decision.create).not.toHaveBeenCalled();
    });

    it('si otra ejecución ya creó la decisión (P2002), se ignora y sigue con el resto', async () => {
      prisma.proposal.findMany.mockResolvedValue([{ id: T, groupId: G }, { id: 't2', groupId: G }]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      prisma.decision.create
        .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
        .mockResolvedValueOnce({ id: 'd2' });
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('processDeadlines() — fin de la objeción', () => {
    const NOW = new Date('2026-11-20T12:00:00Z');
    const DIA = 86_400_000;
    const PARTICIPANTES = ['a', 'b', 'c', 'd', 'e', 'f'];

    beforeEach(() => {
      prisma.decision.findMany.mockImplementation(async ({ where }: { where: { fase: string } }) =>
        where.fase === 'objecion'
          ? [{ id: 'd1', proposalId: T, modoPropuesto: 'excluyentes', proposal: { groupId: G } }]
          : []);
      prisma.proposalComment.findMany.mockResolvedValue(PARTICIPANTES.slice(0, 3).map((p) => ({ authorProfileId: p })));
      prisma.consensusSignal.findMany.mockResolvedValue([{ profileId: 'd' }]);
      prisma.frase.findMany.mockResolvedValue([{ authorProfileId: 'e' }]);
      prisma.fraseVoto.findMany.mockResolvedValue([{ profileId: 'f' }, { profileId: 'ex-miembro' }]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      // Solo los seis siguen siendo miembros.
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.filter((p) => PARTICIPANTES.includes(p)).map((profileId) => ({ profileId })));
      rules.getInt.mockImplementation(async (key: string) => (key === 'debate.fraccion_objecion_modo' ? 33 : 7));
    });

    it('P = 6, f = 33: 2 objeciones cambian el modo', async () => {
      prisma.objecionModo.findMany.mockResolvedValue([{ profileId: 'a' }, { profileId: 'b' }]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', fase: 'objecion' },
        data: {
          fase: 'votacion', modo: 'compatibles', candidatas: ['s1', 's2'],
          votacionStartsAt: NOW, votacionEndsAt: new Date(NOW.getTime() + 7 * DIA),
        },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.vote_opened', metadata: { proposalId: T },
      }));
    });

    it('P = 6, f = 33: 1 objeción no cambia el modo', async () => {
      prisma.objecionModo.findMany.mockResolvedValue([{ profileId: 'a' }]);
      await service.processDeadlines(NOW);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ modo: 'excluyentes' }),
      }));
    });

    it('sin objeciones se queda el modo propuesto', async () => {
      await service.processDeadlines(NOW);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ modo: 'excluyentes' }),
      }));
    });

    it('las objeciones de quienes ya no son miembros no cuentan', async () => {
      // Dos objeciones, pero una es de alguien que dejó el grupo: 1 · 100 < 33 · 6.
      prisma.objecionModo.findMany.mockResolvedValue([{ profileId: 'a' }, { profileId: 'ex-miembro' }]);
      await service.processDeadlines(NOW);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ modo: 'excluyentes' }),
      }));
    });

    it('los participantes que ya no son miembros no cuentan en P', async () => {
      // Con P = 6, 2 objeciones bastan; si el ex miembro contara (P = 7), 200 < 231 y no cambiaría.
      prisma.objecionModo.findMany.mockResolvedValue([{ profileId: 'a' }, { profileId: 'b' }]);
      await service.processDeadlines(NOW);
      const pedidos = prisma.groupMembership.findMany.mock.calls[0]![0].where.profileId.in as string[];
      expect(pedidos).toContain('ex-miembro');
      expect(prisma.decision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ modo: 'compatibles' }),
      }));
    });

    it('si el updateMany no toca nada (count = 0), no audita ni cuenta la transición', async () => {
      prisma.decision.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('processDeadlines() — fin de la votación', () => {
    it('llama al conteo, que en esta etapa no hace transiciones', async () => {
      const NOW = new Date('2026-11-20T12:00:00Z');
      prisma.decision.findMany.mockImplementation(async ({ where }: { where: { fase: string } }) =>
        where.fase === 'votacion' ? [{ id: 'd9', proposalId: T }] : []);
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(prisma.decision.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { fase: 'votacion', votacionEndsAt: { lte: NOW } },
      }));
    });
  });

  describe('proposeModo()', () => {
    beforeEach(() => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.decision.findUnique.mockResolvedValue({ id: 'd1', proposalId: T, fase: 'modo' });
    });

    it('sin permiso de organizar: 403', async () => {
      forums.canOrganize.mockResolvedValue(false);
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
    });

    it('fuera de la fase modo: 400', async () => {
      prisma.decision.findUnique.mockResolvedValue({ id: 'd1', proposalId: T, fase: 'objecion' });
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow(BadRequestException);
      prisma.decision.findUnique.mockResolvedValue(null);
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
    });

    it('tema oculto: 400', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: true, deliberationEndsAt: null });
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow('Este tema está oculto por moderación.');
    });

    it('pasa a objeción con un updateMany condicionado y audita sin texto', async () => {
      const antes = Date.now();
      await service.proposeModo(YO, T, 'excluyentes', 'ip');
      expect(rules.getInt).toHaveBeenCalledWith('debate.plazo_objecion_modo_dias', G);
      const arg = prisma.decision.updateMany.mock.calls[0]![0];
      expect(arg.where).toEqual({ id: 'd1', fase: 'modo' });
      expect(arg.data).toMatchObject({ fase: 'objecion', modoPropuesto: 'excluyentes' });
      expect(arg.data.objecionEndsAt.getTime()).toBeGreaterThanOrEqual(antes + 7 * 86_400_000);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.mode_proposed', metadata: { proposalId: T, modo: 'excluyentes' },
      }));
    });

    it('si otra petición ya lo propuso (count = 0): 400 sin auditar', async () => {
      prisma.decision.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('setObjecion()', () => {
    beforeEach(() => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'objecion', objecionEndsAt: new Date(Date.now() + 86_400_000),
      });
      prisma.proposalComment.findMany.mockResolvedValue([{ authorProfileId: YO }]);
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.map((profileId) => ({ profileId })));
    });

    it('quien no participó en el debate: 403', async () => {
      prisma.proposalComment.findMany.mockResolvedValue([{ authorProfileId: 'p-otro' }]);
      await expect(service.setObjecion(YO, T, true)).rejects.toThrow(ForbiddenException);
      await expect(service.setObjecion(YO, T, true)).rejects.toThrow(
        'Solo quienes participaron en el debate pueden objetar el modo.',
      );
      expect(prisma.objecionModo.upsert).not.toHaveBeenCalled();
    });

    it('un no miembro no objeta', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.setObjecion(YO, T, true)).rejects.toThrow(ForbiddenException);
    });

    it('fuera de la fase o con el plazo vencido: 400', async () => {
      prisma.decision.findUnique.mockResolvedValue({ id: 'd1', proposalId: T, fase: 'modo', objecionEndsAt: null });
      await expect(service.setObjecion(YO, T, true)).rejects.toThrow(BadRequestException);
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'objecion', objecionEndsAt: new Date(Date.now() - 1000),
      });
      await expect(service.setObjecion(YO, T, true)).rejects.toThrow(BadRequestException);
      expect(prisma.objecionModo.upsert).not.toHaveBeenCalled();
    });

    it('objetar hace upsert, retirar borra; ninguna de las dos audita', async () => {
      expect(await service.setObjecion(YO, T, true)).toEqual({ yoObjete: true });
      expect(prisma.objecionModo.upsert).toHaveBeenCalledWith({
        where: { decisionId_profileId: { decisionId: 'd1', profileId: YO } },
        create: { decisionId: 'd1', profileId: YO },
        update: {},
      });
      expect(await service.setObjecion(YO, T, false)).toEqual({ yoObjete: false });
      expect(prisma.objecionModo.deleteMany).toHaveBeenCalledWith({ where: { decisionId: 'd1', profileId: YO } });
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
