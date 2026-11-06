import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComisionesService } from './comisiones.service';
import { elegirPuestos } from './elegir-puestos';
import { ALGORITHM_VERSION, selectMembers, sortPool, verifySelection } from '../sortition/sortition-algorithm';
import { VoluntarioDto } from './dto/voluntario.dto';
import { AjustarComisionDto } from './dto/ajustar-comision.dto';
import { PapeletaComisionDto } from './dto/papeleta-comision.dto';

const YO = 'p-yo';
const OTRA = 'p-otra';
const AMBITO = 'g-ambito';
const SUB = 'g-sub';
const BIF = 'g-bif';
const COM = 'g-com';
const SOL = 's-1';
const PROP = 'prop-1';
const DIA_MS = 86_400_000;
const NOW = new Date('2026-11-10T12:00:00Z');
const V = ['v-a', 'v-b', 'v-c', 'v-d', 'v-e'];

function ambito(over: Record<string, unknown> = {}) {
  return { id: AMBITO, name: 'Managua', slug: 'managua', type: 'territorial_origin', parentGroupId: null, trabajoTipo: null, ...over };
}

function comision(over: Record<string, unknown> = {}) {
  return {
    id: COM,
    name: 'Comisión: Agua potable',
    slug: `trabajo-${COM}`,
    type: 'trabajo',
    parentGroupId: AMBITO,
    trabajoTipo: 'comision',
    trabajoEstado: 'convocando',
    proposito: 'Llevar agua potable a los barrios del norte.',
    convocatoriaEndsAt: new Date(NOW.getTime() + 3 * DIA_MS),
    pocosMiembrosDesde: null,
    origenSolucionId: SOL,
    origenGrupoId: null,
    tarea: 'Llevar agua potable a los barrios del norte.',
    puestos: 3,
    forma: 'sorteo',
    ampliada: false,
    eleccionEndsAt: null,
    seleccionSemilla: null,
    seleccionPool: null,
    seleccionAlgoritmo: null,
    eleccionResultado: null,
    activadaAt: null,
    proximoInformeAt: null,
    ...over,
  };
}

function buildPrisma() {
  const p = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(p)),
    group: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'nuevo' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    groupMembership: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    forum: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'f1' }) },
    comisionVoluntario: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    comisionPapeleta: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    decision: { findMany: vi.fn().mockResolvedValue([]) },
    solucion: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u-yo' }) },
  };
  return p;
}

const REGLAS: Record<string, number> = {
  'comision.puestos_min': 3,
  'comision.puestos_max': 7,
  'comision.plazo_convocatoria_dias': 7,
  'comision.informe_cada_dias': 30,
  'votacion.plazo_dias': 5,
};

