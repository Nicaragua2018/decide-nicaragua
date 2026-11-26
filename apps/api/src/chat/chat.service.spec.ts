import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService, MUY_RAPIDO, type Quien } from './chat.service';

const G = '11111111-1111-4111-8111-111111111111';
const YO: Quien = { userId: 'u-yo', profileId: 'p-yo' };

function fila(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    groupId: G,
    authorProfileId: 'p-yo',
    author: { displayName: 'Ana Pérez' },
    kind: 'miembro',
    body: 'hola',
    enlaces: null,
    hidden: false,
    deletedAt: null,
    replyToId: null,
    createdAt: new Date('2026-11-25T10:00:00Z'),
    _count: { avisos: 2 },
    ...over,
  };
}

function montar() {
  const prisma = {
    group: { findUnique: vi.fn().mockResolvedValue({ type: 'territorial_origin' }) },
    profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u-yo', user: { status: 'verified_citizen' } }) },
    chatMessage: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(fila(data))),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    chatLectura: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    chatAviso: { upsert: vi.fn().mockResolvedValue({}) },
    groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
    moderationAction: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const access = { isParticipant: vi.fn().mockResolvedValue(true) };
  const forums = { canModerate: vi.fn().mockResolvedValue(false), esMesa: vi.fn().mockResolvedValue(false) };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const rules = { getInt: vi.fn().mockResolvedValue(90) };
  const guardian = { responder: vi.fn().mockResolvedValue(undefined) };
  const redis = { contar: vi.fn().mockResolvedValue(1) };
  const service = new ChatService(
    prisma as never,
    access as never,
    forums as never,
    audit as never,
    rules as never,
    guardian as never,
    redis as never,
  );
  return { service, prisma, access, forums, audit, rules, guardian, redis };
}

