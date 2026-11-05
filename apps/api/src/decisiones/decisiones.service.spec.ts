import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DecisionesService } from './decisiones.service';
import { CreateSolucionDto } from './dto/create-solucion.dto';
import { MergeSolucionDto } from './dto/merge-solucion.dto';

const YO = 'p-yo';
const G = 'g1';
const T = 't1';

function buildPrisma() {
  return {
    proposal: { findUnique: vi.fn() },
    groupMembership: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    solucion: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    decision: { findUnique: vi.fn() },
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
  let service: DecisionesService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    forums = { canOrganize: vi.fn().mockResolvedValue(false) };
    prisma.proposal.findUnique.mockResolvedValue({
      id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: new Date('2026-11-12T00:00:00Z'),
    });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u1' });
    prisma.decision.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    service = new DecisionesService(prisma as never, audit as never, forums as never);
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
      expect(r.debateEndsAt).toBe('2026-11-12T00:00:00.000Z');
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
  });
});
