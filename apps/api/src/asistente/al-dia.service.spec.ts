import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlDiaService, ventana } from './al-dia.service';
import { AsistenteController } from './asistente.controller';

const HORA = 3_600_000;
const AHORA = new Date('2026-11-07T12:00:00Z');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const G1 = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';
const D1 = '33333333-3333-4333-8333-333333333333';

describe('ventana', () => {
  it('sin visita previa: una semana atrás', () => {
    const r = ventana({ ultimaVisitaAt: null, alDiaDesde: null }, AHORA);
    expect(r.ultimaVisitaAt).toEqual(AHORA);
    expect(r.alDiaDesde).toEqual(new Date(AHORA.getTime() - 7 * 24 * HORA));
  });

  it('pasaron 13 h: la ventana empieza en la última visita', () => {
    const ultima = new Date(AHORA.getTime() - 13 * HORA);
    const r = ventana({ ultimaVisitaAt: ultima, alDiaDesde: new Date('2026-11-01T00:00:00Z') }, AHORA);
    expect(r.alDiaDesde).toEqual(ultima);
    expect(r.ultimaVisitaAt).toEqual(AHORA);
  });

  it('2 h y ya había ventana: se conserva', () => {
    const previa = new Date('2026-11-05T00:00:00Z');
    const r = ventana({ ultimaVisitaAt: new Date(AHORA.getTime() - 2 * HORA), alDiaDesde: previa }, AHORA);
    expect(r.alDiaDesde).toEqual(previa);
  });

  it('2 h y sin ventana (ya cerrada): sigue sin ventana', () => {
    const r = ventana({ ultimaVisitaAt: new Date(AHORA.getTime() - 2 * HORA), alDiaDesde: null }, AHORA);
    expect(r.alDiaDesde).toBeNull();
    expect(r.ultimaVisitaAt).toEqual(AHORA);
  });
});

