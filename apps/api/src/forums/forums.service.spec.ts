import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ForumsService, LINKED_TOPIC_REASON } from './forums.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ForumsController } from './forums.controller';
import { ModerateDto } from './dto/moderate.dto';
import { ConfirmarModeracionDto } from './dto/confirmar-moderacion.dto';
import { motivoVisible } from './moderacion-motivo';
import { MODERACION_INTERVALO_MS } from './moderacion.scheduler';

function buildPrisma() {
  return {
    groupMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    group: { findUnique: vi.fn() },
    forum: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    proposal: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    proposalComment: { findUnique: vi.fn(), update: vi.fn() },
    inquietud: { findUnique: vi.fn(), update: vi.fn() },
    frase: { findUnique: vi.fn(), update: vi.fn() },
    comisionInforme: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    solucion: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), count: vi.fn(), create: vi.fn() },
    election: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    electionResult: { findUnique: vi.fn() },
    electionCandidate: { findUnique: vi.fn() },
    decision: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    cambioRegla: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    boardAction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    moderationAction: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
}

const YO = 'p-yo';

describe('ForumsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let board: { roleOf: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let service: ForumsService;

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    board = { roleOf: vi.fn().mockResolvedValue(null) };
    rules = { getInt: vi.fn().mockResolvedValue(7) };
    service = new ForumsService(prisma as never, audit as never, board as never, rules as never, new GroupAccessService(prisma as never));
    prisma.solucion.count.mockResolvedValue(1);
    prisma.proposal.updateMany.mockResolvedValue({ count: 1 });
    prisma.decision.updateMany.mockResolvedValue({ count: 0 });
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u-yo' });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
  });

  describe('canModerate()', () => {
    it('la mesa y el administrador moderan; un miembro común no', async () => {
      board.roleOf.mockResolvedValueOnce('administrador');
      expect(await service.canModerate(YO, 'g1')).toBe(true);
      board.roleOf.mockResolvedValueOnce('secretario');
      expect(await service.canModerate(YO, 'g1')).toBe(true);
      board.roleOf.mockResolvedValueOnce(null);
      expect(await service.canModerate(YO, 'g1')).toBe(false);
    });
  });

  describe('publicConsensus()', () => {
    it('solo temas cerrados con conclusión y no ocultos, sin nombres de personas', async () => {
      prisma.proposal.findMany.mockResolvedValue([
        {
          id: 't1', title: 'Mesa de salud', kind: 'tema', conclusion: 'Crear una mesa de salud.', objections: null,
          closedAt: new Date('2026-11-20T00:00:00Z'), electionId: null,
          group: { name: 'León' }, signals: [{ signal: 'support' }, { signal: 'object' }],
        },
      ]);
      const r = await service.publicConsensus();
      expect(prisma.proposal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'closed', hidden: false, conclusion: { not: null }, group: { type: { not: 'trabajo' } } },
        }),
      );
      expect(r).toEqual([
        {
          id: 't1', title: 'Mesa de salud', communityName: 'León', kind: 'tema',
          conclusion: 'Crear una mesa de salud.', objections: null,
          signalCounts: { support: 1, neutral: 0, object: 1 },
          closedAt: '2026-11-20T00:00:00.000Z', winningOption: null, approvedSolutions: [], informeFinal: null,
        },
      ]);
      expect(JSON.stringify(r)).not.toMatch(/author|displayName|email/);
    });

    it('excluye los temas de los grupos de trabajo: lo suyo llega a la comunidad al llevarlo', async () => {
      prisma.proposal.findMany.mockResolvedValue([]);
      await service.publicConsensus();
      const where = (prisma.proposal.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
      expect(where.group).toEqual({ type: { not: 'trabajo' } });
    });

    it('si hubo votación contada, incluye la opción ganadora', async () => {
      prisma.proposal.findMany.mockResolvedValue([
        {
          id: 't2', title: 'Fondo', kind: 'propuesta', conclusion: 'Se aprueba el fondo.', objections: 'Algunos dudan.',
          closedAt: new Date('2026-11-21T00:00:00Z'), electionId: 'e1', group: { name: 'Costa Rica' }, signals: [],
        },
      ]);
      prisma.electionResult.findUnique.mockResolvedValue({ winners: ['c1'] });
      prisma.electionCandidate.findUnique.mockResolvedValue({ title: 'A favor' });
      const r = await service.publicConsensus();
      expect(r[0]?.winningOption).toBe('A favor');
    });

    it('con decisión de soluciones contada: muestra las ganadoras en orden y enmascara las ocultas', async () => {
      prisma.proposal.findMany.mockResolvedValue([
        {
          id: 't3', title: 'Agua', kind: 'propuesta', conclusion: 'Se aprueban dos soluciones.', objections: null,
          closedAt: new Date('2026-11-22T00:00:00Z'), electionId: null, group: { name: 'Estelí' }, signals: [],
        },
        {
          id: 't4', title: 'Luz', kind: 'propuesta', conclusion: 'Sin acuerdo.', objections: null,
          closedAt: new Date('2026-11-21T00:00:00Z'), electionId: null, group: { name: 'Estelí' }, signals: [],
        },
      ]);
      prisma.decision.findMany.mockResolvedValue([{ proposalId: 't3', ganadoras: ['s2', 's1'] }]);
      prisma.solucion.findMany.mockResolvedValue([
        { id: 's1', title: 'Huerto comunitario', hidden: false },
        { id: 's2', title: 'Texto secreto de s2', hidden: true },
      ]);
      const r = await service.publicConsensus();
      expect(prisma.decision.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { proposalId: { in: ['t3', 't4'] }, fase: 'contada' },
      }));
      expect(r[0]?.approvedSolutions).toEqual(['Solución oculta por moderación', 'Huerto comunitario']);
      expect(r[0]?.winningOption).toBeNull();
      expect(r[1]?.approvedSolutions).toEqual([]);
      expect(JSON.stringify(r)).not.toContain('secreto');
    });

    it('informeFinal: el más reciente no oculto de una comisión cerrada de una ganadora, en una sola consulta', async () => {
      prisma.proposal.findMany.mockResolvedValue([
        {
          id: 't3', title: 'Agua', kind: 'propuesta', conclusion: 'Se aprueba.', objections: null,
          closedAt: new Date('2026-11-22T00:00:00Z'), electionId: null, group: { name: 'Estelí' }, signals: [],
        },
        {
          id: 't4', title: 'Luz', kind: 'propuesta', conclusion: 'Se aprueba.', objections: null,
          closedAt: new Date('2026-11-21T00:00:00Z'), electionId: null, group: { name: 'Estelí' }, signals: [],
        },
      ]);
      prisma.decision.findMany.mockResolvedValue([
        { proposalId: 't3', ganadoras: ['s1'] },
        { proposalId: 't4', ganadoras: ['s2'] },
      ]);
      prisma.solucion.findMany.mockResolvedValue([
        { id: 's1', title: 'Pozos', hidden: false },
        { id: 's2', title: 'Paneles', hidden: false },
      ]);
      // Ordenados del más reciente al más antiguo, como los pide la consulta.
      prisma.comisionInforme.findMany.mockResolvedValue([
        { texto: 'Informe final reciente de los pozos', grupo: { origenSolucionId: 's1' } },
        { texto: 'Informe final viejo de los pozos', grupo: { origenSolucionId: 's1' } },
      ]);
      const r = await service.publicConsensus();
      expect(prisma.comisionInforme.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.comisionInforme.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          final: true,
          hidden: false,
          // Solo comisiones de la comunidad: la de una bifurcación (origenGrupoId) no es pública.
          grupo: { trabajoTipo: 'comision', trabajoEstado: 'cerrado', origenSolucionId: { in: ['s1', 's2'] }, origenGrupoId: null },
        },
        orderBy: { createdAt: 'desc' },
      }));
      expect(r[0]?.informeFinal).toBe('Informe final reciente de los pozos');
      expect(r[1]?.informeFinal).toBeNull();
      expect(JSON.stringify(r)).not.toMatch(/autor|displayName/);
    });

    it('un informe final oculto no sale: la consulta lo excluye y sin otro queda null', async () => {
      prisma.proposal.findMany.mockResolvedValue([
        {
          id: 't3', title: 'Agua', kind: 'propuesta', conclusion: 'Se aprueba.', objections: null,
          closedAt: new Date('2026-11-22T00:00:00Z'), electionId: null, group: { name: 'Estelí' }, signals: [],
        },
      ]);
      prisma.decision.findMany.mockResolvedValue([{ proposalId: 't3', ganadoras: ['s1'] }]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's1', title: 'Pozos', hidden: false }]);
      prisma.comisionInforme.findMany.mockImplementation(async ({ where }: { where: { hidden?: boolean } }) =>
        where.hidden === false ? [] : [{ texto: 'Texto oculto del informe', grupo: { origenSolucionId: 's1' } }],
      );
      const r = await service.publicConsensus();
      expect(r[0]?.informeFinal).toBeNull();
      expect(JSON.stringify(r)).not.toContain('oculto del informe');
    });

    it('sin ganadoras no consulta informes', async () => {
      prisma.proposal.findMany.mockResolvedValue([]);
      await service.publicConsensus();
      expect(prisma.comisionInforme.findMany).not.toHaveBeenCalled();
    });
  });

  describe('foro por defecto', () => {
    it('si otra petición lo creó a la vez (P2002), lo relee en vez de fallar', async () => {
      prisma.groupMembership.findMany.mockResolvedValue([{ groupId: 'g1', group: { name: 'Mi comunidad' } }]);
      prisma.forum.findFirst.mockResolvedValue(null);
      prisma.forum.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      prisma.forum.findMany.mockResolvedValue([]);
      await expect(service.listMine(YO)).resolves.toEqual([]);
      expect(prisma.forum.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('grupos de trabajo', () => {
    /** YO es miembro solo de los grupos de `de`; g-sub es un grupo de trabajo de g-ambito. */
    function miembroDe(de: string[]): void {
      prisma.groupMembership.findUnique.mockImplementation(({ where }: { where: { groupId_profileId: { groupId: string } } }) =>
        Promise.resolve(de.includes(where.groupId_profileId.groupId) ? { id: 'm' } : null),
      );
      prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === 'g-sub' ? { type: 'trabajo', parentGroupId: 'g-ambito' } : { type: 'territorial_residence', parentGroupId: null }),
      );
    }
    beforeEach(() => {
      prisma.forum.findUnique.mockResolvedValue({
        id: 'f-sub', groupId: 'g-sub', title: 'Foro del subgrupo', description: null, isDefault: true,
        group: { name: 'Subgrupo' }, _count: { proposals: 0 },
      });
      prisma.proposal.findMany.mockResolvedValue([]);
    });

    it('listMine no muestra los foros de los grupos de trabajo', async () => {
      prisma.groupMembership.findMany.mockResolvedValue([]);
      await service.listMine(YO);
      expect(prisma.groupMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { profileId: YO, group: { type: { not: 'trabajo' } } } }),
      );
    });

    it('un miembro del ámbito lee el foro del subgrupo', async () => {
      miembroDe(['g-ambito']);
      await expect(service.getForum(YO, 'f-sub')).resolves.toMatchObject({ id: 'f-sub', groupId: 'g-sub', soloLectura: true });
    });

    it('un miembro del subgrupo no es solo lectura', async () => {
      miembroDe(['g-sub', 'g-ambito']);
      await expect(service.getForum(YO, 'f-sub')).resolves.toMatchObject({ soloLectura: false });
    });

    it('el autor apela aunque el subgrupo esté archivado (apelar no es participar)', async () => {
      miembroDe(['g-sub', 'g-ambito']);
      prisma.group.findUnique.mockResolvedValue({ type: 'trabajo', parentGroupId: 'g-ambito', trabajoEstado: 'archivado' });
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', reason: 'x', status: 'oculto' });
      prisma.proposalComment.findUnique.mockResolvedValue({ authorProfileId: YO, proposal: { groupId: 'g-sub' } });
      prisma.moderationAction.update.mockResolvedValue({});
      await service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip');
      expect(prisma.moderationAction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'apelado' }) }),
      );
    });

    it('un miembro del ámbito no apela en el subgrupo (403)', async () => {
      miembroDe(['g-ambito']);
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', reason: 'x', status: 'oculto' });
      prisma.proposalComment.findUnique.mockResolvedValue({ authorProfileId: YO, proposal: { groupId: 'g-sub' } });
      await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(
        'Solo los miembros de este grupo pueden participar.',
      );
      expect(prisma.moderationAction.update).not.toHaveBeenCalled();
    });

    it('quien no es del ámbito no lee el foro del subgrupo', async () => {
      miembroDe(['g-otra']);
      await expect(service.getForum(YO, 'f-sub')).rejects.toThrow('Solo los miembros de esta comunidad pueden ver esto.');
    });

    it('R4: el ámbito no lee el foro de una bifurcación (403); sus miembros sí', async () => {
      const esBifurcacion = () =>
        prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'g-sub'
              ? { type: 'trabajo', parentGroupId: 'g-ambito', trabajoEstado: 'activo', trabajoTipo: 'bifurcacion' }
              : { type: 'territorial_residence', parentGroupId: null },
          ),
        );
      miembroDe(['g-ambito']);
      esBifurcacion();
      await expect(service.getForum(YO, 'f-sub')).rejects.toThrow('Solo los miembros de esta comunidad pueden ver esto.');
      miembroDe(['g-sub', 'g-ambito']);
      esBifurcacion();
      await expect(service.getForum(YO, 'f-sub')).resolves.toMatchObject({ soloLectura: false });
    });

    it('un tema llegado desde una bifurcación no muestra a quien lo llevó', async () => {
      miembroDe(['g-sub', 'g-ambito']);
      const p = prisma as unknown as Record<string, unknown>;
      p['inquietud'] = { findMany: vi.fn().mockResolvedValue([{ proposalId: 'tema-bif', origenSolucionId: 's-bif' }]) };
      p['group'] = { ...prisma.group, findMany: vi.fn().mockResolvedValue([{ origenSolucionId: 's-bif' }]) };
      p['solucion'] = { ...(p['solucion'] as object), findMany: vi.fn().mockResolvedValue([]) };
      const tema = {
        groupId: 'g-sub', forumId: 'f-sub', title: 'Huerto', status: 'open', kind: 'discussion', hidden: false,
        signals: [], _count: { comments: 0 }, createdAt: new Date('2026-11-01T00:00:00Z'),
      };
      prisma.proposal.findMany.mockResolvedValue([
        { ...tema, id: 'tema-bif', abiertoPorComunidad: true, author: { displayName: 'Zoe Secreta' } },
        { ...tema, id: 'tema-otro', abiertoPorComunidad: false, author: { displayName: 'Ana' } },
      ]);
      const f = await service.getForum(YO, 'f-sub');
      expect(f.topics.map((t) => t.authorDisplayName)).toEqual(['Iniciativa de un grupo', 'Ana']);
      expect(JSON.stringify(f)).not.toContain('Zoe');
    });
  });

  describe('createForum()', () => {
    it('solo quien puede moderar crea foros', async () => {
      await expect(service.createForum(YO, { groupId: 'g1', title: 'Salud y migración' }, 'ip')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('auditoría sin rastro en lo reservado', () => {
    const sinRastro = () => {
      expect(audit.log).toHaveBeenCalled();
      for (const [e] of audit.log.mock.calls as [Record<string, unknown>][]) {
        expect(e).not.toHaveProperty('actorId');
        expect(e).not.toHaveProperty('ip');
      }
    };
    const tema = { id: 't1', groupId: 'g-bif', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false, title: 'Tema', body: 'Cuerpo', electionId: null, abiertoPorComunidad: false };
    const enBifurcacion = () => {
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm' });
      prisma.group.findUnique.mockResolvedValue({ type: 'trabajo', parentGroupId: 'g-ambito', trabajoEstado: 'activo', trabajoTipo: 'bifurcacion' });
    };

    it('formalizar y cerrar con consenso dentro de una bifurcación', async () => {
      enBifurcacion();
      prisma.proposal.findUnique.mockResolvedValue(tema);
      await service.formalize(YO, 't1', 'ip');
      prisma.proposal.update.mockResolvedValue({});
      await service.closeWithConsensus(YO, 't1', { conclusion: 'Acordamos sembrar el huerto.' } as never, 'ip');
      sinRastro();
    });

    it('apelar un comentario oculto dentro de una bifurcación', async () => {
      enBifurcacion();
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', reason: 'x', status: 'oculto' });
      prisma.proposalComment.findUnique.mockResolvedValue({ authorProfileId: YO, proposal: { groupId: 'g-bif' } });
      prisma.moderationAction.update.mockResolvedValue({});
      await service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip');
      sinRastro();
    });

    it('I2: el tema que la comunidad abrió desde una inquietud llevada por una bifurcación no delata a su autor', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm' });
      prisma.group.findUnique.mockResolvedValue({ type: 'territorial_origin', parentGroupId: null, trabajoEstado: null, trabajoTipo: null });
      const p = prisma as unknown as Record<string, unknown>;
      p['inquietud'] = {
        ...prisma.inquietud,
        findMany: vi.fn().mockResolvedValue([{ proposalId: 't1', origenSolucionId: 's-bif' }]),
        findUnique: vi.fn().mockResolvedValue({ id: 'i1', authorProfileId: YO, groupId: 'g-ambito', origenSolucionId: 's-bif' }),
      };
      p['group'] = { ...prisma.group, findMany: vi.fn().mockResolvedValue([{ origenSolucionId: 's-bif' }]) };
      prisma.proposal.findUnique.mockResolvedValue({ ...tema, groupId: 'g-ambito', abiertoPorComunidad: true });
      await service.formalize(YO, 't1', 'ip');
      // Y la apelación de la inquietud llevada.
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma2', target: 'inquietud', targetId: 'i1', reason: 'x', status: 'oculto' });
      prisma.moderationAction.update.mockResolvedValue({});
      await service.appeal(YO, 'ma2', 'No fue mi intención ofender', 'ip');
      sinRastro();
    });

    it('fuera de lo reservado sigue con actor e ip', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm' });
      prisma.group.findUnique.mockResolvedValue({ type: 'territorial_origin', parentGroupId: null, trabajoEstado: null, trabajoTipo: null });
      prisma.proposal.findUnique.mockResolvedValue({ ...tema, groupId: 'g-ambito' });
      await service.formalize(YO, 't1', 'ip');
      expect(audit.log.mock.calls[0]![0]).toMatchObject({ actorId: 'u-yo', ip: 'ip' });
    });

    it('si la consulta de iniciativa falla tras formalizar o apelar, se audita sin rastro y no hay 500', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm' });
      prisma.group.findUnique.mockResolvedValue({ type: 'territorial_origin', parentGroupId: null, trabajoEstado: null, trabajoTipo: null });
      const p = prisma as unknown as Record<string, unknown>;
      p['inquietud'] = {
        ...prisma.inquietud,
        findMany: vi.fn().mockRejectedValue(new Error('caída')),
        findUnique: vi.fn().mockRejectedValue(new Error('caída')),
      };
      prisma.proposal.findUnique.mockResolvedValue({ ...tema, groupId: 'g-ambito', abiertoPorComunidad: true });
      await expect(service.formalize(YO, 't1', 'ip')).resolves.toBeUndefined();
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma2', target: 'inquietud', targetId: 'i1', reason: 'x', status: 'oculto' });
      // authorOf usa findUnique de la inquietud: aquí responde y después falla la de iniciativa.
      (p['inquietud'] as { findUnique: ReturnType<typeof vi.fn> }).findUnique
        .mockResolvedValueOnce({ id: 'i1', authorProfileId: YO, groupId: 'g-ambito', origenSolucionId: 's-bif' })
        .mockRejectedValueOnce(new Error('caída'));
      prisma.moderationAction.update.mockResolvedValue({});
      await expect(service.appeal(YO, 'ma2', 'No fue mi intención ofender', 'ip')).resolves.toBeUndefined();
      sinRastro();
    });
  });

  describe('formalize()', () => {
    it('solo el autor o quien modera convierte en propuesta', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: 'p-otro', status: 'open', kind: 'tema', hidden: false });
      await expect(service.formalize(YO, 't1', 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('el autor la convierte y queda con plazo de deliberación de 7 días', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false });
      prisma.proposal.update.mockResolvedValue({});
      const antes = Date.now();
      await service.formalize(YO, 't1', 'ip');
      const data = prisma.proposal.updateMany.mock.calls[0]![0].data;
      expect(data.kind).toBe('propuesta');
      const plazo = (data.deliberationEndsAt as Date).getTime() - antes;
      expect(plazo).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
      expect(plazo).toBeLessThanOrEqual(7 * 86_400_000 + 1000);
    });

    it('usa debate.plazo_dias de la comunidad para el plazo', async () => {
      rules.getInt.mockResolvedValue(10);
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false, title: 'T', body: '' });
      prisma.proposal.update.mockResolvedValue({});
      const antes = Date.now();
      await service.formalize(YO, 't1', 'ip');
      expect(rules.getInt).toHaveBeenCalledWith('debate.plazo_dias', 'g1');
      const plazo = (prisma.proposal.updateMany.mock.calls[0]![0].data.deliberationEndsAt as Date).getTime() - antes;
      expect(plazo).toBeGreaterThanOrEqual(10 * 86_400_000 - 1000);
      expect(plazo).toBeLessThanOrEqual(10 * 86_400_000 + 1000);
    });

    it('siembra una solución con el título y el cuerpo del tema si no hay ninguna', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: 'p-aut', status: 'open', kind: 'tema', hidden: false, title: 'T'.repeat(200), body: 'B'.repeat(3000) });
      prisma.proposal.update.mockResolvedValue({});
      board.roleOf.mockResolvedValue('administrador');
      prisma.solucion.count.mockResolvedValue(0);
      await service.formalize(YO, 't1', 'ip');
      expect(prisma.solucion.count).toHaveBeenCalledWith({ where: { proposalId: 't1', hidden: false, mergedIntoId: null } });
      const data = prisma.solucion.create.mock.calls[0]![0].data;
      expect(data).toMatchObject({ proposalId: 't1', authorProfileId: 'p-aut', origen: 'persona' });
      expect(data.title).toHaveLength(140);
      expect(data.description).toHaveLength(2000);
    });

    it('si el cuerpo está vacío la descripción usa el título; si ya hay una solución no siembra', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false, title: 'Un título', body: '' });
      prisma.proposal.update.mockResolvedValue({});
      prisma.solucion.count.mockResolvedValue(0);
      await service.formalize(YO, 't1', 'ip');
      expect(prisma.solucion.create.mock.calls[0]![0].data.description).toBe('Un título');
      prisma.solucion.create.mockClear();
      prisma.solucion.count.mockResolvedValue(2);
      await service.formalize(YO, 't1', 'ip');
      expect(prisma.solucion.create).not.toHaveBeenCalled();
    });

    it('un doble envío (updateMany sin filas) da 409 sin sembrar ni auditar', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false, title: 'T', body: '' });
      prisma.proposal.updateMany.mockResolvedValue({ count: 0 });
      prisma.solucion.count.mockResolvedValue(0);
      await expect(service.formalize(YO, 't1', 'ip')).rejects.toThrow(ConflictException);
      expect(prisma.solucion.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('un autor sin membresía (suspendido) no puede formalizar', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'tema', hidden: false });
      await expect(service.formalize(YO, 't1', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('no se formaliza dos veces', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', kind: 'propuesta', hidden: false });
      await expect(service.formalize(YO, 't1', 'ip')).rejects.toThrow(ConflictException);
    });
  });

  describe('closeWithConsensus()', () => {
    it('exige ser autor o moderar', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: 'p-otro', status: 'open', hidden: false });
      await expect(service.closeWithConsensus(YO, 't1', { conclusion: 'Acordamos crear una mesa de salud.' }, 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('cierra con conclusión y objeciones', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', hidden: false });
      prisma.proposal.update.mockResolvedValue({});
      await service.closeWithConsensus(YO, 't1', { conclusion: 'Acordamos crear una mesa de salud.', objections: 'Dos personas prefieren esperar.' }, 'ip');
      expect(prisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({
          status: 'closed',
          conclusion: 'Acordamos crear una mesa de salud.',
          objections: 'Dos personas prefieren esperar.',
        }),
      });
    });

    it('una propuesta formal se cierra solo cuando su votación ya fue contada', async () => {
      const dto = { conclusion: 'Acordamos crear un fondo común.' };
      prisma.proposal.update.mockResolvedValue({});
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', hidden: false, kind: 'propuesta', electionId: null });
      await expect(service.closeWithConsensus(YO, 't1', dto, 'ip')).rejects.toThrow(
        'Una propuesta formal se cierra cuando su votación ya fue contada.',
      );
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', hidden: false, kind: 'propuesta', electionId: 'e1' });
      prisma.election.findUnique.mockResolvedValue({ status: 'open' });
      await expect(service.closeWithConsensus(YO, 't1', dto, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
      prisma.election.findUnique.mockResolvedValue({ status: 'tallied' });
      await service.closeWithConsensus(YO, 't1', dto, 'ip');
      expect(prisma.proposal.update).toHaveBeenCalledTimes(1);
    });

    it('una propuesta nueva (sin votación del plan 2) se cierra solo con su decisión contada o cancelada', async () => {
      const dto = { conclusion: 'Acordamos crear un fondo común.' };
      prisma.proposal.update.mockResolvedValue({});
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', hidden: false, kind: 'propuesta', electionId: null });
      prisma.decision.findUnique.mockResolvedValue(null);
      await expect(service.closeWithConsensus(YO, 't1', dto, 'ip')).rejects.toThrow(
        'Una propuesta formal se cierra cuando su votación ya fue contada.',
      );
      prisma.decision.findUnique.mockResolvedValue({ fase: 'votacion' });
      await expect(service.closeWithConsensus(YO, 't1', dto, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
      prisma.decision.findUnique.mockResolvedValue({ fase: 'contada' });
      await service.closeWithConsensus(YO, 't1', dto, 'ip');
      prisma.decision.findUnique.mockResolvedValue({ fase: 'cancelada' });
      await service.closeWithConsensus(YO, 't1', dto, 'ip');
      expect(prisma.proposal.update).toHaveBeenCalledTimes(2);
    });

    it('un tema oculto no se cierra con consenso', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO, status: 'open', hidden: true });
      await expect(service.closeWithConsensus(YO, 't1', { conclusion: 'Conclusión larga suficiente.' }, 'ip')).rejects.toThrow(BadRequestException);
    });
  });

  describe('moderación', () => {
    it('solo quien modera oculta', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1' });
      await expect(service.hide(YO, { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('ocultar marca el contenido y registra el motivo', async () => {
      board.roleOf.mockResolvedValue('administrador');
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', proposal: { groupId: 'g1' } });
      prisma.proposalComment.update.mockResolvedValue({});
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      await service.hide(YO, { target: 'respuesta', targetId: 'c1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
      expect(prisma.proposalComment.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { hidden: true } });
      expect(prisma.moderationAction.create).toHaveBeenCalledWith({
        data: { target: 'respuesta', targetId: 'c1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo', moderatorProfileId: YO, status: 'oculto', venceAt: null },
      });
    });

    it('no se oculta dos veces lo que ya está oculto', async () => {
      board.roleOf.mockResolvedValue('administrador');
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', hidden: true, proposal: { groupId: 'g1' } });
      await expect(service.hide(YO, { target: 'respuesta', targetId: 'c1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip')).rejects.toThrow(ConflictException);
      expect(prisma.moderationAction.create).not.toHaveBeenCalled();
    });

    it('ocultar y registrar ocurren en una sola transacción', async () => {
      board.roleOf.mockResolvedValue('administrador');
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false });
      prisma.proposal.update.mockResolvedValue({});
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('ocultar un tema con votación abierta la cancela y le quita el título, en la misma transacción', async () => {
      board.roleOf.mockResolvedValue('administrador');
      // La lectura previa aún no ve la votación: se abrió entre esa lectura y la transacción.
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false, electionId: null, title: 'Título delicado' });
      prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: 'e1' });
      prisma.election.findUnique.mockResolvedValue({ status: 'open' });
      prisma.election.update.mockResolvedValue({});
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.election.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { title: 'Votación de un tema oculto', status: 'cancelled' },
      });
    });

    it('ocultar un tema cancela su decisión activa en la misma transacción y lo audita sin texto', async () => {
      board.roleOf.mockResolvedValue('administrador');
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false, electionId: null, title: 'Título delicado' });
      prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: null });
      prisma.decision.updateMany.mockResolvedValue({ count: 1 });
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { proposalId: 't1', fase: { in: ['modo', 'objecion', 'votacion'] } },
        data: { fase: 'cancelada' },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'decision.cancelled', metadata: { proposalId: 't1' },
      }));
    });

    it('ocultar un tema sin decisión activa (count = 0) no audita la cancelación', async () => {
      board.roleOf.mockResolvedValue('administrador');
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false, electionId: null, title: 'Título delicado' });
      prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: null });
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.cancelled' }));
    });

    describe('un tema de cambio de regla ocultado en firme', () => {
      beforeEach(() => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false, electionId: null, title: 'Cambiar la regla' });
        prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: null });
        prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      });
      const ocultar = () =>
        service.hide(YO, { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');

      it('antes de la decisión: el cambio en votación queda anulado, en la misma transacción', async () => {
        await ocultar();
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.cambioRegla.updateMany).toHaveBeenCalledWith({
          where: { proposalId: 't1', estado: 'en_votacion' },
          data: { estado: 'anulado', resueltoAt: expect.any(Date) },
        });
      });

      it('esperando a la mesa: el cambio queda anulado y su acción de la mesa, rechazada', async () => {
        prisma.cambioRegla.findFirst.mockResolvedValue({ id: 'c-1', boardActionId: 'ba-1' });
        await ocultar();
        expect(prisma.cambioRegla.findFirst).toHaveBeenCalledWith({
          where: { proposalId: 't1', estado: 'pendiente_mesa' },
          select: { id: true, boardActionId: true },
        });
        expect(prisma.boardAction.updateMany).toHaveBeenCalledWith({
          where: { id: 'ba-1', status: 'pending' },
          data: { status: 'rejected', resolvedAt: expect.any(Date) },
        });
        expect(prisma.cambioRegla.updateMany).toHaveBeenCalledWith({
          where: { id: 'c-1', estado: 'pendiente_mesa' },
          data: { estado: 'anulado', resueltoAt: expect.any(Date) },
        });
      });

      it('una ocultación provisional no anula el cambio (solo pausa)', async () => {
        prisma.moderationAction.findFirst.mockResolvedValue(null);
        await (service as unknown as { cancelarVotacionesTx: (tx: unknown, id: string, e: null, c: boolean) => Promise<boolean> })
          .cancelarVotacionesTx(prisma, 't1', null, false);
        expect(prisma.cambioRegla.updateMany).not.toHaveBeenCalled();
        expect(prisma.boardAction.updateMany).not.toHaveBeenCalled();
      });
    });

    it('ocultar un tema con votación ya contada solo le quita el título', async () => {
      board.roleOf.mockResolvedValue('administrador');
      // La lectura previa aún no ve la votación: se abrió entre esa lectura y la transacción.
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false, electionId: null, title: 'Título delicado' });
      prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: 'e1' });
      prisma.election.findUnique.mockResolvedValue({ status: 'tallied' });
      prisma.election.update.mockResolvedValue({});
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
      expect(prisma.election.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { title: 'Votación de un tema oculto' },
      });
    });

    it('restaurar un tema con votación le devuelve el título, sin reabrirla', async () => {
      board.roleOf.mockResolvedValue('secretario');
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'tema', targetId: 't1', status: 'apelado' });
      prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo común', electionId: 'e1' });
      prisma.election.update.mockResolvedValue({});
      prisma.moderationAction.update.mockResolvedValue({});
      await service.resolveAppeal(YO, 'ma1', true, 'ip');
      expect(prisma.election.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { title: 'Votación: Fondo común' },
      });
    });

    it('resolver una apelación ocurre en una sola transacción', async () => {
      board.roleOf.mockResolvedValue('secretario');
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'tema', targetId: 't1', status: 'apelado' });
      await service.resolveAppeal(YO, 'ma1', false, 'ip');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('solo el autor apela, una vez', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', status: 'oculto' });
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', authorProfileId: 'p-otro', proposal: { groupId: 'g1' } });
      await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);

      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', status: 'apelado' });
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', authorProfileId: YO, proposal: { groupId: 'g1' } });
      await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ConflictException);
    });

    it('el autor que ya no es miembro no puede apelar', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'respuesta', targetId: 'c1', status: 'oculto' });
      prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', authorProfileId: YO, proposal: { groupId: 'g1' } });
      await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.moderationAction.update).not.toHaveBeenCalled();
    });

    it('restaurar devuelve el contenido a la vista', async () => {
      board.roleOf.mockResolvedValue('secretario');
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'tema', targetId: 't1', status: 'apelado' });
      prisma.proposal.update.mockResolvedValue({});
      prisma.moderationAction.update.mockResolvedValue({});
      await service.resolveAppeal(YO, 'ma1', true, 'ip');
      expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: false } });
      expect(prisma.moderationAction.update).toHaveBeenCalledWith({
        where: { id: 'ma1' },
        data: expect.objectContaining({ status: 'restaurado' }),
      });
    });

    it('resolver apelaciones es solo de la mesa', async () => {
      board.roleOf.mockResolvedValue(null);
      await expect(service.resolveAppeal(YO, 'ma1', true, 'ip')).rejects.toThrow(ForbiddenException);
    });

    describe('soluciones', () => {
      const so = (over: Record<string, unknown> = {}) => ({
        id: 's1', proposalId: 't1', authorProfileId: YO, title: 'Una solución', description: 'Detalle de la solución', hidden: false,
        proposal: { groupId: 'g1' }, ...over,
      });

      it('ocultarla dos veces da Conflict y un no moderador no oculta', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.solucion.findUnique.mockResolvedValue(so({ hidden: true }));
        await expect(service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip')).rejects.toThrow(ConflictException);
        board.roleOf.mockResolvedValue(null);
        prisma.solucion.findUnique.mockResolvedValue(so());
        await expect(service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip')).rejects.toThrow(ForbiddenException);
        expect(prisma.solucion.update).not.toHaveBeenCalled();
      });

      it('restaurar deja la solución visible; confirmar la deja oculta', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'solucion', targetId: 's1', status: 'apelado' });
        prisma.solucion.update.mockResolvedValue({});
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(prisma.solucion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { hidden: false } });
        prisma.solucion.update.mockClear();
        await service.resolveAppeal(YO, 'ma1', false, 'ip');
        expect(prisma.solucion.update).not.toHaveBeenCalled();
      });

      it('la lista de apelaciones muestra el texto de la solución y solo su autor apela', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'solucion', targetId: 's1', status: 'oculto' });
        prisma.solucion.findUnique.mockResolvedValue(so({ authorProfileId: 'p-otro' }));
        await expect(service.appeal(YO, 'ma1', 'No fue así', 'ip')).rejects.toThrow(ForbiddenException);
        board.roleOf.mockResolvedValue('administrador');
        prisma.moderationAction.findMany.mockResolvedValue([
          { id: 'ma1', target: 'solucion', targetId: 's1', reason: 'Lenguaje ofensivo', appealText: 'No fue así', appealedAt: new Date(), createdAt: new Date() },
        ]);
        prisma.solucion.findUnique.mockResolvedValue(so());
        const r = await service.listAppeals(YO);
        expect(r[0]).toMatchObject({ target: 'solucion', originalText: 'Una solución\n\nDetalle de la solución' });
      });
    });

    describe('frases', () => {
      const fr = (over: Record<string, unknown> = {}) => ({
        id: 'f1', proposalId: 't1', authorProfileId: YO, text: 'Una frase de prueba', hidden: false,
        proposal: { groupId: 'g1' }, ...over,
      });

      it('ocultar una frase la marca oculta y registra el motivo, resolviendo el grupo por su tema', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.frase.findUnique.mockResolvedValue(fr());
        prisma.frase.update.mockResolvedValue({});
        prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
        expect(await service.hide(YO, { target: 'frase', targetId: 'f1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip')).toEqual({ id: 'ma1', estado: 'oculto' });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.frase.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { hidden: true } });
        expect(prisma.moderationAction.create).toHaveBeenCalledWith({
          data: { target: 'frase', targetId: 'f1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo', moderatorProfileId: YO, status: 'oculto', venceAt: null },
        });
      });

      it('ocultarla dos veces da ConflictException; un no moderador no oculta', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.frase.findUnique.mockResolvedValue(fr({ hidden: true }));
        await expect(service.hide(YO, { target: 'frase', targetId: 'f1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip'))
          .rejects.toThrow(ConflictException);
        board.roleOf.mockResolvedValue(null);
        prisma.frase.findUnique.mockResolvedValue(fr());
        await expect(service.hide(YO, { target: 'frase', targetId: 'f1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip'))
          .rejects.toThrow(ForbiddenException);
      });

      it("'frase' con el id de un comentario da NotFound y no toca el comentario", async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.frase.findUnique.mockResolvedValue(null);
        prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', proposal: { groupId: 'g1' } });
        const p = service.hide(YO, { target: 'frase', targetId: 'c1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
        await expect(p).rejects.toThrow(NotFoundException);
        await expect(p).rejects.toThrow('Frase no encontrada');
        expect(prisma.proposalComment.update).not.toHaveBeenCalled();
        expect(prisma.moderationAction.create).not.toHaveBeenCalled();
      });

      it('un no autor no apela; un autor que ya no es miembro tampoco; el autor miembro sí', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'frase', targetId: 'f1', status: 'oculto' });
        prisma.frase.findUnique.mockResolvedValue(fr({ authorProfileId: 'p-otro' }));
        await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);
        prisma.frase.findUnique.mockResolvedValue(fr());
        prisma.groupMembership.findUnique.mockResolvedValue(null);
        await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);
        expect(prisma.moderationAction.update).not.toHaveBeenCalled();
        prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
        await service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip');
        expect(prisma.moderationAction.update).toHaveBeenCalledWith({
          where: { id: 'ma1' },
          data: expect.objectContaining({ status: 'apelado' }),
        });
      });

      it('restaurar deja la frase visible; confirmar la deja oculta', async () => {
        board.roleOf.mockResolvedValue('secretario');
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'frase', targetId: 'f1', status: 'apelado' });
        prisma.frase.update.mockResolvedValue({});
        prisma.moderationAction.update.mockResolvedValue({});
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(prisma.frase.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { hidden: false } });
        prisma.frase.update.mockClear();
        await service.resolveAppeal(YO, 'ma1', false, 'ip');
        expect(prisma.frase.update).not.toHaveBeenCalled();
      });

      it('la lista de apelaciones muestra el texto de la frase', async () => {
        board.roleOf.mockResolvedValue('secretario');
        prisma.moderationAction.findMany.mockResolvedValue([
          { id: 'ma1', target: 'frase', targetId: 'f1', reason: 'Lenguaje ofensivo', appealText: 'No fue así', appealedAt: new Date(), createdAt: new Date() },
        ]);
        prisma.frase.findUnique.mockResolvedValue(fr());
        const r = await service.listAppeals(YO);
        expect(r[0]).toMatchObject({ target: 'frase', originalText: 'Una frase de prueba' });
      });
    });

    describe('informes de comisión', () => {
      const inf = (over: Record<string, unknown> = {}) => ({
        id: 'i1', grupoId: 'g-com', autorProfileId: YO, texto: 'Informe con datos de la obra', final: false, hidden: false, ...over,
      });

      it('un informe se oculta con una sola firma (sin quórum), en el grupo de la comisión', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.comisionInforme.findUnique.mockResolvedValue(inf({ final: true }));
        prisma.comisionInforme.update.mockResolvedValue({});
        prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
        expect(await service.hide(YO, { target: 'informe', targetId: 'i1', causa: 'insultos_amenazas' }, 'ip')).toEqual({ id: 'ma1', estado: 'oculto' });
        expect(prisma.comisionInforme.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { hidden: true } });
        expect(prisma.moderationAction.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ target: 'informe', targetId: 'i1', status: 'oculto', venceAt: null }),
        });
        expect(prisma.proposalComment.update).not.toHaveBeenCalled();
      });

      it('un informe ya oculto da 409; uno inexistente da 404', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.comisionInforme.findUnique.mockResolvedValue(inf({ hidden: true }));
        await expect(service.hide(YO, { target: 'informe', targetId: 'i1', causa: 'insultos_amenazas' }, 'ip')).rejects.toThrow(ConflictException);
        prisma.comisionInforme.findUnique.mockResolvedValue(null);
        await expect(service.hide(YO, { target: 'informe', targetId: 'i1', causa: 'insultos_amenazas' }, 'ip')).rejects.toThrow('Informe no encontrado');
      });

      it('su autor apela; restaurar lo vuelve visible; la mesa ve su texto', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'informe', targetId: 'i1', status: 'oculto', reason: '' });
        prisma.comisionInforme.findUnique.mockResolvedValue(inf());
        await service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip');
        expect(prisma.groupMembership.findUnique).toHaveBeenCalledWith({ where: { groupId_profileId: { groupId: 'g-com', profileId: YO } } });
        board.roleOf.mockResolvedValue('secretario');
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'informe', targetId: 'i1', status: 'apelado', reason: '' });
        prisma.comisionInforme.update.mockResolvedValue({});
        prisma.moderationAction.update.mockResolvedValue({});
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(prisma.comisionInforme.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { hidden: false } });
        prisma.moderationAction.findMany.mockResolvedValue([
          { id: 'ma1', target: 'informe', targetId: 'i1', reason: '', appealText: 'No', appealedAt: new Date(), createdAt: new Date() },
        ]);
        expect((await service.listAppeals(YO))[0]).toMatchObject({ target: 'informe', originalText: 'Informe con datos de la obra' });
      });

      it('el DTO de moderación acepta informe', async () => {
        const dto = plainToInstance(ModerateDto, { target: 'informe', targetId: '11111111-1111-4111-8111-111111111111', causa: 'insultos_amenazas' });
        expect(await validate(dto)).toHaveLength(0);
      });
    });

    describe('inquietudes', () => {
      const inq = (over: Record<string, unknown> = {}) => ({
        id: 'q1', groupId: 'g1', authorProfileId: YO, title: 'Arreglar el local', body: 'Explicación larga', hidden: false, ...over,
      });

      it('ocultar una inquietud la marca oculta y registra el motivo, en una transacción', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.inquietud.findUnique.mockResolvedValue(inq());
        prisma.inquietud.update.mockResolvedValue({});
        prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
        await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.inquietud.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { hidden: true } });
        expect(prisma.moderationAction.create).toHaveBeenCalledWith({
          data: { target: 'inquietud', targetId: 'q1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo', moderatorProfileId: YO, status: 'oculto', venceAt: null },
        });
        expect(prisma.proposalComment.update).not.toHaveBeenCalled();
      });

      it('ocultar dos veces falla; un no moderador no oculta', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.inquietud.findUnique.mockResolvedValue(inq({ hidden: true }));
        await expect(service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip'))
          .rejects.toThrow('Este contenido ya está oculto.');
        board.roleOf.mockResolvedValue(null);
        prisma.inquietud.findUnique.mockResolvedValue(inq());
        await expect(service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip'))
          .rejects.toThrow(ForbiddenException);
      });

      it('el objetivo inquietud con el id de un comentario NO oculta el comentario', async () => {
        board.roleOf.mockResolvedValue('administrador');
        prisma.inquietud.findUnique.mockResolvedValue(null);
        prisma.proposalComment.findUnique.mockResolvedValue({ id: 'c1', proposal: { groupId: 'g1' } });
        const p = service.hide(YO, { target: 'inquietud', targetId: 'c1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
        await expect(p).rejects.toThrow(NotFoundException);
        await expect(p).rejects.toThrow('Inquietud no encontrada');
        expect(prisma.proposalComment.update).not.toHaveBeenCalled();
        expect(prisma.moderationAction.create).not.toHaveBeenCalled();
      });

      it('un tipo de contenido desconocido se rechaza', async () => {
        await expect(service.hide(YO, { target: 'otro' as never, targetId: 'x', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip'))
          .rejects.toThrow('Tipo de contenido no válido.');
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'otro', targetId: 'x', status: 'oculto' });
        await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(BadRequestException);
      });

      it('un tipo de contenido no válido sigue rechazándose', async () => {
        await expect(service.hide(YO, { target: 'foro' as never, targetId: 'f1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip'))
          .rejects.toThrow(new BadRequestException('Tipo de contenido no válido.'));
      });

      it('un no autor no apela; el autor sí, una vez', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'oculto' });
        prisma.inquietud.findUnique.mockResolvedValue(inq({ authorProfileId: 'p-otro' }));
        await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);
        prisma.inquietud.findUnique.mockResolvedValue(inq());
        await service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip');
        expect(prisma.moderationAction.update).toHaveBeenCalledWith({
          where: { id: 'ma1' },
          data: expect.objectContaining({ status: 'apelado' }),
        });
      });

      it('el autor que ya no es miembro no apela', async () => {
        prisma.groupMembership.findUnique.mockResolvedValue(null);
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'oculto' });
        prisma.inquietud.findUnique.mockResolvedValue(inq());
        await expect(service.appeal(YO, 'ma1', 'No fue mi intención ofender', 'ip')).rejects.toThrow(ForbiddenException);
      });

      it('restaurar la deja visible y no toca comentarios', async () => {
        board.roleOf.mockResolvedValue('secretario');
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado' });
        prisma.inquietud.update.mockResolvedValue({});
        prisma.moderationAction.update.mockResolvedValue({});
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(prisma.inquietud.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { hidden: false } });
        expect(prisma.proposalComment.update).not.toHaveBeenCalled();
      });

      describe('debate abierto por la comunidad desde la inquietud', () => {
        const LINKED = 'Oculto junto con la inquietud de origen.';

        it('ocultar una inquietud abierta_por_la_comunidad oculta su tema y registra la moderación vinculada', async () => {
          board.roleOf.mockResolvedValue('administrador');
          prisma.inquietud.findUnique.mockResolvedValue(inq({ status: 'abierta_por_la_comunidad', proposalId: 't1' }));
          prisma.inquietud.update.mockResolvedValue(inq({ hidden: true, proposalId: 't1' }));
          prisma.$queryRaw.mockResolvedValue([{ abiertoPorComunidad: true, hidden: false, kind: 'tema' }]);
          prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: 'e1' });
          prisma.election.findUnique.mockResolvedValue({ status: 'open' });
          prisma.election.update.mockResolvedValue({});
          prisma.moderationAction.create.mockResolvedValueOnce({ id: 'ma1' }).mockResolvedValueOnce({ id: 'ma2' });
          const r = await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
          expect(r).toEqual({ id: 'ma1', estado: 'oculto' });
          expect(prisma.$transaction).toHaveBeenCalledTimes(1);
          expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: true } });
          expect(prisma.election.update).toHaveBeenCalledWith({
            where: { id: 'e1' },
            data: { title: 'Votación de un tema oculto', status: 'cancelled' },
          });
          expect(prisma.moderationAction.create).toHaveBeenCalledWith({
            data: { target: 'tema', targetId: 't1', causa: 'insultos_amenazas', reason: LINKED, moderatorProfileId: YO, status: 'oculto', venceAt: null },
          });
        });

        it('un debate abierto a mano (abiertoPorComunidad false) NO se oculta al ocultar una de sus inquietudes', async () => {
          board.roleOf.mockResolvedValue('administrador');
          prisma.inquietud.findUnique.mockResolvedValue(inq({ status: 'en_debate', proposalId: 't1' }));
          prisma.inquietud.update.mockResolvedValue(inq({ hidden: true, proposalId: 't1' }));
          prisma.$queryRaw.mockResolvedValue([{ abiertoPorComunidad: false, hidden: false, kind: 'tema' }]);
          prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
          await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'insultos_amenazas', reason: 'Lenguaje ofensivo' }, 'ip');
          expect(prisma.proposal.update).not.toHaveBeenCalled();
          expect(prisma.moderationAction.create).toHaveBeenCalledTimes(1);
        });

        it('restaurar la inquietud restaura también el tema ocultado junto con ella', async () => {
          board.roleOf.mockResolvedValue('secretario');
          prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado' });
          prisma.inquietud.update.mockResolvedValue(inq({ proposalId: 't1' }));
          prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: true });
          prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma2', reason: LINKED, status: 'oculto' });
          prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Arreglar el local', electionId: 'e1' });
          prisma.election.update.mockResolvedValue({});
          prisma.moderationAction.update.mockResolvedValue({});
          await service.resolveAppeal(YO, 'ma1', true, 'ip');
          expect(prisma.moderationAction.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { target: 'tema', targetId: 't1' }, orderBy: { createdAt: 'desc' } }),
          );
          expect(prisma.inquietud.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { hidden: false } });
          expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: false } });
          expect(prisma.election.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { title: 'Votación: Arreglar el local' } });
          expect(prisma.moderationAction.update).toHaveBeenCalledWith({
            where: { id: 'ma2' },
            data: expect.objectContaining({ status: 'restaurado' }),
          });
        });

        it('un tema oculto por su propio motivo sigue oculto al restaurar la inquietud', async () => {
          board.roleOf.mockResolvedValue('secretario');
          prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado' });
          prisma.inquietud.update.mockResolvedValue(inq({ proposalId: 't1' }));
          prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: true });
          prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma3', reason: 'Datos personales', status: 'oculto' });
          prisma.moderationAction.update.mockResolvedValue({});
          await service.resolveAppeal(YO, 'ma1', true, 'ip');
          expect(prisma.proposal.update).not.toHaveBeenCalled();
          expect(prisma.moderationAction.update).toHaveBeenCalledTimes(1);
          expect(prisma.moderationAction.update).toHaveBeenCalledWith({
            where: { id: 'ma1' },
            data: expect.objectContaining({ status: 'restaurado' }),
          });
        });

        it('la ocultación vinculada del tema no se apela por separado', async () => {
          prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma2', target: 'tema', targetId: 't1', reason: LINKED, status: 'oculto' });
          prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', authorProfileId: YO });
          const p = service.appeal(YO, 'ma2', 'No fue mi intención ofender', 'ip');
          await expect(p).rejects.toThrow(BadRequestException);
          await expect(p).rejects.toThrow('Esta ocultación se apela desde la inquietud de origen.');
          expect(prisma.moderationAction.update).not.toHaveBeenCalled();
        });

        it('una ocultación vinculada ya apelada no se resuelve directamente', async () => {
          board.roleOf.mockResolvedValue('secretario');
          prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma2', target: 'tema', targetId: 't1', reason: LINKED, status: 'apelado' });
          const p = service.resolveAppeal(YO, 'ma2', true, 'ip');
          await expect(p).rejects.toThrow(BadRequestException);
          await expect(p).rejects.toThrow('Esta ocultación se apela desde la inquietud de origen.');
          expect(prisma.$transaction).not.toHaveBeenCalled();
          expect(prisma.proposal.update).not.toHaveBeenCalled();
        });
      });

      it('la cola de la mesa muestra título y explicación de la inquietud', async () => {
        board.roleOf.mockResolvedValue('secretario');
        prisma.moderationAction.findMany.mockResolvedValue([
          { id: 'ma1', target: 'inquietud', targetId: 'q1', reason: 'Motivo', appealText: 'Apelo', appealedAt: new Date('2026-11-04T00:00:00Z'), createdAt: new Date('2026-11-03T00:00:00Z') },
        ]);
        prisma.inquietud.findUnique.mockResolvedValue(inq());
        const r = await service.listAppeals(YO);
        expect(r[0]).toEqual(expect.objectContaining({ target: 'inquietud', originalText: 'Arreglar el local\n\nExplicación larga' }));
      });
    });
  });

  describe('causas y segunda firma de la mesa', () => {
    const OTRA = 'p-otra';
    const AHORA = new Date('2026-11-10T12:00:00Z');
    const HORA = 3_600_000;
    const SIETE_DIAS = new Date(AHORA.getTime() + 7 * 24 * HORA);
    const so = (over: Record<string, unknown> = {}) => ({
      id: 's1', proposalId: 't1', authorProfileId: 'p-autor', title: 'Una solución', description: 'Detalle', hidden: false,
      proposal: { groupId: 'g1' }, ...over,
    });
    const accion = (over: Record<string, unknown> = {}) => ({
      id: 'ma1', target: 'solucion', targetId: 's1', causa: 'spam', reason: '', moderatorProfileId: OTRA,
      status: 'pendiente', venceAt: SIETE_DIAS, createdAt: AHORA, appealText: null, appealedAt: null, ...over,
    });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(AHORA);
      board.roleOf.mockResolvedValue('secretario');
      prisma.moderationAction.findFirst.mockResolvedValue(null);
      prisma.moderationAction.create.mockResolvedValue({ id: 'ma1' });
      prisma.moderationAction.updateMany.mockResolvedValue({ count: 1 });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('el DTO exige una causa de la lista y acepta un detalle vacío', async () => {
      const base = { target: 'solucion', targetId: '3f0e1c2a-6b7d-4e8f-9a0b-1c2d3e4f5a6b' };
      const sinCausa = await validate(plainToInstance(ModerateDto, base));
      expect(sinCausa.map((e) => e.property)).toEqual(['causa']);
      expect(JSON.stringify(sinCausa)).toContain('Elige una causa de la lista.');
      expect(await validate(plainToInstance(ModerateDto, { ...base, causa: 'groseria' }))).toHaveLength(1);
      expect(await validate(plainToInstance(ModerateDto, { ...base, causa: 'spam' }))).toHaveLength(0);
      const vacio = plainToInstance(ModerateDto, { ...base, causa: 'spam', reason: '   ' });
      expect(vacio.reason).toBe('');
      expect(await validate(vacio)).toHaveLength(0);
      expect(await validate(plainToInstance(ModerateDto, { ...base, causa: 'spam', reason: 'a'.repeat(501) }))).toHaveLength(1);
      expect(await validate(plainToInstance(ConfirmarModeracionDto, { aprobar: 'sí' }))).toHaveLength(1);
      expect(await validate(plainToInstance(ConfirmarModeracionDto, { aprobar: false }))).toHaveLength(0);
    });

    it('una solución con causa no urgente queda pendiente, visible y con 7 días', async () => {
      prisma.solucion.findUnique.mockResolvedValue(so());
      const r = await service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'spam' }, 'ip');
      expect(r).toEqual({ id: 'ma1', estado: 'pendiente' });
      expect(prisma.solucion.update).not.toHaveBeenCalled();
      expect(prisma.moderationAction.create).toHaveBeenCalledWith({
        data: { target: 'solucion', targetId: 's1', causa: 'spam', reason: '', moderatorProfileId: YO, status: 'pendiente', venceAt: SIETE_DIAS },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'moderation.requested', resource: 'moderation:ma1', metadata: {},
      }));
      // La auditoría la leen todas las personas verificadas: una solicitud abierta no dice qué contenido ni por qué.
      const requested = JSON.stringify(audit.log.mock.calls.filter(([e]) => e.action === 'moderation.requested'));
      expect(requested).not.toContain('s1');
      expect(requested).not.toContain('spam');
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'moderation.hidden' }));
    });

    it('con causa urgente queda provisional, oculta ya y con 48 h', async () => {
      prisma.solucion.findUnique.mockResolvedValue(so());
      prisma.solucion.update.mockResolvedValue({});
      const r = await service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'datos_personales', reason: 'Publica un teléfono' }, 'ip');
      expect(r).toEqual({ id: 'ma1', estado: 'provisional' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.solucion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { hidden: true } });
      expect(prisma.moderationAction.create).toHaveBeenCalledWith({
        data: {
          target: 'solucion', targetId: 's1', causa: 'datos_personales', reason: 'Publica un teléfono', moderatorProfileId: YO,
          status: 'provisional', venceAt: new Date(AHORA.getTime() + 48 * HORA), fueProvisional: true,
        },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'moderation.hidden', metadata: { moderationId: 'ma1', causa: 'datos_personales', estado: 'provisional' },
      }));
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('teléfono');
    });

    it('un tema propuesta sigue la misma regla; un tema común y una frase se ocultan directo', async () => {
      // La lectura previa aún dice 'tema': la que manda es la bloqueada dentro de la transacción.
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false, kind: 'tema' });
      prisma.$queryRaw.mockResolvedValue([{ kind: 'propuesta' }]);
      expect(await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'spam' }, 'ip')).toEqual({ id: 'ma1', estado: 'pendiente' });
      expect(String(prisma.$queryRaw.mock.calls[0]?.[0]?.sql ?? '')).toMatch(/SELECT kind, hidden, "abiertoPorComunidad" FROM proposals WHERE id = .*FOR UPDATE/);
      expect(prisma.proposal.update).not.toHaveBeenCalled();
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();

      prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: null });
      prisma.decision.updateMany.mockResolvedValue({ count: 1 });
      expect(await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'ilegal_violencia' }, 'ip')).toEqual({ id: 'ma1', estado: 'provisional' });
      expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: true } });
      // Provisional solo pausa: la decisión sigue en su fase hasta que se confirme.
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.cancelled' }));

      prisma.proposal.findUnique.mockResolvedValue({ id: 't2', groupId: 'g1', hidden: false, kind: 'tema' });
      prisma.$queryRaw.mockResolvedValue([{ kind: 'tema' }]);
      prisma.proposal.update.mockResolvedValue({ id: 't2', electionId: null });
      expect(await service.hide(YO, { target: 'tema', targetId: 't2', causa: 'spam' }, 'ip')).toEqual({ id: 'ma1', estado: 'oculto' });
      expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't2' }, data: { hidden: true } });

      prisma.frase.findUnique.mockResolvedValue({ id: 'f1', hidden: false, proposal: { groupId: 'g1' } });
      prisma.frase.update.mockResolvedValue({});
      expect(await service.hide(YO, { target: 'frase', targetId: 'f1', causa: 'spam' }, 'ip')).toEqual({ id: 'ma1', estado: 'oculto' });
      expect(prisma.frase.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { hidden: true } });
      expect(prisma.moderationAction.create).toHaveBeenLastCalledWith({
        data: { target: 'frase', targetId: 'f1', causa: 'spam', reason: '', moderatorProfileId: YO, status: 'oculto', venceAt: null },
      });
    });

    it('una segunda solicitud abierta sobre el mismo contenido da 409', async () => {
      prisma.solucion.findUnique.mockResolvedValue(so());
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma0' });
      const p = service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'spam' }, 'ip');
      await expect(p).rejects.toThrow(ConflictException);
      await expect(p).rejects.toThrow('Ya hay una solicitud de moderación abierta para este contenido.');
      expect(prisma.moderationAction.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { target: 'solucion', targetId: 's1', status: { in: ['pendiente', 'provisional'] } },
      }));
      expect(prisma.moderationAction.create).not.toHaveBeenCalled();
    });

    it('si otra solicitud se registra a la vez (índice único), también da 409', async () => {
      prisma.solucion.findUnique.mockResolvedValue(so());
      prisma.moderationAction.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'spam' }, 'ip'))
        .rejects.toThrow('Ya hay una solicitud de moderación abierta para este contenido.');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('confirmar la propia solicitud da 403; quien no es de la mesa también', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ moderatorProfileId: YO }));
      const p = service.confirmar(YO, 'ma1', true, 'ip');
      await expect(p).rejects.toThrow(ForbiddenException);
      await expect(p).rejects.toThrow('No puedes confirmar tu propia solicitud.');
      await expect(service.confirmar(YO, 'ma1', false, 'ip')).rejects.toThrow(ForbiddenException);
      board.roleOf.mockResolvedValue(null);
      prisma.moderationAction.findUnique.mockResolvedValue(accion());
      await expect(service.confirmar(YO, 'ma1', true, 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.moderationAction.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('confirmar una pendiente oculta el contenido y pasa a oculto, en una transacción', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion());
      prisma.solucion.update.mockResolvedValue({});
      await service.confirmar(YO, 'ma1', true, 'ip');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'ma1', status: 'pendiente', venceAt: { gt: AHORA } },
        data: { status: 'oculto', confirmadorProfileId: YO },
      });
      expect(prisma.solucion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { hidden: true } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'moderation.confirmed_by_board', resource: 'solucion:s1', metadata: { moderationId: 'ma1', causa: 'spam' },
      }));
    });

    it('confirmar una propuesta pendiente cancela su decisión y lo audita', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ target: 'tema', targetId: 't1' }));
      prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: null });
      prisma.decision.updateMany.mockResolvedValue({ count: 1 });
      await service.confirmar(YO, 'ma1', true, 'ip');
      expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: true } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.cancelled', metadata: { proposalId: 't1' } }));
    });

    it('confirmar una provisional solo cambia su estado: ya estaba oculta', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ status: 'provisional', causa: 'datos_personales' }));
      await service.confirmar(YO, 'ma1', true, 'ip');
      expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'ma1', status: 'provisional', venceAt: { gt: AHORA } },
        data: { status: 'oculto', confirmadorProfileId: YO },
      });
      expect(prisma.solucion.update).not.toHaveBeenCalled();
    });

    it('rechazar una provisional restaura el contenido y pasa a rechazado', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ status: 'provisional', causa: 'datos_personales' }));
      prisma.solucion.update.mockResolvedValue({});
      await service.confirmar(YO, 'ma1', false, 'ip');
      expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'ma1', status: 'provisional', venceAt: { gt: AHORA } },
        data: { status: 'rechazado', confirmadorProfileId: YO, resolvedAt: AHORA },
      });
      expect(prisma.solucion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { hidden: false } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'moderation.rejected_by_board', resource: 'solucion:s1', metadata: { moderationId: 'ma1', causa: 'datos_personales' },
      }));
    });

    it('rechazar una pendiente no toca el contenido', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion());
      await service.confirmar(YO, 'ma1', false, 'ip');
      expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'ma1', status: 'pendiente', venceAt: { gt: AHORA } },
        data: { status: 'rechazado', confirmadorProfileId: YO, resolvedAt: AHORA },
      });
      expect(prisma.solucion.update).not.toHaveBeenCalled();
    });

    it('confirmar o rechazar algo que ya no está pendiente ni provisional da 409', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ status: 'oculto' }));
      await expect(service.confirmar(YO, 'ma1', true, 'ip')).rejects.toThrow(ConflictException);
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ status: 'rechazado' }));
      await expect(service.confirmar(YO, 'ma1', false, 'ip')).rejects.toThrow(ConflictException);
      expect(prisma.moderationAction.updateMany).not.toHaveBeenCalled();

      // Otra persona o el vencimiento la resolvió entre la lectura y la transacción.
      prisma.moderationAction.findUnique.mockResolvedValue(accion());
      prisma.moderationAction.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.confirmar(YO, 'ma1', true, 'ip')).rejects.toThrow(ConflictException);
      expect(prisma.solucion.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('confirmar o rechazar después del plazo da 409 «ya venció», aunque el vencimiento aún no haya corrido', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ venceAt: new Date(AHORA.getTime() - HORA) }));
      const p = service.confirmar(YO, 'ma1', true, 'ip');
      await expect(p).rejects.toThrow(ConflictException);
      await expect(p).rejects.toThrow('Esta solicitud ya venció.');
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ status: 'provisional', venceAt: AHORA }));
      await expect(service.confirmar(YO, 'ma1', false, 'ip')).rejects.toThrow('Esta solicitud ya venció.');
      expect(prisma.moderationAction.updateMany).not.toHaveBeenCalled();
      expect(prisma.solucion.update).not.toHaveBeenCalled();
    });

    it('si vence entre la lectura y la transacción, el updateMany condicionado al plazo no firma', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ venceAt: new Date(AHORA.getTime() + 1000) }));
      prisma.moderationAction.updateMany.mockImplementation(async () => {
        vi.setSystemTime(new Date(AHORA.getTime() + 2000));
        return { count: 0 };
      });
      await expect(service.confirmar(YO, 'ma1', true, 'ip')).rejects.toThrow('Esta solicitud ya venció.');
      expect(prisma.solucion.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('una moderación inexistente da 404', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(null);
      await expect(service.confirmar(YO, 'ma1', true, 'ip')).rejects.toThrow(NotFoundException);
    });

    it('el vencimiento restaura las provisionales y cierra las pendientes', async () => {
      prisma.moderationAction.findMany.mockResolvedValue([
        accion({ id: 'ma1', status: 'provisional', causa: 'datos_personales' }),
        accion({ id: 'ma2', status: 'pendiente', targetId: 's2' }),
      ]);
      prisma.solucion.update.mockResolvedValue({});
      expect(await service.processModerationDeadlines(AHORA)).toBe(2);
      expect(prisma.moderationAction.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: { in: ['pendiente', 'provisional'] }, venceAt: { lte: AHORA } },
      }));
      expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'ma1', status: 'provisional' }, data: { status: 'rechazado', resolvedAt: AHORA },
      });
      expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'ma2', status: 'pendiente' }, data: { status: 'rechazado', resolvedAt: AHORA },
      });
      expect(prisma.solucion.update).toHaveBeenCalledTimes(1);
      expect(prisma.solucion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { hidden: false } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'moderation.expired', resource: 'solucion:s1', metadata: { moderationId: 'ma1', causa: 'datos_personales' },
      }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'moderation.expired', resource: 'solucion:s2', metadata: { moderationId: 'ma2', causa: 'spam' },
      }));
    });

    it('si otra corrida o una confirmación ganó (count = 0), el vencimiento no restaura ni audita', async () => {
      prisma.moderationAction.findMany.mockResolvedValue([accion({ status: 'provisional', causa: 'datos_personales' })]);
      prisma.moderationAction.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.processModerationDeadlines(AHORA)).toBe(0);
      expect(prisma.solucion.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('apelar una pendiente da 409', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue(accion());
      prisma.solucion.findUnique.mockResolvedValue(so({ authorProfileId: YO }));
      await expect(service.appeal(YO, 'ma1', 'No fue así', 'ip')).rejects.toThrow(ConflictException);
      prisma.moderationAction.findUnique.mockResolvedValue(accion({ status: 'provisional' }));
      await expect(service.appeal(YO, 'ma1', 'No fue así', 'ip')).rejects.toThrow(ConflictException);
      expect(prisma.moderationAction.update).not.toHaveBeenCalled();
    });

    it('hiddenReason usa la etiqueta de la causa, más el detalle; sin causa usa el motivo viejo', () => {
      expect(motivoVisible({ causa: 'spam', reason: '' })).toBe('Correo basura o publicidad ajena al tema');
      expect(motivoVisible({ causa: 'insultos_amenazas', reason: 'Insulta a una vecina' }))
        .toBe('Insultos, amenazas o acoso: Insulta a una vecina');
      expect(motivoVisible({ causa: null, reason: 'Lenguaje ofensivo' })).toBe('Lenguaje ofensivo');
      expect(motivoVisible({ reason: 'Lenguaje ofensivo' })).toBe('Lenguaje ofensivo');
      expect(motivoVisible(null)).toBeNull();
    });

    describe('solicitudes del asistente', () => {
      const delAsistente = (over: Record<string, unknown> = {}) =>
        accion({ moderatorProfileId: null, origen: 'asistente', causa: 'odio', ...over });

      it('posterior: urgente queda provisional y oculta; no urgente queda pendiente sin ocultar', async () => {
        prisma.solucion.findUnique.mockResolvedValue(so());
        prisma.solucion.update.mockResolvedValue({});
        prisma.moderationAction.count.mockResolvedValue(0);
        expect(await service.solicitarPorAsistente('solucion', 's1', 'datos_personales')).toEqual({ id: 'ma1', estado: 'provisional' });
        expect(prisma.solucion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { hidden: true } });
        expect(prisma.moderationAction.create).toHaveBeenLastCalledWith({
          data: {
            target: 'solucion', targetId: 's1', causa: 'datos_personales', reason: '', moderatorProfileId: null, origen: 'asistente',
            status: 'provisional', venceAt: new Date(AHORA.getTime() + 48 * HORA), fueProvisional: true,
          },
        });

        prisma.solucion.update.mockClear();
        expect(await service.solicitarPorAsistente('solucion', 's1', 'odio')).toEqual({ id: 'ma1', estado: 'pendiente' });
        expect(prisma.solucion.update).not.toHaveBeenCalled();
        expect(prisma.moderationAction.create).toHaveBeenLastCalledWith({
          data: {
            target: 'solucion', targetId: 's1', causa: 'odio', reason: '', moderatorProfileId: null, origen: 'asistente',
            status: 'pendiente', venceAt: SIETE_DIAS,
          },
        });
      });

      it('posterior: urgente queda pendiente si el contenido ya tuvo una provisional', async () => {
        prisma.solucion.findUnique.mockResolvedValue(so());
        prisma.moderationAction.count.mockResolvedValue(1);
        expect(await service.solicitarPorAsistente('solucion', 's1', 'datos_personales')).toEqual({ id: 'ma1', estado: 'pendiente' });
        expect(prisma.moderationAction.count).toHaveBeenCalledWith({ where: { target: 'solucion', targetId: 's1', fueProvisional: true } });
        expect(prisma.solucion.update).not.toHaveBeenCalled();
      });

      it('posterior: nunca crea estado oculto', async () => {
        // Una persona de la mesa oculta una inquietud con una sola firma; el asistente solo lo pide.
        prisma.inquietud.findUnique.mockResolvedValue({ id: 'q1', groupId: 'g1', hidden: false, proposalId: null });
        prisma.moderationAction.count.mockResolvedValue(0);
        expect(await service.solicitarPorAsistente('inquietud', 'q1', 'odio')).toEqual({ id: 'ma1', estado: 'pendiente' });
        expect(prisma.inquietud.update).not.toHaveBeenCalled();
        prisma.frase.findUnique.mockResolvedValue({ id: 'f1', hidden: false, proposal: { groupId: 'g1' } });
        expect(await service.solicitarPorAsistente('frase', 'f1', 'insultos_amenazas')).toEqual({ id: 'ma1', estado: 'pendiente' });
        expect(prisma.frase.update).not.toHaveBeenCalled();
        for (const [arg] of prisma.moderationAction.create.mock.calls) expect(arg.data.status).not.toBe('oculto');
      });

      it('posterior: solicitud abierta existente → null sin error', async () => {
        prisma.solucion.findUnique.mockResolvedValue(so());
        prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma0' });
        expect(await service.solicitarPorAsistente('solucion', 's1', 'odio')).toBeNull();
        expect(prisma.moderationAction.create).not.toHaveBeenCalled();

        // Otra se registró a la vez: el índice único da P2002.
        prisma.moderationAction.findFirst.mockResolvedValue(null);
        prisma.moderationAction.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
        );
        expect(await service.solicitarPorAsistente('solucion', 's1', 'odio')).toBeNull();
        expect(audit.log).not.toHaveBeenCalled();
      });

      it('posterior: contenido ya oculto o inexistente → null sin crear nada', async () => {
        prisma.solucion.findUnique.mockResolvedValue(so({ hidden: true }));
        expect(await service.solicitarPorAsistente('solucion', 's1', 'odio')).toBeNull();
        prisma.solucion.findUnique.mockResolvedValue(null);
        expect(await service.solicitarPorAsistente('solucion', 's1', 'odio')).toBeNull();
        expect(prisma.moderationAction.create).not.toHaveBeenCalled();
      });

      it('auditoría: la solicitud del asistente no lleva actorId', async () => {
        prisma.solucion.findUnique.mockResolvedValue(so());
        await service.solicitarPorAsistente('solucion', 's1', 'odio');
        const eventos = audit.log.mock.calls.map(([e]) => e);
        expect(eventos).toHaveLength(1);
        expect(eventos[0]).toEqual({ action: 'moderacion.solicitada', resource: 'moderation:ma1', metadata: { origen: 'asistente' } });
        expect(eventos[0].actorId).toBeUndefined();
        expect(JSON.stringify(eventos)).not.toContain('Una solución');
      });

      it('confirmar: solicitud del asistente sobre solución pide dos firmas humanas', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue(delAsistente());
        prisma.solucion.update.mockResolvedValue({});
        // Primera aprobación: queda esa persona como firma y la solicitud sigue pendiente.
        await service.confirmar(YO, 'ma1', true, 'ip');
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
          where: { id: 'ma1', status: 'pendiente', venceAt: { gt: AHORA }, moderatorProfileId: null },
          data: { moderatorProfileId: YO },
        });
        expect(prisma.solucion.update).not.toHaveBeenCalled();
        expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'moderation.confirmed_by_board' }));

        // La misma persona no firma dos veces.
        prisma.moderationAction.findUnique.mockResolvedValue(delAsistente({ moderatorProfileId: YO }));
        await expect(service.confirmar(YO, 'ma1', true, 'ip')).rejects.toThrow(ForbiddenException);

        // Segunda aprobación, de otra persona: se oculta como hoy.
        await service.confirmar(OTRA, 'ma1', true, 'ip');
        expect(prisma.moderationAction.updateMany).toHaveBeenLastCalledWith({
          where: { id: 'ma1', status: 'pendiente', venceAt: { gt: AHORA } },
          data: { status: 'oculto', confirmadorProfileId: OTRA },
        });
        expect(prisma.solucion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { hidden: true } });
      });

      it('confirmar: si otra persona firmó primero a la vez, 409 sin tocar el contenido', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue(delAsistente());
        prisma.moderationAction.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.confirmar(YO, 'ma1', true, 'ip')).rejects.toThrow(ConflictException);
        expect(prisma.solucion.update).not.toHaveBeenCalled();
      });

      it('confirmar: solicitud del asistente sobre frase se resuelve con una firma', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue(delAsistente({ target: 'frase', targetId: 'f1' }));
        prisma.frase.update.mockResolvedValue({});
        await service.confirmar(YO, 'ma1', true, 'ip');
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
          where: { id: 'ma1', status: 'pendiente', venceAt: { gt: AHORA } },
          data: { status: 'oculto', confirmadorProfileId: YO },
        });
        expect(prisma.frase.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { hidden: true } });
      });

      it('confirmar: un rechazo de la solicitud del asistente funciona como hoy', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue(delAsistente());
        await service.confirmar(YO, 'ma1', false, 'ip');
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
          where: { id: 'ma1', status: 'pendiente', venceAt: { gt: AHORA } },
          data: { status: 'rechazado', confirmadorProfileId: YO, resolvedAt: AHORA },
        });
      });

      it('la cola por confirmar muestra la solicitud del asistente a toda la mesa', async () => {
        prisma.moderationAction.findMany.mockResolvedValue([delAsistente(), accion({ id: 'ma2' })]);
        prisma.solucion.findUnique.mockResolvedValue(so());
        const r = await service.listPorConfirmar(YO);
        expect(r[0]).toMatchObject({ id: 'ma1', solicitadaPorAsistente: true, esMia: false });
        expect(r[1]).toMatchObject({ id: 'ma2', solicitadaPorAsistente: false });
      });
    });

    describe('ocultación vinculada de una propuesta formal: también pide la segunda firma', () => {
      beforeEach(() => {
        prisma.inquietud.findUnique.mockResolvedValue({ id: 'q1', groupId: 'g1', hidden: false, proposalId: 't1' });
        prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
        prisma.$queryRaw.mockResolvedValue([{ abiertoPorComunidad: true, hidden: false, kind: 'propuesta' }]);
        prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: null });
        prisma.moderationAction.create.mockResolvedValueOnce({ id: 'ma1' }).mockResolvedValueOnce({ id: 'ma2' });
      });

      it('con causa no urgente la propuesta sigue visible y queda una solicitud pendiente de 7 días', async () => {
        const r = await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'spam' }, 'ip');
        expect(r).toEqual({ id: 'ma1', estado: 'oculto' });
        expect(prisma.inquietud.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { hidden: true } });
        expect(prisma.proposal.update).not.toHaveBeenCalled();
        expect(prisma.decision.updateMany).not.toHaveBeenCalled();
        expect(prisma.moderationAction.create).toHaveBeenLastCalledWith({
          data: {
            target: 'tema', targetId: 't1', causa: 'spam', reason: LINKED_TOPIC_REASON, moderatorProfileId: YO,
            status: 'pendiente', venceAt: SIETE_DIAS,
          },
        });
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
          action: 'moderation.requested', resource: 'moderation:ma2', metadata: {},
        }));
        expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ resource: 'tema:t1' }));
      });

      it('con causa urgente la propuesta se oculta ya, provisional por 48 h, sin cancelar su decisión', async () => {
        prisma.decision.updateMany.mockResolvedValue({ count: 1 });
        await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'datos_personales' }, 'ip');
        expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: true } });
        expect(prisma.moderationAction.create).toHaveBeenLastCalledWith({
          data: {
            target: 'tema', targetId: 't1', causa: 'datos_personales', reason: LINKED_TOPIC_REASON, moderatorProfileId: YO,
            status: 'provisional', venceAt: new Date(AHORA.getTime() + 48 * HORA), fueProvisional: true,
          },
        });
        expect(prisma.decision.updateMany).not.toHaveBeenCalled();
        expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.cancelled' }));
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
          action: 'moderation.hidden', resource: 'tema:t1',
          metadata: { moderationId: 'ma2', causa: 'datos_personales', estado: 'provisional' },
        }));
      });

      it('si la propuesta ya tiene una solicitud abierta, no se toca ni se crea otra', async () => {
        prisma.moderationAction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ma0' });
        await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'datos_personales' }, 'ip');
        expect(prisma.moderationAction.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
          where: { target: 'tema', targetId: 't1', status: { in: ['pendiente', 'provisional'] } },
        }));
        expect(prisma.proposal.update).not.toHaveBeenCalled();
        expect(prisma.moderationAction.create).toHaveBeenCalledTimes(1);
      });

      it('la solicitud vinculada se confirma y se rechaza como cualquier otra', async () => {
        const vinculada = accion({ id: 'ma2', target: 'tema', targetId: 't1', reason: LINKED_TOPIC_REASON });
        prisma.moderationAction.findUnique.mockResolvedValue(vinculada);
        await service.confirmar(YO, 'ma2', true, 'ip');
        expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: true } });
        prisma.moderationAction.findUnique.mockResolvedValue({ ...vinculada, status: 'provisional' });
        prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Arreglar el local', electionId: null });
        await service.confirmar(YO, 'ma2', false, 'ip');
        expect(prisma.proposal.update).toHaveBeenLastCalledWith({ where: { id: 't1' }, data: { hidden: false } });
      });
    });

    it('restaurar la inquietud no muestra el debate si otra moderación propia lo mantiene oculto', async () => {
      prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado', reason: 'x' });
      prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: true });
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma2', reason: LINKED_TOPIC_REASON, status: 'oculto' });
      prisma.moderationAction.count.mockResolvedValue(1);
      await service.resolveAppeal(YO, 'ma1', true, 'ip');
      expect(prisma.moderationAction.count).toHaveBeenCalledWith({
        where: {
          target: 'tema', targetId: 't1', id: { not: 'ma2' },
          status: { in: ['oculto', 'apelado', 'confirmado', 'provisional', 'pendiente'] },
        },
      });
      expect(prisma.proposal.update).not.toHaveBeenCalled();
      expect(prisma.moderationAction.update).toHaveBeenCalledTimes(1);
    });

    it('la ocultación vinculada de un debate común copia la causa y se oculta directo', async () => {
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'q1', groupId: 'g1', hidden: false, proposalId: 't1' });
      prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
      prisma.$queryRaw.mockResolvedValue([{ abiertoPorComunidad: true, hidden: false, kind: 'tema' }]);
      prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: null });
      prisma.moderationAction.create.mockResolvedValueOnce({ id: 'ma1' }).mockResolvedValueOnce({ id: 'ma2' });
      const r = await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'suplantacion', reason: 'Firma como la alcaldía' }, 'ip');
      expect(r).toEqual({ id: 'ma1', estado: 'oculto' });
      expect(prisma.moderationAction.create).toHaveBeenCalledWith({
        data: {
          target: 'tema', targetId: 't1', causa: 'suplantacion', reason: LINKED_TOPIC_REASON, moderatorProfileId: YO,
          status: 'oculto', venceAt: null,
        },
      });
    });

    it('la lista de apelaciones incluye la causa (null en las viejas)', async () => {
      prisma.moderationAction.findMany.mockResolvedValue([
        accion({ status: 'apelado', appealText: 'Apelo', appealedAt: AHORA }),
        accion({ id: 'ma2', status: 'apelado', causa: null, reason: 'Motivo viejo', appealText: 'Apelo', appealedAt: AHORA }),
      ]);
      prisma.solucion.findUnique.mockResolvedValue(so());
      const r = await service.listAppeals(YO);
      expect(r[0]).toMatchObject({ causa: 'spam' });
      expect(r[1]).toMatchObject({ causa: null, reason: 'Motivo viejo' });
    });

    it('la cola por confirmar es solo de la mesa: una persona sin cargo no ve nada', async () => {
      board.roleOf.mockResolvedValue(null);
      await expect(service.listPorConfirmar(YO)).rejects.toThrow(ForbiddenException);
      expect(prisma.moderationAction.findMany).not.toHaveBeenCalled();
    });

    it('la cola por confirmar muestra causa, detalle, texto, plazo y si la pidió quien consulta', async () => {
      prisma.moderationAction.findMany.mockResolvedValue([
        accion(),
        accion({ id: 'ma2', status: 'provisional', causa: 'datos_personales', reason: 'Teléfono', moderatorProfileId: YO }),
      ]);
      prisma.solucion.findUnique.mockResolvedValue(so());
      const r = await service.listPorConfirmar(YO);
      expect(prisma.moderationAction.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: { in: ['pendiente', 'provisional'] } },
        orderBy: { createdAt: 'asc' },
      }));
      expect(r[0]).toEqual({
        id: 'ma1', target: 'solucion', targetId: 's1', causa: 'spam', detalle: '', originalText: 'Una solución\n\nDetalle',
        estado: 'pendiente', venceAt: SIETE_DIAS.toISOString(), createdAt: AHORA.toISOString(), esMia: false, contexto: null,
        solicitadaPorAsistente: false,
      });
      expect(r[1]).toMatchObject({ id: 'ma2', estado: 'provisional', detalle: 'Teléfono', esMia: true });
    });

    it('la cola por confirmar da contexto: propuesta formal o debate vinculado a una inquietud oculta', async () => {
      prisma.moderationAction.findMany.mockResolvedValue([
        accion({ id: 'ma1', target: 'tema', targetId: 't1' }),
        accion({ id: 'ma2', target: 'tema', targetId: 't2', reason: LINKED_TOPIC_REASON, status: 'provisional', causa: 'datos_personales' }),
      ]);
      prisma.proposal.findUnique.mockResolvedValue({ id: 't1', title: 'Fondo', body: 'Texto', kind: 'propuesta' });
      const r = await service.listPorConfirmar(YO);
      expect(r[0]?.contexto).toBe('Propuesta formal');
      expect(r[1]?.contexto).toBe('Debate vinculado a una inquietud oculta');
    });

    describe('correcciones finales: provisional repetida, pausa y fugas', () => {
      it('C1: si el contenido ya tuvo una provisional rechazada o vencida, la nueva solicitud urgente queda pendiente y visible', async () => {
        prisma.solucion.findUnique.mockResolvedValue(so());
        prisma.moderationAction.count.mockResolvedValue(1);
        const r = await service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'datos_personales' }, 'ip');
        expect(r).toEqual({ id: 'ma1', estado: 'pendiente' });
        expect(prisma.moderationAction.count).toHaveBeenCalledWith({
          where: { target: 'solucion', targetId: 's1', status: 'rechazado', fueProvisional: true },
        });
        expect(prisma.solucion.update).not.toHaveBeenCalled();
        expect(prisma.moderationAction.create).toHaveBeenCalledWith({
          data: {
            target: 'solucion', targetId: 's1', causa: 'datos_personales', reason: '', moderatorProfileId: YO,
            status: 'pendiente', venceAt: SIETE_DIAS,
          },
        });
      });

      it('C1: vence una provisional y se vuelve a pedir urgente: queda pendiente y el contenido no se oculta', async () => {
        prisma.moderationAction.findMany.mockResolvedValue([accion({ status: 'provisional', causa: 'datos_personales' })]);
        prisma.solucion.update.mockResolvedValue({});
        expect(await service.processModerationDeadlines(AHORA)).toBe(1);
        expect(prisma.solucion.update).toHaveBeenLastCalledWith({ where: { id: 's1' }, data: { hidden: false } });
        prisma.solucion.update.mockClear();
        prisma.solucion.findUnique.mockResolvedValue(so());
        prisma.moderationAction.count.mockResolvedValue(1);
        expect(await service.hide(YO, { target: 'solucion', targetId: 's1', causa: 'ilegal_violencia' }, 'ip'))
          .toEqual({ id: 'ma1', estado: 'pendiente' });
        expect(prisma.solucion.update).not.toHaveBeenCalled();
      });

      it('C1: en la ocultación vinculada, una propuesta que ya tuvo provisional rechazada queda pendiente', async () => {
        prisma.inquietud.findUnique.mockResolvedValue({ id: 'q1', groupId: 'g1', hidden: false, proposalId: 't1' });
        prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
        prisma.$queryRaw.mockResolvedValue([{ abiertoPorComunidad: true, hidden: false, kind: 'propuesta' }]);
        prisma.moderationAction.count.mockResolvedValue(1);
        prisma.moderationAction.create.mockResolvedValueOnce({ id: 'ma1' }).mockResolvedValueOnce({ id: 'ma2' });
        await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'datos_personales' }, 'ip');
        expect(prisma.proposal.update).not.toHaveBeenCalled();
        expect(prisma.moderationAction.create).toHaveBeenLastCalledWith({
          data: {
            target: 'tema', targetId: 't1', causa: 'datos_personales', reason: LINKED_TOPIC_REASON, moderatorProfileId: YO,
            status: 'pendiente', venceAt: SIETE_DIAS,
          },
        });
      });

      it('I1: ocultar provisionalmente una propuesta con votación del plan 2 solo le quita el título, sin cancelarla', async () => {
        prisma.proposal.findUnique.mockResolvedValue({ id: 't1', groupId: 'g1', hidden: false, kind: 'propuesta' });
        prisma.$queryRaw.mockResolvedValue([{ kind: 'propuesta', hidden: false, abiertoPorComunidad: false }]);
        prisma.proposal.update.mockResolvedValue({ id: 't1', electionId: 'e1' });
        prisma.election.findUnique.mockResolvedValue({ status: 'open' });
        prisma.election.update.mockResolvedValue({});
        await service.hide(YO, { target: 'tema', targetId: 't1', causa: 'datos_personales' }, 'ip');
        expect(prisma.election.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { title: 'Votación de un tema oculto' } });
        expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      });

      it('I1: confirmar la provisional de una propuesta cancela su decisión y su votación, y lo audita', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue(
          accion({ target: 'tema', targetId: 't1', status: 'provisional', causa: 'datos_personales' }),
        );
        prisma.proposal.findUnique.mockResolvedValue({ id: 't1', electionId: 'e1' });
        prisma.election.findUnique.mockResolvedValue({ status: 'open' });
        prisma.election.update.mockResolvedValue({});
        prisma.decision.updateMany.mockResolvedValue({ count: 1 });
        await service.confirmar(YO, 'ma1', true, 'ip');
        expect(prisma.proposal.update).not.toHaveBeenCalled();
        expect(prisma.decision.updateMany).toHaveBeenCalledWith({
          where: { proposalId: 't1', fase: { in: ['modo', 'objecion', 'votacion'] } },
          data: { fase: 'cancelada' },
        });
        expect(prisma.election.update).toHaveBeenCalledWith({
          where: { id: 'e1' },
          data: { title: 'Votación de un tema oculto', status: 'cancelled' },
        });
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'decision.cancelled', metadata: { proposalId: 't1' } }));
      });

      it('I1: rechazar la provisional de una propuesta la restaura sin tocar su decisión', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue(
          accion({ target: 'tema', targetId: 't1', status: 'provisional', causa: 'datos_personales' }),
        );
        prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo', electionId: null });
        await service.confirmar(YO, 'ma1', false, 'ip');
        expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: false } });
        expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      });

      it('I1: al vencer la provisional de una propuesta, el tema vuelve y su decisión sigue donde estaba', async () => {
        prisma.moderationAction.findMany.mockResolvedValue([
          accion({ target: 'tema', targetId: 't1', status: 'provisional', causa: 'datos_personales' }),
        ]);
        prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo', electionId: null });
        expect(await service.processModerationDeadlines(AHORA)).toBe(1);
        expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: false } });
        expect(prisma.decision.updateMany).not.toHaveBeenCalled();
      });

      it('I3: restaurar la inquietud cierra la solicitud vinculada provisional y vuelve a mostrar el debate', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado', reason: 'x' });
        prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
        prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: true });
        prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma2', reason: LINKED_TOPIC_REASON, status: 'provisional', createdAt: AHORA });
        prisma.moderationAction.count.mockResolvedValue(0);
        prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo', electionId: null });
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(prisma.moderationAction.findFirst).toHaveBeenCalledWith(expect.objectContaining({
          where: { target: 'tema', targetId: 't1', reason: LINKED_TOPIC_REASON, status: { in: ['pendiente', 'provisional'] } },
        }));
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
          where: { id: 'ma2', status: 'provisional' },
          data: { status: 'rechazado', resolvedAt: AHORA },
        });
        expect(prisma.moderationAction.count).toHaveBeenCalledWith({
          where: { target: 'tema', targetId: 't1', id: { not: 'ma2' }, status: { in: ['oculto', 'apelado', 'confirmado'] } },
        });
        expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { hidden: false } });
      });

      it('I3: una solicitud vinculada pendiente se cierra sin tocar el debate; si otra ocultación firme lo tiene, sigue oculto', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado', reason: 'x' });
        prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
        prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: false });
        prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma2', reason: LINKED_TOPIC_REASON, status: 'pendiente' });
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledWith({
          where: { id: 'ma2', status: 'pendiente' },
          data: { status: 'rechazado', resolvedAt: AHORA },
        });
        expect(prisma.proposal.update).not.toHaveBeenCalled();

        prisma.moderationAction.updateMany.mockClear();
        prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: true });
        prisma.moderationAction.findFirst.mockResolvedValue({ id: 'ma2', reason: LINKED_TOPIC_REASON, status: 'provisional' });
        prisma.moderationAction.count.mockResolvedValue(1);
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(prisma.moderationAction.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.proposal.update).not.toHaveBeenCalled();
      });

      it('I3: cerrar la vinculada al restaurar la inquietud queda en la auditoría con el contenido', async () => {
        prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado', reason: 'x' });
        prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
        prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: false });
        prisma.moderationAction.findFirst.mockResolvedValue({
          id: 'ma2', reason: LINKED_TOPIC_REASON, status: 'pendiente', causa: 'spam', createdAt: AHORA,
        });
        await service.resolveAppeal(YO, 'ma1', true, 'ip');
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
          action: 'moderation.closed_with_origin', resource: 'tema:t1', metadata: { moderationId: 'ma2', causa: 'spam' },
        }));
      });

      describe('la pausa no acorta los plazos de la decisión', () => {
        const CREADA = new Date(AHORA.getTime() - 10 * HORA);
        const PAUSA = 10 * HORA;
        const FIN = new Date(AHORA.getTime() + 2 * HORA);

        it('al rechazar la provisional de una propuesta en votación, el cierre de la votación se corre lo que duró la pausa', async () => {
          prisma.moderationAction.findUnique.mockResolvedValue(
            accion({ target: 'tema', targetId: 't1', status: 'provisional', causa: 'datos_personales', createdAt: CREADA }),
          );
          prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo', electionId: null });
          prisma.decision.findUnique.mockResolvedValue({ id: 'd1', fase: 'votacion', objecionEndsAt: null, votacionEndsAt: FIN });
          await service.confirmar(YO, 'ma1', false, 'ip');
          expect(prisma.decision.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { proposalId: 't1' } }));
          expect(prisma.decision.updateMany).toHaveBeenCalledWith({
            where: { id: 'd1', fase: 'votacion' },
            data: { votacionEndsAt: new Date(FIN.getTime() + PAUSA) },
          });
        });

        it('al vencer la provisional de una propuesta en objeción, el cierre de la objeción se corre; el debate no', async () => {
          prisma.moderationAction.findMany.mockResolvedValue([
            accion({ target: 'tema', targetId: 't1', status: 'provisional', causa: 'datos_personales', createdAt: CREADA }),
          ]);
          prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo', electionId: null });
          prisma.decision.findUnique.mockResolvedValue({ id: 'd1', fase: 'objecion', objecionEndsAt: FIN, votacionEndsAt: null });
          expect(await service.processModerationDeadlines(AHORA)).toBe(1);
          expect(prisma.decision.updateMany).toHaveBeenCalledWith({
            where: { id: 'd1', fase: 'objecion' },
            data: { objecionEndsAt: new Date(FIN.getTime() + PAUSA) },
          });
          expect(JSON.stringify(prisma.proposal.update.mock.calls)).not.toContain('deliberationEndsAt');
        });

        it('al cerrar con la inquietud una vinculada provisional, también se corre el plazo', async () => {
          prisma.moderationAction.findUnique.mockResolvedValue({ id: 'ma1', target: 'inquietud', targetId: 'q1', status: 'apelado', reason: 'x' });
          prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
          prisma.proposal.findUnique.mockResolvedValue({ id: 't1', abiertoPorComunidad: true, hidden: true });
          prisma.moderationAction.findFirst.mockResolvedValue({
            id: 'ma2', reason: LINKED_TOPIC_REASON, status: 'provisional', causa: 'datos_personales', createdAt: CREADA,
          });
          prisma.moderationAction.count.mockResolvedValue(0);
          prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo', electionId: null });
          prisma.decision.findUnique.mockResolvedValue({ id: 'd1', fase: 'votacion', objecionEndsAt: null, votacionEndsAt: FIN });
          await service.resolveAppeal(YO, 'ma1', true, 'ip');
          expect(prisma.decision.updateMany).toHaveBeenCalledWith({
            where: { id: 'd1', fase: 'votacion' },
            data: { votacionEndsAt: new Date(FIN.getTime() + PAUSA) },
          });
        });

        it('una decisión en modo o ya contada no se toca', async () => {
          prisma.moderationAction.findUnique.mockResolvedValue(
            accion({ target: 'tema', targetId: 't1', status: 'provisional', causa: 'datos_personales', createdAt: CREADA }),
          );
          prisma.proposal.update.mockResolvedValue({ id: 't1', title: 'Fondo', electionId: null });
          prisma.decision.findUnique.mockResolvedValue({ id: 'd1', fase: 'modo', objecionEndsAt: null, votacionEndsAt: null });
          await service.confirmar(YO, 'ma1', false, 'ip');
          expect(prisma.decision.updateMany).not.toHaveBeenCalled();
        });
      });

      it('I4 y M1: el debate vinculado se lee con FOR UPDATE antes de buscar su solicitud abierta', async () => {
        prisma.inquietud.findUnique.mockResolvedValue({ id: 'q1', groupId: 'g1', hidden: false, proposalId: 't1' });
        prisma.inquietud.update.mockResolvedValue({ id: 'q1', proposalId: 't1' });
        prisma.$queryRaw.mockResolvedValue([{ abiertoPorComunidad: true, hidden: false, kind: 'propuesta' }]);
        // La primera búsqueda es la de la inquietud (fuera de la transacción); la segunda, la del debate bajo bloqueo.
        prisma.moderationAction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ma0' });
        const r = await service.hide(YO, { target: 'inquietud', targetId: 'q1', causa: 'datos_personales' }, 'ip');
        expect(r).toEqual({ id: 'ma1', estado: 'oculto' });
        const sql = String(prisma.$queryRaw.mock.calls[0]?.[0]?.sql ?? '');
        expect(sql).toMatch(/SELECT kind, hidden, "abiertoPorComunidad" FROM proposals WHERE id = .*FOR UPDATE/);
        expect(prisma.$queryRaw.mock.calls[0]?.[0]?.values).toEqual(['t1']);
        expect(prisma.proposal.findUnique).not.toHaveBeenCalled();
        expect(prisma.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
          prisma.moderationAction.findFirst.mock.invocationCallOrder[1]!,
        );
        // Ya hay una solicitud abierta del debate: queda la suya y la inquietud se oculta igual.
        expect(prisma.moderationAction.create).toHaveBeenCalledTimes(1);
        expect(prisma.inquietud.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { hidden: true } });
      });
    });
  });
});

describe('ForumsController', () => {
  it('ya no expone POST topics/:id/open-vote', () => {
    const proto = ForumsController.prototype as unknown as Record<string, unknown>;
    expect(proto['openVote']).toBeUndefined();
    const rutas = Object.getOwnPropertyNames(ForumsController.prototype)
      .map((k) => proto[k])
      .filter((fn): fn is object => typeof fn === 'function')
      .map((fn) => Reflect.getMetadata('path', fn) as string | undefined);
    expect(rutas).toContain('topics/:id/close');
    expect(rutas).not.toContain('topics/:id/open-vote');
    expect(rutas).toContain('moderation/por-confirmar');
    expect(rutas).toContain('moderation/:id/confirmar');
  });
});

describe('ModeracionScheduler', () => {
  it('revisa los plazos cada 15 minutos', () => {
    expect(MODERACION_INTERVALO_MS).toBe(15 * 60_000);
  });
});
