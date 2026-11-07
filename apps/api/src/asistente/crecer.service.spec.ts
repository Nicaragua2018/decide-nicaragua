import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsistenteController } from './asistente.controller';
import { CrecerService, FACILIDADES, GARANTIAS, META_ACTIVA, textoSinAsistente } from './crecer.service';

const AHORA = new Date('2026-11-07T12:00:00Z');
const DIA = 24 * 3_600_000;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const G1 = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';
const SALIDA = { texto: 'Masaya va creciendo.', mensajeInvitacion: 'Te invito a sumarte conmigo.' };

describe('CrecerService', () => {
  let prisma: Record<string, any>;
  let asistente: { pedir: ReturnType<typeof vi.fn>; activo: ReturnType<typeof vi.fn> };
  let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; mem: Map<string, string> };
  let service: CrecerService;

  beforeEach(() => {
    prisma = {
      group: { findUnique: vi.fn().mockResolvedValue({ name: 'Masaya', type: 'territorial_origin', isActive: true }) },
      groupMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: 'm1' }),
        count: vi.fn().mockResolvedValue(4),
      },
      avisoCerrado: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
    };
    asistente = { activo: vi.fn().mockReturnValue(true), pedir: vi.fn().mockResolvedValue(SALIDA) };
    const mem = new Map<string, string>();
    redis = {
      mem,
      get: vi.fn(async (k: string) => mem.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        mem.set(k, v);
        return 'OK';
      }),
    };
    service = new CrecerService(prisma as never, asistente as never, redis as never);
  });

  it('asistente apagado: no muestra nada', async () => {
    asistente.activo.mockReturnValue(false);
    expect(await service.ver(G1, P1, AHORA)).toEqual({ mostrar: false });
    expect(asistente.pedir).not.toHaveBeenCalled();
  });

  it.each(['custom', 'trabajo'])('grupo de tipo %s: no muestra nada', async (type) => {
    prisma.group.findUnique.mockResolvedValue({ name: 'X', type, isActive: true });
    expect(await service.ver(G1, P1, AHORA)).toEqual({ mostrar: false });
  });

  it('grupo inexistente o inactivo: no muestra nada', async () => {
    prisma.group.findUnique.mockResolvedValue(null);
    expect(await service.ver(G1, P1, AHORA)).toEqual({ mostrar: false });
    prisma.group.findUnique.mockResolvedValue({ name: 'X', type: 'territorial_origin', isActive: false });
    expect(await service.ver(G1, P1, AHORA)).toEqual({ mostrar: false });
  });

  it('la persona no es miembro: no muestra nada', async () => {
    prisma.groupMembership.findUnique.mockResolvedValue(null);
    expect(await service.ver(G1, P1, AHORA)).toEqual({ mostrar: false });
    expect(prisma.groupMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId_profileId: { groupId: G1, profileId: P1 } } }),
    );
  });

  it('aviso cerrado vigente: no muestra nada', async () => {
    prisma.avisoCerrado.findUnique.mockResolvedValue({ hasta: new Date(AHORA.getTime() + DIA) });
    expect(await service.ver(G1, P1, AHORA)).toEqual({ mostrar: false });
    expect(prisma.avisoCerrado.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profileId_clave: { profileId: P1, clave: `crecer:${G1}` } } }),
    );
  });

  it('aviso cerrado vencido: la tarjeta vuelve a mostrarse', async () => {
    prisma.avisoCerrado.findUnique.mockResolvedValue({ hasta: new Date(AHORA.getTime() - 1000) });
    const r = await service.ver(G1, P1, AHORA);
    expect(r.mostrar).toBe(true);
  });

  it('aviso con hasta igual a ahora: ya no oculta la tarjeta', async () => {
    prisma.avisoCerrado.findUnique.mockResolvedValue({ hasta: AHORA });
    expect((await service.ver(G1, P1, AHORA)).mostrar).toBe(true);
  });

  it('7 miembros: activa, meta 20, faltan 13', async () => {
    prisma.groupMembership.count.mockResolvedValue(7);
    expect(await service.ver(G1, P1, AHORA)).toMatchObject({ activa: true, meta: 20, faltan: 13 });
  });

  it('19 miembros: faltan 1', async () => {
    prisma.groupMembership.count.mockResolvedValue(19);
    expect(await service.ver(G1, P1, AHORA)).toMatchObject({ activa: true, meta: 20, faltan: 1 });
  });

  it('cambia el número de miembros: la caché del día anterior no se reutiliza', async () => {
    await service.ver(G1, P1, AHORA);
    prisma.groupMembership.count.mockResolvedValue(5);
    await service.ver(G1, P1, AHORA);
    expect(asistente.pedir).toHaveBeenCalledTimes(2);
  });

  it('Redis get que nunca responde: texto fijo sin llamar a la IA', async () => {
    vi.useFakeTimers();
    try {
      redis.get.mockReturnValue(new Promise(() => {}));
      const pendiente = service.ver(G1, P1, AHORA);
      await vi.advanceTimersByTimeAsync(400);
      expect(await pendiente).toMatchObject({ mostrar: true, deAsistente: false });
      expect(asistente.pedir).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('20 miembros: no muestra nada', async () => {
    prisma.groupMembership.count.mockResolvedValue(META_ACTIVA);
    expect(await service.ver(G1, P1, AHORA)).toEqual({ mostrar: false });
    expect(asistente.pedir).not.toHaveBeenCalled();
  });

  it('4 miembros: aún no activa, meta 7, faltan 3', async () => {
    const r = await service.ver(G1, P1, AHORA);
    expect(r).toEqual({
      mostrar: true,
      comunidad: 'Masaya',
      miembros: 4,
      activa: false,
      meta: 7,
      faltan: 3,
      ...SALIDA,
      deAsistente: true,
    });
  });

  it('12 miembros: activa, meta 20, faltan 8', async () => {
    prisma.groupMembership.count.mockResolvedValue(12);
    const r = await service.ver(G1, P1, AHORA);
    expect(r).toMatchObject({ mostrar: true, miembros: 12, activa: true, meta: 20, faltan: 8 });
  });

  it('el material lleva solo comunidad, cifras, garantías y facilidades; sin ids ni nombres', async () => {
    await service.ver(G1, P1, AHORA);
    const args = asistente.pedir.mock.calls[0]![0];
    expect(args.herramienta.nombre).toBe('animar_comunidad');
    expect(args.material).toBe(
      [
        'Comunidad: Masaya',
        'Miembros: 4',
        'Activa: no',
        'Faltan: 3',
        'Garantías:',
        '- identidad protegida',
        '- voto secreto',
        '- reglas votadas por todos',
        '- sin caudillos',
        '- cada miembro avalado por dos personas',
        'Facilidades:',
        '- debates y votaciones propios',
        '- grupos de trabajo',
        '- comisiones',
        '- apoyo mutuo en papeles, trabajo y seguridad',
      ].join('\n'),
    );
    expect(args.material).not.toMatch(UUID);
    expect(args.material).not.toContain(P1);
    expect(args.material).toContain('Comunidad: Masaya');
    expect(args.material).toContain('Miembros: 4');
    expect(args.material).toContain('Activa: no');
    expect(args.material).toContain('Faltan: 3');
    for (const t of [...GARANTIAS, ...FACILIDADES]) expect(args.material).toContain(t);
    expect(args.validar(SALIDA)).toBe(true);
    expect(args.validar({ texto: 'x'.repeat(601), mensajeInvitacion: 'y' })).toBe(false);
    expect(args.validar({ texto: 'x' })).toBe(false);
  });

  it('una segunda llamada el mismo día usa la caché, que guarda solo texto e invitación', async () => {
    await service.ver(G1, P1, AHORA);
    const r = await service.ver(G1, P1, new Date('2026-11-07T20:00:00Z'));
    expect(asistente.pedir).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ...SALIDA, deAsistente: true });
    expect(redis.set).toHaveBeenCalledWith(`asistente:crecer:${G1}:4:2026-11-07`, JSON.stringify(SALIDA), 26 * 3600);
  });

  it('al día siguiente se pide de nuevo', async () => {
    await service.ver(G1, P1, AHORA);
    await service.ver(G1, P1, new Date('2026-11-08T12:00:00Z'));
    expect(asistente.pedir).toHaveBeenCalledTimes(2);
  });

  it('caché con contenido inválido: se pide de nuevo', async () => {
    redis.mem.set(`asistente:crecer:${G1}:4:2026-11-07`, '{"texto":5}');
    await service.ver(G1, P1, AHORA);
    expect(asistente.pedir).toHaveBeenCalledTimes(1);
    redis.mem.set(`asistente:crecer:${G1}:4:2026-11-07`, 'no es json');
    await service.ver(G1, P1, AHORA);
    expect(asistente.pedir).toHaveBeenCalledTimes(2);
  });

  it('Redis get rechaza: texto fijo, deAsistente false y sin llamar a la IA', async () => {
    redis.get.mockRejectedValue(new Error('caído'));
    const r = await service.ver(G1, P1, AHORA);
    expect(asistente.pedir).not.toHaveBeenCalled();
    expect(r).toMatchObject({ mostrar: true, deAsistente: false, ...textoSinAsistente({ comunidad: 'Masaya', miembros: 4, activa: false, faltan: 3 }) });
  });

  it('pedir devuelve null: texto fijo con deAsistente false y sin guardar en caché', async () => {
    asistente.pedir.mockResolvedValue(null);
    const r = await service.ver(G1, P1, AHORA);
    expect(r).toMatchObject({ deAsistente: false });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('Redis set rechaza: igual devuelve el texto del asistente', async () => {
    redis.set.mockRejectedValue(new Error('caído'));
    const r = await service.ver(G1, P1, AHORA);
    expect(r).toMatchObject({ ...SALIDA, deAsistente: true });
  });

  it('cerrar no hace nada si el grupo no es comunidad territorial, está inactivo o no existe', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'X', type: 'custom', isActive: true });
    await service.cerrar(G1, P1, AHORA);
    prisma.group.findUnique.mockResolvedValue({ name: 'X', type: 'territorial_origin', isActive: false });
    await service.cerrar(G1, P1, AHORA);
    prisma.group.findUnique.mockResolvedValue(null);
    await service.cerrar(G1, P1, AHORA);
    expect(prisma.avisoCerrado.upsert).not.toHaveBeenCalled();
  });

  it('cerrar no hace nada si la persona no es miembro', async () => {
    prisma.groupMembership.findUnique.mockResolvedValue(null);
    await service.cerrar(G1, P1, AHORA);
    expect(prisma.avisoCerrado.upsert).not.toHaveBeenCalled();
  });

  it('cerrar guarda el aviso por 7 días', async () => {
    await service.cerrar(G1, P1, AHORA);
    const hasta = new Date(AHORA.getTime() + 7 * DIA);
    expect(prisma.avisoCerrado.upsert).toHaveBeenCalledWith({
      where: { profileId_clave: { profileId: P1, clave: `crecer:${G1}` } },
      create: { profileId: P1, clave: `crecer:${G1}`, hasta },
      update: { hasta },
    });
  });
});

