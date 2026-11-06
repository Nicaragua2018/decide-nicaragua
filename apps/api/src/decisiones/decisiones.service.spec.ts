import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DecisionesService } from './decisiones.service';
import { GroupAccessService } from '../groups/group-access.service';
import { CreateSolucionDto } from './dto/create-solucion.dto';
import { MergeSolucionDto } from './dto/merge-solucion.dto';
import { ProposeModoDto } from './dto/propose-modo.dto';
import { ObjecionDto } from './dto/objecion.dto';
import { PapeletaDto } from './dto/papeleta.dto';

const YO = 'p-yo';
const G = 'g1';
const T = 't1';

function buildPrisma() {
  return {
    proposal: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    groupMembership: {
      findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    group: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    solucion: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), updateMany: vi.fn() },
    decision: {
      findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'd1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    objecionModo: {
      findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn(), deleteMany: vi.fn(),
    },
    decisionPapeleta: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    proposalComment: { findMany: vi.fn().mockResolvedValue([]) },
    consensusSignal: { findMany: vi.fn().mockResolvedValue([]) },
    frase: { findMany: vi.fn().mockResolvedValue([]) },
    fraseVoto: { findMany: vi.fn().mockResolvedValue([]) },
    profile: { findUnique: vi.fn() },
    moderationAction: { findMany: vi.fn().mockResolvedValue([]) },
    inquietud: { findMany: vi.fn().mockResolvedValue([]) },
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
    service = new DecisionesService(prisma as never, audit as never, forums as never, rules as never, new GroupAccessService(prisma as never));
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
    beforeEach(() => prisma.$queryRaw.mockResolvedValue([{ id: T }]));

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
    it('dentro de una bifurcación crear y juntar soluciones se auditan sin actor, ip ni el grupo', async () => {
      prisma.group.findUnique.mockResolvedValue({ type: 'trabajo', parentGroupId: 'g-amb', trabajoEstado: 'activo', trabajoTipo: 'bifurcacion' });
      prisma.solucion.create.mockResolvedValue({ id: 's1' });
      await service.createSolucion(YO, T, dto, 'ip');
      forums.canOrganize.mockResolvedValue(true);
      prisma.solucion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        sol(where.id, { proposal: { id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: null } }),
      );
      prisma.solucion.updateMany.mockResolvedValue({ count: 1 });
      await service.mergeSolucion(YO, 's1', 's2', 'ip');
      expect(audit.log.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual(['solucion.created', 'solucion.merged']);
      for (const [e] of audit.log.mock.calls as [Record<string, unknown>][]) {
        expect(e).not.toHaveProperty('actorId');
        expect(e).not.toHaveProperty('ip');
        expect(JSON.stringify(e)).not.toContain(`"${G}"`);
      }
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
    it('crea dentro de una transacción tras bloquear el tema con FOR SHARE (abierto, visible, plazo sin vencer)', async () => {
      prisma.solucion.create.mockResolvedValue({ id: 's1' });
      await service.createSolucion(YO, T, dto, 'ip');
      expect(prisma.$transaction).toHaveBeenCalled();
      const sql = (prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql;
      expect(sql).toContain('FROM proposals');
      expect(sql).toContain('hidden = false');
      expect(sql).toContain("status = 'open'");
      expect(sql).toContain('"deliberationEndsAt" > now()');
      expect(sql).toContain('FOR SHARE');
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(prisma.solucion.create.mock.invocationCallOrder[0]!);
    });
    it('carrera con el fin del debate: si al bloquear el tema ya no está vivo o ya tiene decisión, 400 fijas sin crear', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow('Las soluciones ya quedaron fijas.');
      prisma.$queryRaw.mockResolvedValue([{ id: T }]);
      // Fuera de la transacción aún no había decisión; dentro, el programador ya la creó.
      prisma.decision.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'd1' });
      await expect(service.createSolucion(YO, T, dto, 'ip')).rejects.toThrow('Las soluciones ya quedaron fijas.');
      expect(prisma.solucion.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
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
      prisma.$queryRaw.mockResolvedValue([{ id: T }]);
    });

    it('quien organiza pero no es miembro del grupo: 403', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
    });
    it('bloquea el tema con FOR SHARE antes que las soluciones; si ya no está vivo: 400 fijas sin juntar', async () => {
      await service.mergeSolucion(YO, 's1', 's2', 'ip');
      const sqls = prisma.$queryRaw.mock.calls.map(([q]) => (q as Prisma.Sql).sql);
      expect(sqls[0]).toContain('FROM proposals');
      expect(sqls[0]).toContain('FOR SHARE');
      expect(sqls[1]).toContain('FROM soluciones');
      prisma.solucion.updateMany.mockClear();
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow('Las soluciones ya quedaron fijas.');
      expect(prisma.solucion.updateMany).not.toHaveBeenCalled();
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
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
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
    it('llevadas: las soluciones del tema que ya se llevaron a la comunidad, en una consulta', async () => {
      let r = await service.getTema(YO, T);
      expect(r.llevadas).toEqual([]);
      prisma.inquietud.findMany.mockResolvedValue([{ origenSolucionId: 's1' }]);
      r = await service.getTema(YO, T);
      expect(r.llevadas).toEqual(['s1']);
      expect(prisma.inquietud.findMany).toHaveBeenLastCalledWith({
        where: { origenSolucionId: { in: ['s1', 's2', 's3'] } },
        select: { origenSolucionId: true },
      });
    });
    it('quien organiza ve el texto de las ocultas', async () => {
      forums.canOrganize.mockResolvedValue(true);
      const r = await service.getTema(YO, T);
      expect(r.canOrganize).toBe(true);
      expect(r.soluciones[1]).toMatchObject({ title: 'Texto secreto de s2', description: 'Detalle secreto', hidden: true });
      expect(r.soluciones[2]!.mergedIntoTitle).toBe('Texto secreto de s2');
    });
    it('con decisión en modo: no se puede proponer; candidatas son las vivas (sin ocultas ni juntadas) aunque la fila aún no tenga', async () => {
      rules.getInt.mockImplementation(async (key: string) => (key === 'debate.fraccion_objecion_modo' ? 33 : 7));
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'modo', modo: null, modoPropuesto: null,
        objecionEndsAt: null, votacionEndsAt: null, candidatas: [],
      });
      const r = await service.getTema(YO, T);
      expect(r.puedeProponer).toBe(false);
      expect(rules.getInt).toHaveBeenCalledWith('debate.fraccion_objecion_modo', G);
      expect(r.decision).toEqual({
        fase: 'modo', modo: null, modoPropuesto: null, objecionEndsAt: null, votacionEndsAt: null,
        candidatas: [{
          id: 's1', title: 'Solución s1 de prueba', description: 'Descripción de s1', hidden: false,
          bifurcable: false, puedoIniciarBifurcacion: false, bifurcacionId: null,
        }],
        miPapeleta: null, yoObjete: false, puedoObjetar: false, resultado: null, fraccionObjecionPct: 33,
      });
    });
    it('en objeción también muestra las candidatas vivas en orden de llegada', async () => {
      prisma.solucion.findMany.mockResolvedValue([
        sol('s1'), sol('s4', { createdAt: new Date('2026-11-02T00:00:00Z') }), sol('s5', { hidden: true }),
      ]);
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'objecion', modo: null, modoPropuesto: 'excluyentes',
        objecionEndsAt: new Date(Date.now() + 86_400_000), votacionEndsAt: null, candidatas: [],
      });
      const r = await service.getTema(YO, T);
      expect(r.decision!.candidatas.map((c) => c.id)).toEqual(['s1', 's4']);
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

    describe('bifurcaciones en una decisión contada', () => {
      const CONTADA = new Date(Date.now() - 2 * 86_400_000);
      const contada = (over: Record<string, unknown> = {}) => ({
        id: 'd1', proposalId: T, fase: 'contada', modo: 'excluyentes', modoPropuesto: 'excluyentes',
        objecionEndsAt: null, votacionEndsAt: null, candidatas: ['s1', 's4'], ganadoras: ['s1'],
        resultado: 'aprobada', aprobaciones: [3, 2], papeletasTotal: 5, abstenciones: 0, miembros: 9,
        pairwiseMatrix: [], schulzeMatrix: [], contadaAt: CONTADA, updatedAt: CONTADA,
        ...over,
      });
      beforeEach(() => {
        prisma.solucion.findMany.mockResolvedValue([sol('s1'), sol('s4')]);
        prisma.decision.findUnique.mockResolvedValue(contada());
        rules.getInt.mockImplementation(async (key: string) => (key === 'bifurcacion.plazo_dias' ? 14 : 7));
      });
      const cand = (r: Awaited<ReturnType<DecisionesService['getTema']>>, id: string) =>
        r.decision!.candidatas.find((c) => c.id === id)!;

      it('la perdedora es bifurcable; solo quien la tenía en su orden puede iniciarla', async () => {
        prisma.decisionPapeleta.findUnique.mockResolvedValue({ abstencion: false, orden: ['s4', 's1'] });
        const r = await service.getTema(YO, T);
        expect(cand(r, 's1')).toMatchObject({ bifurcable: false, puedoIniciarBifurcacion: false, bifurcacionId: null });
        expect(cand(r, 's4')).toMatchObject({ bifurcable: true, puedoIniciarBifurcacion: true, bifurcacionId: null });
        expect(rules.getInt).toHaveBeenCalledWith('bifurcacion.plazo_dias', G);
      });

      it('para quien votó otra cosa, no votó o se abstuvo, la respuesta es idéntica', async () => {
        const respuestas: string[] = [];
        for (const p of [{ abstencion: false, orden: ['s1'] }, null, { abstencion: true, orden: [] }]) {
          prisma.decisionPapeleta.findUnique.mockResolvedValue(p);
          const r = await service.getTema(YO, T);
          respuestas.push(JSON.stringify(r.decision!.candidatas));
        }
        expect(new Set(respuestas).size).toBe(1);
        expect(respuestas[0]).toContain('"puedoIniciarBifurcacion":false');
      });

      it('si ya existe, da su id y deja sumarse a quien la apoyó; no lista a nadie', async () => {
        prisma.decisionPapeleta.findUnique.mockResolvedValue({ abstencion: false, orden: ['s4'] });
        prisma.group.findMany.mockResolvedValue([
          { id: 'g-bif', origenSolucionId: 's4', trabajoEstado: 'convocando', convocatoriaEndsAt: new Date(Date.now() + 86_400_000) },
        ]);
        let r = await service.getTema(YO, T);
        expect(cand(r, 's4')).toMatchObject({ bifurcable: true, puedoIniciarBifurcacion: true, bifurcacionId: 'g-bif' });
        expect(prisma.groupMembership.findMany).toHaveBeenCalledWith({
          where: { profileId: YO, groupId: { in: ['g-bif'] } },
          select: { groupId: true },
        });
        // Quien ya es miembro no se suma otra vez.
        prisma.groupMembership.findMany.mockResolvedValue([{ groupId: 'g-bif' }]);
        r = await service.getTema(YO, T);
        expect(cand(r, 's4').puedoIniciarBifurcacion).toBe(false);
        expect(JSON.stringify(r)).not.toContain('p-autor');
      });

      it('fuera de plazo no se inicia; en un grupo de trabajo nada es bifurcable', async () => {
        prisma.decisionPapeleta.findUnique.mockResolvedValue({ abstencion: false, orden: ['s4'] });
        prisma.decision.findUnique.mockResolvedValue(contada({ contadaAt: new Date(Date.now() - 15 * 86_400_000) }));
        let r = await service.getTema(YO, T);
        expect(cand(r, 's4')).toMatchObject({ bifurcable: true, puedoIniciarBifurcacion: false });
        prisma.decision.findUnique.mockResolvedValue(contada());
        prisma.group.findUnique.mockResolvedValue({ type: 'trabajo', parentGroupId: 'g-amb', trabajoEstado: 'activo', trabajoTipo: 'subgrupo' });
        r = await service.getTema(YO, T);
        expect(cand(r, 's4')).toMatchObject({ bifurcable: false, puedoIniciarBifurcacion: false });
      });
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
        where: {
          kind: 'propuesta', status: 'open', hidden: false, deliberationEndsAt: { lte: NOW }, decision: null, electionId: null,
        },
      }));
    });

    it('una propuesta del plan 2 con votación propia (electionId) no entra: ni la consulta ni el bloqueo la toman', async () => {
      // La consulta ya la excluye; si se colara (lectura vieja), el bloqueo exige electionId nulo.
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }]);
      expect(await service.processDeadlines(NOW)).toBe(0);
      const sql = (prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql;
      expect(sql).toContain('"electionId" IS NULL');
      expect(sql).toContain('FOR UPDATE');
      expect(prisma.decision.create).not.toHaveBeenCalled();
    });

    it('con 0 soluciones visibles: contada sin_soluciones y audita decision.counted', async () => {
      prisma.solucion.findMany.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.solucion.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { proposalId: T, mergedIntoId: null },
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

    it('una solución oculta en firme no entra; una oculta de forma provisional sí (solo pausa)', async () => {
      prisma.solucion.findMany.mockResolvedValue([
        { id: 's1', hidden: false }, { id: 's2', hidden: true }, { id: 's3', hidden: true },
      ]);
      prisma.moderationAction.findMany.mockResolvedValue([{ targetId: 's2' }]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.moderationAction.findMany).toHaveBeenCalledWith({
        where: { target: 'solucion', targetId: { in: ['s2', 's3'] }, status: 'provisional' },
        select: { targetId: true },
      });
      // Dos candidatas (s1 visible y s2 provisional): fase modo, no votación directa con una sola.
      expect(prisma.decision.create).toHaveBeenCalledWith({ data: { proposalId: T, fase: 'modo' } });
    });

    it('sin ocultas provisionales, la oculta en firme queda fuera: votación directa con la única visible', async () => {
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1', hidden: false }, { id: 's3', hidden: true }]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ fase: 'votacion', candidatas: ['s1'] }),
      });
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

  describe('processDeadlines() — plazo para proponer el modo', () => {
    const NOW = new Date('2026-11-20T12:00:00Z');
    const DIA = 86_400_000;
    const creada = (dias: number) => new Date(NOW.getTime() - dias * DIA);
    const enModo = (createdAt: Date) => [{ id: 'd1', proposalId: T, createdAt, proposal: { groupId: G } }];

    beforeEach(() => {
      prisma.decision.findMany.mockImplementation(async ({ where }: { where: { fase: string } }) =>
        (where.fase === 'modo' ? enModo(creada(7)) : []));
      prisma.$queryRaw.mockResolvedValue([{ id: T }]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      rules.getInt.mockImplementation(async (key: string) => (key === 'debate.plazo_objecion_modo_dias' ? 7 : 5));
    });

    it('busca las decisiones en fase modo y lee el plazo del grupo', async () => {
      await service.processDeadlines(NOW);
      expect(prisma.decision.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { fase: 'modo' } }));
      expect(rules.getInt).toHaveBeenCalledWith('debate.plazo_objecion_modo_dias', G);
    });

    it('antes del plazo no hace nada', async () => {
      prisma.decision.findMany.mockImplementation(async ({ where }: { where: { fase: string } }) =>
        (where.fase === 'modo' ? enModo(new Date(creada(7).getTime() + 1000)) : []));
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('con 2 o más vivas: propone excluyentes y abre la objeción; audita mode_proposed', async () => {
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect((prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql).toContain('FOR UPDATE');
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', fase: 'modo' },
        data: { fase: 'objecion', modoPropuesto: 'excluyentes', objecionEndsAt: new Date(NOW.getTime() + 7 * DIA) },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.mode_proposed', resource: 'decision:d1', metadata: { proposalId: T, modo: 'excluyentes' },
      }));
    });

    it('con 1 viva: votación compatible con el plazo de votación; audita vote_opened', async () => {
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(rules.getInt).toHaveBeenCalledWith('votacion.plazo_dias', G);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', fase: 'modo' },
        data: {
          fase: 'votacion', modo: 'compatibles', candidatas: ['s1'],
          votacionStartsAt: NOW, votacionEndsAt: new Date(NOW.getTime() + 5 * DIA),
        },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.vote_opened', metadata: { proposalId: T } }));
    });

    it('con 0 vivas: contada sin_soluciones; audita decision.counted', async () => {
      prisma.solucion.findMany.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', fase: 'modo' },
        data: { fase: 'contada', resultado: 'sin_soluciones', contadaAt: NOW, candidatas: [] },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.counted', metadata: { proposalId: T, resultado: 'sin_soluciones' },
      }));
    });

    it('si el tema ya no está vivo al bloquearlo, no toca nada', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('si el updateMany no toca nada (alguien propuso el modo a la vez), no audita ni cuenta', async () => {
      prisma.decision.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
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
      prisma.$queryRaw.mockResolvedValue([{ id: T }]);
    });

    it('bloquea el tema con FOR UPDATE antes de leer las candidatas; si ya no está vivo, no toca nada', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect((prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql).toContain('FOR UPDATE');
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('con 0 candidatas visibles: queda contada sin_soluciones y audita decision.counted', async () => {
      prisma.solucion.findMany.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', fase: 'objecion' },
        data: { fase: 'contada', resultado: 'sin_soluciones', contadaAt: NOW, candidatas: [] },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.counted', metadata: { proposalId: T, resultado: 'sin_soluciones' },
      }));
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.vote_opened' }));
    });

    it('con 1 candidata: modo compatibles aunque se propusiera excluyentes y nadie objetara', async () => {
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }]);
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ fase: 'votacion', modo: 'compatibles', candidatas: ['s1'] }),
      }));
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

  describe('processDeadlines() — fin de la votación (conteo)', () => {
    const NOW = new Date('2026-11-20T12:00:00Z');
    const MIEMBROS = ['a', 'b', 'c', 'd'];
    const PAPELETAS = [
      { profileId: 'a', abstencion: false, orden: ['s1', 's2'] },
      // Guardada con un id ajeno y repetido: el conteo los descarta por si acaso.
      { profileId: 'b', abstencion: false, orden: ['s1', 'zz', 's1'] },
      { profileId: 'c', abstencion: true, orden: [] },
      { profileId: 'ex-miembro', abstencion: false, orden: ['s2', 's1'] },
    ];

    beforeEach(() => {
      prisma.decision.findMany.mockImplementation(async ({ where }: { where: { fase: string } }) =>
        where.fase === 'votacion' ? [{ id: 'd1' }] : []);
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'votacion', modo: 'excluyentes', candidatas: ['s1', 's2'], proposal: { groupId: G },
      });
      prisma.$queryRaw.mockResolvedValue([{ id: T }]);
      prisma.groupMembership.count.mockResolvedValue(MIEMBROS.length);
      rules.getInt.mockImplementation(async (key: string) => (key === 'votacion.quorum_porcentaje' ? 50 : 7));
      prisma.decisionPapeleta.findMany.mockImplementation(
        async ({ where }: { where: { profile?: { memberships?: { some?: { groupId?: string } } } } }) =>
          (where.profile?.memberships?.some?.groupId === G ? PAPELETAS.filter((p) => MIEMBROS.includes(p.profileId)) : PAPELETAS)
            .map(({ abstencion, orden }) => ({ abstencion, orden })),
      );
    });

    it('busca las votaciones vencidas', async () => {
      await service.processDeadlines(NOW);
      expect(prisma.decision.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { fase: 'votacion', votacionEndsAt: { lte: NOW } },
      }));
    });

    it('cuenta solo papeletas y miembros actuales, congela el resultado y audita decision.counted', async () => {
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(rules.getInt).toHaveBeenCalledWith('votacion.quorum_porcentaje', G);
      expect(prisma.decisionPapeleta.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { decisionId: 'd1', profile: { memberships: { some: { groupId: G } } } },
      }));
      expect(prisma.groupMembership.count).toHaveBeenCalledWith({ where: { groupId: G } });
      expect((prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql).toContain('FOR UPDATE');
      const arg = prisma.decision.updateMany.mock.calls[0]![0];
      expect(arg.where).toEqual({ id: 'd1', fase: 'votacion' });
      // La del ex miembro no cuenta: 3 papeletas, 1 abstención, s1 en 2 y s2 en 1.
      expect(arg.data).toMatchObject({
        fase: 'contada', resultado: 'aprobada', ganadoras: ['s1'], aprobaciones: [2, 1],
        papeletasTotal: 3, abstenciones: 1, miembros: 4, contadaAt: NOW,
      });
      expect(arg.data.pairwiseMatrix).toEqual([[0, 2], [0, 0]]);
      expect(Array.isArray(arg.data.schulzeMatrix)).toBe(true);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.counted', resource: 'decision:d1', metadata: { proposalId: T, resultado: 'aprobada' },
      }));
    });

    it('bloquea la fila de la decisión antes de leer las papeletas (espera a una papeleta en curso)', async () => {
      await service.processDeadlines(NOW);
      const i = prisma.$queryRaw.mock.calls.findIndex(([q]) => {
        const sql = (q as Prisma.Sql).sql;
        return sql.includes('FROM decisiones') && sql.includes('FOR UPDATE');
      });
      expect(i).toBeGreaterThanOrEqual(0);
      expect(prisma.$queryRaw.mock.invocationCallOrder[i]!).toBeLessThan(
        prisma.decisionPapeleta.findMany.mock.invocationCallOrder[0]!,
      );
    });

    it('ejecutado dos veces audita una sola vez (el segundo updateMany no toca nada)', async () => {
      prisma.decision.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(audit.log).toHaveBeenCalledTimes(1);
    });

    it('con una sola candidata usa compatibles (aunque no haya modo guardado)', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'votacion', modo: null, candidatas: ['s1'], proposal: { groupId: G },
      });
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.decision.updateMany.mock.calls[0]![0].data).toMatchObject({ resultado: 'aprobada', ganadoras: ['s1'] });
    });

    it('una candidata ocultada durante la votación no puede ganar (se lee dentro de la transacción)', async () => {
      // s1 sería la ganadora; al estar oculta, en excluyentes no se aprueba ninguna.
      prisma.solucion.findMany.mockImplementation(async ({ where }: { where: { hidden?: boolean } }) =>
        (where.hidden === true ? [{ id: 's1' }] : []));
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.solucion.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: ['s1', 's2'] }, hidden: true },
      }));
      const arg = prisma.decision.updateMany.mock.calls[0]![0];
      expect(arg.data).toMatchObject({ resultado: 'ninguna', ganadoras: [], aprobaciones: [2, 1] });
      expect(arg.data.pairwiseMatrix).toEqual([[0, 2], [0, 0]]);
    });

    it('compatibles: la oculta sale de las ganadoras y, si era la única, el resultado es ninguna', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'votacion', modo: 'compatibles', candidatas: ['s1', 's2'], proposal: { groupId: G },
      });
      prisma.solucion.findMany.mockImplementation(async ({ where }: { where: { hidden?: boolean } }) =>
        (where.hidden === true ? [{ id: 's1' }] : []));
      await service.processDeadlines(NOW);
      expect(prisma.decision.updateMany.mock.calls[0]![0].data).toMatchObject({ resultado: 'ninguna', ganadoras: [] });
    });

    it('si una candidata está oculta de forma provisional, no cuenta en esta pasada (reintenta la siguiente)', async () => {
      prisma.moderationAction.findMany.mockResolvedValue([{ targetId: 's2' }]);
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(prisma.moderationAction.findMany).toHaveBeenCalledWith({
        where: { target: 'solucion', targetId: { in: ['s1', 's2'] }, status: 'provisional' },
        select: { targetId: true },
      });
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      // Confirmada (o vencida) la provisional, la pasada siguiente cuenta.
      prisma.moderationAction.findMany.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(1);
    });

    it('si el tema ya no está vivo al bloquearlo, no cuenta ni audita', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('si dentro de la transacción la decisión ya no está en votación, no cuenta', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'cancelada', modo: 'excluyentes', candidatas: ['s1', 's2'], proposal: { groupId: G },
      });
      expect(await service.processDeadlines(NOW)).toBe(0);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('proposeModo()', () => {
    beforeEach(() => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.decision.findUnique.mockResolvedValue({ id: 'd1', proposalId: T, fase: 'modo' });
      prisma.$queryRaw.mockResolvedValue([{ id: T }]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    });

    it('quien organiza pero no es miembro del grupo: 403', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
    });

    it('dentro de una bifurcación se audita sin actor ni ip', async () => {
      prisma.group.findUnique.mockResolvedValue({ type: 'trabajo', parentGroupId: 'g-amb', trabajoEstado: 'activo', trabajoTipo: 'bifurcacion' });
      await service.proposeModo(YO, T, 'excluyentes', 'ip');
      expect(audit.log).toHaveBeenCalled();
      for (const [e] of audit.log.mock.calls as [Record<string, unknown>][]) {
        expect(e).not.toHaveProperty('actorId');
        expect(e).not.toHaveProperty('ip');
      }
    });

    it('con una sola solución viva no hay objeción: abre la votación compatible y audita vote_opened', async () => {
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1' }]);
      const antes = Date.now();
      await service.proposeModo(YO, T, 'excluyentes', 'ip');
      const arg = prisma.decision.updateMany.mock.calls[0]![0];
      expect(arg.where).toEqual({ id: 'd1', fase: 'modo' });
      expect(arg.data).toMatchObject({ fase: 'votacion', modo: 'compatibles', candidatas: ['s1'] });
      expect(arg.data.votacionEndsAt.getTime()).toBeGreaterThanOrEqual(antes + 7 * 86_400_000);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.vote_opened', metadata: { proposalId: T } }));
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.mode_proposed' }));
    });

    it('sin soluciones vivas: queda contada sin_soluciones y audita decision.counted', async () => {
      prisma.solucion.findMany.mockResolvedValue([]);
      await service.proposeModo(YO, T, 'compatibles', 'ip');
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', fase: 'modo' },
        data: expect.objectContaining({ fase: 'contada', resultado: 'sin_soluciones', candidatas: [] }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.counted', metadata: { proposalId: T, resultado: 'sin_soluciones' },
      }));
    });

    it('si al bloquear el tema ya no está vivo: 400 sin tocar la decisión', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow(BadRequestException);
      expect((prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql).toContain('FOR UPDATE');
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
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
      prisma.$queryRaw.mockResolvedValue([{ id: 'd1' }]);
    });

    it('dentro de la transacción vuelve a comprobar la fase y el plazo; si cambiaron: 400 sin escribir', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.setObjecion(YO, T, true)).rejects.toThrow('El plazo para objetar el modo no está abierto.');
      await expect(service.setObjecion(YO, T, false)).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).toHaveBeenCalled();
      const sql = (prisma.$queryRaw.mock.calls[0]![0] as Prisma.Sql).sql;
      expect(sql).toContain("fase = 'objecion'");
      expect(sql).toContain('"objecionEndsAt" >');
      expect(sql).toContain('FOR UPDATE');
      expect(prisma.objecionModo.upsert).not.toHaveBeenCalled();
      expect(prisma.objecionModo.deleteMany).not.toHaveBeenCalled();
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

  describe('DTO de la papeleta', () => {
    const U1 = '3f0f6a7e-5c1d-4b8a-9d2e-1a2b3c4d5e6f';
    it('abstencion booleana, orden un arreglo de UUID de hasta 50', async () => {
      expect(await validate(plainToInstance(PapeletaDto, { abstencion: false, orden: [U1] }))).toHaveLength(0);
      expect(await validate(plainToInstance(PapeletaDto, { abstencion: true, orden: [] }))).toHaveLength(0);
      expect(await validate(plainToInstance(PapeletaDto, { abstencion: 'no', orden: [] }))).toHaveLength(1);
      expect(await validate(plainToInstance(PapeletaDto, { abstencion: false, orden: 'x' }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(PapeletaDto, { abstencion: false, orden: ['nada'] }))).toHaveLength(1);
      expect(await validate(plainToInstance(PapeletaDto, { abstencion: false, orden: Array(51).fill(U1) }))).toHaveLength(1);
    });
  });

  describe('castPapeleta()', () => {
    const futuro = () => new Date(Date.now() + 86_400_000);
    const enVotacion = (candidatas: string[]) => ({
      id: 'd1', proposalId: T, fase: 'votacion', votacionEndsAt: futuro(), candidatas,
    });
    beforeEach(() => {
      prisma.decision.findUnique.mockResolvedValue(enVotacion(['s1']));
      prisma.$queryRaw.mockResolvedValue([{ id: 'd1' }]);
      prisma.decisionPapeleta.upsert.mockResolvedValue({});
    });

    it.each([
      ['Apruebo', { abstencion: false, orden: ['s1'] }],
      ['No apruebo', { abstencion: false, orden: [] }],
      ['Me abstengo', { abstencion: true, orden: [] }],
    ])('con una sola candidata: «%s» se guarda con upsert y no se audita', async (_n, p) => {
      expect(await service.castPapeleta(YO, T, p)).toEqual(p);
      expect(prisma.decisionPapeleta.upsert).toHaveBeenCalledWith({
        where: { decisionId_profileId: { decisionId: 'd1', profileId: YO } },
        create: { decisionId: 'd1', profileId: YO, abstencion: p.abstencion, orden: p.orden },
        update: { abstencion: p.abstencion, orden: p.orden },
      });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('orden parcial con varias candidatas', async () => {
      prisma.decision.findUnique.mockResolvedValue(enVotacion(['s1', 's2', 's3']));
      const p = { abstencion: false, orden: ['s3', 's1'] };
      expect(await service.castPapeleta(YO, T, p)).toEqual(p);
      expect(prisma.decisionPapeleta.upsert).toHaveBeenCalledTimes(1);
    });

    it('papeleta manipulada: id de otro tema, id repetido o abstención con orden → 400 sin guardar', async () => {
      prisma.decision.findUnique.mockResolvedValue(enVotacion(['s1', 's2']));
      await expect(service.castPapeleta(YO, T, { abstencion: false, orden: ['s1', 's-otro'] })).rejects.toThrow(BadRequestException);
      await expect(service.castPapeleta(YO, T, { abstencion: false, orden: ['s1', 's1'] })).rejects.toThrow(BadRequestException);
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: ['s1'] })).rejects.toThrow(BadRequestException);
      expect(prisma.decisionPapeleta.upsert).not.toHaveBeenCalled();
    });

    it('si el tema se ocultó entre la lectura y la escritura, no guarda: el tema se bloquea antes que la decisión', async () => {
      prisma.$queryRaw.mockImplementation(async (q: Prisma.Sql) => (q.sql.includes('FROM proposals') ? [] : [{ id: 'd1' }]));
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow('Este tema está oculto por moderación.');
      expect(prisma.decisionPapeleta.upsert).not.toHaveBeenCalled();
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw.mockResolvedValue([{ id: 'x' }]);
      await service.castPapeleta(YO, T, { abstencion: true, orden: [] });
      const sqls = prisma.$queryRaw.mock.calls.map(([q]) => (q as Prisma.Sql).sql);
      expect(sqls[0]).toMatch(/FROM proposals WHERE id = .* AND hidden = false FOR SHARE/);
      expect(sqls[1]).toContain('FROM decisiones');
    });

    it('fuera de la fase de votación o con el plazo vencido: 400', async () => {
      prisma.decision.findUnique.mockResolvedValue({ ...enVotacion(['s1']), fase: 'objecion' });
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow('La votación no está abierta.');
      prisma.decision.findUnique.mockResolvedValue({ ...enVotacion(['s1']), votacionEndsAt: new Date(Date.now() - 1000) });
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow('La votación no está abierta.');
      prisma.decision.findUnique.mockResolvedValue(null);
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow('La votación no está abierta.');
      expect(prisma.decisionPapeleta.upsert).not.toHaveBeenCalled();
    });

    it('dentro de la transacción vuelve a comprobar la fase y el plazo; si cambiaron: 400 sin guardar', async () => {
      // El tema sigue visible (primer bloqueo); la decisión ya no está en votación (segundo).
      prisma.$queryRaw.mockImplementation(async (q: Prisma.Sql) => (q.sql.includes('FROM proposals') ? [{ id: T }] : []));
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow('La votación no está abierta.');
      const sql = (prisma.$queryRaw.mock.calls[1]![0] as Prisma.Sql).sql;
      expect(sql).toContain("fase = 'votacion'");
      expect(sql).toContain('"votacionEndsAt" >');
      expect(sql).toContain('FOR UPDATE');
      expect(prisma.decisionPapeleta.upsert).not.toHaveBeenCalled();
    });

    it('quien no es miembro recibe 403; tema oculto 400; tema inexistente 404', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow(ForbiddenException);
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: true, deliberationEndsAt: null });
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow('Este tema está oculto por moderación.');
      prisma.proposal.findUnique.mockResolvedValue(null);
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow(NotFoundException);
      expect(prisma.decisionPapeleta.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getTema() — papeleta, objeción y resultado', () => {
    const OTRO = 'p-otro-perfil';
    beforeEach(() => {
      prisma.solucion.findMany.mockResolvedValue([
        sol('s1'),
        sol('s2', { hidden: true, title: 'Texto secreto de s2', description: 'Detalle secreto' }),
      ]);
      // Si el servicio pidiera la papeleta de otra persona, la recibiría: la prueba lo detectaría.
      prisma.decisionPapeleta.findUnique.mockImplementation(
        async ({ where }: { where: { decisionId_profileId: { profileId: string } } }) =>
          where.decisionId_profileId.profileId === YO
            ? { id: 'pp1', profileId: YO, abstencion: false, orden: ['s1'] }
            : { id: 'pp2', profileId: OTRO, abstencion: false, orden: ['s2', 's1'] },
      );
      prisma.decisionPapeleta.findMany.mockResolvedValue([
        { id: 'pp2', profileId: OTRO, abstencion: false, orden: ['s2', 's1'] },
      ]);
      prisma.objecionModo.findUnique.mockImplementation(
        async ({ where }: { where: { decisionId_profileId: { profileId: string } } }) =>
          ({ id: where.decisionId_profileId.profileId === YO ? 'o1' : 'o2', profileId: where.decisionId_profileId.profileId }),
      );
      prisma.objecionModo.findMany.mockResolvedValue([{ profileId: OTRO }]);
    });

    it('en votación: devuelve solo mi papeleta, sin cifras ni la de otra persona', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'votacion', modo: 'excluyentes', modoPropuesto: 'excluyentes',
        objecionEndsAt: null, votacionEndsAt: new Date('2099-01-01T00:00:00Z'), candidatas: ['s1', 's2'],
        resultado: null, ganadoras: [], aprobaciones: [], papeletasTotal: null, abstenciones: null, miembros: null,
      });
      const r = await service.getTema(YO, T);
      expect(r.decision!.miPapeleta).toEqual({ abstencion: false, orden: ['s1'] });
      expect(r.decision!.resultado).toBeNull();
      const json = JSON.stringify(r);
      expect(json).not.toContain(OTRO);
      expect(json).not.toContain('["s2","s1"]');
      expect(json).not.toContain('pp1');
    });

    it('en objeción: yoObjete es mi objeción y puedoObjetar exige participar y plazo abierto', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'objecion', modo: null, modoPropuesto: 'excluyentes',
        objecionEndsAt: new Date(Date.now() + 86_400_000), votacionEndsAt: null, candidatas: [],
      });
      prisma.proposalComment.findMany.mockResolvedValue([{ authorProfileId: YO }]);
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.map((profileId) => ({ profileId })));
      let r = await service.getTema(YO, T);
      expect(r.decision).toMatchObject({ yoObjete: true, puedoObjetar: true, miPapeleta: null, resultado: null });
      expect(JSON.stringify(r)).not.toContain(OTRO);

      prisma.objecionModo.findUnique.mockResolvedValue(null);
      prisma.proposalComment.findMany.mockResolvedValue([{ authorProfileId: 'p-otro' }]);
      r = await service.getTema(YO, T);
      expect(r.decision).toMatchObject({ yoObjete: false, puedoObjetar: false });

      prisma.proposalComment.findMany.mockResolvedValue([{ authorProfileId: YO }]);
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'objecion', modo: null, modoPropuesto: 'excluyentes',
        objecionEndsAt: new Date(Date.now() - 1000), votacionEndsAt: null, candidatas: [],
      });
      r = await service.getTema(YO, T);
      expect(r.decision!.puedoObjetar).toBe(false);
    });

    it('contada: arma el resultado con las ocultas enmascaradas en candidatas', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'contada', modo: 'excluyentes', modoPropuesto: 'excluyentes',
        objecionEndsAt: null, votacionEndsAt: new Date('2026-11-20T00:00:00Z'), candidatas: ['s1', 's2'],
        resultado: 'aprobada', ganadoras: ['s2'], aprobaciones: [1, 3],
        pairwiseMatrix: [[0, 1], [3, 0]], schulzeMatrix: [[0, 0], [3, 0]],
        papeletasTotal: 5, abstenciones: 1, miembros: 8, contadaAt: new Date('2026-11-20T00:05:00Z'),
      });
      const r = await service.getTema(YO, T);
      expect(r.decision!.miPapeleta).toEqual({ abstencion: false, orden: ['s1'] });
      expect(r.decision!.resultado).toEqual({
        resultado: 'aprobada', ganadoras: ['s2'],
        aprobaciones: [{ solucionId: 's1', incluyen: 1 }, { solucionId: 's2', incluyen: 3 }],
        papeletasTotal: 5, abstenciones: 1, validas: 4, miembros: 8,
        pairwiseMatrix: [[0, 1], [3, 0]], schulzeMatrix: [[0, 0], [3, 0]],
        contadaAt: '2026-11-20T00:05:00.000Z',
      });
      expect(r.decision!.candidatas[1]).toMatchObject({ id: 's2', title: 'Solución oculta por moderación', description: '', hidden: true });
      // Una oculta nunca es bifurcable.
      expect(r.decision!.candidatas[1]!.bifurcable).toBe(false);
      const json = JSON.stringify(r);
      expect(json).not.toContain('secreto');
      expect(json).not.toContain(OTRO);
    });

    it('contada sin soluciones: matrices vacías y ceros', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'contada', modo: null, modoPropuesto: null,
        objecionEndsAt: null, votacionEndsAt: null, candidatas: [],
        resultado: 'sin_soluciones', ganadoras: [], aprobaciones: [],
        pairwiseMatrix: null, schulzeMatrix: null, papeletasTotal: null, abstenciones: null, miembros: null,
        contadaAt: new Date('2026-11-20T00:05:00Z'),
      });
      const r = await service.getTema(YO, T);
      expect(r.decision!.resultado).toEqual({
        resultado: 'sin_soluciones', ganadoras: [], aprobaciones: [],
        papeletasTotal: 0, abstenciones: 0, validas: 0, miembros: 0,
        pairwiseMatrix: [], schulzeMatrix: [], contadaAt: '2026-11-20T00:05:00.000Z',
      });
    });
  });

  describe('grupo de trabajo (G es subgrupo de g-ambito)', () => {
    /** YO es miembro solo de los grupos de `de`. */
    function miembroDe(de: string[]): void {
      prisma.groupMembership.findUnique.mockImplementation(({ where }: { where: { groupId_profileId: { groupId: string } } }) =>
        Promise.resolve(de.includes(where.groupId_profileId.groupId) ? { id: 'm' } : null),
      );
      prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === G ? { type: 'trabajo', parentGroupId: 'g-ambito' } : { type: 'territorial_residence', parentGroupId: null }),
      );
    }
    const NO_PARTICIPA = 'Solo los miembros de este grupo pueden participar.';

    it('un miembro del ámbito lee el tema con las banderas de participación en false', async () => {
      miembroDe(['g-ambito']);
      forums.canOrganize.mockResolvedValue(true);
      prisma.solucion.findMany.mockResolvedValue([sol('s1', { authorProfileId: YO })]);
      prisma.decision.findUnique.mockResolvedValue({
        id: 'd1', proposalId: T, fase: 'votacion', modo: 'excluyentes', modoPropuesto: 'excluyentes',
        objecionEndsAt: null, votacionEndsAt: new Date('2099-01-01T00:00:00Z'), candidatas: ['s1'],
        resultado: null, ganadoras: [], aprobaciones: [], papeletasTotal: null, abstenciones: null, miembros: null,
      });
      prisma.decisionPapeleta.findUnique.mockResolvedValue({ abstencion: false, orden: ['s1'] });
      const r = await service.getTema(YO, T);
      expect(r.soloLectura).toBe(true);
      expect(r.puedeProponer).toBe(false);
      expect(r.canOrganize).toBe(false);
      expect(r.soluciones[0]!.isAuthor).toBe(false);
      expect(r.decision).toMatchObject({ miPapeleta: null, puedoObjetar: false, yoObjete: false });
    });

    it('un miembro del subgrupo recibe soloLectura en false', async () => {
      miembroDe([G, 'g-ambito']);
      const r = await service.getTema(YO, T);
      expect(r.soloLectura).toBe(false);
      expect(r.puedeProponer).toBe(true);
    });

    it('un miembro del ámbito no propone, no junta, no propone el modo, no objeta ni vota (403)', async () => {
      miembroDe(['g-ambito']);
      await expect(
        service.createSolucion(YO, T, { title: 'Huerto comunitario', description: 'Una descripción suficiente' }, 'ip'),
      ).rejects.toThrow(NO_PARTICIPA);
      await expect(service.setObjecion(YO, T, true)).rejects.toThrow(NO_PARTICIPA);
      await expect(service.castPapeleta(YO, T, { abstencion: true, orden: [] })).rejects.toThrow(NO_PARTICIPA);
      forums.canOrganize.mockResolvedValue(true);
      await expect(service.proposeModo(YO, T, 'excluyentes', 'ip')).rejects.toThrow(NO_PARTICIPA);
      prisma.solucion.findUnique.mockResolvedValue(sol('s1'));
      await expect(service.mergeSolucion(YO, 's1', 's2', 'ip')).rejects.toThrow(NO_PARTICIPA);
      expect(prisma.solucion.create).not.toHaveBeenCalled();
      expect(prisma.objecionModo.upsert).not.toHaveBeenCalled();
      expect(prisma.decisionPapeleta.upsert).not.toHaveBeenCalled();
    });

    it('quien no es del ámbito no lee el tema', async () => {
      miembroDe(['g-otra']);
      await expect(service.getTema(YO, T)).rejects.toThrow('Solo los miembros de esta comunidad pueden ver esto.');
    });
  });

  describe('getResumen()', () => {
    const ORIGEN = { id: 'g-origen', name: 'Matagalpa', type: 'territorial_origin', slug: 'matagalpa' };
    const ACOGIDA = { id: 'g-acogida', name: 'Costa Rica', type: 'territorial_residence', slug: 'country-cr' };
    const GENERAL = { id: 'g-general', name: 'Comunidad general', type: 'custom', slug: 'general' };
    const OTRA = { id: 'g-otra', name: 'Jóvenes', type: 'custom', slug: 'jovenes' };

    const dec = (over: Record<string, unknown> = {}) => ({
      fase: 'contada', resultado: 'aprobada', candidatas: ['s1', 's2'], ganadoras: ['s1'], aprobaciones: [3, 1],
      papeletasTotal: 5, abstenciones: 1, contadaAt: new Date('2026-11-20T00:00:00Z'),
      objecionEndsAt: null, votacionEndsAt: null, updatedAt: new Date('2026-11-20T00:00:00Z'),
      ...over,
    });
    const tema = (id: string, groupId: string, over: Record<string, unknown> = {}) => ({
      id, groupId, title: `Tema ${id}`, status: 'closed', kind: 'propuesta', hidden: false, electionId: null,
      conclusion: null, closedAt: null, deliberationEndsAt: null,
      createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-01T00:00:00Z'), decision: null,
      ...over,
    });
    const miembroDe = (...gs: (typeof ORIGEN)[]) =>
      prisma.groupMembership.findMany.mockResolvedValue(gs.map((group) => ({ group })));

    it('ordena origen, acogida, general y las demás comunidades al final como general', async () => {
      miembroDe(OTRA, GENERAL, ACOGIDA, ORIGEN);
      const r = await service.getResumen(YO);
      expect(r.comunidades.map((c) => [c.groupId, c.tipo])).toEqual([
        ['g-origen', 'origen'], ['g-acogida', 'acogida'], ['g-general', 'general'], ['g-otra', 'general'],
      ]);
      expect(r.comunidades[0]?.name).toBe('Matagalpa');
      expect(r.comunidades.every((c) => Array.isArray(c.grupos))).toBe(true);
    });

    it('incluye los grupos de trabajo de cada ámbito y no los trata como comunidades', async () => {
      const SUB = {
        id: 'g-sub', name: 'Agua potable', type: 'trabajo', slug: 'trabajo-g-sub', parentGroupId: ORIGEN.id,
        trabajoTipo: 'subgrupo', trabajoEstado: 'convocando', proposito: 'Agua para el barrio norte.',
        convocatoriaEndsAt: new Date('2026-11-20T00:00:00Z'), pocosMiembrosDesde: null,
      };
      const OTRO_SUB = { ...SUB, id: 'g-sub2', name: 'Caminos', parentGroupId: ACOGIDA.id, trabajoEstado: 'activo', convocatoriaEndsAt: null };
      miembroDe(ORIGEN, ACOGIDA, SUB as never);
      prisma.group.findMany.mockResolvedValue([SUB, OTRO_SUB]);
      prisma.groupMembership.groupBy.mockResolvedValue([
        { groupId: 'g-sub', _count: { _all: 2 } },
        { groupId: 'g-sub2', _count: { _all: 6 } },
      ]);
      rules.getInt.mockResolvedValue(5);
      const r = await service.getResumen(YO);
      expect(r.comunidades.map((c) => c.groupId)).toEqual(['g-origen', 'g-acogida']);
      const where = prisma.group.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toEqual({ type: 'trabajo', parentGroupId: { in: ['g-origen', 'g-acogida'] }, trabajoEstado: { not: 'archivado' } });
      expect(prisma.group.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.groupMembership.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.proposal.findMany.mock.calls[0]?.[0]?.where.groupId).toEqual({ in: ['g-origen', 'g-acogida'] });
      expect(r.comunidades[0]!.grupos).toEqual([
        {
          id: 'g-sub', name: 'Agua potable', proposito: 'Agua para el barrio norte.', tipo: 'subgrupo', estado: 'convocando',
          miembros: 2, faltan: 3, convocatoriaEndsAt: '2026-11-20T00:00:00.000Z', soyMiembro: true,
        },
      ]);
      expect(r.comunidades[1]!.grupos).toEqual([
        expect.objectContaining({ id: 'g-sub2', estado: 'activo', miembros: 6, faltan: null, soyMiembro: false }),
      ]);
    });

    it('una bifurcación sale como «Iniciativa de un grupo», con su mínimo y cuántos son, sin miembros', async () => {
      const BIF = {
        id: 'g-bif', name: 'Iniciativa de un grupo', type: 'trabajo', slug: 'trabajo-g-bif', parentGroupId: ORIGEN.id,
        trabajoTipo: 'bifurcacion', trabajoEstado: 'convocando', proposito: 'Huerto comunitario',
        convocatoriaEndsAt: new Date('2026-11-20T00:00:00Z'), pocosMiembrosDesde: null,
      };
      miembroDe(ORIGEN);
      prisma.group.findMany.mockResolvedValue([BIF]);
      prisma.groupMembership.groupBy.mockResolvedValue([{ groupId: 'g-bif', _count: { _all: 3 } }]);
      rules.getInt.mockImplementation(async (key: string) => (key === 'bifurcacion.minimo_personas' ? 7 : 5));
      const r = await service.getResumen(YO);
      expect(rules.getInt).toHaveBeenCalledWith('bifurcacion.minimo_personas', ORIGEN.id);
      expect(r.comunidades[0]!.grupos).toEqual([
        expect.objectContaining({ id: 'g-bif', name: 'Iniciativa de un grupo', proposito: 'Huerto comunitario', miembros: 3, faltan: 4 }),
      ]);
      expect(JSON.stringify(r)).not.toContain('p-');
    });

    it('M1: si la solución de origen de una bifurcación se ocultó, no repite su título', async () => {
      const BIF = {
        id: 'g-bif', name: 'Iniciativa de un grupo', type: 'trabajo', slug: 'trabajo-g-bif', parentGroupId: ORIGEN.id,
        trabajoTipo: 'bifurcacion', trabajoEstado: 'convocando', proposito: 'Huerto comunitario',
        convocatoriaEndsAt: new Date('2026-11-20T00:00:00Z'), pocosMiembrosDesde: null, origenSolucionId: 's-origen',
      };
      miembroDe(ORIGEN);
      prisma.group.findMany.mockResolvedValue([BIF]);
      prisma.solucion.findMany.mockImplementation(async ({ where }: { where: { hidden?: boolean } }) =>
        where.hidden === true ? [{ id: 's-origen' }] : [],
      );
      const r = await service.getResumen(YO);
      expect(r.comunidades[0]!.grupos[0]!.proposito).toBe('Solución oculta por moderación');
      expect(JSON.stringify(r)).not.toContain('Huerto');
      expect(prisma.group.findMany.mock.calls[0]![0].select).toMatchObject({ origenSolucionId: true });
    });

    it('solo consulta las comunidades de quien pregunta y excluye los temas ocultos', async () => {
      miembroDe(ORIGEN);
      prisma.proposal.findMany.mockResolvedValue([
        tema('t-oculto', ORIGEN.id, { hidden: true, decision: dec() }),
        tema('t-ajeno', 'g-ajeno', { decision: dec() }),
      ]);
      const r = await service.getResumen(YO);
      expect(prisma.groupMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { profileId: YO } }));
      const where = prisma.proposal.findMany.mock.calls[0]?.[0]?.where;
      expect(where.groupId).toEqual({ in: ['g-origen'] });
      expect(where.hidden).toBe(false);
      expect(r.comunidades).toHaveLength(1);
      const c = r.comunidades[0]!;
      expect([...c.aprobadas, ...c.rechazadas, ...c.enCurso]).toEqual([]);
    });

    it('sin comunidades no consulta temas', async () => {
      const r = await service.getResumen(YO);
      expect(r.comunidades).toEqual([]);
      expect(prisma.proposal.findMany).not.toHaveBeenCalled();
    });

    it('clasifica aprobadas, rechazadas y en curso, con porcentajes y fechas', async () => {
      miembroDe(ORIGEN);
      prisma.proposal.findMany.mockResolvedValue([
        tema('t-votada', ORIGEN.id, { decision: dec() }),
        tema('t-consenso', ORIGEN.id, { conclusion: 'Acordamos X', closedAt: new Date('2026-11-10T00:00:00Z') }),
        tema('t-ninguna', ORIGEN.id, { decision: dec({ resultado: 'ninguna', ganadoras: [], contadaAt: new Date('2026-11-21T00:00:00Z') }) }),
        tema('t-empate', ORIGEN.id, { decision: dec({ resultado: 'empate', ganadoras: [] }) }),
        tema('t-quorum', ORIGEN.id, { decision: dec({ resultado: 'sin_quorum', ganadoras: [] }) }),
        tema('t-vacia', ORIGEN.id, { decision: dec({ resultado: 'sin_soluciones', ganadoras: [], candidatas: [], aprobaciones: [] }) }),
        tema('t-debate', ORIGEN.id, { status: 'open', deliberationEndsAt: new Date('2026-11-30T00:00:00Z') }),
        tema('t-modo', ORIGEN.id, { status: 'open', decision: dec({ fase: 'modo', resultado: null }) }),
        tema('t-objecion', ORIGEN.id, {
          status: 'open', decision: dec({ fase: 'objecion', resultado: null, objecionEndsAt: new Date('2026-12-01T00:00:00Z') }),
        }),
        tema('t-votacion', ORIGEN.id, {
          status: 'open', decision: dec({ fase: 'votacion', resultado: null, votacionEndsAt: new Date('2026-12-02T00:00:00Z') }),
        }),
      ]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1', title: 'Mesa de salud', hidden: false }]);
      const c = (await service.getResumen(YO)).comunidades[0]!;

      expect(c.aprobadas).toEqual([
        {
          proposalId: 't-votada', title: 'Tema t-votada', estado: 'aprobada', detalle: 'Aprobada por votación',
          ganadoras: [{ title: 'Mesa de salud', incluyenPct: 75 }], fecha: '2026-11-20T00:00:00.000Z',
        },
        {
          proposalId: 't-consenso', title: 'Tema t-consenso', estado: 'aprobada', detalle: 'Consenso del debate',
          ganadoras: [], fecha: '2026-11-10T00:00:00.000Z',
        },
      ]);
      expect(c.rechazadas.map((i) => [i.proposalId, i.estado, i.detalle])).toEqual([
        ['t-ninguna', 'rechazada', 'Ninguna solución obtuvo más de la mitad'],
        ['t-empate', 'rechazada', 'Empate: sin decisión'],
        ['t-quorum', 'rechazada', 'Sin decisión: no se alcanzó la participación mínima'],
        ['t-vacia', 'rechazada', 'No se propusieron soluciones'],
      ]);
      expect(c.enCurso.map((i) => [i.proposalId, i.estado, i.detalle, i.fecha])).toEqual([
        ['t-debate', 'en_curso', 'En debate hasta el {fecha}', '2026-11-30T00:00:00.000Z'],
        ['t-modo', 'en_curso', 'Eligiendo cómo decidir', null],
        ['t-objecion', 'en_curso', 'Objeciones hasta el {fecha}', '2026-12-01T00:00:00.000Z'],
        ['t-votacion', 'en_curso', 'Votación abierta hasta el {fecha}', '2026-12-02T00:00:00.000Z'],
      ]);
      // Los títulos de las ganadoras salen de una sola consulta.
      expect(prisma.solucion.findMany).toHaveBeenCalledTimes(1);
    });

    it('la decisión cancelada no aparece en ninguna lista', async () => {
      miembroDe(ORIGEN);
      prisma.proposal.findMany.mockResolvedValue([
        tema('t-cancelada', ORIGEN.id, { status: 'open', decision: dec({ fase: 'cancelada', resultado: null }) }),
        tema('t-cerrada-cancelada', ORIGEN.id, { conclusion: 'Algo', decision: dec({ fase: 'cancelada', resultado: null }) }),
      ]);
      const c = (await service.getResumen(YO)).comunidades[0]!;
      expect([...c.aprobadas, ...c.rechazadas, ...c.enCurso]).toEqual([]);
    });

    it('enmascara el título de una ganadora oculta por moderación', async () => {
      miembroDe(ORIGEN);
      prisma.proposal.findMany.mockResolvedValue([tema('t-votada', ORIGEN.id, { decision: dec() })]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1', title: 'Texto ofensivo', hidden: true }]);
      const c = (await service.getResumen(YO)).comunidades[0]!;
      expect(c.aprobadas[0]?.ganadoras).toEqual([{ title: 'Solución oculta por moderación', incluyenPct: 75 }]);
    });

    it('sin papeletas válidas el porcentaje es null', async () => {
      miembroDe(ORIGEN);
      prisma.proposal.findMany.mockResolvedValue([
        tema('t-votada', ORIGEN.id, { decision: dec({ papeletasTotal: 2, abstenciones: 2 }) }),
      ]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1', title: 'Mesa de salud', hidden: false }]);
      const c = (await service.getResumen(YO)).comunidades[0]!;
      expect(c.aprobadas[0]?.ganadoras).toEqual([{ title: 'Mesa de salud', incluyenPct: null }]);
    });

    it('cada lista trae como máximo 50, las más recientes primero', async () => {
      miembroDe(ORIGEN);
      prisma.proposal.findMany.mockResolvedValue(
        Array.from({ length: 60 }, (_, i) =>
          tema(`t${i}`, ORIGEN.id, { conclusion: 'Acuerdo', closedAt: new Date(Date.UTC(2026, 10, 1, 0, i)) }),
        ),
      );
      const c = (await service.getResumen(YO)).comunidades[0]!;
      expect(c.aprobadas).toHaveLength(50);
      expect(c.aprobadas[0]?.proposalId).toBe('t59');
      expect(c.aprobadas[49]?.proposalId).toBe('t10');
    });

    it('un tema de votación del plan 2 abierto no figura como debate en curso', async () => {
      miembroDe(ORIGEN);
      prisma.proposal.findMany.mockResolvedValue([tema('t-eleccion', ORIGEN.id, { status: 'open', electionId: 'e1' })]);
      const c = (await service.getResumen(YO)).comunidades[0]!;
      expect(c.enCurso).toEqual([]);
    });
  });
});