describe('AlDiaService', () => {
  const desde = new Date('2026-11-05T00:00:00Z');
  let prisma: Record<string, any>;
  let asistente: { pedir: ReturnType<typeof vi.fn>; activo: ReturnType<typeof vi.fn> };
  let contexto: { gruposLegibles: ReturnType<typeof vi.fn> };
  let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; mem: Map<string, string> };
  let service: AlDiaService;

  beforeEach(() => {
    prisma = {
      profile: {
        findUnique: vi.fn().mockResolvedValue({ ultimaVisitaAt: new Date(AHORA.getTime() - 2 * HORA), alDiaDesde: desde }),
        update: vi.fn().mockResolvedValue({}),
      },
      proposal: {
        findMany: vi.fn().mockResolvedValue([{ id: P1, title: 'Arreglar el parque', groupId: G1, createdAt: new Date('2026-11-06T10:00:00Z') }]),
      },
      decision: { findMany: vi.fn().mockResolvedValue([]) },
      comisionInforme: { findMany: vi.fn().mockResolvedValue([]) },
      inquietud: { findMany: vi.fn().mockResolvedValue([]) },
    };
    asistente = {
      activo: vi.fn().mockReturnValue(true),
      pedir: vi.fn().mockResolvedValue({ resumen: 'Hay un debate nuevo sobre el parque.' }),
    };
    contexto = { gruposLegibles: vi.fn().mockResolvedValue([{ id: G1, nombre: 'Masaya', tipo: 'origen', padreId: null }]) };
    const mem = new Map<string, string>();
    redis = {
      mem,
      get: vi.fn(async (k: string) => mem.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        mem.set(k, v);
        return 'OK';
      }),
    };
    service = new AlDiaService(prisma as never, asistente as never, contexto as never, redis as never);
  });

  it('asistente apagado: no muestra nada y no llama a pedir', async () => {
    asistente.activo.mockReturnValue(false);
    const r = await service.ver('p1', AHORA);
    expect(r).toEqual({ mostrar: false, desde: null, items: [], resumen: null });
    expect(asistente.pedir).not.toHaveBeenCalled();
    expect(prisma.profile.update).toHaveBeenCalled();
  });

  it('actualiza la visita con la ventana', async () => {
    await service.ver('p1', AHORA);
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { ultimaVisitaAt: AHORA, alDiaDesde: desde },
    });
  });

  it('las búsquedas filtran por los grupos legibles y hidden: false', async () => {
    await service.ver('p1', AHORA);
    expect(prisma.proposal.findMany.mock.calls[0]![0].where).toMatchObject({ groupId: { in: [G1] }, hidden: false, status: { not: 'draft' } });
    expect(prisma.decision.findMany).toHaveBeenCalled();
    for (const llamada of prisma.decision.findMany.mock.calls) {
      expect(llamada[0].where.proposal).toMatchObject({ groupId: { in: [G1] }, hidden: false });
    }
    expect(prisma.comisionInforme.findMany.mock.calls[0]![0].where).toMatchObject({ grupoId: { in: [G1] }, hidden: false });
    expect(prisma.inquietud.findMany.mock.calls[0]![0].where).toMatchObject({ groupId: { in: [G1] }, hidden: false });
  });

  it('arma los items con ruta y comunidad, y el resumen', async () => {
    const r = await service.ver('p1', AHORA);
    expect(r.mostrar).toBe(true);
    expect(r.desde).toBe(desde.toISOString());
    expect(r.items).toEqual([
      { clase: 'debate', titulo: 'Arreglar el parque', comunidad: 'Masaya', ruta: `/proposals/${P1}`, fecha: '2026-11-06T10:00:00.000Z' },
    ]);
    expect(r.resumen).toBe('Hay un debate nuevo sobre el parque.');
    const op = asistente.pedir.mock.calls[0]![0];
    expect(op).toMatchObject({ modelo: 'rapido', prioridad: 'interactiva', timeoutMs: 8000 });
    expect(op.herramienta.nombre).toBe('resumir_al_dia');
  });

  const decisionDe = (extra: Record<string, unknown>) => ({
    id: D1,
    proposalId: P1,
    fase: 'contada',
    resultado: 'aprobada',
    contadaAt: null,
    votacionStartsAt: null,
    votacionEndsAt: null,
    proposal: { title: 'Arreglar el parque', groupId: G1 },
    ...extra,
  });

  it('el material del resumen no lleva uuid ni rutas, con varias clases a la vez', async () => {
    prisma.decision.findMany.mockImplementation(async (args: any) => {
      if (args.where.fase === 'votacion') return [decisionDe({ fase: 'votacion', resultado: null, votacionEndsAt: new Date('2026-11-08T00:00:00Z') })];
      if (args.where.contadaAt) return [decisionDe({ contadaAt: new Date('2026-11-06T11:00:00Z') })];
      return [decisionDe({ votacionStartsAt: new Date('2026-11-06T09:00:00Z'), proposalId: G1 })];
    });
    prisma.comisionInforme.findMany.mockResolvedValue([{ grupoId: G1, createdAt: new Date('2026-11-06T12:00:00Z') }]);
    prisma.inquietud.findMany.mockResolvedValue([{ id: D1, title: 'Basura', groupId: G1, thresholdReachedAt: new Date('2026-11-06T13:00:00Z') }]);
    await service.ver('p1', AHORA);
    const { material, tarea } = asistente.pedir.mock.calls[0]![0];
    expect(material.match(/^- /gm)!.length).toBeGreaterThanOrEqual(5);
    expect(material).not.toMatch(UUID);
    expect(material).not.toContain('/proposals');
    expect(material).not.toContain('/grupos');
    expect(material).not.toContain('/inquietudes');
    expect(tarea).not.toMatch(UUID);
  });

  it('una votación que abrió en la ventana y cierra pronto sale una sola vez', async () => {
    prisma.proposal.findMany.mockResolvedValue([]);
    const d = decisionDe({ fase: 'votacion', resultado: null, votacionStartsAt: new Date('2026-11-06T09:00:00Z'), votacionEndsAt: new Date('2026-11-08T00:00:00Z') });
    prisma.decision.findMany.mockImplementation(async (args: any) => (args.where.contadaAt ? [] : [d]));
    const r = await service.ver('p1', AHORA);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.clase).toBe('votacion_cierra');
  });

  it('un item nuevo cambia la clave y vuelve a pedir el resumen', async () => {
    await service.ver('p1', AHORA);
    prisma.proposal.findMany.mockResolvedValue([
      { id: P1, title: 'Arreglar el parque', groupId: G1, createdAt: new Date('2026-11-06T10:00:00Z') },
      { id: D1, title: 'Otro tema', groupId: G1, createdAt: new Date('2026-11-07T10:00:00Z') },
    ]);
    await service.ver('p1', AHORA);
    expect(asistente.pedir).toHaveBeenCalledTimes(2);
  });

  it('los borradores se excluyen también en las decisiones', async () => {
    await service.ver('p1', AHORA);
    for (const llamada of prisma.decision.findMany.mock.calls) {
      expect(llamada[0].where.proposal).toMatchObject({ status: { not: 'draft' } });
    }
  });

  it('una segunda llamada con la misma ventana usa la caché', async () => {
    const a = await service.ver('p1', AHORA);
    const b = await service.ver('p1', AHORA);
    expect(asistente.pedir).toHaveBeenCalledTimes(1);
    expect(b.resumen).toBe(a.resumen);
    const clave = redis.set.mock.calls[0]![0] as string;
    expect(clave).toMatch(/^asistente:aldia:[0-9a-f]{64}$/);
    expect(redis.set.mock.calls[0]![2]).toBe(12 * 3600);
  });

  it('si Redis falla, igual pide el resumen', async () => {
    redis.get.mockRejectedValue(new Error('caído'));
    redis.set.mockRejectedValue(new Error('caído'));
    const r = await service.ver('p1', AHORA);
    expect(r.resumen).toBe('Hay un debate nuevo sobre el parque.');
  });

  it('con pedir null: se muestra la tarjeta sin resumen', async () => {
    asistente.pedir.mockResolvedValue(null);
    const r = await service.ver('p1', AHORA);
    expect(r.mostrar).toBe(true);
    expect(r.resumen).toBeNull();
    expect(r.items).toHaveLength(1);
  });

  it('sin novedades: no se muestra', async () => {
    prisma.proposal.findMany.mockResolvedValue([]);
    const r = await service.ver('p1', AHORA);
    expect(r).toEqual({ mostrar: false, desde: null, items: [], resumen: null });
    expect(asistente.pedir).not.toHaveBeenCalled();
  });

  it('sin ventana (ya cerrada): no muestra y no consulta', async () => {
    prisma.profile.findUnique.mockResolvedValue({ ultimaVisitaAt: new Date(AHORA.getTime() - 2 * HORA), alDiaDesde: null });
    const r = await service.ver('p1', AHORA);
    expect(r.mostrar).toBe(false);
    expect(prisma.proposal.findMany).not.toHaveBeenCalled();
  });

  it('pone primero lo que cierra antes y limita a 20', async () => {
    prisma.proposal.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({ id: P1, title: `Tema ${i}`, groupId: G1, createdAt: new Date(Date.UTC(2026, 10, 6, 0, i)) })),
    );
    prisma.decision.findMany.mockImplementation(async (args: any) =>
      args.where.fase === 'votacion'
        ? [{ id: D1, proposalId: P1, fase: 'votacion', resultado: null, contadaAt: null, votacionStartsAt: null, votacionEndsAt: new Date('2026-11-08T00:00:00Z'), proposal: { title: 'Vota', groupId: G1 } }]
        : [],
    );
    const r = await service.ver('p1', AHORA);
    expect(r.items).toHaveLength(20);
    expect(r.items[0]).toMatchObject({ clase: 'votacion_cierra', titulo: 'Vota', ruta: `/proposals/${P1}` });
    expect(r.items[1]!.titulo).toBe('Tema 24');
  });

  it('cerrar deja alDiaDesde en null', async () => {
    await service.cerrar('p1');
    expect(prisma.profile.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { alDiaDesde: null } });
  });
});