describe('textoSinAsistente', () => {
  it('antes de activar', () => {
    const r = textoSinAsistente({ comunidad: 'Masaya', miembros: 4, activa: false, faltan: 3 });
    expect(r.texto).toBe(
      'Masaya tiene 4 miembros. Faltan 3 personas para activar la comunidad. Invitar a alguien de confianza ayuda a que la comunidad crezca.',
    );
  });

  it('ya activa, y singular', () => {
    expect(textoSinAsistente({ comunidad: 'Masaya', miembros: 19, activa: true, faltan: 1 }).texto).toContain(
      'Falta 1 persona para llegar a 20.',
    );
  });

  it('la invitación va en primera persona y sin enlaces', () => {
    const r = textoSinAsistente({ comunidad: 'Masaya', miembros: 4, activa: false, faltan: 3 });
    expect(r.mensajeInvitacion).not.toMatch(/https?:|www\./i);
    expect(r.mensajeInvitacion).toMatch(/^Te invito/);
  });
});

describe('AsistenteController crecer', () => {
  const crecer = { ver: vi.fn(), cerrar: vi.fn() };
  const controller = new AsistenteController({} as never, {} as never, {} as never, {} as never, crecer as never);

  beforeEach(() => vi.clearAllMocks());

  it('sin verificar: tarjeta apagada y cerrar sin efecto', async () => {
    const user = { sub: 'u', profileId: 'p1', status: 'pending_verification' } as never;
    expect(await controller.crecer(G1, user)).toEqual({ mostrar: false });
    await controller.cerrarCrecer(G1, user);
    expect(crecer.ver).not.toHaveBeenCalled();
    expect(crecer.cerrar).not.toHaveBeenCalled();
  });

  it('sin perfil: prohibido', async () => {
    await expect(controller.crecer(G1, { sub: 'u', status: 'verified_citizen' } as never)).rejects.toThrow();
  });

  it('verificada: usa el servicio', async () => {
    crecer.ver.mockResolvedValue({ mostrar: false });
    const user = { sub: 'u', profileId: 'p1', status: 'verified_citizen' } as never;
    await controller.crecer(G1, user);
    expect(crecer.ver).toHaveBeenCalledWith(G1, 'p1');
    await controller.cerrarCrecer(G1, user);
    expect(crecer.cerrar).toHaveBeenCalledWith(G1, 'p1');
  });
});