describe('ComisionesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let access: { isParticipant: ReturnType<typeof vi.fn>; requireReader: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn>; getChoice: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let forums: { canOrganize: ReturnType<typeof vi.fn> };
  let service: ComisionesService;
  let miembroDe: Set<string>;
  let grupoActual: Record<string, unknown>;

  beforeEach(() => {
    prisma = buildPrisma();
    miembroDe = new Set([AMBITO]);
    grupoActual = comision();
    access = {
      isParticipant: vi.fn(async (groupId: string) => miembroDe.has(groupId)),
      requireReader: vi.fn(async (groupId: string) => {
        const parent = groupId === COM ? (grupoActual['parentGroupId'] as string) : null;
        if (!miembroDe.has(groupId) && !(parent && miembroDe.has(parent))) throw new ForbiddenException('No lee.');
        return { participa: miembroDe.has(groupId) };
      }),
    };
    rules = {
      getInt: vi.fn(async (key: string) => REGLAS[key] ?? 14),
      getChoice: vi.fn().mockResolvedValue('sorteo'),
    };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    forums = { canOrganize: vi.fn().mockResolvedValue(false) };
    service = new ComisionesService(prisma as never, access as never, rules as never, audit as never, forums as never);
    prisma.group.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === AMBITO) return ambito();
      if (where.id === BIF) return ambito({ id: BIF, type: 'trabajo', parentGroupId: AMBITO, trabajoTipo: 'bifurcacion' });
      if (where.id === COM) return grupoActual;
      return null;
    });
  });

  const acciones = () => audit.log.mock.calls.map((c) => (c[0] as { action: string }).action);
  const metadatas = () => audit.log.mock.calls.map((c) => (c[0] as { metadata: unknown }).metadata);

  // ─── Nacimiento ───────────────────────────────────────────────────────────

  describe('crearComisiones', () => {
    function decision(over: Record<string, unknown> = {}, grupo: Record<string, unknown> = {}) {
      return {
        id: 'd-1',
        proposalId: PROP,
        ganadoras: [SOL],
        proposal: { groupId: AMBITO, hidden: false, group: { type: 'territorial_origin', parentGroupId: null, trabajoTipo: null, ...grupo } },
        ...over,
      };
    }
    const sol = (over: Record<string, unknown> = {}) => ({
      id: SOL,
      title: 'Agua potable',
      description: 'Llevar agua potable a los barrios del norte de la ciudad.',
      hidden: false,
      ...over,
    });

    it('crea una comisión convocando por cada ganadora, con los valores por defecto del ámbito', async () => {
      prisma.decision.findMany.mockResolvedValue([decision({ ganadoras: [SOL, 's-2'] })]);
      prisma.solucion.findMany.mockResolvedValue([sol(), sol({ id: 's-2', title: 'Pozos', hidden: false })]);
      const n = await service.crearComisiones(NOW);
      expect(n).toBe(2);
      expect(prisma.group.create).toHaveBeenCalledTimes(2);
      const data = prisma.group.create.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data).toMatchObject({
        name: 'Comisión: Agua potable',
        type: 'trabajo',
        parentGroupId: AMBITO,
        trabajoTipo: 'comision',
        trabajoEstado: 'convocando',
        tarea: sol().description,
        proposito: sol().description,
        puestos: 3,
        forma: 'sorteo',
        origenSolucionId: SOL,
        convocatoriaEndsAt: new Date(NOW.getTime() + 7 * DIA_MS),
      });
      expect(data['slug']).toBe(`trabajo-${data['id'] as string}`);
      expect(rules.getInt).toHaveBeenCalledWith('comision.puestos_min', AMBITO);
      expect(rules.getChoice).toHaveBeenCalledWith('comision.forma', AMBITO);
      expect(acciones()).toEqual(['comision.created', 'comision.created']);
      expect(metadatas()[0]).toEqual({ grupoId: data['id'] });
    });

    it('la decisión de un subgrupo crea la comisión en el ámbito del subgrupo', async () => {
      prisma.decision.findMany.mockResolvedValue([
        decision({}, { type: 'trabajo', parentGroupId: AMBITO, trabajoTipo: 'subgrupo' }),
      ]);
      prisma.solucion.findMany.mockResolvedValue([sol()]);
      await service.crearComisiones(NOW);
      expect(prisma.group.create.mock.calls[0]![0].data).toMatchObject({ parentGroupId: AMBITO });
    });

    it('no crea comisiones de decisiones de comisiones o bifurcaciones', async () => {
      prisma.decision.findMany.mockResolvedValue([
        decision({}, { type: 'trabajo', parentGroupId: AMBITO, trabajoTipo: 'comision' }),
        decision({ id: 'd-2' }, { type: 'trabajo', parentGroupId: AMBITO, trabajoTipo: 'bifurcacion' }),
      ]);
      prisma.solucion.findMany.mockResolvedValue([sol()]);
      expect(await service.crearComisiones(NOW)).toBe(0);
      expect(prisma.group.create).not.toHaveBeenCalled();
    });

    it('omite soluciones ocultas y temas ocultos', async () => {
      prisma.decision.findMany.mockResolvedValue([
        decision(),
        decision({ id: 'd-2', ganadoras: ['s-2'], proposal: { groupId: AMBITO, hidden: true, group: ambito() } }),
      ]);
      prisma.solucion.findMany.mockResolvedValue([sol({ hidden: true }), sol({ id: 's-2' })]);
      expect(await service.crearComisiones(NOW)).toBe(0);
      expect(prisma.group.create).not.toHaveBeenCalled();
    });

    it('no crea otra si la solución ya tuvo comisión, aunque esté archivada', async () => {
      prisma.decision.findMany.mockResolvedValue([decision()]);
      prisma.solucion.findMany.mockResolvedValue([sol()]);
      prisma.group.findMany.mockResolvedValue([{ origenSolucionId: SOL }]);
      expect(await service.crearComisiones(NOW)).toBe(0);
      expect(prisma.group.create).not.toHaveBeenCalled();
      expect(prisma.group.findMany.mock.calls[0]![0].where).toMatchObject({ trabajoTipo: 'comision' });
      expect(prisma.group.findMany.mock.calls[0]![0].where).not.toHaveProperty('trabajoEstado');
    });

    it('una sola comisión por ganadora aunque dos pasadas corran a la vez (P2002 se ignora)', async () => {
      prisma.decision.findMany.mockResolvedValue([decision()]);
      prisma.solucion.findMany.mockResolvedValue([sol()]);
      prisma.group.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: {} }),
      );
      await expect(service.crearComisiones(NOW)).resolves.toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('corta el nombre a 80 y la tarea a 1000', async () => {
      prisma.decision.findMany.mockResolvedValue([decision()]);
      prisma.solucion.findMany.mockResolvedValue([sol({ title: 'x'.repeat(140), description: 'y'.repeat(2000) })]);
      await service.crearComisiones(NOW);
      const data = prisma.group.create.mock.calls[0]![0].data as { name: string; tarea: string; proposito: string };
      expect(data.name).toHaveLength(80);
      expect(data.tarea).toHaveLength(1000);
      expect(data.proposito).toHaveLength(1000);
    });
  });

  // ─── Voluntarios ──────────────────────────────────────────────────────────

  describe('ofrecerse', () => {
    it('quien no es del ámbito recibe 403 y no se guarda nada', async () => {
      miembroDe.clear();
      await expect(service.ofrecerse(YO, COM, undefined, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comisionVoluntario.upsert).not.toHaveBeenCalled();
    });

    it('quien es miembro de la comisión pero se mudó del ámbito recibe 403', async () => {
      miembroDe = new Set([COM]);
      await expect(service.ofrecerse(YO, COM, undefined, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comisionVoluntario.upsert).not.toHaveBeenCalled();
    });

    it('en la comisión de una bifurcación solo se ofrecen sus miembros', async () => {
      grupoActual = comision({ parentGroupId: BIF, origenGrupoId: BIF });
      access.requireReader.mockResolvedValue({ participa: false });
      await expect(service.ofrecerse(YO, COM, undefined, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      miembroDe.add(BIF);
      await service.ofrecerse(YO, COM, undefined, '1.1.1.1', NOW);
      expect(prisma.comisionVoluntario.upsert).toHaveBeenCalledTimes(1);
    });

    it('un grupo que no es comisión da 400', async () => {
      grupoActual = comision({ trabajoTipo: 'subgrupo' });
      await expect(service.ofrecerse(YO, COM, undefined, '1.1.1.1', NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fuera de la convocatoria (o vencida) da 409', async () => {
      for (const over of [{ trabajoEstado: 'eligiendo' }, { trabajoEstado: 'activo' }, { convocatoriaEndsAt: NOW }]) {
        grupoActual = comision(over);
        await expect(service.ofrecerse(YO, COM, undefined, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ConflictException);
      }
      expect(prisma.comisionVoluntario.upsert).not.toHaveBeenCalled();
    });

    it('guarda la experiencia con la fila bloqueada y audita sin texto', async () => {
      await service.ofrecerse(YO, COM, 'Fui fontanero diez años.', '1.1.1.1', NOW);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.comisionVoluntario.upsert).toHaveBeenCalledWith({
        where: { grupoId_profileId: { grupoId: COM, profileId: YO } },
        create: { grupoId: COM, profileId: YO, experiencia: 'Fui fontanero diez años.' },
        update: { experiencia: 'Fui fontanero diez años.' },
      });
      expect(acciones()).toEqual(['comision.volunteered']);
      expect(metadatas()).toEqual([{ grupoId: COM }]);
    });

    it('sin experiencia guarda texto vacío', async () => {
      await service.ofrecerse(YO, COM, undefined, '1.1.1.1', NOW);
      expect(prisma.comisionVoluntario.upsert.mock.calls[0]![0].create).toEqual({ grupoId: COM, profileId: YO, experiencia: '' });
    });
  });

  describe('retirarse', () => {
    it('se retira mientras convoca y audita', async () => {
      await service.retirarse(YO, COM, '1.1.1.1', NOW);
      expect(prisma.comisionVoluntario.deleteMany).toHaveBeenCalledWith({ where: { grupoId: COM, profileId: YO } });
      expect(acciones()).toEqual(['comision.withdrew']);
    });

    it('no audita si no era voluntario', async () => {
      prisma.comisionVoluntario.deleteMany.mockResolvedValue({ count: 0 });
      await service.retirarse(YO, COM, '1.1.1.1', NOW);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('durante la elección ya no se retira (409)', async () => {
      grupoActual = comision({ trabajoEstado: 'eligiendo' });
      await expect(service.retirarse(YO, COM, '1.1.1.1', NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.comisionVoluntario.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── Ajuste ───────────────────────────────────────────────────────────────

  describe('ajustar', () => {
    it('solo quien organiza (403 para el resto)', async () => {
      await expect(service.ajustar(YO, COM, { puestos: 5 }, NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.group.updateMany).not.toHaveBeenCalled();
    });

    it('quien organiza pero no es del ámbito recibe 403', async () => {
      forums.canOrganize.mockResolvedValue(true);
      miembroDe = new Set([COM]);
      await expect(service.ajustar(YO, COM, { puestos: 5 }, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('respeta los límites de puestos de las reglas (400)', async () => {
      forums.canOrganize.mockResolvedValue(true);
      for (const puestos of [2, 8]) {
        await expect(service.ajustar(YO, COM, { puestos }, NOW)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(prisma.group.updateMany).not.toHaveBeenCalled();
    });

    it('ajusta tarea y puestos mientras convoca, con updateMany condicionado', async () => {
      forums.canOrganize.mockResolvedValue(true);
      const tarea = 'Instalar tuberías en los barrios del norte.';
      await service.ajustar(YO, COM, { tarea, puestos: 7 }, NOW);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: COM, trabajoTipo: 'comision', trabajoEstado: 'convocando' },
        data: { tarea, puestos: 7 },
      });
      expect(forums.canOrganize).toHaveBeenCalledWith(YO, AMBITO);
    });

    it('fuera de la convocatoria da 409', async () => {
      forums.canOrganize.mockResolvedValue(true);
      grupoActual = comision({ trabajoEstado: 'activo' });
      await expect(service.ajustar(YO, COM, { puestos: 4 }, NOW)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── Cierre de la convocatoria ────────────────────────────────────────────

  describe('cerrarConvocatorias', () => {
    const vencida = (over: Record<string, unknown> = {}) => comision({ convocatoriaEndsAt: new Date(NOW.getTime() - 1000), ...over });
    function con(over: Record<string, unknown>, voluntarios: string[]) {
      grupoActual = vencida(over);
      prisma.group.findMany.mockResolvedValue([{ id: COM }]);
      prisma.comisionVoluntario.findMany.mockResolvedValue(voluntarios.map((profileId) => ({ profileId })));
    }

    it('solo busca comisiones convocando vencidas y cuenta voluntarios que siguen en el ámbito', async () => {
      con({}, V);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.group.findMany.mock.calls[0]![0].where).toMatchObject({
        trabajoTipo: 'comision',
        trabajoEstado: 'convocando',
        convocatoriaEndsAt: { lte: NOW },
      });
      expect(prisma.comisionVoluntario.findMany.mock.calls[0]![0].where).toEqual({
        grupoId: COM,
        profile: { memberships: { some: { groupId: AMBITO } } },
      });
    });

    it('con menos voluntarios que puestos amplía 7 días, una sola vez', async () => {
      con({}, ['v-a']);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: COM, trabajoEstado: 'convocando', ampliada: false },
        data: { ampliada: true, convocatoriaEndsAt: new Date(NOW.getTime() + 7 * DIA_MS) },
      });
      expect(acciones()).toEqual(['comision.extended']);
      expect(prisma.groupMembership.createMany).not.toHaveBeenCalled();
    });

    it('con 0 voluntarios tampoco archiva antes de ampliar', async () => {
      con({}, []);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.group.updateMany.mock.calls[0]![0].data).toMatchObject({ ampliada: true });
    });

    it('con 0 voluntarios tras ampliar se archiva', async () => {
      con({ ampliada: true }, []);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: COM, trabajoEstado: 'convocando' },
        data: { trabajoEstado: 'archivado' },
      });
      expect(prisma.groupMembership.createMany).not.toHaveBeenCalled();
      expect(acciones()).toEqual(['grupo.archived']);
    });

    it('tras ampliar, con menos voluntarios que puestos entran todos sin sorteo', async () => {
      con({ ampliada: true }, ['v-b', 'v-a']);
      await service.cerrarConvocatorias(NOW);
      const data = prisma.group.updateMany.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data).toMatchObject({ trabajoEstado: 'activo', convocatoriaEndsAt: null, activadaAt: NOW });
      expect(data['seleccionSemilla']).toBeUndefined();
      expect(prisma.groupMembership.createMany).toHaveBeenCalledWith({
        data: [
          { groupId: COM, profileId: 'v-a' },
          { groupId: COM, profileId: 'v-b' },
        ],
        skipDuplicates: true,
      });
    });

    it('sorteo verificable: guarda semilla, pool ordenado y algoritmo, y verifySelection reproduce a los elegidos', async () => {
      con({}, ['v-e', 'v-c', 'v-a', 'v-d', 'v-b']);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.group.updateMany.mock.calls[0]![0].where).toEqual({ id: COM, trabajoEstado: 'convocando' });
      const data = prisma.group.updateMany.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data).toMatchObject({
        trabajoEstado: 'activo',
        activadaAt: NOW,
        proximoInformeAt: new Date(NOW.getTime() + 30 * DIA_MS),
        seleccionPool: sortPool(V),
        seleccionAlgoritmo: ALGORITHM_VERSION,
      });
      const semilla = data['seleccionSemilla'] as string;
      expect(semilla).toMatch(/^[0-9a-f]{64}$/);
      const elegidos = (prisma.groupMembership.createMany.mock.calls[0]![0].data as { profileId: string }[]).map((m) => m.profileId);
      expect(elegidos).toHaveLength(3);
      expect(elegidos).toEqual(selectMembers(sortPool(V), 3, semilla));
      expect(verifySelection(data['seleccionPool'] as string[], 3, semilla, elegidos)).toBe(true);
      expect(data['eleccionResultado']).toEqual({ elegidos });
      expect(prisma.forum.create).toHaveBeenCalledWith({ data: { groupId: COM, title: 'Comisión: Agua potable', isDefault: true } });
      expect(acciones()).toEqual(['comision.selected']);
      expect(metadatas()).toEqual([{ grupoId: COM, forma: 'sorteo' }]);
    });

    it('si otra pasada ya la cerró (count 0), no crea miembros ni audita', async () => {
      con({}, V);
      prisma.group.updateMany.mockResolvedValue({ count: 0 });
      await service.cerrarConvocatorias(NOW);
      expect(prisma.groupMembership.createMany).not.toHaveBeenCalled();
      expect(prisma.forum.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('releída con la fila bloqueada: si ya no convoca no hace nada', async () => {
      con({ trabajoEstado: 'activo' }, V);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.group.updateMany).not.toHaveBeenCalled();
    });

    it('preferencias con más voluntarios que puestos abre la elección', async () => {
      con({ forma: 'preferencias' }, V);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: COM, trabajoEstado: 'convocando' },
        data: { trabajoEstado: 'eligiendo', convocatoriaEndsAt: null, eleccionEndsAt: new Date(NOW.getTime() + 5 * DIA_MS) },
      });
      expect(prisma.groupMembership.createMany).not.toHaveBeenCalled();
    });

    it('preferencias con tantos voluntarios como puestos: entran todos', async () => {
      con({ forma: 'preferencias' }, ['v-a', 'v-b', 'v-c']);
      await service.cerrarConvocatorias(NOW);
      expect(prisma.group.updateMany.mock.calls[0]![0].data).toMatchObject({ trabajoEstado: 'activo' });
      expect(prisma.groupMembership.createMany.mock.calls[0]![0].data).toHaveLength(3);
      expect(metadatas()).toEqual([{ grupoId: COM, forma: 'preferencias' }]);
    });

    it('un error en una comisión no detiene las demás', async () => {
      con({}, V);
      prisma.group.findMany.mockResolvedValue([{ id: 'otra' }, { id: COM }]);
      prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
      await service.cerrarConvocatorias(NOW);
      expect(acciones()).toEqual(['comision.selected']);
    });
  });

  // ─── Elección por preferencias ────────────────────────────────────────────

  describe('votar', () => {
    beforeEach(() => {
      grupoActual = comision({ trabajoEstado: 'eligiendo', eleccionEndsAt: new Date(NOW.getTime() + DIA_MS) });
      prisma.comisionVoluntario.findMany.mockResolvedValue(V.map((profileId) => ({ profileId })));
    });

    it('quien no es del ámbito recibe 403', async () => {
      miembroDe = new Set([COM]);
      await expect(service.votar(YO, COM, ['v-a'], NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comisionPapeleta.upsert).not.toHaveBeenCalled();
    });

    it('fuera de la elección, o vencida, da 409', async () => {
      for (const over of [{ trabajoEstado: 'convocando' }, { eleccionEndsAt: NOW }]) {
        grupoActual = comision({ trabajoEstado: 'eligiendo', eleccionEndsAt: new Date(NOW.getTime() + DIA_MS), ...over });
        await expect(service.votar(YO, COM, ['v-a'], NOW)).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('rechaza (400) quien no es voluntario y los repetidos', async () => {
      await expect(service.votar(YO, COM, ['v-a', 'p-x'], NOW)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.votar(YO, COM, ['v-a', 'v-a'], NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.comisionPapeleta.upsert).not.toHaveBeenCalled();
    });

    it('guarda la papeleta con la fila bloqueada', async () => {
      await service.votar(YO, COM, ['v-c', 'v-a'], NOW);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.comisionPapeleta.upsert).toHaveBeenCalledWith({
        where: { grupoId_profileId: { grupoId: COM, profileId: YO } },
        create: { grupoId: COM, profileId: YO, orden: ['v-c', 'v-a'] },
        update: { orden: ['v-c', 'v-a'] },
      });
    });
  });

  describe('cerrarElecciones', () => {
    it('al vencer elige con elegirPuestos, cuenta solo papeletas del ámbito y guarda elegidos y rondas', async () => {
      grupoActual = comision({ trabajoEstado: 'eligiendo', forma: 'preferencias', puestos: 2, eleccionEndsAt: new Date(NOW.getTime() - 1) });
      prisma.group.findMany.mockResolvedValue([{ id: COM }]);
      const candidatos = ['v-a', 'v-b', 'v-c', 'v-d'];
      prisma.comisionVoluntario.findMany.mockResolvedValue(candidatos.map((profileId) => ({ profileId })));
      const ordenes = [
        ['v-c', 'v-b', 'v-a'],
        ['v-c', 'v-a'],
        ['v-b', 'v-c', 'v-d'],
      ];
      prisma.comisionPapeleta.findMany.mockResolvedValue(ordenes.map((orden) => ({ orden })));
      await service.cerrarElecciones(NOW);

      expect(prisma.group.findMany.mock.calls[0]![0].where).toMatchObject({
        trabajoTipo: 'comision',
        trabajoEstado: 'eligiendo',
        eleccionEndsAt: { lte: NOW },
      });
      expect(prisma.comisionPapeleta.findMany.mock.calls[0]![0].where).toEqual({
        grupoId: COM,
        profile: { memberships: { some: { groupId: AMBITO } } },
      });
      const esperado = elegirPuestos(ordenes, candidatos, 2);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: COM, trabajoEstado: 'eligiendo' },
        data: expect.objectContaining({
          trabajoEstado: 'activo',
          activadaAt: NOW,
          proximoInformeAt: new Date(NOW.getTime() + 30 * DIA_MS),
          eleccionResultado: esperado,
        }),
      });
      expect(prisma.groupMembership.createMany).toHaveBeenCalledWith({
        data: esperado.elegidos.map((profileId) => ({ groupId: COM, profileId })),
        skipDuplicates: true,
      });
      expect(metadatas()).toEqual([{ grupoId: COM, forma: 'preferencias' }]);
    });

    it('sin candidatos que sigan en el ámbito se archiva', async () => {
      grupoActual = comision({ trabajoEstado: 'eligiendo', forma: 'preferencias', eleccionEndsAt: new Date(NOW.getTime() - 1) });
      prisma.group.findMany.mockResolvedValue([{ id: COM }]);
      await service.cerrarElecciones(NOW);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: COM, trabajoEstado: 'eligiendo' },
        data: { trabajoEstado: 'archivado' },
      });
    });
  });

  // ─── Vista y verificación ─────────────────────────────────────────────────

  describe('vista', () => {
    it('nunca devuelve la papeleta de otra persona: solo lee la propia', async () => {
      grupoActual = comision({ trabajoEstado: 'eligiendo', eleccionEndsAt: new Date(NOW.getTime() + DIA_MS) });
      prisma.comisionPapeleta.findUnique.mockResolvedValue({ orden: ['v-b'] });
      const v = await service.vista(grupoActual as never, YO, true, NOW);
      expect(v.miPapeleta).toEqual(['v-b']);
      expect(prisma.comisionPapeleta.findUnique).toHaveBeenCalledWith({
        where: { grupoId_profileId: { grupoId: COM, profileId: YO } },
        select: { orden: true },
      });
      expect(prisma.comisionPapeleta.findMany).not.toHaveBeenCalled();
    });

    it('muestra voluntarios del ámbito con soyYo, y la selección cuando hubo sorteo', async () => {
      grupoActual = comision({
        trabajoEstado: 'activo',
        seleccionSemilla: 'ab'.repeat(32),
        seleccionPool: sortPool(V),
        seleccionAlgoritmo: ALGORITHM_VERSION,
      });
      prisma.comisionVoluntario.findMany.mockResolvedValue([
        { profileId: YO, experiencia: 'Fontanero', profile: { displayName: 'Ana' } },
        { profileId: OTRA, experiencia: '', profile: { displayName: 'Beto' } },
      ]);
      const v = await service.vista(grupoActual as never, YO, true, NOW);
      expect(v.voluntarios).toEqual([
        { nombre: 'Ana', experiencia: 'Fontanero', soyYo: true },
        { nombre: 'Beto', experiencia: '', soyYo: false },
      ]);
      expect(v.yoVoluntario).toBe(true);
      expect(v.seleccion).toEqual({ semilla: 'ab'.repeat(32), pool: sortPool(V), algoritmo: ALGORITHM_VERSION });
      expect(v.puedoAjustar).toBe(false);
      expect(JSON.stringify(v)).not.toContain(OTRA);
    });

    it('puedoAjustar solo para quien organiza, es del ámbito y mientras convoca', async () => {
      forums.canOrganize.mockResolvedValue(true);
      expect((await service.vista(comision() as never, YO, true, NOW)).puedoAjustar).toBe(true);
      expect((await service.vista(comision({ trabajoEstado: 'activo' }) as never, YO, true, NOW)).puedoAjustar).toBe(false);
      miembroDe.clear();
      expect((await service.vista(comision() as never, YO, true, NOW)).puedoAjustar).toBe(false);
    });

    it('sin lectura completa no muestra voluntarios', async () => {
      prisma.comisionVoluntario.findMany.mockResolvedValue([{ profileId: OTRA, experiencia: '', profile: { displayName: 'Beto' } }]);
      const v = await service.vista(comision() as never, YO, false, NOW);
      expect(v.voluntarios).toEqual([]);
    });
  });

  describe('verificar', () => {
    it('reproduce el sorteo con la semilla y el pool guardados', async () => {
      const pool = sortPool(V);
      const semilla = 'cd'.repeat(32);
      const elegidos = selectMembers(pool, 3, semilla);
      grupoActual = comision({
        trabajoEstado: 'activo',
        seleccionSemilla: semilla,
        seleccionPool: pool,
        seleccionAlgoritmo: ALGORITHM_VERSION,
        eleccionResultado: { elegidos },
      });
      expect(await service.verificar(YO, COM)).toEqual({ ok: true, elegidos });
      grupoActual = { ...grupoActual, eleccionResultado: { elegidos: [...elegidos].reverse() } };
      expect((await service.verificar(YO, COM)).ok).toBe(false);
    });

    it('sin sorteo da ok false', async () => {
      expect(await service.verificar(YO, COM)).toEqual({ ok: false, elegidos: [] });
    });

    it('quien no lee recibe 403', async () => {
      miembroDe.clear();
      await expect(service.verificar(YO, COM)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── DTOs ─────────────────────────────────────────────────────────────────

  describe('DTOs', () => {
    it('la experiencia es opcional, se recorta y admite hasta 500', async () => {
      expect(await validate(plainToInstance(VoluntarioDto, {}))).toHaveLength(0);
      const d = plainToInstance(VoluntarioDto, { experiencia: '  hola  ' });
      expect(await validate(d)).toHaveLength(0);
      expect(d.experiencia).toBe('hola');
      expect(await validate(plainToInstance(VoluntarioDto, { experiencia: 'x'.repeat(501) }))).not.toHaveLength(0);
    });

    it('la tarea recortada tiene entre 20 y 2000; los puestos son enteros', async () => {
      expect(await validate(plainToInstance(AjustarComisionDto, { tarea: `   ${'x'.repeat(19)}   ` }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(AjustarComisionDto, { tarea: 'x'.repeat(2001) }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(AjustarComisionDto, { puestos: 2.5 }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(AjustarComisionDto, { tarea: 'x'.repeat(20), puestos: 4 }))).toHaveLength(0);
    });

    it('la papeleta es una lista de identificadores', async () => {
      const ok = plainToInstance(PapeletaComisionDto, { orden: ['11111111-1111-4111-8111-111111111111'] });
      expect(await validate(ok)).toHaveLength(0);
      expect(await validate(plainToInstance(PapeletaComisionDto, { orden: ['x'] }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(PapeletaComisionDto, { orden: [] }))).not.toHaveLength(0);
    });
  });
});