describe('ChatService', () => {
  let t: ReturnType<typeof montar>;
  beforeEach(() => {
    t = montar();
  });

  describe('quién entra a la sala', () => {
    it('un grupo de trabajo no tiene sala', async () => {
      t.prisma.group.findUnique.mockResolvedValue({ type: 'trabajo' });
      await expect(t.service.requerirSala(G, YO)).rejects.toThrow(NotFoundException);
    });
    it('una comunidad que no existe no tiene sala', async () => {
      t.prisma.group.findUnique.mockResolvedValue(null);
      await expect(t.service.requerirSala(G, YO)).rejects.toThrow(NotFoundException);
    });
    it('sin membresía no entra', async () => {
      t.access.isParticipant.mockResolvedValue(false);
      await expect(t.service.requerirSala(G, YO)).rejects.toThrow(ForbiddenException);
    });
    it.each(['suspended', 'pending_verification', 'invited', 'observer', 'rejected'])(
      'con membresía pero cuenta %s no entra: el estado se lee de la base',
      async (status) => {
        t.prisma.profile.findUnique.mockResolvedValue({ user: { status } });
        await expect(t.service.requerirSala(G, YO)).rejects.toThrow(ForbiddenException);
      },
    );
    it('la mesa sin membresía no lee: moderar no da acceso', async () => {
      t.access.isParticipant.mockResolvedValue(false);
      t.forums.canModerate.mockResolvedValue(true);
      t.forums.esMesa.mockResolvedValue(true);
      await expect(t.service.listar(G, YO)).rejects.toThrow(ForbiddenException);
      expect(t.prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
    it('un miembro verificado entra', async () => {
      await expect(t.service.requerirSala(G, YO)).resolves.toBeUndefined();
    });
  });

  describe('publicar', () => {
    it('rechaza el texto vacío y el de más de 1000 caracteres', async () => {
      await expect(t.service.publicar(G, YO, '   ', false)).rejects.toThrow(BadRequestException);
      await expect(t.service.publicar(G, YO, 'a'.repeat(1001), false)).rejects.toThrow(BadRequestException);
      expect(t.prisma.chatMessage.create).not.toHaveBeenCalled();
    });
    it('guarda el texto recortado como mensaje de miembro', async () => {
      const m = await t.service.publicar(G, YO, '  hola a todos  ', false);
      const data = (t.prisma.chatMessage.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
      expect(data).toMatchObject({ groupId: G, authorProfileId: 'p-yo', kind: 'miembro', body: 'hola a todos' });
      expect(m).toMatchObject({ tipo: 'miembro', autor: 'Ana Pérez', iniciales: 'AP', esMio: true, estado: 'visible' });
      expect(t.guardian.responder).not.toHaveBeenCalled();
    });
    it('la auditoría registra solo el hecho y la comunidad: sin texto, sin persona y sin IP', async () => {
      await t.service.publicar(G, YO, 'un secreto', false);
      await vi.waitFor(() => expect(t.audit.log).toHaveBeenCalledOnce());
      const evento = (t.audit.log.mock.calls[0] as [Record<string, unknown>])[0];
      expect(evento).toEqual({ action: 'chat.message_added', resource: `group:${G}` });
    });
    it('el límite es por persona: el mensaje 11 del minuto da 429 y no se guarda', async () => {
      t.redis.contar.mockResolvedValue(11);
      const intento = t.service.publicar(G, YO, 'hola', false);
      await expect(intento).rejects.toThrow(HttpException);
      await expect(intento).rejects.toMatchObject({ status: 429, message: MUY_RAPIDO });
      expect(t.prisma.chatMessage.create).not.toHaveBeenCalled();
      expect((t.redis.contar.mock.calls[0] as [string])[0]).toMatch(/^chat:envio:[0-9a-f]{64}:\d+$/);
    });
    it('si Redis falla, se permite publicar', async () => {
      t.redis.contar.mockRejectedValue(new Error('redis'));
      await expect(t.service.publicar(G, YO, 'hola', false)).resolves.toMatchObject({ tipo: 'miembro' });
    });
    it('una mención a Guardián en medio del texto no lo llama', async () => {
      await t.service.publicar(G, YO, 'hola @Guardián', false);
      expect((t.prisma.chatMessage.create.mock.calls[0] as [{ data: { kind: string } }])[0].data.kind).toBe('miembro');
      expect(t.guardian.responder).not.toHaveBeenCalled();
    });
    it('empezar con @guardian lo llama una vez y solo con ese mensaje', async () => {
      await t.service.publicar(G, YO, '@guardian ¿cómo invito?', false);
      expect((t.prisma.chatMessage.create.mock.calls[0] as [{ data: { kind: string } }])[0].data.kind).toBe('pregunta_guardian');
      expect(t.guardian.responder).toHaveBeenCalledOnce();
      expect(t.guardian.responder).toHaveBeenCalledWith(G, 'm1', 'p-yo', '@guardian ¿cómo invito?');
    });
    it('el botón «Preguntar a Guardián» lo llama aunque el texto no lo nombre', async () => {
      await t.service.publicar(G, YO, '¿cómo propongo una regla?', true);
      expect(t.guardian.responder).toHaveBeenCalledWith(G, 'm1', 'p-yo', '¿cómo propongo una regla?');
    });
  });

  describe('listar', () => {
    const fecha = new Date('2026-11-25T10:00:00Z');

    it('trae los 50 más recientes en orden ascendente y marca la lectura', async () => {
      const filas = Array.from({ length: 51 }, (_, i) =>
        fila({ id: `m${(51 - i).toString()}`, createdAt: new Date(Date.UTC(2026, 10, 25, 10, 0, 51 - i)) }),
      );
      t.prisma.chatMessage.findMany.mockResolvedValue(filas);
      const p = await t.service.listar(G, YO);
      const arg = (t.prisma.chatMessage.findMany.mock.calls[0] as [{ take: number; where: unknown }])[0];
      expect(arg.take).toBe(51);
      expect(arg.where).toEqual({ groupId: G });
      expect(p.mensajes).toHaveLength(50);
      expect(p.hayAnteriores).toBe(true);
      expect(p.mensajes[0]!.id).toBe('m2');
      expect(p.mensajes[49]!.id).toBe('m51');
      expect(t.prisma.chatLectura.upsert).toHaveBeenCalledOnce();
    });
    it('con «despues» trae lo posterior, y desempata por id si comparten instante', async () => {
      t.prisma.chatMessage.findFirst.mockResolvedValueOnce({ id: 'm1', createdAt: fecha });
      await t.service.listar(G, YO, { despues: 'm1' });
      expect((t.prisma.chatMessage.findMany.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({
        groupId: G,
        OR: [{ createdAt: { gt: fecha } }, { createdAt: fecha, id: { gt: 'm1' } }],
      });
    });
    it('con «antes» trae lo anterior, con el mismo desempate', async () => {
      t.prisma.chatMessage.findFirst.mockResolvedValueOnce({ id: 'm1', createdAt: fecha });
      await t.service.listar(G, YO, { antes: 'm1' });
      expect((t.prisma.chatMessage.findMany.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({
        groupId: G,
        OR: [{ createdAt: { lt: fecha } }, { createdAt: fecha, id: { lt: 'm1' } }],
      });
    });
    it('el cursor se busca dentro de la misma sala: un id de otra comunidad no sirve de ancla', async () => {
      await t.service.listar(G, YO, { despues: 'de-otra-sala' });
      expect((t.prisma.chatMessage.findFirst.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({ id: 'de-otra-sala', groupId: G });
      expect((t.prisma.chatMessage.findMany.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({ groupId: G });
    });
    it('no muestra el texto de un mensaje oculto ni de uno eliminado', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValue([
        fila({ id: 'b', deletedAt: new Date(), body: null }),
        fila({ id: 'a', hidden: true, body: 'insulto' }),
      ]);
      const p = await t.service.listar(G, YO);
      expect(p.mensajes.map((m) => [m.id, m.estado, m.texto])).toEqual([
        ['a', 'oculto', null],
        ['b', 'eliminado', null],
      ]);
    });
    it('los avisos solo los ve quien puede moderar', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValue([fila()]);
      expect((await t.service.listar(G, YO)).mensajes[0]!.avisos).toBeNull();
      t.forums.canModerate.mockResolvedValue(true);
      expect((await t.service.listar(G, YO)).mensajes[0]!.avisos).toBe(2);
    });
    it('un mensaje de Guardián no lleva autor y solo trae enlaces internos', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValue([
        fila({
          kind: 'guardian',
          authorProfileId: null,
          author: null,
          enlaces: [
            { texto: 'Reglas', ruta: '/reglas' },
            { texto: 'fuera', ruta: 'https://x.org' },
            { texto: 'doble barra', ruta: '//x.org' },
          ],
        }),
      ]);
      const m = (await t.service.listar(G, YO)).mensajes[0]!;
      expect(m).toMatchObject({ tipo: 'guardian', autor: null, esMio: false });
      expect(m.enlaces).toEqual([{ texto: 'Reglas', ruta: '/reglas' }]);
    });
    it('un mensaje de alguien cuyo perfil ya no existe se muestra sin nombre propio', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValue([fila({ authorProfileId: null, author: null })]);
      expect((await t.service.listar(G, YO)).mensajes[0]).toMatchObject({ autor: 'Miembro que ya no está', iniciales: null });
    });
    it('quien escribió un mensaje ocultado recibe el id para apelar; los demás no', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValue([
        fila({ id: 'mio', hidden: true }),
        fila({ id: 'ajeno', hidden: true, authorProfileId: 'p-otra' }),
      ]);
      t.prisma.moderationAction.findMany.mockResolvedValue([{ id: 'ma1', targetId: 'mio' }]);
      const p = await t.service.listar(G, YO);
      expect((t.prisma.moderationAction.findMany.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({
        target: 'mensaje',
        targetId: { in: ['mio'] },
        status: 'oculto',
      });
      expect(p.mensajes.map((m) => [m.id, m.apelacionId])).toEqual([
        ['ajeno', null],
        ['mio', 'ma1'],
      ]);
    });
    it('avisa que Guardián está por responder mientras su pregunta reciente no tiene respuesta', async () => {
      t.prisma.chatMessage.findFirst.mockResolvedValue({ id: 'q1' });
      expect((await t.service.listar(G, YO)).esperandoGuardian).toBe(true);
      t.prisma.chatMessage.count.mockResolvedValue(1);
      expect((await t.service.listar(G, YO)).esperandoGuardian).toBe(false);
    });
  });

  describe('borrar y avisar', () => {
    it('no se puede eliminar el mensaje de otra persona', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, authorProfileId: 'p-otra', deletedAt: null });
      await expect(t.service.borrarPropio('m1', YO)).rejects.toThrow(ForbiddenException);
      expect(t.prisma.chatMessage.update).not.toHaveBeenCalled();
    });
    it('eliminar lo propio borra el texto de la base y se audita sin nombre', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, authorProfileId: 'p-yo', deletedAt: null });
      await t.service.borrarPropio('m1', YO);
      const arg = (t.prisma.chatMessage.update.mock.calls[0] as [{ data: { body: unknown; deletedAt: unknown } }])[0];
      expect(arg.data.body).toBeNull();
      expect(arg.data.deletedAt).toBeInstanceOf(Date);
      await vi.waitFor(() => expect(t.audit.log).toHaveBeenCalledWith({ action: 'chat.message_deleted', resource: `group:${G}` }));
    });
    it('quien salió de la comunidad o fue suspendido aún puede retirar lo que escribió', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, authorProfileId: 'p-yo', deletedAt: null });
      t.access.isParticipant.mockResolvedValue(false);
      t.prisma.profile.findUnique.mockResolvedValue({ user: { status: 'suspended' } });
      await expect(t.service.borrarPropio('m1', YO)).resolves.toBeUndefined();
      expect(t.prisma.chatMessage.update).toHaveBeenCalledOnce();
    });
    it('un mensaje que no existe da 404', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue(null);
      await expect(t.service.borrarPropio('m1', YO)).rejects.toThrow(NotFoundException);
      await expect(t.service.avisar('m1', YO)).rejects.toThrow(NotFoundException);
    });
    it('avisar guarda un solo aviso por persona y mensaje: repetirlo no cambia nada', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, deletedAt: null });
      await t.service.avisar('m1', YO);
      expect(t.prisma.chatAviso.upsert).toHaveBeenCalledWith({
        where: { messageId_profileId: { messageId: 'm1', profileId: 'p-yo' } },
        create: { messageId: 'm1', profileId: 'p-yo' },
        update: {},
      });
    });
    it('quien no es de la comunidad no puede avisar', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, deletedAt: null });
      t.access.isParticipant.mockResolvedValue(false);
      await expect(t.service.avisar('m1', YO)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('avisos para la mesa', () => {
    it('quien no es de la mesa no los ve', async () => {
      await expect(t.service.avisosParaMesa(YO)).rejects.toThrow(ForbiddenException);
      expect(t.prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
    it('la mesa ve solo mensajes señalados y aún visibles, sin nombres', async () => {
      t.forums.esMesa.mockResolvedValue(true);
      t.prisma.chatMessage.findMany.mockResolvedValue([
        { id: 'm1', body: 'un insulto', createdAt: new Date('2026-11-25T10:00:00Z'), group: { id: G, name: 'Masaya' }, _count: { avisos: 3 } },
      ]);
      const r = await t.service.avisosParaMesa(YO);
      const arg = (t.prisma.chatMessage.findMany.mock.calls[0] as [{ where: unknown; select: Record<string, unknown> }])[0];
      expect(arg.where).toEqual({ hidden: false, deletedAt: null, body: { not: null }, avisos: { some: {} } });
      expect(Object.keys(arg.select)).not.toContain('author');
      expect(Object.keys(arg.select)).not.toContain('authorProfileId');
      expect(r).toEqual([
        { id: 'm1', texto: 'un insulto', comunidad: 'Masaya', groupId: G, avisos: 3, createdAt: '2026-11-25T10:00:00.000Z' },
      ]);
    });
  });

  describe('novedades', () => {
    it('marca nuevos solo donde hay un mensaje ajeno posterior a la última lectura', async () => {
      t.prisma.groupMembership.findMany.mockResolvedValue([{ groupId: 'a' }, { groupId: 'b' }, { groupId: 'c' }, { groupId: 'd' }]);
      t.prisma.chatMessage.groupBy.mockResolvedValue([
        { groupId: 'a', _max: { createdAt: new Date('2026-11-25T12:00:00Z') } },
        { groupId: 'b', _max: { createdAt: new Date('2026-11-25T08:00:00Z') } },
        { groupId: 'c', _max: { createdAt: new Date('2026-11-25T08:00:00Z') } },
      ]);
      t.prisma.chatLectura.findMany.mockResolvedValue([
        { groupId: 'a', lastReadAt: new Date('2026-11-25T10:00:00Z') },
        { groupId: 'b', lastReadAt: new Date('2026-11-25T10:00:00Z') },
      ]);
      expect(await t.service.novedades(YO)).toEqual([
        { groupId: 'a', nuevos: true },
        { groupId: 'b', nuevos: false },
        { groupId: 'c', nuevos: true },
        { groupId: 'd', nuevos: false },
      ]);
      const where = (t.prisma.groupMembership.findMany.mock.calls[0] as [{ where: unknown }])[0].where;
      expect(where).toEqual({ profileId: 'p-yo', group: { type: { not: 'trabajo' } } });
    });
    it('una cuenta sin verificar no recibe novedades', async () => {
      t.prisma.profile.findUnique.mockResolvedValue({ user: { status: 'suspended' } });
      expect(await t.service.novedades(YO)).toEqual([]);
      expect(t.prisma.groupMembership.findMany).not.toHaveBeenCalled();
    });
  });

  describe('limpiar', () => {
    const ahora = new Date('2026-11-25T00:00:00Z');
    const vencidosWhere = () =>
      (t.prisma.chatMessage.findMany.mock.calls[0] as [{ where: { createdAt: { lt: Date }; id: unknown } }])[0].where;

    it.each([
      [90, '2026-08-27T00:00:00.000Z'],
      [30, '2026-10-26T00:00:00.000Z'],
    ])('con la regla en %i días borra lo anterior a %s', async (dias, limite) => {
      t.rules.getInt.mockResolvedValue(dias);
      t.prisma.chatMessage.findMany.mockResolvedValueOnce([{ id: 'v1' }, { id: 'v2' }]);
      t.prisma.chatMessage.deleteMany.mockResolvedValue({ count: 2 });
      expect(await t.service.limpiar(ahora)).toBe(2);
      expect(t.rules.getInt).toHaveBeenCalledWith('chat.conservacion_dias', null);
      expect(vencidosWhere().createdAt.lt.toISOString()).toBe(limite);
      expect(t.prisma.chatMessage.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['v1', 'v2'] } } });
    });
    it('no borra un mensaje con una apelación o solicitud sin resolver', async () => {
      t.prisma.moderationAction.findMany.mockResolvedValue([{ targetId: 'm-apelado' }]);
      await t.service.limpiar(ahora);
      expect((t.prisma.moderationAction.findMany.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({
        target: 'mensaje',
        status: { in: ['apelado', 'pendiente', 'provisional'] },
      });
      expect(vencidosWhere().id).toEqual({ notIn: ['m-apelado'] });
      expect(t.prisma.chatMessage.deleteMany).not.toHaveBeenCalled();
    });
    it('leer las apelaciones abiertas y borrar ocurren en la misma transacción', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValueOnce([{ id: 'v1' }]);
      t.prisma.chatMessage.deleteMany.mockResolvedValue({ count: 1 });
      await t.service.limpiar(ahora);
      expect(t.prisma.$transaction).toHaveBeenCalledOnce();
    });
    it('con el mensaje se va lo que lo cita en la moderación y las lecturas igual de viejas', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValueOnce([{ id: 'v1' }]);
      t.prisma.chatMessage.deleteMany.mockResolvedValue({ count: 1 });
      await t.service.limpiar(ahora);
      expect(t.prisma.moderationAction.updateMany).toHaveBeenCalledWith({
        where: { target: 'mensaje', targetId: { in: ['v1'] } },
        data: { reason: '', appealText: null },
      });
      const where = (t.prisma.chatLectura.deleteMany.mock.calls[0] as [{ where: { lastReadAt: { lt: Date } } }])[0].where;
      expect(where.lastReadAt.lt.toISOString()).toBe('2026-08-27T00:00:00.000Z');
    });
    it('sigue por tandas mientras queden vencidos', async () => {
      const tanda = Array.from({ length: 500 }, (_, i) => ({ id: `v${i.toString()}` }));
      t.prisma.chatMessage.findMany.mockResolvedValueOnce(tanda).mockResolvedValueOnce([{ id: 'ultimo' }]);
      t.prisma.chatMessage.deleteMany.mockResolvedValueOnce({ count: 500 }).mockResolvedValueOnce({ count: 1 });
      expect(await t.service.limpiar(ahora)).toBe(501);
      expect(t.prisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
