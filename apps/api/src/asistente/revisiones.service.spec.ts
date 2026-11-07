import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RevisionesService } from './revisiones.service';

const AUTOR = 'p-autor';
const M1 = 'p-m1';
const M2 = 'p-m2';
const M3 = 'p-m3';
const ID = 'rev1';
const FUTURO = new Date('2100-01-01T00:00:00Z');

type Firma = { revisionId: string; profileId: string; aprobar: boolean };

function build(opts: { cargos?: number } = {}) {
  const firmas: Firma[] = [];
  const rev = {
    id: ID,
    autorProfileId: AUTOR,
    tipo: 'frase',
    args: { a: 1 },
    texto: 'Texto de nivel 2 con datos de alguien',
    causa: 'odio',
    estado: 'pendiente',
    motivo: null as string | null,
    creadoAt: new Date('2026-11-06T00:00:00Z'),
    venceAt: FUTURO,
    resueltoAt: null as Date | null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: ID }]),
    textoEnRevision: {
      findUnique: vi.fn(async () => ({ ...rev, firmas: firmas.map((f) => ({ ...f })) })),
      findMany: vi.fn(async () => [{ ...rev, firmas: firmas.map((f) => ({ ...f })) }]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (where.estado !== undefined && rev.estado !== where.estado) return { count: 0 };
        Object.assign(rev, data);
        return { count: 1 };
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: vi.fn(async ({ data }: any) => {
        Object.assign(rev, data);
        return { ...rev };
      }),
    },
    firmaRevision: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: vi.fn(async ({ data }: any) => {
        if (firmas.some((f) => f.profileId === data.profileId)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        }
        firmas.push({ ...data });
        return data;
      }),
      findMany: vi.fn(async () => firmas.map((f) => ({ ...f }))),
    },
    boardSeat: { count: vi.fn().mockResolvedValue(opts.cargos ?? 3) },
    profile: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ userId: `usr-${where.id.slice(2)}` })) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma['$transaction'] = vi.fn(async (cb: any) => cb(prisma));
  const board = { roleOf: vi.fn(async (id: string) => ([M1, M2, M3].includes(id) ? 'administrador' : null)) };
  const publicadores = { publicar: vi.fn().mockResolvedValue({ id: 'nuevo' }) };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const svc = new RevisionesService(prisma as never, board as never, publicadores as never, audit as never);
  return { svc, prisma, board, publicadores, audit, rev, firmas };
}

