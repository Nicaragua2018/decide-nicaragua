import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import { GuardiaService } from './guardia.service';
import { Publicadores } from './publicadores';
import { FrasesService } from '../frases/frases.service';
import { GroupAccessService } from '../groups/group-access.service';

const YO = 'p-yo';
const T = 't1';
const ODIO = 'Los de ese barrio son una plaga y hay que echarlos a todos';
const DIA_MS = 86_400_000;

function buildPrisma() {
  return {
    proposal: { findUnique: vi.fn().mockResolvedValue({ id: T, groupId: 'g1', status: 'open', hidden: false }) },
    groupMembership: { findUnique: vi.fn().mockResolvedValue({ id: 'm1' }) },
    group: { findUnique: vi.fn().mockResolvedValue(null) },
    profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u1' }) },
    frase: { create: vi.fn().mockResolvedValue({ id: 'f1' }) },
    textoEnRevision: { create: vi.fn().mockResolvedValue({ id: 'rev1' }), findMany: vi.fn().mockResolvedValue([]) },
    colaRevisionPosterior: { upsert: vi.fn().mockResolvedValue({}) },
  };
}

describe('GuardiaService (con frases.create)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let moderacion: { revisar: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let guardia: GuardiaService;
  let frases: FrasesService;

  beforeEach(() => {
    prisma = buildPrisma();
    moderacion = {
      revisar: vi.fn().mockResolvedValue({ nivel: 2, causa: 'odio', explicacion: 'Ataca a un grupo.', sugerencia: 'Otra forma.', revisado: true }),
    };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    guardia = new GuardiaService(moderacion as never, prisma as never, audit as never);
    frases = new FrasesService(
      prisma as never,
      audit as never,
      { getInt: vi.fn() } as never,
      new GroupAccessService(prisma as never),
      guardia,
      new Publicadores(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guardia: bloquea nivel 2 aunque la web no haya revisado', async () => {
    const err = await frases.create(YO, T, ODIO, 'ip').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    const resp = (err as UnprocessableEntityException).getResponse() as { codigo: string; revision: { nivel: number; causa: string } };
    expect(resp.codigo).toBe('nivel_2');
    expect(resp.revision).toMatchObject({ nivel: 2, causa: 'odio' });
    expect(moderacion.revisar).toHaveBeenCalledWith(ODIO, 'frase', { profileId: YO });
    expect(prisma.frase.create).not.toHaveBeenCalled();
    expect(prisma.textoEnRevision.create).not.toHaveBeenCalled();
  });

  it('guardia: con pedirRevision guarda el texto y responde 202', async () => {
    vi.useFakeTimers();
    const ahora = new Date('2026-11-06T15:00:00Z');
    vi.setSystemTime(ahora);
    const err = await frases.create(YO, T, ODIO, 'ip', { pedirRevision: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(202);
    expect((err as HttpException).getResponse()).toEqual({ codigo: 'en_revision', revisionId: 'rev1' });
    expect(prisma.textoEnRevision.create).toHaveBeenCalledWith({
      data: {
        autorProfileId: YO,
        tipo: 'frase',
        args: { proposalId: T, text: ODIO },
        texto: ODIO,
        causa: 'odio',
        venceAt: new Date(ahora.getTime() + 7 * DIA_MS),
      },
    });
    expect(prisma.frase.create).not.toHaveBeenCalled();
    // La auditoría no lleva texto ni autor.
    const evento = audit.log.mock.calls.map((c) => c[0]).find((e: { action: string }) => e.action === 'asistente.revision_pedida');
    expect(evento).toBeDefined();
    expect(evento.actorId).toBeUndefined();
    expect(JSON.stringify(evento)).not.toContain('plaga');
    expect(JSON.stringify(evento)).not.toContain(YO);
  });

  it('guardia: pedir revisión dos veces del mismo texto reutiliza la pendiente', async () => {
    prisma.textoEnRevision.findMany.mockResolvedValue([
      // Mismos argumentos (en otro orden de claves) y aún vigente.
      { id: 'rev0', args: { text: ODIO, proposalId: T }, venceAt: new Date(Date.now() + DIA_MS) },
    ]);
    const err = await frases.create(YO, T, ODIO, 'ip', { pedirRevision: true }).catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(202);
    expect((err as HttpException).getResponse()).toEqual({ codigo: 'en_revision', revisionId: 'rev0' });
    expect(prisma.textoEnRevision.findMany).toHaveBeenCalledWith({
      where: { autorProfileId: YO, tipo: 'frase', texto: ODIO, estado: 'pendiente' },
      select: { id: true, args: true, venceAt: true },
    });
    expect(prisma.textoEnRevision.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('guardia: mismo texto a otro destino crea su propia revisión', async () => {
    prisma.textoEnRevision.findMany.mockResolvedValue([
      { id: 'rev0', args: { proposalId: 'otro-tema', text: ODIO }, venceAt: new Date(Date.now() + DIA_MS) },
    ]);
    const err = await frases.create(YO, T, ODIO, 'ip', { pedirRevision: true }).catch((e: unknown) => e);
    expect((err as HttpException).getResponse()).toEqual({ codigo: 'en_revision', revisionId: 'rev1' });
    expect(prisma.textoEnRevision.create).toHaveBeenCalledTimes(1);
  });

  it('guardia: una pendiente ya vencida no se reutiliza', async () => {
    prisma.textoEnRevision.findMany.mockResolvedValue([
      { id: 'rev0', args: { proposalId: T, text: ODIO }, venceAt: new Date(Date.now() - 1000) },
    ]);
    const err = await frases.create(YO, T, ODIO, 'ip', { pedirRevision: true }).catch((e: unknown) => e);
    expect((err as HttpException).getResponse()).toEqual({ codigo: 'en_revision', revisionId: 'rev1' });
    expect(prisma.textoEnRevision.create).toHaveBeenCalledTimes(1);
  });

  it('guardia: si el asistente no responde, publica y encola', async () => {
    moderacion.revisar.mockResolvedValue({ nivel: 0, revisado: false });
    expect(await frases.create(YO, T, ODIO, 'ip')).toEqual({ id: 'f1' });
    expect(prisma.frase.create).toHaveBeenCalled();
    expect(prisma.colaRevisionPosterior.upsert).toHaveBeenCalledWith({
      where: { target_targetId: { target: 'frase', targetId: 'f1' } },
      create: { target: 'frase', targetId: 'f1' },
      update: {},
    });
  });

  it('guardia: con el asistente apagado publica y no encola (igual que 3A)', async () => {
    moderacion.revisar.mockResolvedValue({ nivel: 0, revisado: true, apagado: true });
    expect(await frases.create(YO, T, ODIO, 'ip')).toEqual({ id: 'f1' });
    expect(prisma.frase.create).toHaveBeenCalled();
    expect(prisma.colaRevisionPosterior.upsert).not.toHaveBeenCalled();
  });

  it('guardia: nivel 0 revisado publica y no encola', async () => {
    moderacion.revisar.mockResolvedValue({ nivel: 0, revisado: true });
    expect(await frases.create(YO, T, 'Una frase normal sobre el agua', 'ip')).toEqual({ id: 'f1' });
    expect(prisma.colaRevisionPosterior.upsert).not.toHaveBeenCalled();
  });

  it('guardia: nivel 1 no bloquea en el servidor', async () => {
    moderacion.revisar.mockResolvedValue({ nivel: 1, causa: 'insultos_amenazas', explicacion: 'x', sugerencia: 'y', revisado: true });
    expect(await frases.create(YO, T, 'El concejal es un inútil y no hizo nada', 'ip')).toEqual({ id: 'f1' });
    expect(prisma.frase.create).toHaveBeenCalled();
    expect(prisma.colaRevisionPosterior.upsert).not.toHaveBeenCalled();
    // El aviso del nivel 1 no se guarda.
    expect(prisma.textoEnRevision.create).not.toHaveBeenCalled();
  });

  it('guardia: sinModeracion no llama a revisar', async () => {
    expect(await frases.create(YO, T, ODIO, '', { sinModeracion: true })).toEqual({ id: 'f1' });
    expect(moderacion.revisar).not.toHaveBeenCalled();
    expect(prisma.colaRevisionPosterior.upsert).not.toHaveBeenCalled();
  });

  it('guardia: sin permiso no gasta una revisión', async () => {
    prisma.groupMembership.findUnique.mockResolvedValue(null);
    await expect(frases.create(YO, T, ODIO, 'ip')).rejects.toThrow();
    expect(moderacion.revisar).not.toHaveBeenCalled();
  });

  it('despuesDePublicar: si la cola falla no rompe la publicación', async () => {
    prisma.colaRevisionPosterior.upsert.mockRejectedValue(new Error('db'));
    await expect(guardia.despuesDePublicar('frase', 'f1', false)).resolves.toBeUndefined();
  });

  it('frases registra su publicador, que publica sin moderación', async () => {
    const publicadores = new Publicadores();
    const svc = new FrasesService(
      prisma as never,
      audit as never,
      { getInt: vi.fn() } as never,
      new GroupAccessService(prisma as never),
      guardia,
      publicadores,
    );
    svc.onModuleInit();
    expect(await publicadores.publicar('frase', YO, { proposalId: T, text: ODIO })).toEqual({ id: 'f1' });
    expect(moderacion.revisar).not.toHaveBeenCalled();
    expect(prisma.frase.create).toHaveBeenCalledWith({ data: { proposalId: T, authorProfileId: YO, text: ODIO } });
  });
});
