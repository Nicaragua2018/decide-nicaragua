import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GruposService } from './grupos.service';
import { ProponerGrupoDto } from './dto/proponer-grupo.dto';
import { LlevarPropuestaDto } from './dto/llevar-propuesta.dto';

const YO = 'p-yo';
const AMBITO = '11111111-1111-4111-8111-111111111111';
const GT = 'g-trabajo';
const DIA_MS = 86_400_000;
const NOW = new Date('2026-11-10T12:00:00Z');

function ambito(over: Record<string, unknown> = {}) {
  return { id: AMBITO, name: 'Managua', slug: 'managua', type: 'territorial_origin', parentGroupId: null, ...over };
}

function trabajo(over: Record<string, unknown> = {}) {
  return {
    id: GT,
    name: 'Agua potable',
    slug: `trabajo-${GT}`,
    type: 'trabajo',
    parentGroupId: AMBITO,
    parent: ambito(),
    trabajoTipo: 'subgrupo',
    trabajoEstado: 'convocando',
    proposito: 'Conseguir agua potable para los barrios del norte.',
    convocatoriaEndsAt: new Date('2026-11-20T00:00:00Z'),
    pocosMiembrosDesde: null,
    creadoPorProfileId: YO,
    ...over,
  };
}

function buildTx() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: GT }]),
    group: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    groupMembership: {
      upsert: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn(),
    },
    forum: { create: vi.fn().mockResolvedValue({ id: 'f1' }), findFirst: vi.fn().mockResolvedValue(null) },
    proposal: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    decision: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    inquietud: { create: vi.fn().mockResolvedValue({ id: 'inq-1' }) },
  };
}

function buildPrisma(tx: ReturnType<typeof buildTx>) {
  return {
    group: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    groupMembership: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(1) },
    forum: { findFirst: vi.fn().mockResolvedValue(null) },
    profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u-yo' }) },
    solucion: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    comisionInforme: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
}