describe('RevisionesService', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  it('revisiones: solo la mesa lista y firma', async () => {
    await expect(t.svc.listarPendientes(AUTOR)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.svc.firmar(AUTOR, ID, true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.prisma['firmaRevision'].create).not.toHaveBeenCalled();
    const r = await t.svc.listarPendientes(M1);
    expect(r.revisiones).toHaveLength(1);
  });

  it('revisiones: quien escribió el texto no firma su revisión aunque esté en la mesa', async () => {
    t.rev.autorProfileId = M1;
    const err = await t.svc.firmar(M1, ID, true).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe('No puedes firmar la revisión de tu propio texto.');
    expect(t.prisma['firmaRevision'].create).not.toHaveBeenCalled();
  });

  it('revisiones: dos aprobaciones distintas publican una vez', async () => {
    await t.svc.firmar(M1, ID, true);
    expect(t.rev.estado).toBe('pendiente');
    expect(t.publicadores.publicar).not.toHaveBeenCalled();
    const r = await t.svc.firmar(M2, ID, true);
    expect(t.publicadores.publicar).toHaveBeenCalledTimes(1);
    expect(t.publicadores.publicar).toHaveBeenCalledWith('frase', AUTOR, { a: 1 });
    expect(t.rev.estado).toBe('publicado');
    expect(r.estado).toBe('publicado');
    // Una tercera firma ya no cuenta ni vuelve a publicar.
    await expect(t.svc.firmar(M3, ID, true)).rejects.toBeInstanceOf(ConflictException);
    expect(t.publicadores.publicar).toHaveBeenCalledTimes(1);
  });

  it('revisiones: si otra firma ya hizo la transición, esta no publica', async () => {
    await t.svc.firmar(M1, ID, true);
    t.prisma['textoEnRevision'].updateMany.mockResolvedValueOnce({ count: 0 });
    await t.svc.firmar(M2, ID, true);
    expect(t.publicadores.publicar).not.toHaveBeenCalled();
  });

  it('revisiones: misma persona no firma dos veces', async () => {
    await t.svc.firmar(M1, ID, true);
    const err = await t.svc.firmar(M1, ID, false).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe('Ya firmaste esta revisión.');
  });

  it('revisiones: dos rechazos rechazan sin publicar', async () => {
    await t.svc.firmar(M1, ID, false);
    const r = await t.svc.firmar(M2, ID, false);
    expect(r.estado).toBe('rechazado');
    expect(t.rev.estado).toBe('rechazado');
    expect(t.publicadores.publicar).not.toHaveBeenCalled();
  });

  it('revisiones: si publicar falla, queda no_publicable', async () => {
    t.publicadores.publicar.mockRejectedValue(new ForbiddenException('No eres miembro de este grupo.'));
    await t.svc.firmar(M1, ID, true);
    const r = await t.svc.firmar(M2, ID, true);
    expect(t.rev.estado).toBe('no_publicable');
    expect(t.rev.motivo).toBe('No eres miembro de este grupo.');
    expect(r.estado).toBe('no_publicable');
    expect(r.motivo).toBe('No eres miembro de este grupo.');
  });

  it('revisiones: si publicar falla con un error cualquiera, el motivo es genérico', async () => {
    t.publicadores.publicar.mockRejectedValue(new Error('boom con datos internos'));
    await t.svc.firmar(M1, ID, true);
    await t.svc.firmar(M2, ID, true);
    expect(t.rev.estado).toBe('no_publicable');
    expect(t.rev.motivo).toBe('No se pudo publicar');
  });

  it('revisiones: vencer pasa a vencido y nunca publica', async () => {
    t.prisma['textoEnRevision'].updateMany.mockResolvedValueOnce({ count: 2 });
    const now = new Date('2026-11-20T00:00:00Z');
    expect(await t.svc.vencer(now)).toBe(2);
    expect(t.prisma['textoEnRevision'].updateMany).toHaveBeenCalledWith({
      where: { estado: 'pendiente', venceAt: { lte: now } },
      data: { estado: 'vencido', resueltoAt: now },
    });
    expect(t.publicadores.publicar).not.toHaveBeenCalled();
  });

  it('revisiones: mias solo devuelve las del autor', async () => {
    await t.svc.misRevisiones(AUTOR);
    expect(t.prisma['textoEnRevision'].findMany.mock.calls[0]![0].where).toEqual({ autorProfileId: AUTOR });
  });

  it('revisiones: mias muestra publicando como pendiente y yaFirme falso', async () => {
    t.rev.estado = 'publicando';
    t.firmas.push({ revisionId: ID, profileId: AUTOR, aprobar: true });
    const [v] = await t.svc.misRevisiones(AUTOR);
    expect(v!.estado).toBe('pendiente');
    expect(v!.yaFirme).toBe(false);
    expect(v!.aprobaciones).toBe(1);
  });

  it('revisiones: mesaSuficiente es false con un solo cargo', async () => {
    const solo = build({ cargos: 1 });
    expect((await solo.svc.listarPendientes(M1)).mesaSuficiente).toBe(false);
    expect((await t.svc.listarPendientes(M1)).mesaSuficiente).toBe(true);
  });

  it('revisiones: la auditoría no lleva texto ni autor', async () => {
    await t.svc.firmar(M1, ID, true);
    await t.svc.firmar(M2, ID, true);
    const acciones = t.audit.log.mock.calls.map((c) => c[0].action);
    expect(acciones).toEqual(['asistente.revision_firmada', 'asistente.revision_firmada', 'asistente.revision_resuelta']);
    const todo = JSON.stringify(t.audit.log.mock.calls);
    expect(todo).not.toContain(AUTOR);
    expect(todo).not.toContain(M1);
  });
  it('retención: al publicarse se borran el texto y los argumentos (quedan causa, estado y fechas)', async () => {
    await t.svc.firmar(M1, ID, true);
    const r = await t.svc.firmar(M2, ID, true);
    expect(t.publicadores.publicar).toHaveBeenCalledWith('frase', AUTOR, { a: 1 });
    expect(t.rev.estado).toBe('publicado');
    expect(t.rev.texto).toBe('');
    expect(t.rev.args).toEqual({});
    expect(t.rev.causa).toBe('odio');
    expect(t.rev.resueltoAt).toBeInstanceOf(Date);
    expect(r.texto).toBe('');
  });

  it('retención: al rechazarse se borran el texto y los argumentos', async () => {
    await t.svc.firmar(M1, ID, false);
    await t.svc.firmar(M2, ID, false);
    expect(t.rev.estado).toBe('rechazado');
    expect(t.rev.texto).toBe('');
    expect(t.rev.args).toEqual({});
  });

  it('retención: no_publicable conserva el texto para que la persona lo reformule', async () => {
    t.publicadores.publicar.mockRejectedValue(new ForbiddenException('No eres miembro de este grupo.'));
    await t.svc.firmar(M1, ID, true);
    await t.svc.firmar(M2, ID, true);
    expect(t.rev.estado).toBe('no_publicable');
    expect(t.rev.texto).toBe('Texto de nivel 2 con datos de alguien');
  });

  it('retención: purgar borra texto y argumentos de vencidos y no publicables 30 días después de resolverse', async () => {
    t.prisma['textoEnRevision'].updateMany.mockResolvedValueOnce({ count: 3 });
    const now = new Date('2026-12-31T00:00:00Z');
    expect(await t.svc.purgar(now)).toBe(3);
    expect(t.prisma['textoEnRevision'].updateMany).toHaveBeenCalledWith({
      where: {
        estado: { in: ['vencido', 'no_publicable'] },
        resueltoAt: { lte: new Date(now.getTime() - 30 * 86_400_000) },
        texto: { not: '' },
      },
      data: { texto: '', args: {} },
    });
  });

  it('auditoría: la firma lleva el actorId de quien firma (nunca el texto ni el autor)', async () => {
    await t.svc.firmar(M1, ID, true);
    const evento = t.audit.log.mock.calls.map((c) => c[0]).find((e: { action: string }) => e.action === 'asistente.revision_firmada');
    expect(evento.actorId).toBe(`usr-${M1.slice(2)}`);
    const todo = JSON.stringify(t.audit.log.mock.calls);
    expect(todo).not.toContain('Texto de nivel 2');
    expect(todo).not.toContain(`usr-${AUTOR.slice(2)}`);
  });

  it('registro: un error al publicar se registra solo por su nombre (sin pila ni mensaje)', async () => {
    const espia = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      t.publicadores.publicar.mockRejectedValue(new Error('boom con datos internos'));
      await t.svc.firmar(M1, ID, true);
      await t.svc.firmar(M2, ID, true);
      const registrado = JSON.stringify(espia.mock.calls);
      expect(registrado).toContain('Error');
      expect(registrado).not.toContain('boom');
      expect(registrado).not.toContain('at ');
    } finally {
      espia.mockRestore();
    }
  });
});
