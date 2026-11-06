import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BifurcacionesService } from './bifurcaciones.service';
import { esBifurcable } from './bifurcacion-reglas';
import { PausarBifurcacionDto, ApelarPausaDto, ResolverPausaDto, IniciarBifurcacionDto } from './dto/bifurcacion.dto';

const YO = 'p-yo';
const OTRA = 'p-otra';
const AMBITO = 'g-ambito';
const BIF = 'g-bif';
const S = 's-perdedora';
const GANADORA = 's-ganadora';
const DEC = 'd-1';
const DIA_MS = 86_400_000;
const CONTADA = new Date('2026-11-01T12:00:00Z');
const NOW = new Date('2026-11-05T12:00:00Z');
const NO_ELEGIBLE = 'Solo quienes apoyaron esta solución pueden sumarse.';

const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

function decision(over: Record<string, unknown> = {}) {
  return {
    id: DEC,
    fase: 'contada',
    resultado: 'aprobada',
    modo: 'excluyentes',
    ganadoras: [GANADORA],
    candidatas: [GANADORA, S],
    contadaAt: CONTADA,
    updatedAt: CONTADA,
    ...over,
  };
}

function solucion(over: Record<string, unknown> = {}, dec: Record<string, unknown> = {}) {
  return {
    id: S,
    title: 'Huerto comunitario',
    description: 'Sembrar un huerto en el terreno baldío del barrio.',
    hidden: false,
    proposalId: 't-1',
    proposal: { id: 't-1', groupId: AMBITO, hidden: false, group: { type: 'territorial_origin' }, decision: decision(dec) },
    ...over,
  };
}

function bif(over: Record<string, unknown> = {}) {
  return {
    id: BIF,
    name: 'Iniciativa de un grupo',
    type: 'trabajo',
    parentGroupId: AMBITO,
    trabajoTipo: 'bifurcacion',
    trabajoEstado: 'activo',
    proposito: 'Huerto comunitario',
    convocatoriaEndsAt: null,
    pocosMiembrosDesde: null,
    origenSolucionId: S,
    pausaCausa: null,
    pausaDetalle: null,
    pausaApelacion: null,
    pausaApeladaAt: null,
    ...over,
  };
}

function buildTx() {
  return {
    group: { create: vi.fn().mockResolvedValue({}) },
    groupMembership: { create: vi.fn().mockResolvedValue({}) },
  };
}