describe('GruposService', () => {
  let tx: ReturnType<typeof buildTx>;
  let prisma: ReturnType<typeof buildPrisma>;
  let access: {
    isParticipant: ReturnType<typeof vi.fn>;
    requireReader: ReturnType<typeof vi.fn>;
    requireParticipant: ReturnType<typeof vi.fn>;
    requireMember: ReturnType<typeof vi.fn>;
    canRead: ReturnType<typeof vi.fn>;
    esReservado: ReturnType<typeof vi.fn>;
  };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let comisiones: { vista: ReturnType<typeof vi.fn> };
  let bifurcaciones: {
    vista: ReturnType<typeof vi.fn>;
    elegible: ReturnType<typeof vi.fn>;
    puedePausarEn: ReturnType<typeof vi.fn>;
  };
  let service: GruposService;
  /** Miembros por grupo, para las comprobaciones de membresía. */
  let miembroDe: Set<string>;

  beforeEach(() => {
    tx = buildTx();
    prisma = buildPrisma(tx);
    miembroDe = new Set([AMBITO]);
    access = {
      isParticipant: vi.fn(async (groupId: string) => miembroDe.has(groupId)),
      requireReader: vi.fn().mockResolvedValue({ participa: true }),
      requireParticipant: vi.fn(async (groupId: string) => {
        if (!miembroDe.has(groupId)) throw new ForbiddenException('No participa.');
      }),
      requireMember: vi.fn(async (groupId: string) => {
        if (!miembroDe.has(groupId)) throw new ForbiddenException('No participa.');
      }),
      canRead: vi.fn().mockResolvedValue(true),
      esReservado: vi.fn().mockResolvedValue(false),
    };
    rules = { getInt: vi.fn(async (key: string) => (key === 'subgrupo.minimo_personas' ? 5 : 14)) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    comisiones = { vista: vi.fn().mockResolvedValue({ tarea: 'vista de la comisión' }) };
    bifurcaciones = {
      vista: vi.fn().mockResolvedValue({ solucionTitulo: 'vista de la bifurcación' }),
      elegible: vi.fn().mockResolvedValue(false),
      puedePausarEn: vi.fn().mockResolvedValue(false),
    };
    service = new GruposService(
      prisma as never,
      access as never,
      rules as never,
      audit as never,
      comisiones as never,
      bifurcaciones as never,
    );
    prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === AMBITO ? ambito() : trabajo(),
    );
    prisma.groupMembership.findMany.mockResolvedValue([]);
  });

  const acciones = () => audit.log.mock.calls.map((c) => (c[0] as { action: string }).action);

  describe('proponer', () => {
    const dto = { ambitoId: AMBITO, name: 'Agua potable', proposito: 'Conseguir agua potable para los barrios del norte.' };

    it('exige ser miembro del ámbito', async () => {
      miembroDe.clear();
      await expect(service.proponer(YO, dto, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.group.create).not.toHaveBeenCalled();
    });

    it('rechaza con 400 un ámbito que es un grupo de trabajo', async () => {
      prisma.group.findUnique.mockResolvedValue(trabajo({ id: AMBITO }));
      await expect(service.proponer(YO, dto, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.group.create).not.toHaveBeenCalled();
    });

    it('rechaza con 400 un grupo custom que no es el nivel general', async () => {
      prisma.group.findUnique.mockResolvedValue(ambito({ type: 'custom', slug: 'otro' }));
      await expect(service.proponer(YO, dto, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 si el ámbito no existe', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      await expect(service.proponer(YO, dto, '1.1.1.1', NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crea el subgrupo convocando, con quien propone como primer miembro y el plazo del ámbito', async () => {
      tx.group.create.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
      const res = await service.proponer(YO, dto, '1.1.1.1', NOW);
      const data = tx.group.create.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data).toMatchObject({
        name: 'Agua potable',
        type: 'trabajo',
        parentGroupId: AMBITO,
        trabajoTipo: 'subgrupo',
        trabajoEstado: 'convocando',
        proposito: dto.proposito,
        creadoPorProfileId: YO,
        convocatoriaEndsAt: new Date(NOW.getTime() + 14 * DIA_MS),
      });
      expect(data['slug']).toBe(`trabajo-${data['id'] as string}`);
      expect(res).toEqual({ id: data['id'] });
      expect(rules.getInt).toHaveBeenCalledWith('subgrupo.plazo_dias', AMBITO);
      expect(tx.groupMembership.create).toHaveBeenCalledWith({ data: { groupId: data['id'], profileId: YO } });
      expect(acciones()).toEqual(['grupo.proposed']);
      expect(audit.log.mock.calls[0]![0].metadata).toEqual({ grupoId: data['id'] });
    });
  });

  describe('entrar', () => {
    beforeEach(() => {
      tx.group.findUnique.mockResolvedValue(trabajo());
    });

    it('exige ser miembro del ámbito', async () => {
      miembroDe.clear();
      await expect(service.entrar(YO, GT, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.groupMembership.upsert).not.toHaveBeenCalled();
    });

    it('quien no puede leer un subgrupo recibe el mismo 403 de lectura, sin transacción', async () => {
      access.requireReader.mockRejectedValue(new ForbiddenException('x'));
      const e = await service.entrar(YO, GT, '1.1.1.1', NOW).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).message).toBe('x');
      expect(access.requireReader).toHaveBeenCalledWith(GT, YO);
      // Solo se mira si es una bifurcación (a la que se entra por elegibilidad, no por lectura).
      expect(bifurcaciones.elegible).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un id que no es de un grupo de trabajo es 403, como en el detalle', async () => {
      prisma.group.findUnique.mockResolvedValue(ambito());
      await expect(service.entrar(YO, AMBITO, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no se entra a un archivado (409)', async () => {
      prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === AMBITO ? ambito() : trabajo({ trabajoEstado: 'archivado' }),
      );
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: 'archivado' }));
      await expect(service.entrar(YO, GT, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.groupMembership.upsert).not.toHaveBeenCalled();
    });

    it('lee el estado con la fila bloqueada: si se archivó mientras esperaba, 409', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: 'archivado' }));
      await expect(service.entrar(YO, GT, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.groupMembership.upsert).not.toHaveBeenCalled();
    });

    it('con cuatro miembros sigue convocando y no crea foro', async () => {
      tx.groupMembership.count.mockResolvedValue(4);
      await service.entrar(YO, GT, '1.1.1.1', NOW);
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.groupMembership.upsert).toHaveBeenCalled();
      expect(tx.group.updateMany).not.toHaveBeenCalled();
      expect(tx.forum.create).not.toHaveBeenCalled();
      expect(acciones()).toEqual(['grupo.joined']);
    });

    it('nace con el quinto miembro: pasa a activo, crea su foro y audita una vez', async () => {
      tx.groupMembership.count.mockResolvedValue(5);
      await service.entrar(YO, GT, '1.1.1.1', NOW);
      expect(rules.getInt).toHaveBeenCalledWith('subgrupo.minimo_personas', AMBITO);
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: GT, trabajoEstado: 'convocando' },
        data: { trabajoEstado: 'activo', convocatoriaEndsAt: null },
      });
      expect(tx.forum.create).toHaveBeenCalledWith({ data: { groupId: GT, title: 'Agua potable', isDefault: true } });
      expect(acciones().sort()).toEqual(['grupo.activated', 'grupo.joined']);
      expect(audit.log.mock.calls.every((c) => JSON.stringify(c[0].metadata) === JSON.stringify({ grupoId: GT }))).toBe(true);
    });

    it('si ya existe un foro por defecto, la activación no crea otro', async () => {
      tx.groupMembership.count.mockResolvedValue(5);
      tx.forum.findFirst.mockResolvedValue({ id: 'f-previo' });
      await service.entrar(YO, GT, '1.1.1.1', NOW);
      expect(tx.forum.findFirst).toHaveBeenCalledWith({ where: { groupId: GT, isDefault: true }, select: { id: true } });
      expect(tx.forum.create).not.toHaveBeenCalled();
      expect(acciones().sort()).toEqual(['grupo.activated', 'grupo.joined']);
    });

    it('con la convocatoria vencida da 409 con el mensaje exacto y no entra', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo({ convocatoriaEndsAt: new Date(NOW.getTime() - 1) }));
      const err = await service.entrar(YO, GT, '1.1.1.1', NOW).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe('La convocatoria de este grupo ya venció.');
      expect(tx.groupMembership.upsert).not.toHaveBeenCalled();
      tx.group.findUnique.mockResolvedValue(trabajo({ convocatoriaEndsAt: NOW }));
      await expect(service.entrar(YO, GT, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ConflictException);
    });

    it('dos que entran a la vez activan una sola vez', async () => {
      tx.groupMembership.count.mockResolvedValueOnce(5).mockResolvedValueOnce(6);
      tx.group.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await service.entrar(YO, GT, '1.1.1.1', NOW);
      await service.entrar('p-otra', GT, '1.1.1.1', NOW);
      expect(tx.forum.create).toHaveBeenCalledTimes(1);
      expect(acciones().filter((a) => a === 'grupo.activated')).toHaveLength(1);
      expect(acciones().filter((a) => a === 'grupo.joined')).toHaveLength(2);
    });

    it('quien ya es miembro no se vuelve a auditar', async () => {
      tx.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
      tx.groupMembership.count.mockResolvedValue(3);
      await service.entrar(YO, GT, '1.1.1.1', NOW);
      expect(acciones()).toEqual([]);
    });

    it('un activo con pocos miembros que vuelve a tener 3 limpia pocosMiembrosDesde', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: 'activo', convocatoriaEndsAt: null, pocosMiembrosDesde: NOW }));
      tx.groupMembership.count.mockResolvedValue(3);
      await service.entrar(YO, GT, '1.1.1.1', NOW);
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: GT, trabajoEstado: 'activo' },
        data: { pocosMiembrosDesde: null },
      });
      expect(tx.forum.create).not.toHaveBeenCalled();
    });

    it('un activo con pocos miembros que sigue con 2 no lo limpia', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: 'activo', convocatoriaEndsAt: null, pocosMiembrosDesde: NOW }));
      tx.groupMembership.count.mockResolvedValue(2);
      await service.entrar(YO, GT, '1.1.1.1', NOW);
      expect(tx.group.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('salir', () => {
    beforeEach(() => {
      miembroDe.add(GT);
    });

    it('quien no es del subgrupo ni del ámbito recibe 403 y no se borra ni devuelve nada', async () => {
      access.requireReader.mockRejectedValue(new ForbiddenException('x'));
      await expect(service.salir('p-ajena', GT, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(access.requireReader).toHaveBeenCalledWith(GT, 'p-ajena');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.groupMembership.deleteMany).not.toHaveBeenCalled();
      expect(prisma.group.findUnique).not.toHaveBeenCalled();
      expect(acciones()).toEqual([]);
    });

    it('un id que no es de un grupo de trabajo es 403', async () => {
      prisma.group.findUnique.mockResolvedValue(ambito());
      await expect(service.salir(YO, AMBITO, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.groupMembership.deleteMany).not.toHaveBeenCalled();
    });

    it('borra la membresía y audita', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo());
      tx.groupMembership.count.mockResolvedValue(3);
      await service.salir(YO, GT, '1.1.1.1', NOW);
      expect(tx.groupMembership.deleteMany).toHaveBeenCalledWith({ where: { groupId: GT, profileId: YO } });
      expect(tx.group.updateMany).not.toHaveBeenCalled();
      expect(acciones()).toEqual(['grupo.left']);
    });

    it('un activo que queda con menos de 3 marca pocosMiembrosDesde', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: 'activo', convocatoriaEndsAt: null }));
      tx.groupMembership.count.mockResolvedValue(2);
      await service.salir(YO, GT, '1.1.1.1', NOW);
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: GT, trabajoEstado: 'activo', pocosMiembrosDesde: null },
        data: { pocosMiembrosDesde: NOW },
      });
    });

    it('si ya tenía pocosMiembrosDesde no lo reinicia', async () => {
      tx.group.findUnique.mockResolvedValue(
        trabajo({ trabajoEstado: 'activo', convocatoriaEndsAt: null, pocosMiembrosDesde: new Date('2026-11-01T00:00:00Z') }),
      );
      tx.groupMembership.count.mockResolvedValue(1);
      await service.salir(YO, GT, '1.1.1.1', NOW);
      expect(tx.group.updateMany).not.toHaveBeenCalled();
    });

    it('un convocando que queda sin miembros se archiva', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo());
      tx.groupMembership.count.mockResolvedValue(0);
      await service.salir(YO, GT, '1.1.1.1', NOW);
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: GT, trabajoEstado: 'convocando' },
        data: { trabajoEstado: 'archivado' },
      });
      expect(acciones().sort()).toEqual(['grupo.archived', 'grupo.left']);
    });

    it('quien no era miembro no audita nada', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo());
      tx.groupMembership.deleteMany.mockResolvedValue({ count: 0 });
      tx.groupMembership.count.mockResolvedValue(3);
      await service.salir(YO, GT, '1.1.1.1', NOW);
      expect(acciones()).toEqual([]);
    });
  });

  describe('comisiones en entrar, salir y plazos', () => {
    it('a una comisión no se entra (400)', async () => {
      prisma.group.findUnique.mockResolvedValue(trabajo({ trabajoTipo: 'comision' }));
      await expect(service.entrar(YO, GT, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('salir de una comisión convocando no la archiva', async () => {
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoTipo: 'comision' }));
      tx.groupMembership.deleteMany.mockResolvedValue({ count: 0 });
      tx.groupMembership.count.mockResolvedValue(0);
      await service.salir(YO, GT, '1.1.1.1', NOW);
      expect(tx.group.updateMany).not.toHaveBeenCalled();
      expect(acciones()).toEqual([]);
    });

    it('salir de la comisión de una bifurcación (reservada) se audita sin actor ni ip', async () => {
      access.esReservado.mockResolvedValue(true);
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoTipo: 'comision', trabajoEstado: 'activo' }));
      await service.salir(YO, GT, '1.1.1.1', NOW);
      expect(acciones()).toEqual(['grupo.left']);
      expect(audit.log.mock.calls[0]![0]).not.toHaveProperty('actorId');
      expect(audit.log.mock.calls[0]![0]).not.toHaveProperty('ip');
    });

    it('los plazos de subgrupos dejan fuera a las comisiones (filtro positivo, sin depender de NULL)', async () => {
      await service.processDeadlines(NOW);
      for (const call of prisma.group.findMany.mock.calls) {
        expect(call[0].where).toMatchObject({ trabajoTipo: { in: ['subgrupo', 'bifurcacion'] } });
      }
      expect(prisma.group.findMany).toHaveBeenCalledTimes(3);
    });

    it('la lista trae el último informe no oculto de cada comisión, en una sola consulta', async () => {
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['profileId'] && !where['groupId'] ? [{ groupId: AMBITO, group: ambito() }] : [],
      );
      prisma.group.findMany.mockResolvedValue([
        { ...trabajo({ id: 'g-com', trabajoTipo: 'comision', trabajoEstado: 'activo' }), _count: { memberships: 3 } },
        { ...trabajo({ id: 'g-com2', trabajoTipo: 'comision', trabajoEstado: 'activo' }), _count: { memberships: 3 } },
        { ...trabajo(), _count: { memberships: 2 } },
      ]);
      const fecha = new Date('2026-11-09T00:00:00Z');
      (prisma as Record<string, unknown>)['comisionInforme'] = {
        findMany: vi.fn().mockResolvedValue([{ grupoId: 'g-com', texto: 'Compramos la tubería.', createdAt: fecha }]),
      };
      const res = await service.list(YO);
      const [c1, c2, sub] = res.ambitos[0]!.grupos;
      expect(c1!.ultimoInforme).toEqual({ texto: 'Compramos la tubería.', createdAt: fecha.toISOString() });
      expect(c2!.ultimoInforme).toBeNull();
      expect(sub!.ultimoInforme).toBeNull();
      const consulta = (prisma as unknown as { comisionInforme: { findMany: ReturnType<typeof vi.fn> } }).comisionInforme.findMany;
      expect(consulta).toHaveBeenCalledTimes(1);
      expect(consulta.mock.calls[0]![0]).toMatchObject({
        where: { grupoId: { in: ['g-com', 'g-com2'] }, hidden: false },
        orderBy: { createdAt: 'desc' },
        distinct: ['grupoId'],
      });
    });

    it('I4: con la solución de origen oculta, la comisión no repite su título en la lista ni en el detalle', async () => {
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['profileId'] && !where['groupId'] ? [{ groupId: AMBITO, group: ambito() }] : [],
      );
      const com = trabajo({
        trabajoTipo: 'comision',
        name: 'Comisión: Agua potable',
        proposito: 'Agua potable para el norte.',
        tarea: 'Agua potable para el norte.',
        origenSolucionId: 's-oculta',
      });
      prisma.group.findMany.mockResolvedValue([{ ...com, _count: { memberships: 0 } }]);
      prisma.solucion.findMany.mockResolvedValue([{ id: 's-oculta' }]);
      const res = await service.list(YO);
      expect(res.ambitos[0]!.grupos[0]).toMatchObject({
        name: 'Comisión: Solución oculta por moderación',
        proposito: 'Solución oculta por moderación',
      });
      expect(JSON.stringify(res)).not.toContain('Agua potable');

      prisma.group.findUnique.mockResolvedValue({ ...com, parent: ambito() });
      const d = await service.detail(YO, GT);
      expect(d.name).toBe('Comisión: Solución oculta por moderación');
      expect(comisiones.vista).toHaveBeenCalledWith(
        expect.objectContaining({ tarea: 'Solución oculta por moderación', proposito: 'Solución oculta por moderación' }),
        YO,
        true,
      );
    });

    it('si esReservado falla tras salir, se audita sin actor ni ip y no hay 500', async () => {
      access.esReservado.mockRejectedValue(new Error('caída'));
      tx.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: 'activo' }));
      tx.groupMembership.count.mockResolvedValue(5);
      await expect(service.salir(YO, GT, '1.1.1.1', NOW)).resolves.toBeDefined();
      expect(acciones()).toEqual(['grupo.left']);
      expect(audit.log.mock.calls[0]![0]).not.toHaveProperty('actorId');
      expect(audit.log.mock.calls[0]![0]).not.toHaveProperty('ip');
    });
  });

  describe('processDeadlines', () => {
    it('archiva al vencer la convocatoria sin el mínimo', async () => {
      prisma.group.findMany.mockResolvedValueOnce([{ id: GT }]).mockResolvedValueOnce([]);
      const n = await service.processDeadlines(NOW);
      expect(n).toBe(1);
      expect(prisma.group.findMany.mock.calls[0]![0].where).toMatchObject({
        type: 'trabajo',
        trabajoEstado: 'convocando',
        convocatoriaEndsAt: { lte: NOW },
      });
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: GT, trabajoEstado: 'convocando', convocatoriaEndsAt: { lte: NOW } },
        data: { trabajoEstado: 'archivado' },
      });
      expect(acciones()).toEqual(['grupo.archived']);
      expect(audit.log.mock.calls[0]![0].metadata).toEqual({ grupoId: GT });
    });

    it('archiva tras 30 días con menos de 3 y cierra sus temas y decisiones activas', async () => {
      const limite = new Date(NOW.getTime() - 30 * DIA_MS);
      prisma.group.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: GT }]);
      const n = await service.processDeadlines(NOW);
      expect(n).toBe(1);
      expect(prisma.group.findMany.mock.calls[1]![0].where).toMatchObject({
        type: 'trabajo',
        trabajoEstado: 'activo',
        pocosMiembrosDesde: { lte: limite },
      });
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: GT, trabajoEstado: 'activo', pocosMiembrosDesde: { lte: limite } },
        data: { trabajoEstado: 'archivado' },
      });
      expect(tx.decision.updateMany).toHaveBeenCalledWith({
        where: { proposal: { groupId: GT }, fase: { in: ['modo', 'objecion', 'votacion'] } },
        data: { fase: 'cancelada' },
      });
      expect(tx.proposal.updateMany).toHaveBeenCalledWith({
        where: { groupId: GT, status: 'open' },
        data: { status: 'closed', closedAt: NOW },
      });
    });

    it('marca pocosMiembrosDesde en los activos que quedaron con menos de 3 (p. ej., por suspensiones)', async () => {
      prisma.group.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: GT, _count: { memberships: 2 } },
          { id: 'g-lleno', _count: { memberships: 3 } },
        ]);
      const n = await service.processDeadlines(NOW);
      expect(n).toBe(0);
      expect(prisma.group.findMany.mock.calls[2]![0].where).toEqual({
        type: 'trabajo',
        trabajoTipo: { in: ['subgrupo', 'bifurcacion'] },
        trabajoEstado: 'activo',
        pocosMiembrosDesde: null,
      });
      expect(prisma.group.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: GT, trabajoEstado: 'activo', pocosMiembrosDesde: null },
        data: { pocosMiembrosDesde: NOW },
      });
    });

    it('si otro proceso ya lo cambió (count 0), no audita ni cierra nada', async () => {
      prisma.group.findMany.mockResolvedValueOnce([{ id: GT }]).mockResolvedValueOnce([]);
      tx.group.updateMany.mockResolvedValue({ count: 0 });
      const n = await service.processDeadlines(NOW);
      expect(n).toBe(0);
      expect(tx.proposal.updateMany).not.toHaveBeenCalled();
      expect(tx.decision.updateMany).not.toHaveBeenCalled();
      expect(acciones()).toEqual([]);
    });
  });

  describe('llevar a la comunidad', () => {
    const SOL = 's-ganadora';
    const solucion = (over: Record<string, unknown> = {}) => ({
      id: SOL,
      proposalId: 't-sub',
      title: 'Pozo comunitario en el barrio norte',
      description: 'Perforar un pozo y organizar turnos de mantenimiento.',
      hidden: false,
      mergedIntoId: null,
      proposal: { id: 't-sub', groupId: GT, hidden: false, decision: { fase: 'contada', resultado: 'aprobada', ganadoras: [SOL] } },
      ...over,
    });

    beforeEach(() => {
      miembroDe.add(GT);
      prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === AMBITO ? ambito() : trabajo({ trabajoEstado: 'activo', convocatoriaEndsAt: null }),
      );
      prisma.solucion.findUnique.mockResolvedValue(solucion());
      rules.getInt.mockImplementation(async (key: string) => (key === 'inquietud.plazo_respuesta_dias' ? 10 : 5));
    });

    it('lleva una ganadora real: la inquietud nace en el ámbito, en plazo y con el texto exacto', async () => {
      const res = await service.llevar(YO, GT, SOL, '1.1.1.1', NOW);
      expect(res).toEqual({ inquietudId: 'inq-1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const data = tx.inquietud.create.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data).toEqual({
        groupId: AMBITO,
        authorProfileId: YO,
        title: 'Pozo comunitario en el barrio norte',
        body: 'Propuesta del grupo de trabajo Agua potable.\n\nPerforar un pozo y organizar turnos de mantenimiento.',
        status: 'en_plazo',
        thresholdReachedAt: NOW,
        deadlineAt: new Date(NOW.getTime() + 10 * DIA_MS),
        origenSolucionId: SOL,
      });
      expect(rules.getInt).toHaveBeenCalledWith('inquietud.plazo_respuesta_dias', AMBITO);
      expect(acciones()).toEqual(['grupo.propuesta_llevada']);
      expect(audit.log.mock.calls[0]![0].metadata).toEqual({ grupoId: GT, inquietudId: 'inq-1' });
    });

    it('corta el cuerpo a 2000 caracteres', async () => {
      prisma.solucion.findUnique.mockResolvedValue(solucion({ description: 'x'.repeat(3000) }));
      await service.llevar(YO, GT, SOL, '1.1.1.1', NOW);
      const body = (tx.inquietud.create.mock.calls[0]![0].data as { body: string }).body;
      expect(body).toHaveLength(2000);
      expect(body.startsWith('Propuesta del grupo de trabajo Agua potable.\n\nxxx')).toBe(true);
    });

    it('una solución que no está entre las ganadoras da 400', async () => {
      prisma.solucion.findUnique.mockResolvedValue(
        solucion({ proposal: { id: 't-sub', groupId: GT, decision: { fase: 'contada', resultado: 'aprobada', ganadoras: ['otra'] } } }),
      );
      await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.inquietud.create).not.toHaveBeenCalled();
    });

    it('una decisión que no está contada y aprobada da 400', async () => {
      for (const decision of [
        { fase: 'votacion', resultado: null, ganadoras: [SOL] },
        { fase: 'contada', resultado: 'empate', ganadoras: [SOL] },
        null,
      ]) {
        prisma.solucion.findUnique.mockResolvedValue(solucion({ proposal: { id: 't-sub', groupId: GT, decision } }));
        await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(tx.inquietud.create).not.toHaveBeenCalled();
    });

    it('una solución de otro grupo da 400', async () => {
      prisma.solucion.findUnique.mockResolvedValue(
        solucion({ proposal: { id: 't-otro', groupId: 'g-otro', decision: { fase: 'contada', resultado: 'aprobada', ganadoras: [SOL] } } }),
      );
      await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.inquietud.create).not.toHaveBeenCalled();
    });

    it('una solución que no existe da 400', async () => {
      prisma.solucion.findUnique.mockResolvedValue(null);
      await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('una solución oculta da 400', async () => {
      prisma.solucion.findUnique.mockResolvedValue(solucion({ hidden: true }));
      await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.inquietud.create).not.toHaveBeenCalled();
    });

    it('la segunda vez da 409 con el mensaje exacto y sin auditar', async () => {
      tx.inquietud.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['origenSolucionId'] } }),
      );
      const err = await service.llevar(YO, GT, SOL, '1.1.1.1', NOW).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toBe('Esta propuesta ya se llevó a la comunidad.');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('desde un subgrupo archivado (o que no está activo) da 409', async () => {
      for (const estado of ['archivado', 'cerrado', 'convocando', 'pausado']) {
        prisma.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: estado }));
        await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ConflictException);
      }
      expect(tx.inquietud.create).not.toHaveBeenCalled();
    });

    it('quien solo lee (miembro del ámbito, no del subgrupo) recibe 403', async () => {
      miembroDe.delete(GT);
      await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(access.requireMember).toHaveBeenCalledWith(GT, YO);
      expect(tx.inquietud.create).not.toHaveBeenCalled();
    });

    it('un tema oculto por moderación da 400 con el mensaje exacto', async () => {
      prisma.solucion.findUnique.mockResolvedValue(
        solucion({ proposal: { id: 't-sub', groupId: GT, hidden: true, decision: { fase: 'contada', resultado: 'aprobada', ganadoras: [SOL] } } }),
      );
      const err = await service.llevar(YO, GT, SOL, '1.1.1.1', NOW).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toBe('Este tema está oculto por moderación.');
      expect(tx.inquietud.create).not.toHaveBeenCalled();
      const select = prisma.solucion.findUnique.mock.calls[0]![0].select as { proposal: { select: Record<string, unknown> } };
      expect(select.proposal.select.hidden).toBe(true);
    });

    it('quien ya no es miembro de la comunidad no la lleva (403)', async () => {
      miembroDe.delete(AMBITO);
      const err = await service.llevar(YO, GT, SOL, '1.1.1.1', NOW).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe('Solo los miembros de la comunidad pueden llevar propuestas a ella.');
      expect(tx.inquietud.create).not.toHaveBeenCalled();
    });

    it('el 409 de no activo es el propio de llevar', async () => {
      prisma.group.findUnique.mockResolvedValue(trabajo({ trabajoEstado: 'pausado' }));
      const err = await service.llevar(YO, GT, SOL, '1.1.1.1', NOW).catch((e: unknown) => e);
      expect((err as ConflictException).message).toBe('Solo un grupo de trabajo activo puede llevar propuestas a la comunidad.');
    });

    it('quien no lee el grupo recibe 403 antes de cualquier consulta', async () => {
      access.requireReader.mockRejectedValue(new ForbiddenException('x'));
      await expect(service.llevar(YO, GT, SOL, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.group.findUnique).not.toHaveBeenCalled();
      expect(prisma.solucion.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('lecturas', () => {
    it('lista los ámbitos en orden origen, acogida y general, con sus grupos no archivados', async () => {
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['profileId'] && !where['groupId']
          ? [
              { groupId: 'gen', group: { id: 'gen', name: 'General', slug: 'general', type: 'custom' } },
              { groupId: 'aco', group: { id: 'aco', name: 'Costa Rica', slug: 'country-cr', type: 'territorial_residence' } },
              { groupId: AMBITO, group: ambito() },
              { groupId: 'otro', group: { id: 'otro', name: 'Otro', slug: 'otro', type: 'custom' } },
            ]
          : [{ groupId: GT }],
      );
      prisma.group.findMany.mockResolvedValue([
        { ...trabajo(), _count: { memberships: 2 } },
        { ...trabajo({ id: 'g2', parentGroupId: 'aco', trabajoEstado: 'activo', convocatoriaEndsAt: null }), _count: { memberships: 7 } },
      ]);
      const res = await service.list(YO);
      expect(res.ambitos.map((a) => a.tipo)).toEqual(['origen', 'acogida', 'general']);
      const where = prisma.group.findMany.mock.calls[0]![0].where;
      expect(where).toMatchObject({ type: 'trabajo', trabajoEstado: { not: 'archivado' } });
      const origen = res.ambitos[0]!;
      expect(origen.grupos).toEqual([
        expect.objectContaining({ id: GT, miembros: 2, faltan: 3, soyMiembro: true, estado: 'convocando' }),
      ]);
      expect(res.ambitos[1]!.grupos).toEqual([expect.objectContaining({ id: 'g2', faltan: null, soyMiembro: false })]);
      expect(res.ambitos[2]!.grupos).toEqual([]);
    });

    it('el detalle exige poder leer y calcula las banderas', async () => {
      prisma.group.findUnique.mockResolvedValue({ ...trabajo(), parent: ambito() });
      prisma.groupMembership.findMany.mockResolvedValue([
        { profile: { displayName: 'Zoe' } },
        { profile: { displayName: 'Ana' } },
      ]);
      prisma.groupMembership.count.mockResolvedValue(2);
      const d = await service.detail(YO, GT);
      expect(access.requireReader).toHaveBeenCalledWith(GT, YO);
      expect(d).toMatchObject({
        id: GT,
        ambito: { id: AMBITO, name: 'Managua', tipo: 'origen' },
        miembrosNombres: ['Ana', 'Zoe'],
        forumId: null,
        puedoEntrar: true,
        puedoSalir: false,
        faltan: 3,
        soyMiembro: false,
      });
    });

    it('el detalle de una comisión trae su vista y no ofrece entrar', async () => {
      const g = { ...trabajo({ trabajoTipo: 'comision' }), parent: ambito() };
      prisma.group.findUnique.mockResolvedValue(g);
      const d = await service.detail(YO, GT);
      expect(comisiones.vista).toHaveBeenCalledWith(g, YO, true);
      expect(d.comision).toEqual({ tarea: 'vista de la comisión' });
      expect(d.puedoEntrar).toBe(false);
      expect(d.faltan).toBeNull();
    });

    it('el detalle de un subgrupo no trae vista de comisión', async () => {
      prisma.group.findUnique.mockResolvedValue({ ...trabajo(), parent: ambito() });
      const d = await service.detail(YO, GT);
      expect(d.comision).toBeNull();
      expect(comisiones.vista).not.toHaveBeenCalled();
    });

    it('el detalle de un grupo que no es de trabajo es 404', async () => {
      prisma.group.findUnique.mockResolvedValue(ambito());
      await expect(service.detail(YO, AMBITO)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('bifurcaciones', () => {
    const BIF = 'g-bif';
    const S = 's-origen';
    const OTRA = 'p-otra-persona';
    const NO_ELEGIBLE = 'Solo quienes apoyaron esta solución pueden sumarse.';
    const bif = (over: Record<string, unknown> = {}) =>
      trabajo({
        id: BIF,
        name: 'Iniciativa de un grupo',
        slug: `trabajo-${BIF}`,
        trabajoTipo: 'bifurcacion',
        proposito: 'Huerto comunitario',
        origenSolucionId: S,
        creadoPorProfileId: null,
        ...over,
      });

    beforeEach(() => {
      rules.getInt.mockImplementation(async (key: string) =>
        key === 'bifurcacion.minimo_personas' ? 7 : key === 'subgrupo.minimo_personas' ? 5 : 10,
      );
      prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === AMBITO ? ambito() : { ...bif(), parent: ambito() },
      );
      tx.group.findUnique.mockResolvedValue(bif());
      // Si alguien pidiera los nombres de los miembros, aparecerían: las pruebas buscan que no.
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['groupId'] === BIF ? [{ profileId: OTRA, profile: { displayName: 'Zoe Secreta' } }] : [],
      );
    });

    it('quien no la lee pero la apoyó entra; nace con bifurcacion.minimo_personas y no se audita quién entró', async () => {
      access.requireReader.mockRejectedValueOnce(new ForbiddenException('No lee.'));
      bifurcaciones.elegible.mockResolvedValue(true);
      tx.groupMembership.count.mockResolvedValue(7);
      const d = await service.entrar(YO, BIF, '1.1.1.1', NOW);
      expect(rules.getInt).toHaveBeenCalledWith('bifurcacion.minimo_personas', AMBITO);
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: BIF, trabajoEstado: 'convocando' },
        data: { trabajoEstado: 'activo', convocatoriaEndsAt: null },
      });
      expect(acciones()).toEqual(['bifurcacion.activated']);
      expect(audit.log.mock.calls[0]![0]).not.toHaveProperty('actorId');
      expect(audit.log.mock.calls[0]![0].metadata).toEqual({ grupoId: BIF });
      expect(d.miembrosNombres).toEqual([]);
      expect(JSON.stringify(d)).not.toContain(OTRA);
      expect(JSON.stringify(d)).not.toContain('Zoe');
    });

    it('con seis sigue convocando y sumarse no deja rastro en la auditoría', async () => {
      access.requireReader.mockRejectedValueOnce(new ForbiddenException('No lee.'));
      bifurcaciones.elegible.mockResolvedValue(true);
      tx.groupMembership.count.mockResolvedValue(6);
      await service.entrar(YO, BIF, '1.1.1.1', NOW);
      expect(tx.group.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('quien no es elegible recibe siempre el mismo 403, sin entrar', async () => {
      access.requireReader.mockRejectedValue(new ForbiddenException('No lee.'));
      const e1 = await service.entrar(YO, BIF, '1.1.1.1', NOW).catch((x: unknown) => x);
      miembroDe.clear();
      const e2 = await service.entrar('p-ajena', BIF, '1.1.1.1', NOW).catch((x: unknown) => x);
      for (const e of [e1, e2]) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).message).toBe(NO_ELEGIBLE);
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('salir de una bifurcación no se audita', async () => {
      miembroDe.add(BIF);
      tx.groupMembership.count.mockResolvedValue(4);
      tx.group.findUnique.mockResolvedValue(bif({ trabajoEstado: 'activo', convocatoriaEndsAt: null }));
      access.canRead.mockResolvedValue(false);
      const d = await service.salir(YO, BIF, '1.1.1.1', NOW);
      expect(tx.groupMembership.deleteMany).toHaveBeenCalled();
      expect(acciones()).toEqual([]);
      expect(JSON.stringify(d)).not.toContain(OTRA);
    });

    it('el detalle trae la vista de bifurcación, sin nombres ni ids de los miembros', async () => {
      miembroDe.add(BIF);
      const d = await service.detail(YO, BIF);
      expect(bifurcaciones.vista).toHaveBeenCalledWith(expect.objectContaining({ id: BIF }), YO, true, true);
      expect(d.bifurcacion).toEqual({ solucionTitulo: 'vista de la bifurcación' });
      expect(d.name).toBe('Iniciativa de un grupo');
      expect(d.miembrosNombres).toEqual([]);
      expect(d.puedoEntrar).toBe(false);
      expect(JSON.stringify(d)).not.toContain(OTRA);
      expect(JSON.stringify(d)).not.toContain('Zoe');
    });

    it('en la lista sale como «Iniciativa de un grupo» con cuántos son, nunca quiénes', async () => {
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['profileId'] && !where['groupId'] ? [{ groupId: AMBITO, group: ambito() }] : [],
      );
      prisma.group.findMany.mockResolvedValue([
        { ...bif(), _count: { memberships: 3 } },
        { ...trabajo(), _count: { memberships: 2 } },
      ]);
      const res = await service.list(YO);
      expect(res.ambitos[0]!.grupos).toEqual([
        expect.objectContaining({ id: BIF, name: 'Iniciativa de un grupo', proposito: 'Huerto comunitario', miembros: 3, faltan: 4, tipo: 'bifurcacion' }),
        expect.objectContaining({ id: GT, miembros: 2, faltan: 3 }),
      ]);
      expect(JSON.stringify(res)).not.toContain(OTRA);
    });

    it('I2: quien organiza la comunidad ve «puedoPausar» en una bifurcación activa de la lista (sin nada de dentro)', async () => {
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['profileId'] && !where['groupId'] ? [{ groupId: AMBITO, group: ambito() }] : [],
      );
      prisma.group.findMany.mockResolvedValue([
        { ...bif({ trabajoEstado: 'activo' }), _count: { memberships: 8 } },
        { ...bif({ id: 'g-bif2', trabajoEstado: 'convocando' }), _count: { memberships: 2 } },
        { ...trabajo({ trabajoEstado: 'activo' }), _count: { memberships: 4 } },
      ]);
      let res = await service.list(YO);
      expect(res.ambitos[0]!.grupos.map((g) => g.puedoPausar)).toEqual([false, false, false]);
      bifurcaciones.puedePausarEn.mockResolvedValue(true);
      res = await service.list(YO);
      expect(bifurcaciones.puedePausarEn).toHaveBeenCalledWith(YO, AMBITO);
      expect(res.ambitos[0]!.grupos.map((g) => g.puedoPausar)).toEqual([true, false, false]);
      expect(JSON.stringify(res)).not.toContain(OTRA);
    });

    it('M1: si la solución de origen se ocultó, la lista no repite su título', async () => {
      prisma.groupMembership.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['profileId'] && !where['groupId'] ? [{ groupId: AMBITO, group: ambito() }] : [],
      );
      prisma.group.findMany.mockResolvedValue([{ ...bif(), _count: { memberships: 3 } }]);
      (prisma.solucion as Record<string, unknown>)['findMany'] = vi.fn().mockResolvedValue([{ id: S }]);
      const res = await service.list(YO);
      expect(res.ambitos[0]!.grupos[0]!.proposito).toBe('Solución oculta por moderación');
      expect(JSON.stringify(res)).not.toContain('Huerto');
    });

    describe('volver a la colmena', () => {
      const origen = (over: Record<string, unknown> = {}) => ({
        id: S,
        title: 'Huerto comunitario',
        description: 'Sembrar un huerto en el terreno baldío.',
        hidden: false,
        proposal: { groupId: AMBITO, hidden: false, decision: { fase: 'contada', resultado: 'aprobada', ganadoras: ['s-otra'] } },
        ...over,
      });

      beforeEach(() => {
        miembroDe.add(BIF);
        prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
          where.id === AMBITO ? ambito() : bif({ trabajoEstado: 'activo', convocatoriaEndsAt: null }),
        );
        prisma.solucion.findUnique.mockResolvedValue(origen());
      });

      it('lleva la solución de origen al ámbito como inquietud en plazo; audita sin actor ni ip', async () => {
        const r = await service.llevar(YO, BIF, S, '1.1.1.1', NOW);
        expect(r).toEqual({ inquietudId: 'inq-1' });
        expect(tx.inquietud.create.mock.calls[0]![0].data).toEqual({
          groupId: AMBITO,
          authorProfileId: YO,
          title: 'Huerto comunitario',
          body: 'Propuesta de una iniciativa de un grupo.\n\nSembrar un huerto en el terreno baldío.',
          status: 'en_plazo',
          thresholdReachedAt: NOW,
          deadlineAt: new Date(NOW.getTime() + 10 * DIA_MS),
          origenSolucionId: S,
        });
        expect(audit.log.mock.calls).toHaveLength(1);
        expect(audit.log.mock.calls[0]![0]).toEqual({ action: 'bifurcacion.carried_back', resource: `group:${BIF}`, metadata: { grupoId: BIF } });
      });

      it('una sola vez: la segunda da 409 y no audita', async () => {
        prisma.$transaction.mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
        );
        const e = await service.llevar(YO, BIF, S, '1.1.1.1', NOW).catch((x: unknown) => x);
        expect(e).toBeInstanceOf(ConflictException);
        expect((e as ConflictException).message).toBe('Esta propuesta ya se llevó a la comunidad.');
        expect(audit.log).not.toHaveBeenCalled();
      });

      it('pausada no lleva nada (409); otra solución del ámbito que no es la de origen da 400', async () => {
        prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
          where.id === AMBITO ? ambito() : bif({ trabajoEstado: 'pausado', convocatoriaEndsAt: null }),
        );
        await expect(service.llevar(YO, BIF, S, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ConflictException);
        prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
          where.id === AMBITO ? ambito() : bif({ trabajoEstado: 'activo', convocatoriaEndsAt: null }),
        );
        prisma.solucion.findUnique.mockResolvedValue(origen({ id: 's-otra' }));
        await expect(service.llevar(YO, BIF, 's-otra', '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.inquietud.create).not.toHaveBeenCalled();
      });
    });

    it('al vencer sin el mínimo se archiva como cualquier convocatoria', async () => {
      prisma.group.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where['trabajoEstado'] === 'convocando' ? [{ id: BIF }] : [],
      );
      tx.group.updateMany.mockResolvedValue({ count: 1 });
      expect(await service.processDeadlines(NOW)).toBe(1);
      expect(prisma.group.findMany.mock.calls[0]![0].where).toMatchObject({ trabajoTipo: { in: ['subgrupo', 'bifurcacion'] }, trabajoEstado: 'convocando' });
      expect(tx.group.updateMany).toHaveBeenCalledWith({
        where: { id: BIF, trabajoEstado: 'convocando', convocatoriaEndsAt: { lte: NOW } },
        data: { trabajoEstado: 'archivado' },
      });
      expect(acciones()).toEqual(['grupo.archived']);
    });
  });
});

