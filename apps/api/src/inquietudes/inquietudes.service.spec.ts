import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { InquietudesService } from './inquietudes.service';
import { CreateInquietudDto } from './dto/create-inquietud.dto';
import { OpenDebateDto } from './dto/open-debate.dto';
import { RespondDto } from './dto/respond.dto';
import { guardiaMock, publicadoresMock } from '../test/guardia-mock';

function buildPrisma() {
  return {
    groupMembership: { findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    group: { findUnique: vi.fn().mockResolvedValue(null) },
    inquietud: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    inquietudApoyo: { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    moderationAction: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
}

const YO = 'p-yo';
const OTRO = 'p-otro-que-apoyo';
const G = 'g1';

function fila(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    groupId: G,
    authorProfileId: 'p-autor',
    title: 'Arreglar el local de reuniones',
    body: 'Texto de la explicación',
    status: 'abierta',
    hidden: false,
    thresholdReachedAt: null,
    deadlineAt: null,
    response: null,
    respondedAt: null,
    proposalId: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    author: { displayName: 'Ana' },
    ...over,
  };
}

describe('InquietudesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let service: InquietudesService;
  let guardia: ReturnType<typeof guardiaMock>;
  let forums: { canOrganize: ReturnType<typeof vi.fn> };
  let deliberation: {
    createTopicInDefaultForum: ReturnType<typeof vi.fn>;
    ensureDefaultForum: ReturnType<typeof vi.fn>;
  };
  let tx: { inquietud: { updateMany: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = buildPrisma();
    guardia = guardiaMock();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    rules = {
      getInt: vi.fn(async (key: string) =>
        key === 'inquietud.apoyo_minimo_personas' ? 3 : key === 'inquietud.apoyo_minimo_porcentaje' ? 10 : 7,
      ),
    };
    forums = { canOrganize: vi.fn().mockResolvedValue(false) };
    deliberation = {
      createTopicInDefaultForum: vi.fn().mockResolvedValue({ id: 'tema1' }),
      ensureDefaultForum: vi.fn().mockResolvedValue({ id: 'f1' }),
    };
    prisma.groupMembership.findMany.mockResolvedValue([]);
    tx = { inquietud: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    service = new InquietudesService(
      prisma as never,
      audit as never,
      rules as never,
      forums as never,
      deliberation as never,
      guardia as never,
      publicadoresMock() as never,
    );
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u-yo' });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.groupMembership.count.mockResolvedValue(5);
    prisma.inquietudApoyo.count.mockResolvedValue(0);
    prisma.inquietudApoyo.findUnique.mockResolvedValue(null);
    // Si el servicio leyera filas de apoyos, aparecería OTRO: la prueba lo detectaría.
    prisma.inquietudApoyo.findMany.mockResolvedValue([{ id: 'x', inquietudId: 'i1', profileId: OTRO }]);
    prisma.inquietud.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('DTO', () => {
    it('rechaza un título de 9 caracteres con mensaje en español', async () => {
      const dto = Object.assign(new CreateInquietudDto(), {
        groupId: '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e6f',
        title: '123456789',
        body: 'ok',
      });
      const errors = await validate(dto);
      expect(errors[0]?.constraints).toEqual(
        expect.objectContaining({ minLength: 'El título necesita entre 10 y 140 caracteres.' }),
      );
    });
    it('rechaza una explicación de más de 2000 caracteres y acepta una válida', async () => {
      const base = { groupId: '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e6f', title: 'Un título válido' };
      const largo = await validate(Object.assign(new CreateInquietudDto(), { ...base, body: 'x'.repeat(2001) }));
      expect(largo[0]?.constraints?.maxLength).toBe('La explicación admite hasta 2000 caracteres.');
      expect(await validate(Object.assign(new CreateInquietudDto(), { ...base, body: 'x'.repeat(2000) }))).toEqual([]);
    });
  });

  describe('DTO: mensajes en español', () => {
    it('un groupId inválido y un título no texto traen mensaje en español', async () => {
      const errors = await validate(Object.assign(new CreateInquietudDto(), { groupId: 'x', title: 5, body: 3 }));
      const msgs = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      expect(msgs).toEqual(expect.arrayContaining(['Elige una comunidad válida.', 'El título debe ser texto.', 'La explicación debe ser texto.']));
    });
  });

  describe('membresía', () => {
    it('un no miembro no crea ni lista', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.create(YO, { groupId: G, title: 'Título largo ok', body: '' }, '1.1.1.1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.list(YO, G)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.inquietud.create).not.toHaveBeenCalled();
    });
  });

  describe('grupos de trabajo', () => {
    it('no se crean inquietudes dentro de un grupo de trabajo (400)', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.group.findUnique.mockResolvedValue({ type: 'trabajo' });
      await expect(
        service.create(YO, { groupId: G, title: 'Una inquietud de prueba', body: 'Explicación suficiente' }, 'ip'),
      ).rejects.toThrow('Los grupos de trabajo deciden con soluciones y votación; lo demás se lleva a la comunidad.');
      expect(prisma.inquietud.create).not.toHaveBeenCalled();
    });
  });

  describe('llevadas desde una bifurcación', () => {
    it('no muestran el nombre de quien la llevó (delataría su voto); las demás sí', async () => {
      const p = prisma as unknown as Record<string, unknown>;
      p['group'] = {
        ...prisma.group,
        findMany: vi.fn(async ({ where }: { where: { origenSolucionId: { in: string[] } } }) =>
          where.origenSolucionId.in.includes('s-bif') ? [{ origenSolucionId: 's-bif' }] : [],
        ),
      };
      p['solucion'] = { findMany: vi.fn().mockResolvedValue([]) };
      prisma.inquietud.findMany.mockResolvedValue([
        fila({ id: 'i1', origenSolucionId: 's-bif', author: { displayName: 'Zoe Secreta' } }),
        fila({ id: 'i2', origenSolucionId: 's-sub', author: { displayName: 'Ana' } }),
        fila({ id: 'i3', origenSolucionId: null, author: { displayName: 'Beto' } }),
      ]);
      const r = await service.list(YO, G);
      expect(r.map((i) => i.authorDisplayName)).toEqual(['Iniciativa de un grupo', 'Ana', 'Beto']);
      expect(JSON.stringify(r)).not.toContain('Zoe');
    });
  });

  describe('create()', () => {
    it('guardia: revisa título y explicación como inquietud y encola con su id', async () => {
      prisma.inquietud.create.mockResolvedValue({ id: 'i9' });
      await service.create(YO, { groupId: G, title: 'Título largo ok', body: 'Cuerpo' }, 'ip');
      expect(guardia.antesDePublicar).toHaveBeenCalledWith({
        tipo: 'inquietud',
        texto: 'Título largo ok\n\nCuerpo',
        autorProfileId: YO,
        args: { groupId: G, title: 'Título largo ok', body: 'Cuerpo' },
      });
      expect(guardia.despuesDePublicar).toHaveBeenCalledWith('inquietud', 'i9', true);
    });

    it('crea y audita con solo el id del grupo', async () => {
      prisma.inquietud.create.mockResolvedValue({ id: 'i9' });
      expect(await service.create(YO, { groupId: G, title: 'Título largo ok', body: 'b' }, '1.1.1.1')).toEqual({ id: 'i9' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inquietud.created', metadata: { groupId: G } }),
      );
    });
  });

  describe('threshold()', () => {
    it.each([
      [5, 3],
      [100, 10],
      [101, 11],
    ])('con %i miembros = %i', async (miembros, esperado) => {
      prisma.groupMembership.count.mockResolvedValue(miembros);
      expect(await service.threshold(G)).toBe(esperado);
    });
  });

  describe('support() / unsupport()', () => {
    beforeEach(() => {
      prisma.inquietud.findUnique.mockResolvedValue(fila());
    });

    it('support dos veces es idempotente (upsert) y no lanza', async () => {
      await service.support(YO, 'i1', '1.1.1.1');
      await service.support(YO, 'i1', '1.1.1.1');
      expect(prisma.inquietudApoyo.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.inquietudApoyo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inquietudId_profileId: { inquietudId: 'i1', profileId: YO } }, update: {} }),
      );
    });

    it('support simultáneo: si el upsert choca con el índice único (P2002) se trata como éxito', async () => {
      prisma.inquietudApoyo.upsert.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.support(YO, 'i1', '1.1.1.1')).resolves.toBeUndefined();
      prisma.inquietudApoyo.upsert.mockRejectedValueOnce(new Error('otra cosa'));
      await expect(service.support(YO, 'i1', '1.1.1.1')).rejects.toThrow('otra cosa');
    });

    it('support sobre una oculta se rechaza', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true }));
      await expect(service.support(YO, 'i1', 'ip')).rejects.toEqual(
        new BadRequestException('Esta inquietud está oculta por moderación.'),
      );
      expect(prisma.inquietudApoyo.upsert).not.toHaveBeenCalled();
    });

    it('unsupport sin apoyo previo no lanza', async () => {
      prisma.inquietudApoyo.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unsupport(YO, 'i1', 'ip')).resolves.toBeUndefined();
    });

    it('un no miembro no apoya', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(service.support(YO, 'i1', 'ip')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('apoyar y retirar el apoyo no escriben nada en la auditoría', async () => {
      await service.support(YO, 'i1', '9.9.9.9');
      await service.unsupport(YO, 'i1', '9.9.9.9');
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('evaluateThreshold()', () => {
    beforeEach(() => {
      prisma.inquietud.findUnique.mockResolvedValue(fila());
    });

    it('al llegar al umbral pasa a en_plazo con plazo a 7 días', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(3);
      const antes = Date.now();
      await service.evaluateThreshold('i1');
      const arg = prisma.inquietud.updateMany.mock.calls[0]![0];
      expect(arg.where).toEqual({ id: 'i1', status: 'abierta', hidden: false, thresholdReachedAt: null });
      expect(arg.data.status).toBe('en_plazo');
      const dias = (arg.data.deadlineAt.getTime() - arg.data.thresholdReachedAt.getTime()) / 86_400_000;
      expect(dias).toBe(7);
      expect(Math.abs(arg.data.thresholdReachedAt.getTime() - antes)).toBeLessThan(1000);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'inquietud.threshold_reached' }));
    });

    it('por debajo del umbral no cambia nada', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(2);
      await service.evaluateThreshold('i1');
      expect(prisma.inquietud.updateMany).not.toHaveBeenCalled();
    });

    it('una respondida o una oculta no se mueve', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(9);
      prisma.inquietud.findUnique.mockResolvedValue(fila({ status: 'respondida' }));
      await service.evaluateThreshold('i1');
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true }));
      await service.evaluateThreshold('i1');
      expect(prisma.inquietud.updateMany).not.toHaveBeenCalled();
    });

    it('es idempotente: si otra petición ya la movió, no audita de nuevo', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(3);
      prisma.inquietud.updateMany.mockResolvedValue({ count: 0 });
      await service.evaluateThreshold('i1');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('solo cuenta apoyos de miembros actuales del grupo', async () => {
      prisma.inquietudApoyo.count.mockResolvedValue(0);
      await service.evaluateThreshold('i1');
      expect(prisma.inquietudApoyo.count).toHaveBeenCalledWith({
        where: { inquietudId: 'i1', profile: { memberships: { some: { groupId: G } } } },
      });
    });
  });

  describe('lectura sin revelar quién apoyó', () => {
    it('la lista ordena por apoyos y luego antigüedad, sin ids de quienes apoyaron', async () => {
      prisma.inquietud.findMany.mockResolvedValue([
        fila({ id: 'a', apoyos: [{ profileId: OTRO }], createdAt: new Date('2026-11-02T00:00:00Z') }),
        fila({ id: 'b', createdAt: new Date('2026-11-03T00:00:00Z') }),
        fila({ id: 'c', createdAt: new Date('2026-11-01T00:00:00Z') }),
      ]);
      prisma.inquietudApoyo.count.mockImplementation(async ({ where }: { where: { inquietudId: string } }) =>
        where.inquietudId === 'b' ? 5 : 1,
      );
      // El perfil OTRO apoyó, pero solo se consulta si YO apoyó.
      prisma.inquietudApoyo.findUnique.mockImplementation(
        async ({ where }: { where: { inquietudId_profileId: { profileId: string } } }) =>
          where.inquietudId_profileId.profileId === YO ? { id: 'x' } : null,
      );
      const lista = await service.list(YO, G);
      expect(lista.map((i) => i.id)).toEqual(['b', 'c', 'a']);
      expect(lista[0]).toEqual(expect.objectContaining({ supportCount: 5, supportedByMe: true, threshold: 3 }));
      expect(JSON.stringify(lista)).not.toContain(OTRO);
      expect(JSON.stringify(lista)).not.toContain('apoyos');
    });

    it('el detalle no contiene ids de quienes apoyaron y canOrganize es falso por ahora', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ apoyos: [{ profileId: OTRO }] }));
      prisma.inquietudApoyo.count.mockResolvedValue(2);
      const d = await service.get(YO, 'i1');
      expect(d.supportCount).toBe(2);
      expect(d.canOrganize).toBe(false);
      expect(JSON.stringify(d)).not.toContain(OTRO);
    });

    it('el detalle trae isMember: verdadero para un miembro, falso para quien organiza sin ser miembro', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila());
      prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
      expect((await service.get(YO, 'i1')).isMember).toBe(true);
      forums.canOrganize.mockResolvedValue(true);
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      const d = await service.get(YO, 'i1');
      expect(d.canOrganize).toBe(true);
      expect(d.isMember).toBe(false);
    });

    it('hiddenReason de una inquietud oculta usa la etiqueta de la causa', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true, authorProfileId: YO }));
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'mod1', causa: 'suplantacion', reason: 'Firma como la alcaldía', status: 'oculto' });
      const d = await service.get(YO, 'i1');
      expect(d.hiddenReason).toBe('Suplantación de una persona u organización: Firma como la alcaldía');
    });

    it('el detalle de una oculta tiene texto neutro, motivo y moderationId solo para el autor', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true, authorProfileId: YO }));
      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'mod1', reason: 'Insultos', status: 'oculto' });
      const d = await service.get(YO, 'i1');
      expect(d.title).toBe('Inquietud oculta por moderación');
      expect(d.body).toBe('');
      expect(d.hiddenReason).toBe('Insultos');
      expect(d.moderationId).toBe('mod1');
      expect(JSON.stringify(d)).not.toContain('Arreglar el local');

      const otro = await service.get('p-otro', 'i1');
      expect(otro.hiddenReason).toBe('Insultos');
      expect(otro.moderationId).toBeNull();

      prisma.moderationAction.findFirst.mockResolvedValue({ id: 'mod1', reason: 'Insultos', status: 'apelado' });
      expect((await service.get(YO, 'i1')).moderationId).toBeNull();
    });
  });
  describe('reevaluación del umbral al leer', () => {
    it('el detalle reevalúa el umbral: una restaurada con apoyos suficientes entra en plazo', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila());
      prisma.inquietudApoyo.count.mockResolvedValue(3);
      prisma.inquietud.updateMany.mockResolvedValue({ count: 1 });
      await service.get(YO, 'i1');
      expect(prisma.inquietud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'i1', status: 'abierta', hidden: false, thresholdReachedAt: null } }),
      );
    });

    it('la lista reevalúa cada inquietud abierta y visible, y no las ocultas', async () => {
      prisma.inquietud.findMany.mockResolvedValue([fila({ id: 'a' }), fila({ id: 'b', hidden: true }), fila({ id: 'c', status: 'respondida' })]);
      const porId: Record<string, Record<string, unknown>> = { a: {}, b: { hidden: true }, c: { status: 'respondida' } };
      prisma.inquietud.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => fila({ id: where.id, ...porId[where.id] }));
      prisma.inquietudApoyo.count.mockResolvedValue(3);
      prisma.inquietud.updateMany.mockResolvedValue({ count: 1 });
      await service.list(YO, G);
      expect(prisma.inquietud.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.inquietud.updateMany.mock.calls[0]![0].where.id).toBe('a');
    });

    it('una oculta en en_plazo no se abre por leerla', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true, status: 'en_plazo', deadlineAt: new Date('2026-01-01T00:00:00Z') }));
      prisma.moderationAction.findFirst.mockResolvedValue(null);
      await service.get(YO, 'i1');
      expect(prisma.inquietud.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('agenda: abrir debate, responder, apertura automática', () => {
    const ID1 = '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e61';
    const ID2 = '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e62';
    const dto = { groupId: G, inquietudIds: [ID1, ID2], title: 'Debate sobre el local', body: 'Texto del debate con detalle suficiente.' };
    const filas = (over: Record<string, unknown> = {}) => [
      { id: ID1, groupId: G, status: 'en_plazo', hidden: false, ...over },
      { id: ID2, groupId: G, status: 'abierta', hidden: false },
    ];

    it('guardia: responder revisa como respuesta_inquietud y no encola la inquietud', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'i1', groupId: G, status: 'en_plazo', hidden: false });
      const texto = 'x'.repeat(50);
      await service.respond(YO, 'i1', texto, 'ip');
      expect(guardia.antesDePublicar).toHaveBeenCalledWith({
        tipo: 'respuesta_inquietud',
        texto,
        autorProfileId: YO,
        args: { id: 'i1', text: texto },
      });
      expect(guardia.antesDePublicar.mock.invocationCallOrder[0]).toBeLessThan(prisma.inquietud.updateMany.mock.invocationCallOrder[0] ?? 0);
      expect(guardia.despuesDePublicar).not.toHaveBeenCalled();
    });

    it('guardia: una respuesta sin revisar no encola la inquietud del miembro (Ruling 16)', async () => {
      forums.canOrganize.mockResolvedValue(true);
      guardia.antesDePublicar.mockResolvedValue({ revisado: false });
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'i1', groupId: G, status: 'en_plazo', hidden: false });
      await service.respond(YO, 'i1', 'x'.repeat(50), 'ip');
      expect(prisma.inquietud.updateMany).toHaveBeenCalled();
      expect(guardia.despuesDePublicar).not.toHaveBeenCalled();
    });

    it('guardia: abrir debate revisa el tema antes de la transacción y encola el tema', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findMany.mockResolvedValue(filas());
      tx.inquietud.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 2 });
      await service.openDebate(YO, dto, 'ip', { pedirRevision: true });
      expect(guardia.antesDePublicar).toHaveBeenCalledWith({
        tipo: 'tema',
        texto: `${dto.title}\n\n${dto.body}`,
        autorProfileId: YO,
        args: { via: 'abrir_debate', groupId: G, inquietudIds: [ID1, ID2], title: dto.title, body: dto.body },
        pedirRevision: true,
      });
      expect(guardia.antesDePublicar.mock.invocationCallOrder[0]).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0] ?? 0);
      expect(guardia.despuesDePublicar).toHaveBeenCalledWith('tema', 'tema1', true);
    });

    it('un miembro común no abre debate ni responde', async () => {
      await expect(service.openDebate(YO, dto, '1.1.1.1')).rejects.toBeInstanceOf(ForbiddenException);
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'i1', groupId: G, status: 'abierta', hidden: false });
      await expect(service.respond(YO, 'i1', 'x'.repeat(50), '1.1.1.1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('juntar inquietudes de dos grupos se rechaza', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findMany.mockResolvedValue(filas({ groupId: 'otro' }));
      await expect(service.openDebate(YO, dto, 'ip')).rejects.toThrow('Todas las inquietudes deben ser de la misma comunidad.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('juntar una respondida, una oculta o una inexistente se rechaza', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findMany.mockResolvedValue(filas({ status: 'respondida' }));
      await expect(service.openDebate(YO, dto, 'ip')).rejects.toBeInstanceOf(BadRequestException);
      prisma.inquietud.findMany.mockResolvedValue(filas({ hidden: true }));
      await expect(service.openDebate(YO, dto, 'ip')).rejects.toBeInstanceOf(BadRequestException);
      prisma.inquietud.findMany.mockResolvedValue([filas()[0]]);
      await expect(service.openDebate(YO, dto, 'ip')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si el conteo no coincide lanza Conflict y no crea el tema', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findMany.mockResolvedValue(filas());
      tx.inquietud.updateMany.mockResolvedValue({ count: 1 });
      await expect(service.openDebate(YO, dto, 'ip')).rejects.toThrow('Alguna inquietud ya cambió de estado.');
      await expect(service.openDebate(YO, dto, 'ip')).rejects.toBeInstanceOf(ConflictException);
      expect(deliberation.createTopicInDefaultForum).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('abre el debate: pasa a en_debate, crea el tema, vincula y audita solo ids y conteo', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findMany.mockResolvedValue(filas());
      tx.inquietud.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 2 });
      const r = await service.openDebate(YO, { ...dto, inquietudIds: [ID1, ID2, ID1] }, 'ip');
      expect(r).toEqual({ proposalId: 'tema1' });
      expect(deliberation.ensureDefaultForum).toHaveBeenCalledWith(G);
      expect(deliberation.ensureDefaultForum.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0] ?? 0,
      );
      expect(tx.inquietud.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: { in: [ID1, ID2] }, groupId: G, hidden: false, status: { in: ['abierta', 'en_plazo'] } },
        data: { status: 'en_debate' },
      });
      expect(deliberation.createTopicInDefaultForum).toHaveBeenCalledWith(tx, {
        groupId: G,
        authorProfileId: YO,
        title: dto.title,
        body: dto.body,
        abiertoPorComunidad: false,
      });
      expect(tx.inquietud.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: [ID1, ID2] } },
        data: { proposalId: 'tema1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'inquietud.debate_opened',
          resource: 'proposal:tema1',
          metadata: { proposalId: 'tema1', count: 2 },
        }),
      );
    });

    it('respond: 49 caracteres lo rechaza el DTO y 50 pasa', async () => {
      const mal = await validate(Object.assign(new RespondDto(), { text: 'x'.repeat(49) }));
      expect(mal[0]?.constraints).toEqual(
        expect.objectContaining({ minLength: 'La respuesta necesita entre 50 y 2000 caracteres.' }),
      );
      expect(await validate(Object.assign(new RespondDto(), { text: 'x'.repeat(50) }))).toHaveLength(0);
    });

    it('el DTO de debate limita 1-10 inquietudes', async () => {
      const base = { groupId: ID1, title: 'Un título válido', body: 'x'.repeat(20) };
      expect(await validate(Object.assign(new OpenDebateDto(), { ...base, inquietudIds: [] }))).not.toHaveLength(0);
      expect(
        await validate(Object.assign(new OpenDebateDto(), { ...base, inquietudIds: Array(11).fill(ID1) })),
      ).not.toHaveLength(0);
      expect(await validate(Object.assign(new OpenDebateDto(), { ...base, inquietudIds: [ID1] }))).toHaveLength(0);
    });

    it('respond: guarda la respuesta con updateMany condicionado y audita solo el id', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'i1', groupId: G, status: 'en_plazo', hidden: false });
      const texto = 'r'.repeat(60);
      await service.respond(YO, 'i1', texto, 'ip');
      expect(prisma.inquietud.updateMany).toHaveBeenCalledWith({
        where: { id: 'i1', hidden: false, status: { in: ['abierta', 'en_plazo'] } },
        data: expect.objectContaining({ status: 'respondida', response: texto, respondedByProfileId: YO }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inquietud.responded', metadata: { inquietudId: 'i1' } }),
      );
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain(texto);
    });

    it('respond: si cambió de estado (conteo 0) lanza Conflict', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'i1', groupId: G, status: 'abierta', hidden: false });
      prisma.inquietud.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.respond(YO, 'i1', 'r'.repeat(60), 'ip')).rejects.toThrow('Esta inquietud ya cambió de estado.');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('respond: rechaza una ya respondida o una oculta', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'i1', groupId: G, status: 'respondida', hidden: false });
      await expect(service.respond(YO, 'i1', 'r'.repeat(60), 'ip')).rejects.toBeInstanceOf(BadRequestException);
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'i1', groupId: G, status: 'abierta', hidden: true });
      await expect(service.respond(YO, 'i1', 'r'.repeat(60), 'ip')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('processDeadlines abre solo las vencidas no ocultas, con tema abiertoPorComunidad y título de la inquietud', async () => {
      const now = new Date('2026-11-20T00:00:00Z');
      prisma.inquietud.findMany.mockResolvedValue([
        { id: 'i1', groupId: G, authorProfileId: 'p-autor', title: 'Arreglar el local', body: 'Explicación' },
      ]);
      tx.inquietud.updateMany.mockResolvedValue({ count: 1 });
      const n = await service.processDeadlines(now);
      expect(n).toBe(1);
      expect(deliberation.ensureDefaultForum).toHaveBeenCalledWith(G);
      expect(deliberation.ensureDefaultForum.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0] ?? 0,
      );
      expect(prisma.inquietud.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'en_plazo', hidden: false, deadlineAt: { lte: now } } }),
      );
      expect(tx.inquietud.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'i1', status: 'en_plazo', hidden: false, deadlineAt: { lte: now } },
        data: { status: 'abierta_por_la_comunidad' },
      });
      expect(deliberation.createTopicInDefaultForum).toHaveBeenCalledWith(tx, {
        groupId: G,
        authorProfileId: 'p-autor',
        title: 'Arreglar el local',
        body: 'Explicación',
        abiertoPorComunidad: true,
      });
      expect(tx.inquietud.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'i1' },
        data: { proposalId: 'tema1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'inquietud.opened_by_community',
          metadata: { inquietudId: 'i1', proposalId: 'tema1' },
        }),
      );
    });

    it('processDeadlines no crea tema si otra instancia ya la abrió (conteo 0)', async () => {
      prisma.inquietud.findMany.mockResolvedValue([
        { id: 'i1', groupId: G, authorProfileId: 'p-autor', title: 'T', body: 'B' },
      ]);
      tx.inquietud.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.processDeadlines(new Date())).toBe(0);
      expect(deliberation.createTopicInDefaultForum).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('processDeadlines: el fallo de una no detiene a las demás', async () => {
      prisma.inquietud.findMany.mockResolvedValue([
        { id: 'i1', groupId: G, authorProfileId: 'a', title: 'T1', body: 'B' },
        { id: 'i2', groupId: G, authorProfileId: 'a', title: 'T2', body: 'B' },
      ]);
      deliberation.createTopicInDefaultForum.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ id: 'tema2' });
      expect(await service.processDeadlines(new Date())).toBe(1);
    });

    it('agenda: 403 si no organiza; si organiza, ordena por plazo y deja fuera abiertas sin apoyo', async () => {
      prisma.inquietud.findMany.mockResolvedValue([fila({ status: 'en_plazo' })]);
      await expect(service.agenda(YO)).rejects.toThrow('Solo quien organiza la agenda puede verla.');
      prisma.inquietud.findMany.mockResolvedValue([]);
      await expect(service.agenda(YO)).rejects.toBeInstanceOf(ForbiddenException);
      // Organiza solo una comunidad (3C): sin candidatas ahí, la agenda llega vacía, no 403.
      prisma.groupMembership.findMany.mockResolvedValue([{ groupId: 'g-suya' }]);
      forums.canOrganize.mockImplementation(async (_p: string, g: string) => g === 'g-suya');
      expect(await service.agenda(YO)).toEqual([]);
      forums.canOrganize.mockReset();
      forums.canOrganize.mockResolvedValue(true);
      const f = (id: string, deadlineAt: Date | null, status: string) => fila({ id, status, deadlineAt });
      prisma.inquietud.findMany.mockResolvedValue([
        f('tarde', new Date('2026-12-01T00:00:00Z'), 'en_plazo'),
        f('sin-plazo', null, 'abierta'),
        f('pronto', new Date('2026-11-10T00:00:00Z'), 'en_plazo'),
        f('abierta-sin-apoyo', null, 'abierta'),
      ]);
      prisma.inquietudApoyo.count.mockImplementation(async (a: { where: { inquietudId: string } }) =>
        a.where.inquietudId === 'abierta-sin-apoyo' ? 0 : 2,
      );
      const r = await service.agenda(YO);
      expect(r.map((x) => x.id)).toEqual(['pronto', 'tarde', 'sin-plazo']);
    });

    it('get() informa canOrganize real', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findUnique.mockResolvedValue(fila());
      expect((await service.get(YO, 'i1')).canOrganize).toBe(true);
    });

    it('get(): quien organiza sin ser miembro ve el detalle con canOrganize true', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      forums.canOrganize.mockResolvedValue(true);
      prisma.inquietud.findUnique.mockResolvedValue(fila());
      const d = await service.get(YO, 'i1');
      expect(d.canOrganize).toBe(true);
      expect(d.body).toBe('Texto de la explicación');
    });

    it('get(): un no miembro que no organiza recibe 403 y no se reevalúa el umbral', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      forums.canOrganize.mockResolvedValue(false);
      prisma.inquietud.findUnique.mockResolvedValue(fila());
      prisma.inquietudApoyo.count.mockResolvedValue(3);
      const spy = vi.spyOn(service, 'evaluateThreshold');
      await expect(service.get(YO, 'i1')).rejects.toThrow(ForbiddenException);
      expect(spy).not.toHaveBeenCalled();
      expect(prisma.inquietud.updateMany).not.toHaveBeenCalled();
    });

    it('get()/list(): una inquietud oculta no expone el id de su debate', async () => {
      prisma.inquietud.findUnique.mockResolvedValue(fila({ hidden: true, status: 'abierta_por_la_comunidad', proposalId: 'tema1' }));
      prisma.moderationAction.findFirst.mockResolvedValue(null);
      expect((await service.get(YO, 'i1')).proposalId).toBeNull();
      prisma.inquietud.findMany.mockResolvedValue([fila({ hidden: true, proposalId: 'tema1' }), fila({ id: 'i2', proposalId: 'tema2' })]);
      const lista = await service.list(YO, G);
      expect(lista.find((x) => x.id === 'i1')?.proposalId).toBeNull();
      expect(lista.find((x) => x.id === 'i2')?.proposalId).toBe('tema2');
      expect(JSON.stringify(lista)).not.toContain('tema1');
    });
  });
});
