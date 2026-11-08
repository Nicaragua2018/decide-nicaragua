import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EleccionesService } from './elecciones.service';
import { EleccionesController, RepresentantesController } from './elecciones.controller';
import { CandidaturaDto } from './dto/candidatura.dto';
import { PapeletaEleccionDto } from './dto/papeleta-eleccion.dto';
import { guardiaMock, publicadoresMock } from '../test/guardia-mock';

const DIA = 86_400_000;
const YO = 'p-yo';
const GEN = 'g-general';
const E = 'e1';

function eleccion(over: Record<string, unknown> = {}) {
  return {
    id: E,
    groupId: GEN,
    group: { id: GEN, name: 'Nicaragua Decide' },
    cargo: 'secretario',
    puestos: 1,
    motivo: 'primera',
    jornadaId: 'j1',
    fase: 'candidaturas',
    candidaturasEndsAt: new Date(Date.now() + 3 * DIA),
    votacionEndsAt: new Date(Date.now() + 10 * DIA),
    miembros: null,
    papeletasTotal: null,
    abstenciones: null,
    aprobaciones: [],
    candidatasOrden: [],
    pairwiseMatrix: null,
    schulzeMatrix: null,
    ordenFinal: [],
    electas: [],
    semilla: null,
    sinQuorum: false,
    contadaAt: null,
    ...over,
  };
}

function cand(id: string, profileId: string, nombre: string, over: Record<string, unknown> = {}) {
  return {
    id,
    eleccionId: E,
    profileId,
    presentacion: `Presentación de ${nombre}`,
    compromisos: ['Escuchar'],
    oculta: false,
    retiradaAt: null,
    profile: {
      displayName: nombre,
      memberships: [{ group: { name: 'Managua', type: 'territorial_origin' } }, { group: { name: 'Grupo X', type: 'custom' } }],
    },
    ...over,
  };
}

function buildPrisma() {
  return {
    eleccion: { findUnique: vi.fn().mockResolvedValue(eleccion()), findMany: vi.fn().mockResolvedValue([]) },
    candidatura: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'c-nueva' }),
      update: vi.fn().mockResolvedValue({ id: 'c-vieja' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    boardAction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    cargo: { findMany: vi.fn().mockResolvedValue([]) },
    boardSeat: { findMany: vi.fn().mockResolvedValue([]) },
    papeletaEleccion: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    group: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: E }]),
    $transaction: vi.fn(),
  };
}