describe('ProponerGrupoDto', () => {
  async function errores(o: Record<string, unknown>) {
    const dto = plainToInstance(ProponerGrupoDto, o);
    return { dto, errs: await validate(dto) };
  }
  const ok = { ambitoId: AMBITO, name: 'Agua potable', proposito: 'Conseguir agua potable para los barrios.' };

  it('acepta uno válido y recorta', async () => {
    const { dto, errs } = await errores({ ...ok, name: '  Agua potable  ', proposito: `  ${ok.proposito}  ` });
    expect(errs).toHaveLength(0);
    expect(dto.name).toBe('Agua potable');
    expect(dto.proposito).toBe(ok.proposito);
  });

  it('el nombre necesita de 5 a 80 caracteres, sin contar espacios de relleno', async () => {
    expect((await errores({ ...ok, name: '   Agua   ' })).errs[0]?.constraints?.['minLength']).toBe(
      'El nombre necesita entre 5 y 80 caracteres.',
    );
    expect((await errores({ ...ok, name: 'a'.repeat(81) })).errs).toHaveLength(1);
    expect((await errores({ ...ok, name: 'a'.repeat(80) })).errs).toHaveLength(0);
  });

  it('el propósito necesita de 20 a 1000 caracteres', async () => {
    expect((await errores({ ...ok, proposito: `   ${'a'.repeat(19)}   ` })).errs[0]?.constraints?.['minLength']).toBe(
      'El propósito necesita entre 20 y 1000 caracteres.',
    );
    expect((await errores({ ...ok, proposito: 'a'.repeat(1001) })).errs).toHaveLength(1);
    expect((await errores({ ...ok, proposito: 'a'.repeat(1000) })).errs).toHaveLength(0);
  });

  it('el ámbito debe ser un UUID', async () => {
    expect((await errores({ ...ok, ambitoId: 'x' })).errs[0]?.constraints?.['isUuid']).toBe('Elige una comunidad válida.');
  });
});

describe('LlevarPropuestaDto', () => {
  it('exige un UUID', async () => {
    expect(await validate(plainToInstance(LlevarPropuestaDto, { solucionId: AMBITO }))).toHaveLength(0);
    const errs = await validate(plainToInstance(LlevarPropuestaDto, { solucionId: 'x' }));
    expect(errs[0]?.constraints?.['isUuid']).toBeDefined();
  });
});