function buildPrisma(tx: ReturnType<typeof buildTx>) {
  return {
    solucion: { findUnique: vi.fn() },
    decisionPapeleta: { findUnique: vi.fn() },
    groupMembership: { findUnique: vi.fn() },
    group: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    inquietud: { findUnique: vi.fn().mockResolvedValue(null) },
    profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u-yo' }) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
}

describe('esBifurcable', () => {
  it('una perdedora de excluyentes sí; la ganadora no', () => {
    expect(esBifurcable(decision(), S, 'territorial_origin')).toBe(true);
    expect(esBifurcable(decision(), GANADORA, 'territorial_origin')).toBe(false);
  });
  it('sin quórum, cualquier candidata (también en compatibles o con una sola)', () => {
    expect(esBifurcable(decision({ resultado: 'sin_quorum', modo: 'compatibles', ganadoras: [] }), GANADORA, 'custom')).toBe(true);
    expect(esBifurcable(decision({ resultado: 'sin_quorum', candidatas: [S], ganadoras: [] }), S, 'custom')).toBe(true);
  });
  it('compatibles con quórum no se bifurca; tampoco una sola candidata sin quórum suficiente de otro tipo', () => {
    expect(esBifurcable(decision({ modo: 'compatibles' }), S, 'custom')).toBe(false);
    expect(esBifurcable(decision({ resultado: 'ninguna', candidatas: [S], ganadoras: [] }), S, 'custom')).toBe(false);
  });
  it('excluyentes sin ganadora (ninguna o empate): todas', () => {
    expect(esBifurcable(decision({ resultado: 'empate', ganadoras: [] }), GANADORA, 'custom')).toBe(true);
  });
  it('no contada, solución ajena o decisión de un grupo de trabajo: no', () => {
    expect(esBifurcable(decision({ fase: 'votacion' }), S, 'custom')).toBe(false);
    expect(esBifurcable(decision(), 's-otra', 'custom')).toBe(false);
    expect(esBifurcable(decision(), S, 'trabajo')).toBe(false);
  });
});

describe('BifurcacionesService', () => {
  let tx: ReturnType<typeof buildTx>;
  let prisma: ReturnType<typeof buildPrisma>;
  let access: { isParticipant: ReturnType<typeof vi.fn>; requireMember: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let forums: { canOrganize: ReturnType<typeof vi.fn>; esMesa: ReturnType<typeof vi.fn> };
  let comisiones: { crearDeBifurcacion: ReturnType<typeof vi.fn> };
  let service: BifurcacionesService;
  /** Papeletas por persona: orden de cada una. */
  let papeletas: Map<string, { abstencion: boolean; orden: string[] }>;
  /** Grupos de los que es miembro cada persona. */
  let miembros: Map<string, Set<string>>;

  beforeEach(() => {
    tx = buildTx();
    prisma = buildPrisma(tx);
    papeletas = new Map([
      [YO, { abstencion: false, orden: [S, GANADORA] }],
      [OTRA, { abstencion: false, orden: [GANADORA] }],
    ]);
    miembros = new Map([
      [YO, new Set([AMBITO])],
      [OTRA, new Set([AMBITO])],
      ['p-nadie', new Set([AMBITO])],
    ]);
    const esMiembro = (groupId: string, profileId: string) => miembros.get(profileId)?.has(groupId) ?? false;
    prisma.decisionPapeleta.findUnique.mockImplementation(
      async ({ where }: { where: { decisionId_profileId: { profileId: string } } }) =>
        papeletas.get(where.decisionId_profileId.profileId) ?? null,
    );
    prisma.groupMembership.findUnique.mockImplementation(
      async ({ where }: { where: { groupId_profileId: { groupId: string; profileId: string } } }) =>
        esMiembro(where.groupId_profileId.groupId, where.groupId_profileId.profileId) ? { id: 'm' } : null,
    );
    prisma.solucion.findUnique.mockResolvedValue(solucion());
    prisma.group.findUnique.mockResolvedValue(bif());
    access = {
      isParticipant: vi.fn(async (groupId: string, profileId: string) => esMiembro(groupId, profileId)),
      requireMember: vi.fn(async (groupId: string, profileId: string) => {
        if (!esMiembro(groupId, profileId)) throw new ForbiddenException('Solo los miembros de este grupo pueden participar.');
      }),
    };
    rules = { getInt: vi.fn(async (key: string) => (key === 'bifurcacion.plazo_dias' ? 14 : 7)) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    forums = { canOrganize: vi.fn().mockResolvedValue(false), esMesa: vi.fn().mockResolvedValue(false) };
    comisiones = { crearDeBifurcacion: vi.fn().mockResolvedValue('g-com') };
    service = new BifurcacionesService(
      prisma as never,
      access as never,
      rules as never,
      audit as never,
      forums as never,
      comisiones as never,
    );
  });

  const acciones = () => audit.log.mock.calls.map((c) => (c[0] as { action: string }).action);

  describe('iniciar', () => {
    it('quien tenía S en su orden la inicia: nace convocando, sin quien la creó, con el plazo desde el conteo', async () => {
      tx.group.create.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
      const res = await service.iniciar(YO, S, NOW);
      const data = tx.group.create.mock.calls[0]![0].data as Record<string, unknown>;
      expect(data).toMatchObject({
        name: 'Iniciativa de un grupo',
        type: 'trabajo',
        parentGroupId: AMBITO,
        trabajoTipo: 'bifurcacion',
        trabajoEstado: 'convocando',
        proposito: 'Huerto comunitario',
        origenSolucionId: S,
        convocatoriaEndsAt: new Date(CONTADA.getTime() + 14 * DIA_MS),
      });
      expect(data).not.toHaveProperty('creadoPorProfileId');
      expect(res).toEqual({ id: data['id'] });
      expect(rules.getInt).toHaveBeenCalledWith('bifurcacion.plazo_dias', AMBITO);
      expect(tx.groupMembership.create).toHaveBeenCalledWith({ data: { groupId: data['id'], profileId: YO } });
    });

    it('la auditoría bifurcacion.started no registra actor, ip ni nada más que el grupo', async () => {
      const { id } = await service.iniciar(YO, S, NOW);
      expect(acciones()).toEqual(['bifurcacion.started']);
      expect(audit.log.mock.calls[0]![0]).toEqual({ action: 'bifurcacion.started', resource: `group:${id}`, metadata: { grupoId: id } });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain(YO);
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('u-yo');
    });

    it('el 403 es idéntico para quien votó otra cosa, para quien no votó y para quien se abstuvo', async () => {
      papeletas.set('p-abst', { abstencion: true, orden: [] });
      miembros.set('p-abst', new Set([AMBITO]));
      const errores = await Promise.all(
        [OTRA, 'p-nadie', 'p-abst'].map((p) => service.iniciar(p, S, NOW).catch((e: unknown) => e)),
      );
      for (const e of errores) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).getResponse()).toEqual((errores[0] as ForbiddenException).getResponse());
        expect((e as ForbiddenException).message).toBe(NO_ELEGIBLE);
      }
      expect(tx.group.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('quien la apoyó pero ya no es miembro del ámbito recibe el mismo 403', async () => {
      miembros.set(YO, new Set());
      const e = await service.iniciar(YO, S, NOW).catch((x: unknown) => x);
      expect((e as ForbiddenException).message).toBe(NO_ELEGIBLE);
    });

    it('una por solución: el índice único (P2002) da 409 fuera de la transacción y no audita', async () => {
      prisma.$transaction.mockRejectedValueOnce(p2002());
      const e = await service.iniciar(YO, S, NOW).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).message).toBe('Ya hay una iniciativa para esta solución: puedes sumarte a ella.');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('fuera del plazo da 409', async () => {
      const tarde = new Date(CONTADA.getTime() + 14 * DIA_MS);
      await expect(service.iniciar(YO, S, tarde)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.group.create).not.toHaveBeenCalled();
    });

    it('la ganadora, una oculta, un tema oculto o una decisión de un grupo de trabajo no se bifurcan (400)', async () => {
      papeletas.set(YO, { abstencion: false, orden: [GANADORA, S] });
      const casos = [
        solucion({ id: GANADORA }),
        solucion({ hidden: true }),
        solucion({ proposal: { ...solucion().proposal, hidden: true } }),
        solucion({ proposal: { ...solucion().proposal, group: { type: 'trabajo' } } }),
        solucion({}, { fase: 'votacion' }),
      ];
      for (const c of casos) {
        prisma.solucion.findUnique.mockResolvedValueOnce(c);
        await expect(service.iniciar(YO, c.id, NOW)).rejects.toBeInstanceOf(BadRequestException);
      }
      prisma.solucion.findUnique.mockResolvedValueOnce(null);
      await expect(service.iniciar(YO, 's-no', NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.group.create).not.toHaveBeenCalled();
    });

    it('con una sola candidata y sin quórum, orden = [S] («Apruebo») es elegible', async () => {
      prisma.solucion.findUnique.mockResolvedValue(
        solucion({}, { resultado: 'sin_quorum', modo: null, candidatas: [S], ganadoras: [] }),
      );
      papeletas.set(YO, { abstencion: false, orden: [S] });
      await expect(service.iniciar(YO, S, NOW)).resolves.toHaveProperty('id');
    });
  });

  describe('elegible', () => {
    it('solo quien tenía S en su orden y sigue en el ámbito', async () => {
      const g = bif();
      expect(await service.elegible(g, YO)).toBe(true);
      expect(await service.elegible(g, OTRA)).toBe(false);
      expect(await service.elegible(g, 'p-nadie')).toBe(false);
      miembros.set(YO, new Set());
      expect(await service.elegible(g, YO)).toBe(false);
    });
  });

  describe('pausa', () => {
    beforeEach(() => {
      prisma.group.updateMany.mockResolvedValue({ count: 1 });
    });

    it('quien organiza y es del ámbito la pausa con causa y detalle; audita con su actor', async () => {
      forums.canOrganize.mockResolvedValue(true);
      await service.pausar(YO, BIF, 'insultos_amenazas', 'Hubo amenazas en el foro.', '1.1.1.1');
      expect(forums.canOrganize).toHaveBeenCalledWith(YO, AMBITO);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: BIF, trabajoTipo: 'bifurcacion', trabajoEstado: 'activo' },
        data: {
          trabajoEstado: 'pausado',
          pausaCausa: 'insultos_amenazas',
          pausaDetalle: 'Hubo amenazas en el foro.',
          pausaApelacion: null,
          pausaApeladaAt: null,
        },
      });
      expect(acciones()).toEqual(['bifurcacion.paused']);
      expect(audit.log.mock.calls[0]![0].metadata).toEqual({ grupoId: BIF });
    });

    it('sin organizar, o sin ser del ámbito, 403', async () => {
      await expect(service.pausar(YO, BIF, 'spam', undefined, '1.1.1.1')).rejects.toBeInstanceOf(ForbiddenException);
      forums.canOrganize.mockResolvedValue(true);
      miembros.set(YO, new Set());
      await expect(service.pausar(YO, BIF, 'spam', undefined, '1.1.1.1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.group.updateMany).not.toHaveBeenCalled();
    });

    it('una que no está activa da 409; otro tipo de grupo da 400', async () => {
      forums.canOrganize.mockResolvedValue(true);
      prisma.group.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.pausar(YO, BIF, 'spam', undefined, '1.1.1.1')).rejects.toBeInstanceOf(ConflictException);
      prisma.group.findUnique.mockResolvedValue(bif({ trabajoTipo: 'subgrupo' }));
      await expect(service.pausar(YO, BIF, 'spam', undefined, '1.1.1.1')).rejects.toBeInstanceOf(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('un miembro apela una sola vez, sin actor en la auditoría', async () => {
      miembros.get(YO)!.add(BIF);
      prisma.group.findUnique.mockResolvedValue(bif({ trabajoEstado: 'pausado', pausaCausa: 'spam' }));
      await service.apelar(YO, BIF, 'No hubo spam, fue un malentendido.', NOW);
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: BIF, trabajoTipo: 'bifurcacion', trabajoEstado: 'pausado', pausaApelacion: null },
        data: { pausaApelacion: 'No hubo spam, fue un malentendido.', pausaApeladaAt: NOW },
      });
      expect(acciones()).toEqual(['bifurcacion.appealed']);
      expect(audit.log.mock.calls[0]![0]).not.toHaveProperty('actorId');
      expect(audit.log.mock.calls[0]![0].metadata).toEqual({ grupoId: BIF });

      prisma.group.updateMany.mockResolvedValue({ count: 0 });
      prisma.group.findUnique.mockResolvedValue(bif({ trabajoEstado: 'pausado', pausaApelacion: 'ya' }));
      const e = await service.apelar(YO, BIF, 'Otra apelación más larga.', NOW).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).message).toBe('Esta pausa ya fue apelada.');
    });

    it('quien no es miembro no apela (403) y una no pausada da 409', async () => {
      prisma.group.findUnique.mockResolvedValue(bif({ trabajoEstado: 'pausado' }));
      await expect(service.apelar(YO, BIF, 'Texto de apelación.', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      miembros.get(YO)!.add(BIF);
      prisma.group.findUnique.mockResolvedValue(bif());
      await expect(service.apelar(YO, BIF, 'Texto de apelación.', NOW)).rejects.toBeInstanceOf(ConflictException);
    });

    it('la mesa reanuda: vuelve a activo y limpia la pausa; audita resumed', async () => {
      forums.esMesa.mockResolvedValue(true);
      await service.resolver(YO, BIF, true, '1.1.1.1');
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: BIF, trabajoTipo: 'bifurcacion', trabajoEstado: 'pausado', pausaApeladaAt: { not: null } },
        data: { trabajoEstado: 'activo', pausaCausa: null, pausaDetalle: null, pausaApelacion: null, pausaApeladaAt: null },
      });
      expect(acciones()).toEqual(['bifurcacion.resumed']);
    });

    it('la mesa mantiene: sigue pausada, la apelación sale de la cola y no se puede volver a apelar', async () => {
      forums.esMesa.mockResolvedValue(true);
      await service.resolver(YO, BIF, false, '1.1.1.1');
      expect(prisma.group.updateMany).toHaveBeenCalledWith({
        where: { id: BIF, trabajoTipo: 'bifurcacion', trabajoEstado: 'pausado', pausaApeladaAt: { not: null } },
        data: { pausaApeladaAt: null },
      });
      expect(acciones()).toEqual([]);
    });

    it('quien no es de la mesa no resuelve (403); sin apelación pendiente, 409', async () => {
      await expect(service.resolver(YO, BIF, true, '1.1.1.1')).rejects.toBeInstanceOf(ForbiddenException);
      forums.esMesa.mockResolvedValue(true);
      prisma.group.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.resolver(YO, BIF, true, '1.1.1.1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('la cola de la mesa trae las apeladas sin ids ni nombres de miembros; fuera de la mesa, 403', async () => {
      await expect(service.apeladas(YO)).rejects.toBeInstanceOf(ForbiddenException);
      forums.esMesa.mockResolvedValue(true);
      const apeladaAt = new Date('2026-11-04T00:00:00Z');
      prisma.group.findMany.mockResolvedValue([
        bif({
          trabajoEstado: 'pausado',
          pausaCausa: 'spam',
          pausaDetalle: 'Publicidad.',
          pausaApelacion: 'No era publicidad.',
          pausaApeladaAt: apeladaAt,
          creadoPorProfileId: null,
        }),
      ]);
      prisma.solucion.findUnique.mockResolvedValue({ title: 'Huerto comunitario', proposalId: 't-1', hidden: false });
      const r = await service.apeladas(YO);
      expect(prisma.group.findMany.mock.calls[0]![0].where).toEqual({
        type: 'trabajo',
        trabajoTipo: 'bifurcacion',
        trabajoEstado: 'pausado',
        pausaApeladaAt: { not: null },
      });
      expect(r).toEqual([
        {
          grupoId: BIF,
          solucionTitulo: 'Huerto comunitario',
          proposalId: 't-1',
          causa: 'spam',
          detalle: 'Publicidad.',
          apelacion: 'No era publicidad.',
          apeladaAt: apeladaAt.toISOString(),
        },
      ]);
    });
  });

  describe('comisión propia', () => {
    it('un miembro de una bifurcación activa la pide: nace con la solución de origen', async () => {
      miembros.get(YO)!.add(BIF);
      const r = await service.pedirComision(YO, BIF, NOW);
      expect(r).toEqual({ id: 'g-com' });
      expect(comisiones.crearDeBifurcacion).toHaveBeenCalledWith(
        { id: BIF, parentGroupId: AMBITO, origenSolucionId: S },
        NOW,
      );
    });

    it('quien no es miembro no la pide (403); una pausada tampoco (409)', async () => {
      await expect(service.pedirComision(YO, BIF, NOW)).rejects.toBeInstanceOf(ForbiddenException);
      miembros.get(YO)!.add(BIF);
      prisma.group.findUnique.mockResolvedValue(bif({ trabajoEstado: 'pausado' }));
      await expect(service.pedirComision(YO, BIF, NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(comisiones.crearDeBifurcacion).not.toHaveBeenCalled();
    });
  });

  describe('vista', () => {
    it('banderas y pausa, sin ningún profileId', async () => {
      const g = bif({ trabajoEstado: 'pausado', pausaCausa: 'spam', pausaDetalle: 'Publicidad.' });
      prisma.solucion.findUnique.mockResolvedValue({ title: 'Huerto comunitario', proposalId: 't-1', hidden: false });
      const v = await service.vista(g, YO, true, true);
      expect(v).toEqual({
        solucionTitulo: 'Huerto comunitario',
        solucionId: S,
        proposalId: 't-1',
        pausa: { causa: 'spam', detalle: 'Publicidad.', apelada: false },
        puedoApelar: true,
        puedoPausar: false,
        puedoPedirComision: false,
        yaLlevada: false,
        comisionId: null,
      });
      expect(JSON.stringify(v)).not.toContain('p-');
    });

    it('comisionId: la comisión viva propia, solo para sus miembros', async () => {
      prisma.solucion.findUnique.mockResolvedValue({ title: 'Huerto comunitario', proposalId: 't-1', hidden: false });
      prisma.group.findFirst.mockResolvedValue({ id: 'g-com' });
      expect((await service.vista(bif({ trabajoEstado: 'pausado' }), YO, true, true)).comisionId).toBe('g-com');
      expect((await service.vista(bif(), YO, false, true)).comisionId).toBeNull();
    });

    it('activa: pide comisión si no hay una viva; ya llevada si existe la inquietud', async () => {
      prisma.solucion.findUnique.mockResolvedValue({ title: 'Huerto comunitario', proposalId: 't-1', hidden: false });
      forums.canOrganize.mockResolvedValue(true);
      let v = await service.vista(bif(), YO, true, true);
      expect(v).toMatchObject({ pausa: null, puedoApelar: false, puedoPausar: true, puedoPedirComision: true, yaLlevada: false });
      prisma.group.findFirst.mockResolvedValue({ id: 'g-com' });
      prisma.inquietud.findUnique.mockResolvedValue({ id: 'inq' });
      v = await service.vista(bif(), YO, true, true);
      expect(v).toMatchObject({ puedoPedirComision: false, yaLlevada: true, comisionId: 'g-com' });
      expect(prisma.group.findFirst).toHaveBeenLastCalledWith({
        where: { trabajoTipo: 'comision', origenSolucionId: S, trabajoEstado: { notIn: ['cerrado', 'archivado'] } },
        select: { id: true },
      });
    });
  });
});

describe('DTOs de bifurcación', () => {
  it('iniciar exige un UUID', async () => {
    expect(await validate(plainToInstance(IniciarBifurcacionDto, { solucionId: 'x' }))).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(IniciarBifurcacionDto, { solucionId: '11111111-1111-4111-8111-111111111111' })),
    ).toHaveLength(0);
  });
  it('la pausa exige una causa de la lista y un detalle de hasta 500', async () => {
    expect(await validate(plainToInstance(PausarBifurcacionDto, { causa: 'otra' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(PausarBifurcacionDto, { causa: 'spam' }))).toHaveLength(0);
    expect(await validate(plainToInstance(PausarBifurcacionDto, { causa: 'spam', detalle: 'x'.repeat(501) }))).not.toHaveLength(0);
  });
  it('la apelación va de 10 a 1000 caracteres, sin contar espacios de relleno', async () => {
    expect(await validate(plainToInstance(ApelarPausaDto, { texto: '   corto    ' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ApelarPausaDto, { texto: 'x'.repeat(10) }))).toHaveLength(0);
    expect(await validate(plainToInstance(ApelarPausaDto, { texto: 'x'.repeat(1001) }))).not.toHaveLength(0);
  });
  it('resolver exige un booleano', async () => {
    expect(await validate(plainToInstance(ResolverPausaDto, { reanudar: 'sí' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ResolverPausaDto, { reanudar: false }))).toHaveLength(0);
  });
});