describe('EleccionesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let convocatoria: { enElectorado: ReturnType<typeof vi.fn> };
  let guardia: ReturnType<typeof guardiaMock>;
  let publicadores: ReturnType<typeof publicadoresMock>;
  let service: EleccionesService;

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    convocatoria = { enElectorado: vi.fn().mockResolvedValue(true) };
    guardia = guardiaMock();
    service = new EleccionesService(
      prisma as never,
      audit as never,
      convocatoria as never,
      guardia as never,
      (publicadores = publicadoresMock()) as never,
    );
  });

  const ficha = { presentacion: 'Quiero servir a la colmena.', compromisos: ['Rendir cuentas cada mes'] };

  it('presentarse fuera de plazo o fuera del electorado da 400/403', async () => {
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ fase: 'votacion' }));
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);

    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ candidaturasEndsAt: new Date(Date.now() - 1000) }));
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);

    prisma.eleccion.findUnique.mockResolvedValue(eleccion());
    convocatoria.enElectorado.mockResolvedValue(false);
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.candidatura.create).not.toHaveBeenCalled();

    convocatoria.enElectorado.mockResolvedValue(true);
    await expect(service.presentarse(YO, E, ficha)).resolves.toEqual({ id: 'c-nueva' });
    expect(prisma.candidatura.create.mock.calls[0]![0].data).toMatchObject({
      eleccionId: E, profileId: YO, presentacion: ficha.presentacion, compromisos: ficha.compromisos,
    });
  });

  it('no se puede presentar a dos cargos de la misma jornada', async () => {
    prisma.candidatura.findFirst.mockResolvedValue({ id: 'c-otra' });
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);
    // Busca cualquier candidatura viva propia en otra elección abierta.
    expect(prisma.candidatura.findFirst.mock.calls[0]![0].where).toMatchObject({
      profileId: YO, retiradaAt: null, eleccionId: { not: E }, eleccion: { fase: { in: ['candidaturas', 'votacion'] } },
    });
    expect(prisma.candidatura.create).not.toHaveBeenCalled();
  });

  it('quien ocupa otro cargo no se presenta; a la renovación del suyo sí', async () => {
    // Observador que quiere ir a la mesa: no.
    prisma.cargo.findMany.mockResolvedValue([{ profileId: YO, tipo: 'observador', groupId: GEN }]);
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);

    // Coordinador de una comunidad que quiere ser secretario: no.
    prisma.cargo.findMany.mockResolvedValue([{ profileId: YO, tipo: 'coordinador', groupId: 'g-managua' }]);
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);

    // Asiento elegido de otro rol de la mesa: no.
    prisma.cargo.findMany.mockResolvedValue([]);
    prisma.boardSeat.findMany.mockResolvedValue([{ profileId: YO, role: 'administrador' }]);
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);

    // Fundador en una elección de coordinadores: cualquier asiento bloquea.
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ cargo: 'coordinador', groupId: 'g-managua', puestos: 2 }));
    prisma.boardSeat.findMany.mockResolvedValue([{ profileId: YO, role: 'secretario' }]);
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.boardSeat.findMany.mock.calls.at(-1)![0].where).toEqual({ profileId: { in: [YO] } });
    expect(prisma.candidatura.create).not.toHaveBeenCalled();

    // Renovación del propio cargo: sí.
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ motivo: 'renovacion' }));
    prisma.cargo.findMany.mockResolvedValue([{ profileId: YO, tipo: 'secretario', groupId: GEN }]);
    prisma.boardSeat.findMany.mockResolvedValue([{ profileId: YO, role: 'secretario' }]);
    await expect(service.presentarse(YO, E, ficha)).resolves.toEqual({ id: 'c-nueva' });
    // En la mesa los asientos fundadores no cuentan: solo se leen los elegidos.
    expect(prisma.boardSeat.findMany.mock.calls.at(-1)![0].where).toMatchObject({ source: 'eleccion' });
  });

  it('la candidatura pasa por la revisión previa', async () => {
    await service.presentarse(YO, E, { ...ficha, compromisos: ['Uno', 'Dos'] }, { pedirRevision: true });
    expect(guardia.antesDePublicar).toHaveBeenCalledWith({
      tipo: 'candidatura',
      texto: `${ficha.presentacion}\n\nUno\n\nDos`,
      autorProfileId: YO,
      args: { eleccionId: E, presentacion: ficha.presentacion, compromisos: ['Uno', 'Dos'] },
      pedirRevision: true,
    });

    // La mesa publica lo aprobado reproduciendo la llamada.
    service.onModuleInit();
    expect(publicadores.registrar).toHaveBeenCalledWith('candidatura', expect.any(Function));
    const publicar = publicadores.registrar.mock.calls[0]![1] as (a: string, args: unknown, o: unknown) => Promise<unknown>;
    guardia.antesDePublicar.mockClear();
    await publicar(YO, { eleccionId: E, presentacion: 'Hola', compromisos: [] }, { sinModeracion: true });
    expect(guardia.antesDePublicar.mock.calls[0]![0]).toMatchObject({ tipo: 'candidatura', sinModeracion: true });

    // Nivel 2 con revisión pedida: 202 y no se crea.
    prisma.candidatura.create.mockClear();
    guardia.antesDePublicar.mockRejectedValue(new HttpException({ codigo: 'en_revision' }, 202));
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(HttpException);
    expect(prisma.candidatura.create).not.toHaveBeenCalled();

    // Una candidatura retirada se puede volver a presentar: se reutiliza su fila.
    guardia.antesDePublicar.mockResolvedValue({ revisado: true });
    prisma.candidatura.findUnique.mockResolvedValue({ id: 'c-vieja', oculta: false, retiradaAt: new Date() });
    await expect(service.presentarse(YO, E, ficha)).resolves.toEqual({ id: 'c-vieja' });
    expect(prisma.candidatura.update.mock.calls[0]![0].data).toMatchObject({ retiradaAt: null });
  });

  it('la segunda comprobación, con la persona bloqueada, cierra la carrera entre dos presentaciones', async () => {
    // Fuera de la transacción no había otra; dentro, la otra petición ya la creó.
    prisma.candidatura.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'c-otra' });
    await expect(service.presentarse(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.candidatura.create).not.toHaveBeenCalled();
    const sqls = prisma.$queryRaw.mock.calls.map((c) => (c[0] as { strings: string[] }).strings.join('?'));
    expect(sqls.some((q) => q.includes('FROM profiles') && q.includes('FOR UPDATE'))).toBe(true);
  });

  describe('editar la ficha', () => {
    beforeEach(() => {
      prisma.candidatura.findUnique.mockResolvedValue({ id: 'c1', oculta: true, retiradaAt: null });
    });

    it('editar vuelve a pasar la revisión previa y quita la ocultación', async () => {
      await service.editar(YO, E, { presentacion: 'Nueva presentación', compromisos: ['Uno'] });
      expect(guardia.antesDePublicar).toHaveBeenCalledWith({
        tipo: 'candidatura',
        texto: 'Nueva presentación\n\nUno',
        autorProfileId: YO,
        args: { via: 'editar', eleccionId: E, presentacion: 'Nueva presentación', compromisos: ['Uno'] },
      });
      expect(prisma.candidatura.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', retiradaAt: null },
        data: { presentacion: 'Nueva presentación', compromisos: ['Uno'], oculta: false, ocultaCausa: null },
      });
      // La mesa reproduce la edición aprobada por la misma vía.
      service.onModuleInit();
      expect(publicadores.registrar).toHaveBeenCalledWith('candidatura', expect.any(Function), 'editar');
    });

    it('editar cancela las propuestas pendientes de ocultar esa ficha', async () => {
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
      await service.editar(YO, E, ficha);
      expect(prisma.boardAction.updateMany).toHaveBeenCalledWith({
        where: { type: 'ocultar_candidatura', status: 'pending', params: { path: ['candidaturaId'], equals: 'c1' } },
        data: { status: 'rejected', resolvedAt: expect.any(Date) },
      });
      expect(audit.log).toHaveBeenCalledWith({
        action: 'candidatura.ocultacion_cancelada', resource: 'candidatura:c1', metadata: { eleccionId: E, acciones: 1 },
      });
    });

    it('si se retiró a la vez, editar da 400', async () => {
      prisma.candidatura.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.editar(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('editar fuera de candidaturas da 400', async () => {
      prisma.eleccion.findUnique.mockResolvedValue(eleccion({ fase: 'votacion' }));
      await expect(service.editar(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);
      prisma.eleccion.findUnique.mockResolvedValue(eleccion());
      prisma.candidatura.findUnique.mockResolvedValue({ id: 'c1', oculta: false, retiradaAt: new Date() });
      await expect(service.editar(YO, E, ficha)).rejects.toBeInstanceOf(BadRequestException);
      expect(guardia.antesDePublicar).not.toHaveBeenCalled();
      expect(prisma.candidatura.updateMany).not.toHaveBeenCalled();
    });
  });

  it('quien se presentó ve su ficha, también oculta, con la causa en lenguaje sencillo', async () => {
    prisma.candidatura.findMany.mockResolvedValue([cand('c2', 'p2', 'Luis Mora')]);
    prisma.candidatura.findUnique.mockResolvedValue(
      cand('c1', YO, 'Ana Ruiz', { oculta: true, ocultaCausa: 'datos_personales' }),
    );
    const d = await service.detalle(YO, E);
    expect(d.candidaturas.map((c) => c.id)).toEqual(['c2']);
    expect(d.miCandidatura).toMatchObject({ oculta: true, ficha: { id: 'c1', esMia: true } });
    expect(d.miCandidatura!.aviso).toBe('Tu ficha la ocultó la mesa: datos que identifican o ponen en riesgo a una persona.');

    prisma.candidatura.findUnique.mockResolvedValue(null);
    expect((await service.detalle(YO, E)).miCandidatura).toBeNull();
  });

  it('retirarse solo antes de la votación', async () => {
    prisma.candidatura.findUnique.mockResolvedValue({ id: 'c1', retiradaAt: null });
    await service.retirarse(YO, E);
    expect(prisma.candidatura.update.mock.calls[0]![0]).toMatchObject({ where: { id: 'c1' } });
    expect(prisma.candidatura.update.mock.calls[0]![0].data.retiradaAt).toBeInstanceOf(Date);

    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ fase: 'votacion' }));
    await expect(service.retirarse(YO, E)).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('papeleta', () => {
    beforeEach(() => {
      prisma.eleccion.findUnique.mockResolvedValue(eleccion({ fase: 'votacion', candidaturasEndsAt: new Date(Date.now() - DIA) }));
      prisma.candidatura.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    });

    it('votar con una candidatura ajena o duplicada da 400', async () => {
      await expect(service.votar(YO, E, { abstencion: false, orden: ['c1', 'c-ajena'] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.votar(YO, E, { abstencion: false, orden: ['c1', 'c1'] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.votar(YO, E, { abstencion: true, orden: ['c1'] })).rejects.toBeInstanceOf(BadRequestException);
      // Solo cuentan las vivas de esta elección.
      expect(prisma.candidatura.findMany.mock.calls[0]![0].where).toMatchObject({ eleccionId: E, oculta: false, retiradaAt: null });
      expect(prisma.papeletaEleccion.upsert).not.toHaveBeenCalled();

      convocatoria.enElectorado.mockResolvedValue(false);
      await expect(service.votar(YO, E, { abstencion: false, orden: ['c1'] })).rejects.toBeInstanceOf(ForbiddenException);

      convocatoria.enElectorado.mockResolvedValue(true);
      prisma.eleccion.findUnique.mockResolvedValue(eleccion());
      await expect(service.votar(YO, E, { abstencion: false, orden: ['c1'] })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.papeletaEleccion.upsert).not.toHaveBeenCalled();
    });

    it('«Rechazo a todas» y «Me abstengo» se guardan distinto', async () => {
      await service.votar(YO, E, { abstencion: false, orden: [] });
      await service.votar(YO, E, { abstencion: true, orden: [] });
      await service.votar(YO, E, { abstencion: false, orden: ['c2', 'c1'] });
      const datos = prisma.papeletaEleccion.upsert.mock.calls.map((c) => c[0].create);
      expect(datos[0]).toMatchObject({ abstencion: false, orden: [] });
      expect(datos[1]).toMatchObject({ abstencion: true, orden: [] });
      expect(datos[2]).toMatchObject({ abstencion: false, orden: ['c2', 'c1'] });
      expect(prisma.papeletaEleccion.upsert.mock.calls[0]![0].where).toEqual({
        eleccionId_profileId: { eleccionId: E, profileId: YO },
      });
      // Los votos no se auditan (como en las decisiones): la auditoría daría la participación exacta.
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  it('el detalle en votación da participación redondeada y nunca papeletas ni matrices', async () => {
    prisma.eleccion.findUnique.mockResolvedValue(
      eleccion({ fase: 'votacion', pairwiseMatrix: [[0, 3], [1, 0]], papeletasTotal: 4 }),
    );
    prisma.candidatura.findMany.mockResolvedValue([cand('c1', 'p1', 'Ana Ruiz'), cand('c2', 'p2', 'Luis Mora')]);
    prisma.papeletaEleccion.count.mockResolvedValue(12);
    const d = await service.detalle(YO, E);
    expect(d.participacionAprox).toBe(10);
    expect(d.resultado).toBeNull();
    expect(d.candidaturas).toHaveLength(2);
    expect(d.candidaturas[0]).not.toHaveProperty('profileId');
    expect(JSON.stringify(d)).not.toContain('pairwise');

    prisma.papeletaEleccion.count.mockResolvedValue(2);
    expect((await service.detalle(YO, E)).participacionAprox).toBe(5);

    // En candidaturas no hay participación.
    prisma.eleccion.findUnique.mockResolvedValue(eleccion());
    const c = await service.detalle(YO, E);
    expect(c.participacionAprox).toBeNull();
    expect(c.candidaturas[0]!.comunidades).toBe('Managua');
    expect(c.candidaturas[0]!.iniciales).toMatch(/^[A-Z]{2}$/);

    convocatoria.enElectorado.mockResolvedValue(false);
    await expect(service.detalle(YO, E)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el detalle contado da el resultado completo', async () => {
    prisma.eleccion.findUnique.mockResolvedValue(
      eleccion({
        fase: 'contada',
        puestos: 2,
        contadaAt: new Date(),
        miembros: 20,
        papeletasTotal: 10,
        abstenciones: 2,
        candidatasOrden: ['c1', 'c2', 'c3'],
        aprobaciones: [7, 5, 2],
        ordenFinal: ['c1', 'c2', 'c3'],
        electas: ['c1', 'c2'],
        pairwiseMatrix: [[0, 6, 7], [2, 0, 5], [1, 3, 0]],
        schulzeMatrix: [[0, 6, 7], [0, 0, 5], [0, 0, 0]],
        semilla: 'abc',
      }),
    );
    prisma.candidatura.findMany.mockResolvedValue([
      cand('c1', 'p1', 'Ana Ruiz'), cand('c2', 'p2', 'Luis Mora'), cand('c3', 'p3', 'Eva Paz'),
    ]);
    const d = await service.detalle(YO, E);
    expect(d.participacionAprox).toBeNull();
    const r = d.resultado!;
    expect(r.electas.map((x) => [x.candidaturaId, x.lugar])).toEqual([['c1', 1], ['c2', 2]]);
    expect(r.vacantes).toBe(0);
    expect(r.filas.map((f) => f.aprobacionesPct)).toEqual([90, 65, 25]);
    expect(r.duelos).toEqual([
      { gana: 'c1', pierde: 'c2', aFavor: 6, enContra: 2 },
      { gana: 'c2', pierde: 'c3', aFavor: 5, enContra: 3 },
    ]);
    expect(r.pairwiseMatrix).toEqual([[0, 6, 7], [2, 0, 5], [1, 3, 0]]);
    expect(r.semilla).toBe('abc');
  });

  it('el orden de las fichas es estable para una persona y distinto entre personas', async () => {
    const muchas = Array.from({ length: 8 }, (_, i) => cand(`c${i}`, `p${i}`, `Persona ${i}`));
    prisma.candidatura.findMany.mockResolvedValue(muchas);
    const orden = async (p: string) => (await service.detalle(p, E)).candidaturas.map((c) => c.id);
    const a1 = await orden('p-a');
    prisma.candidatura.findMany.mockResolvedValue([...muchas].reverse());
    const a2 = await orden('p-a');
    const b = await orden('p-b');
    expect(a1).toEqual(a2);
    expect(b).not.toEqual(a1);
    expect([...b].sort()).toEqual([...a1].sort());
  });

  it('ninguna respuesta incluye profileIds de quien votó', async () => {
    prisma.eleccion.findUnique.mockResolvedValue(eleccion({ fase: 'votacion' }));
    prisma.eleccion.findMany.mockResolvedValue([eleccion({ fase: 'votacion' })]);
    prisma.candidatura.findMany.mockResolvedValue([cand('c1', 'p1', 'Ana Ruiz')]);
    // Filas con dueño: si alguna vista copiara el profileId de una papeleta, aparecería v1 o v2.
    prisma.papeletaEleccion.findUnique.mockResolvedValue({ profileId: 'v1', abstencion: false, orden: ['c1'] });
    prisma.papeletaEleccion.findMany.mockResolvedValue([
      { eleccionId: E, profileId: 'v1', abstencion: false, orden: ['c1'] },
      { eleccionId: E, profileId: 'v2', abstencion: true, orden: [] },
    ]);
    prisma.papeletaEleccion.count.mockResolvedValue(7);
    const d = await service.detalle(YO, E);
    const l = await service.listar(YO);
    const texto = JSON.stringify([d, l]);
    for (const votante of ['v1', 'v2', YO]) expect(texto).not.toContain(votante);
    expect(texto).not.toContain('profileId');
    expect(d.miPapeleta).toEqual({ abstencion: false, orden: ['c1'] });
    expect(l[0]!.yaVote).toBe(true);
    // La papeleta propia se lee por su clave única; las demás nunca se leen con su dueño.
    expect(prisma.papeletaEleccion.findUnique.mock.calls[0]![0].where).toEqual({
      eleccionId_profileId: { eleccionId: E, profileId: YO },
    });
    expect(prisma.papeletaEleccion.findMany.mock.calls[0]![0].where).toMatchObject({ profileId: YO });
  });

  it('listar muestra abiertas y contadas recientes del electorado', async () => {
    prisma.eleccion.findMany.mockResolvedValue([eleccion(), eleccion({ id: 'e2', cargo: 'coordinador', groupId: 'g2', group: { id: 'g2', name: 'León' } })]);
    convocatoria.enElectorado.mockImplementation(async (_p: string, e: { groupId: string }) => e.groupId === GEN);
    const l = await service.listar(YO);
    expect(l.map((x) => x.id)).toEqual([E]);
    expect(l[0]).toMatchObject({ ambito: { id: GEN, nombre: 'Nicaragua Decide' }, puedoPresentarme: true, yaVote: false });
    const where = prisma.eleccion.findMany.mock.calls[0]![0].where;
    expect(where.OR[0]).toEqual({ fase: { in: ['candidaturas', 'votacion'] } });
    expect(where.OR[1].fase).toBe('contada');
  });

  it('representantes es público y no expone correos', async () => {
    const desde = new Date('2027-01-01T00:00:00Z');
    const hasta = new Date('2028-01-01T00:00:00Z');
    const prof = (n: string) => ({ displayName: n, user: { email: `${n}@correo.com` } });
    prisma.boardSeat.findMany.mockResolvedValue([
      { role: 'administrador', source: 'fundador', since: desde, profileId: 'p1', profile: prof('Ana Ruiz') },
      { role: 'secretario', source: 'eleccion', since: desde, profileId: 'p2', profile: prof('Luis Mora') },
    ]);
    prisma.cargo.findMany.mockResolvedValue([
      { tipo: 'secretario', groupId: GEN, profileId: 'p2', desde, hasta, enFunciones: false, profile: prof('Luis Mora') },
      { tipo: 'observador', groupId: GEN, profileId: 'p3', desde, hasta, enFunciones: false, profile: prof('Eva Paz') },
      { tipo: 'coordinador', groupId: 'g-leon', profileId: 'p4', desde, hasta, enFunciones: true, profile: prof('Juan Gil') },
    ]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g-leon', name: 'León', activadaAt: desde },
      { id: 'g-cr', name: 'Costa Rica', activadaAt: null },
    ]);
    prisma.eleccion.findMany.mockResolvedValue([{ groupId: 'g-cr' }]);
    const r = await service.representantes();

    expect(r.mesa).toEqual([
      { tipo: 'administrador', nombre: 'Ana Ruiz', iniciales: 'AR', desde: desde.toISOString(), hasta: null, enFunciones: true, fundador: true },
      { tipo: 'secretario', nombre: 'Luis Mora', iniciales: 'LM', desde: desde.toISOString(), hasta: hasta.toISOString(), enFunciones: false, fundador: false },
    ]);
    expect(r.observadores).toEqual([{ nombre: 'Eva Paz', iniciales: 'EP', desde: desde.toISOString(), hasta: hasta.toISOString() }]);
    expect(r.comunidades).toEqual([
      { id: 'g-leon', nombre: 'León', activa: true, eleccionAbierta: false, coordinadores: [
        { nombre: 'Juan Gil', iniciales: 'JG', desde: desde.toISOString(), hasta: hasta.toISOString(), enFunciones: true },
      ] },
      { id: 'g-cr', nombre: 'Costa Rica', activa: false, eleccionAbierta: true, coordinadores: [] },
    ]);
    expect(JSON.stringify(r)).not.toContain('@');
    // Sin guard: también para visitantes. El resto de elecciones pide sesión.
    expect(Reflect.getMetadata('__guards__', RepresentantesController)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', EleccionesController)).toHaveLength(1);
    // Solo comunidades territoriales; ningún select pide el correo.
    expect(prisma.group.findMany.mock.calls[0]![0].where.type).toEqual({ in: ['territorial_origin', 'territorial_residence'] });
    const selects = JSON.stringify([prisma.boardSeat.findMany.mock.calls, prisma.cargo.findMany.mock.calls]);
    expect(selects).not.toContain('email');
  });

  describe('DTO', () => {
    it('valida la ficha y la papeleta', async () => {
      const ok = plainToInstance(CandidaturaDto, { presentacion: '  Hola  ', compromisos: [' Uno '] });
      expect(await validate(ok)).toHaveLength(0);
      expect(ok.presentacion).toBe('Hola');
      expect(ok.compromisos).toEqual(['Uno']);
      const largo = plainToInstance(CandidaturaDto, { presentacion: 'x'.repeat(601), compromisos: ['a', 'b', 'c', 'd'] });
      expect((await validate(largo)).map((e) => e.property).sort()).toEqual(['compromisos', 'presentacion']);
      const compromisoLargo = plainToInstance(CandidaturaDto, { presentacion: 'Hola', compromisos: ['x'.repeat(141)] });
      expect(await validate(compromisoLargo)).toHaveLength(1);

      expect(await validate(plainToInstance(PapeletaEleccionDto, { abstencion: false, orden: [] }))).toHaveLength(0);
      expect(await validate(plainToInstance(PapeletaEleccionDto, { abstencion: 'no', orden: ['x'] }))).toHaveLength(2);
    });
  });
});
