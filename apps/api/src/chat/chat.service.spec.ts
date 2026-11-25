import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService, type Quien } from './chat.service';

const G = '11111111-1111-4111-8111-111111111111';
const YO: Quien = { userId: 'u-yo', profileId: 'p-yo', status: 'verified_citizen' };

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
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
    chatLectura: { upsert: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    chatAviso: { upsert: vi.fn().mockResolvedValue({}) },
    groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
    moderationAction: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const access = {
    isParticipant: vi.fn().mockResolvedValue(true),
    rastro: vi.fn().mockResolvedValue({ reservado: false, quien: { actorId: 'u-yo', ip: '1.2.3.4' } }),
  };
  const forums = { canModerate: vi.fn().mockResolvedValue(false) };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const rules = { getInt: vi.fn().mockResolvedValue(90) };
  const guardian = { responder: vi.fn().mockResolvedValue(undefined) };
  const service = new ChatService(
    prisma as never,
    access as never,
    forums as never,
    audit as never,
    rules as never,
    guardian as never,
  );
  return { service, prisma, access, forums, audit, rules, guardian };
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
      'con membresía pero cuenta %s no entra, diga lo que diga el token',
      async (status) => {
        t.prisma.profile.findUnique.mockResolvedValue({ user: { status } });
        await expect(t.service.requerirSala(G, YO)).rejects.toThrow(ForbiddenException);
      },
    );
    it('la mesa sin membresía no lee: moderar no da acceso', async () => {
      t.access.isParticipant.mockResolvedValue(false);
      t.forums.canModerate.mockResolvedValue(true);
      await expect(t.service.listar(G, YO)).rejects.toThrow(ForbiddenException);
      expect(t.prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
    it('un miembro verificado entra', async () => {
      await expect(t.service.requerirSala(G, YO)).resolves.toBeUndefined();
    });
  });

  describe('publicar', () => {
    it('rechaza el texto vacío y el de más de 1000 caracteres', async () => {
      await expect(t.service.publicar(G, YO, '   ', false, 'ip')).rejects.toThrow(BadRequestException);
      await expect(t.service.publicar(G, YO, 'a'.repeat(1001), false, 'ip')).rejects.toThrow(BadRequestException);
      expect(t.prisma.chatMessage.create).not.toHaveBeenCalled();
    });
    it('guarda el texto recortado como mensaje de miembro', async () => {
      const m = await t.service.publicar(G, YO, '  hola a todos  ', false, 'ip');
      const data = (t.prisma.chatMessage.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
      expect(data).toMatchObject({ groupId: G, authorProfileId: 'p-yo', kind: 'miembro', body: 'hola a todos' });
      expect(m).toMatchObject({ tipo: 'miembro', autor: 'Ana Pérez', iniciales: 'AP', esMio: true, estado: 'visible' });
      expect(t.guardian.responder).not.toHaveBeenCalled();
    });
    it('la auditoría registra el hecho, nunca el texto', async () => {
      await t.service.publicar(G, YO, 'un secreto', false, '1.2.3.4');
      await vi.waitFor(() => expect(t.audit.log).toHaveBeenCalledOnce());
      const evento = (t.audit.log.mock.calls[0] as [Record<string, unknown>])[0];
      expect(evento).toEqual({ actorId: 'u-yo', ip: '1.2.3.4', action: 'chat.message_added', resource: `group:${G}` });
      expect(JSON.stringify(evento)).not.toContain('secreto');
    });
    it('una mención a Guardián en medio del texto no lo llama', async () => {
      await t.service.publicar(G, YO, 'hola @Guardián', false, 'ip');
      expect((t.prisma.chatMessage.create.mock.calls[0] as [{ data: { kind: string } }])[0].data.kind).toBe('miembro');
      expect(t.guardian.responder).not.toHaveBeenCalled();
    });
    it('empezar con @guardian lo llama una vez y solo con ese mensaje', async () => {
      await t.service.publicar(G, YO, '@guardian ¿cómo invito?', false, 'ip');
      expect((t.prisma.chatMessage.create.mock.calls[0] as [{ data: { kind: string } }])[0].data.kind).toBe('pregunta_guardian');
      expect(t.guardian.responder).toHaveBeenCalledOnce();
      expect(t.guardian.responder).toHaveBeenCalledWith(G, 'm1', YO, '@guardian ¿cómo invito?');
    });
    it('el botón «Preguntar a Guardián» lo llama aunque el texto no lo nombre', async () => {
      await t.service.publicar(G, YO, '¿cómo propongo una regla?', true, 'ip');
      expect(t.guardian.responder).toHaveBeenCalledWith(G, 'm1', YO, '¿cómo propongo una regla?');
    });
  });

  describe('listar', () => {
    it('trae los 50 más recientes en orden ascendente y marca la lectura', async () => {
      const filas = Array.from({ length: 51 }, (_, i) =>
        fila({ id: `m${(51 - i).toString()}`, createdAt: new Date(Date.UTC(2026, 10, 25, 10, 0, 51 - i)) }),
      );
      t.prisma.chatMessage.findMany.mockResolvedValue(filas);
      const p = await t.service.listar(G, YO);
      const arg = (t.prisma.chatMessage.findMany.mock.calls[0] as [{ take: number; orderBy: unknown; where: unknown }])[0];
      expect(arg.take).toBe(51);
      expect(arg.where).toEqual({ groupId: G });
      expect(p.mensajes).toHaveLength(50);
      expect(p.hayAnteriores).toBe(true);
      expect(p.mensajes[0]!.id).toBe('m2');
      expect(p.mensajes[49]!.id).toBe('m51');
      expect(t.prisma.chatLectura.upsert).toHaveBeenCalledOnce();
    });
    it('con «despues» solo trae lo posterior a ese mensaje', async () => {
      const fecha = new Date('2026-11-25T10:00:00Z');
      t.prisma.chatMessage.findFirst.mockResolvedValueOnce({ createdAt: fecha });
      await t.service.listar(G, YO, { despues: 'm1' });
      const arg = (t.prisma.chatMessage.findMany.mock.calls[0] as [{ where: unknown }])[0];
      expect(arg.where).toEqual({ groupId: G, createdAt: { gt: fecha } });
    });
    it('con «antes» trae lo anterior', async () => {
      const fecha = new Date('2026-11-25T10:00:00Z');
      t.prisma.chatMessage.findFirst.mockResolvedValueOnce({ createdAt: fecha });
      await t.service.listar(G, YO, { antes: 'm1' });
      const arg = (t.prisma.chatMessage.findMany.mock.calls[0] as [{ where: unknown }])[0];
      expect(arg.where).toEqual({ groupId: G, createdAt: { lt: fecha } });
    });
    it('un cursor de un mensaje que ya no existe carga la página reciente', async () => {
      await t.service.listar(G, YO, { despues: 'borrado' });
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
    it('un mensaje de Guardián no lleva autor y trae sus enlaces internos', async () => {
      t.prisma.chatMessage.findMany.mockResolvedValue([
        fila({ kind: 'guardian', authorProfileId: null, author: null, enlaces: [{ texto: 'Reglas', ruta: '/reglas' }, { texto: 'malo', ruta: 'https://x.org' }] }),
      ]);
      const m = (await t.service.listar(G, YO)).mensajes[0]!;
      expect(m).toMatchObject({ tipo: 'guardian', autor: null, esMio: false, enlaces: [{ texto: 'Reglas', ruta: '/reglas' }] });
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
      expect(p.mensajes.map((m) => [m.id, m.apelacionId])).toEqual([['ajeno', null], ['mio', 'ma1']]);
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
      await expect(t.service.borrarPropio('m1', YO, 'ip')).rejects.toThrow(ForbiddenException);
      expect(t.prisma.chatMessage.update).not.toHaveBeenCalled();
    });
    it('eliminar lo propio borra el texto de la base', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, authorProfileId: 'p-yo', deletedAt: null });
      await t.service.borrarPropio('m1', YO, 'ip');
      const arg = (t.prisma.chatMessage.update.mock.calls[0] as [{ data: { body: unknown; deletedAt: unknown } }])[0];
      expect(arg.data.body).toBeNull();
      expect(arg.data.deletedAt).toBeInstanceOf(Date);
    });
    it('un mensaje que no existe da 404', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue(null);
      await expect(t.service.borrarPropio('m1', YO, 'ip')).rejects.toThrow(NotFoundException);
      await expect(t.service.avisar('m1', YO)).rejects.toThrow(NotFoundException);
    });
    it('avisar dos veces no falla ni duplica', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, deletedAt: null });
      await t.service.avisar('m1', YO);
      await t.service.avisar('m1', YO);
      expect(t.prisma.chatAviso.upsert).toHaveBeenCalledTimes(2);
      expect((t.prisma.chatAviso.upsert.mock.calls[0] as [{ update: unknown }])[0].update).toEqual({});
    });
    it('quien no es de la comunidad no puede avisar', async () => {
      t.prisma.chatMessage.findUnique.mockResolvedValue({ groupId: G, deletedAt: null });
      t.access.isParticipant.mockResolvedValue(false);
      await expect(t.service.avisar('m1', YO)).rejects.toThrow(ForbiddenException);
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
    it.each([
      [90, '2026-08-27T00:00:00.000Z'],
      [30, '2026-10-26T00:00:00.000Z'],
    ])('con la regla en %i días borra lo anterior a %s', async (dias, limite) => {
      t.rules.getInt.mockResolvedValue(dias);
      expect(await t.service.limpiar(ahora)).toBe(3);
      expect(t.rules.getInt).toHaveBeenCalledWith('chat.conservacion_dias', null);
      const where = (t.prisma.chatMessage.deleteMany.mock.calls[0] as [{ where: { createdAt: { lt: Date } } }])[0].where;
      expect(where.createdAt.lt.toISOString()).toBe(limite);
    });
    it('no borra un mensaje con una apelación o solicitud sin resolver', async () => {
      t.prisma.moderationAction.findMany.mockResolvedValue([{ targetId: 'm-apelado' }]);
      await t.service.limpiar(ahora);
      expect((t.prisma.moderationAction.findMany.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({
        target: 'mensaje',
        status: { in: ['apelado', 'pendiente', 'provisional'] },
      });
      const where = (t.prisma.chatMessage.deleteMany.mock.calls[0] as [{ where: { id: unknown } }])[0].where;
      expect(where.id).toEqual({ notIn: ['m-apelado'] });
    });
  });
});