describe('AsistenteController al-dia', () => {
  const alDia = { ver: vi.fn(), cerrar: vi.fn() };
  const controller = new AsistenteController({} as never, {} as never, {} as never, alDia as never, {} as never);

  beforeEach(() => vi.clearAllMocks());

  it('una cuenta sin verificar no ve nada ni toca el perfil', async () => {
    const r = await controller.alDia({ sub: 'u', profileId: 'p1', status: 'pending_verification' } as never);
    expect(r).toEqual({ mostrar: false, desde: null, items: [], resumen: null });
    expect(alDia.ver).not.toHaveBeenCalled();
  });

  it('cerrar sin verificar no hace nada', async () => {
    await controller.cerrarAlDia({ sub: 'u', profileId: 'p1', status: 'pending_verification' } as never);
    expect(alDia.cerrar).not.toHaveBeenCalled();
  });

  it('una cuenta verificada usa el servicio', async () => {
    alDia.ver.mockResolvedValue({ mostrar: true, desde: 'x', items: [], resumen: null });
    await controller.alDia({ sub: 'u', profileId: 'p1', status: 'verified_citizen' } as never);
    expect(alDia.ver).toHaveBeenCalledWith('p1');
    await controller.cerrarAlDia({ sub: 'u', profileId: 'p1', status: 'verified_citizen' } as never);
    expect(alDia.cerrar).toHaveBeenCalledWith('p1');
  });
});
