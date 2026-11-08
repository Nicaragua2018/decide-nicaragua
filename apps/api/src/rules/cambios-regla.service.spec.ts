import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import { CambiosReglaService } from './cambios-regla.service';
import { ProponerCambioDto } from './dto/proponer-cambio.dto';
import { GroupAccessService } from '../groups/group-access.service';
import { guardiaMock, publicadoresMock } from '../test/guardia-mock';

const YO = 'p-yo';
const ORIGEN = 'g-origen';
const GENERAL = 'g-general';
const TRABAJO = 'g-trabajo';
const OTRA = 'g-custom';
const DIA_MS = 86_400_000;

const GRUPOS: Record<string, { id: string; type: string; slug: string; parentGroupId: string | null; trabajoTipo: string | null; trabajoEstado: string | null }> = {
  [ORIGEN]: { id: ORIGEN, type: 'territorial_origin', slug: 'managua', parentGroupId: null, trabajoTipo: null, trabajoEstado: null },
  [GENERAL]: { id: GENERAL, type: 'custom', slug: GENERAL_GROUP_SLUG, parentGroupId: null, trabajoTipo: null, trabajoEstado: null },
  [TRABAJO]: { id: TRABAJO, type: 'trabajo', slug: 'trabajo-x', parentGroupId: ORIGEN, trabajoTipo: 'subgrupo', trabajoEstado: 'activo' },
  [OTRA]: { id: OTRA, type: 'custom', slug: 'otra', parentGroupId: null, trabajoTipo: null, trabajoEstado: null },
};

function build() {
  const tx = {
    proposal: { update: vi.fn().mockResolvedValue({}) },
    solucion: { create: vi.fn().mockResolvedValue({ id: 's-1' }) },
    cambioRegla: { create: vi.fn().mockResolvedValue({ id: 'c-1' }) },
  };
  const prisma = {
    group: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => GRUPOS[where.id] ?? null) },
    groupMembership: { findUnique: vi.fn().mockResolvedValue({ id: 'm-1' }) },
    profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u-yo' }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, prisma };
}

describe('CambiosReglaService', () => {
  let tx: ReturnType<typeof build>['tx'];
  let prisma: ReturnType<typeof build>['prisma'];
  let rules: { getInt: ReturnType<typeof vi.fn>; getChoice: ReturnType<typeof vi.fn> };
  let deliberation: { ensureDefaultForum: ReturnType<typeof vi.fn>; createTopicInDefaultForum: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: CambiosReglaService;
  let guardia: ReturnType<typeof guardiaMock>;
  const orden: string[] = [];

  beforeEach(() => {
    ({ tx, prisma } = build());
    orden.length = 0;
    rules = {
      getInt: vi.fn(async (key: string) => (key === 'debate.plazo_dias' ? 5 : 7)),
      getChoice: vi.fn().mockResolvedValue('sorteo'),
    };
    deliberation = {
      ensureDefaultForum: vi.fn(async () => {
        orden.push('foro');
        return { id: 'f-1' };
      }),
      createTopicInDefaultForum: vi.fn(async () => ({ id: 't-1' })),
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => {
      orden.push('tx');
      return fn(tx);
    });
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    guardia = guardiaMock();
    service = new CambiosReglaService(
      prisma as never,
      rules as never,
      deliberation as never,
      new GroupAccessService(prisma as never),
      audit as never,
      guardia as never,
      publicadoresMock() as never,
    );
  });

  const proponer = (over: Record<string, unknown> = {}) =>
    service.proponer(YO, { groupId: ORIGEN, key: 'inquietud.plazo_respuesta_dias', valor: '10', ...over } as never, 'ip');

  describe('guardia', () => {
    it('con motivo revisa el motivo como motivo_regla y encola el tema del cambio', async () => {
      guardia.antesDePublicar.mockResolvedValue({ revisado: false });
      await service.proponer(
        YO,
        { groupId: ORIGEN, key: 'inquietud.plazo_respuesta_dias', valor: '10', motivo: '  Siete días no alcanzan.  ' } as never,
        'ip',
        { pedirRevision: true },
      );
      expect(guardia.antesDePublicar).toHaveBeenCalledWith({
        tipo: 'motivo_regla',
        texto: 'Siete días no alcanzan.',
        autorProfileId: YO,
        args: { groupId: ORIGEN, key: 'inquietud.plazo_respuesta_dias', valor: '10', motivo: '  Siete días no alcanzan.  ' },
        pedirRevision: true,
      });
      expect(guardia.antesDePublicar.mock.invocationCallOrder[0]).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0] ?? 0);
      expect(guardia.despuesDePublicar).toHaveBeenCalledWith('tema', 't-1', false);
    });

    it('sin motivo no revisa ni encola', async () => {
      await proponer();
      await proponer({ motivo: '   ' });
      expect(guardia.antesDePublicar).not.toHaveBeenCalled();
      expect(guardia.despuesDePublicar).not.toHaveBeenCalled();
    });
  });

  describe('crea el tema como propuesta con una sola solución', () => {
    it('regla local: tema en el foro por defecto, propuesta con plazo de debate, solución y cambio', async () => {
      const antes = Date.now();
      expect(await proponer({ motivo: '  Siete días no alcanzan.  ' })).toEqual({ id: 'c-1', proposalId: 't-1' });
      expect(orden).toEqual(['foro', 'tx']);
      expect(deliberation.ensureDefaultForum).toHaveBeenCalledWith(ORIGEN);
      const cuerpo = 'Se propone cambiar «Plazo para responder una inquietud (días)» de 7 días a 10 días.\n\nSiete días no alcanzan.';
      expect(deliberation.createTopicInDefaultForum).toHaveBeenCalledWith(tx, {
        groupId: ORIGEN,
        authorProfileId: YO,
        title: 'Cambiar la regla: Plazo para responder una inquietud (días)',
        body: cuerpo,
        abiertoPorComunidad: false,
      });
      expect(rules.getInt).toHaveBeenCalledWith('inquietud.plazo_respuesta_dias', ORIGEN);
      expect(rules.getInt).toHaveBeenCalledWith('debate.plazo_dias', ORIGEN);
      const upd = tx.proposal.update.mock.calls[0]![0] as { where: unknown; data: { kind: string; deliberationEndsAt: Date } };
      expect(upd.where).toEqual({ id: 't-1' });
      expect(upd.data.kind).toBe('propuesta');
      const fin = upd.data.deliberationEndsAt.getTime();
      expect(fin).toBeGreaterThanOrEqual(antes + 5 * DIA_MS);
      expect(fin).toBeLessThanOrEqual(Date.now() + 5 * DIA_MS);
      expect(tx.solucion.create).toHaveBeenCalledWith({
        data: { proposalId: 't-1', authorProfileId: YO, title: 'Cambiar a 10 días', description: cuerpo, origen: 'persona' },
      });
      expect(tx.cambioRegla.create).toHaveBeenCalledWith({
        data: {
          key: 'inquietud.plazo_respuesta_dias',
          nivel: 'local',
          ambitoGroupId: ORIGEN,
          valorAnterior: '7',
          valorPropuesto: '10',
          proposalId: 't-1',
          autorProfileId: YO,
        },
      });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: 'u-yo',
        action: 'regla.cambio_propuesto',
        resource: 'cambio_regla:c-1',
        ip: 'ip',
        metadata: { cambioId: 'c-1', key: 'inquietud.plazo_respuesta_dias' },
      });
    });

    it('sin motivo, el cuerpo es solo la frase; una opción no lleva unidad', async () => {
      await proponer({ key: 'comision.forma', valor: 'preferencias' });
      const arg = deliberation.createTopicInDefaultForum.mock.calls[0]![1] as { body: string };
      expect(arg.body).toBe('Se propone cambiar «Forma de elegir a la comisión» de sorteo a preferencias.');
      expect(rules.getChoice).toHaveBeenCalledWith('comision.forma', ORIGEN);
      expect(tx.solucion.create.mock.calls[0]![0].data.title).toBe('Cambiar a preferencias');
    });

    it('regla de la colmena en el nivel general: vigente de la colmena, nivel colmena y ámbito general', async () => {
      await proponer({ groupId: GENERAL, key: 'reglas.participacion_minima', valor: '40' });
      expect(rules.getInt).toHaveBeenCalledWith('reglas.participacion_minima', null);
      expect(tx.cambioRegla.create.mock.calls[0]![0].data).toMatchObject({
        nivel: 'colmena', ambitoGroupId: GENERAL, valorAnterior: '7', valorPropuesto: '40',
      });
      expect(tx.solucion.create.mock.calls[0]![0].data.title).toBe('Cambiar a 40 %');
    });

    it('un entero se guarda normalizado («010» → «10»)', async () => {
      await proponer({ valor: ' 010 ' });
      expect(tx.cambioRegla.create.mock.calls[0]![0].data.valorPropuesto).toBe('10');
    });
  });

  describe('validaciones', () => {
    const noCrea = () => {
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    };

    it('fuera de límites o no entero: «El valor debe estar entre {min} y {max}.»', async () => {
      for (const valor of ['0', '31', 'abc', '7.5', '', '-3']) {
        await expect(proponer({ valor })).rejects.toThrow(new BadRequestException('El valor debe estar entre 1 y 30.'));
      }
      noCrea();
    });

    it('una opción que no existe: «Elige una de las opciones.»', async () => {
      await expect(proponer({ key: 'comision.forma', valor: 'dedazo' })).rejects.toThrow(
        new BadRequestException('Elige una de las opciones.'),
      );
      noCrea();
    });

    it('igual al vigente: «Ese ya es el valor vigente.»', async () => {
      for (const valor of ['7', '07']) {
        await expect(proponer({ valor })).rejects.toThrow(new BadRequestException('Ese ya es el valor vigente.'));
      }
      await expect(proponer({ key: 'comision.forma', valor: 'sorteo' })).rejects.toThrow('Ese ya es el valor vigente.');
      noCrea();
    });

    it('una regla de la colmena fuera del nivel general', async () => {
      await expect(proponer({ key: 'observadores.numero', valor: '9' })).rejects.toThrow(
        new BadRequestException('Las reglas de la colmena se cambian en «Exilio y diáspora».'),
      );
      noCrea();
    });

    it('una regla de la colmena que aún no tiene efecto no se puede proponer (400)', async () => {
      await expect(proponer({ groupId: GENERAL, key: 'revocacion.fraccion', valor: '40' })).rejects.toThrow(
        new BadRequestException('Esta regla aún no tiene efecto: se conecta con las elecciones (plan 3C).'),
      );
      noCrea();
    });

    it('puestos de una comisión: el mínimo no puede pasar del máximo vigente (ni el máximo bajar del mínimo)', async () => {
      // El doble de RulesService da 7 a ambas reglas.
      const msg = new BadRequestException('El mínimo de puestos no puede ser mayor que el máximo.');
      await expect(proponer({ key: 'comision.puestos_min', valor: '8' })).rejects.toThrow(msg);
      expect(rules.getInt).toHaveBeenCalledWith('comision.puestos_max', ORIGEN);
      await expect(proponer({ key: 'comision.puestos_max', valor: '6' })).rejects.toThrow(msg);
      expect(rules.getInt).toHaveBeenCalledWith('comision.puestos_min', ORIGEN);
      noCrea();
      await proponer({ key: 'comision.puestos_min', valor: '5' });
      await proponer({ key: 'comision.puestos_max', valor: '9' });
      expect(tx.cambioRegla.create).toHaveBeenCalledTimes(2);
    });

    it('una regla local también se cambia en el nivel general (con su valor local)', async () => {
      await proponer({ groupId: GENERAL });
      expect(rules.getInt).toHaveBeenCalledWith('inquietud.plazo_respuesta_dias', GENERAL);
      expect(tx.cambioRegla.create.mock.calls[0]![0].data).toMatchObject({ nivel: 'local', ambitoGroupId: GENERAL });
    });

    it('un grupo de trabajo o una comunidad que no es ámbito no cambian reglas (400)', async () => {
      await expect(proponer({ groupId: TRABAJO })).rejects.toBeInstanceOf(BadRequestException);
      await expect(proponer({ groupId: OTRA })).rejects.toBeInstanceOf(BadRequestException);
      noCrea();
    });

    it('una regla desconocida (400) y una comunidad que no existe (404)', async () => {
      await expect(proponer({ key: 'no.existe' })).rejects.toThrow(new BadRequestException('Esa regla no existe.'));
      await expect(proponer({ groupId: 'g-nada' })).rejects.toBeInstanceOf(NotFoundException);
      noCrea();
    });

    it('quien no es miembro (o está suspendida y perdió la membresía) no propone (403)', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(proponer()).rejects.toBeInstanceOf(ForbiddenException);
      expect(deliberation.ensureDefaultForum).not.toHaveBeenCalled();
      noCrea();
    });
  });

  describe('un solo cambio abierto por regla y ámbito', () => {
    it('el P2002 del índice parcial se captura fuera de la transacción y responde 409', async () => {
      tx.cambioRegla.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: {} }),
      );
      await expect(proponer()).rejects.toThrow(new ConflictException('Ya hay un cambio en curso para esta regla.'));
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('otro error se propaga tal cual', async () => {
      tx.cambioRegla.create.mockRejectedValue(new Error('boom'));
      await expect(proponer()).rejects.toThrow('boom');
    });
  });

  describe('DTO', () => {
    const base = { groupId: '3f0f6a7e-5c1d-4b8a-9d2e-1a2b3c4d5e6f', key: 'debate.plazo_dias', valor: '10' };
    const errores = async (o: Record<string, unknown>) => validate(plainToInstance(ProponerCambioDto, { ...base, ...o }));

    it('acepta lo mínimo y recorta el motivo', async () => {
      expect(await errores({})).toHaveLength(0);
      const dto = plainToInstance(ProponerCambioDto, { ...base, motivo: '  porque sí  ' });
      expect(dto.motivo).toBe('porque sí');
      expect(await errores({ motivo: 'a'.repeat(1000) })).toHaveLength(0);
    });

    it('rechaza comunidad no UUID, valor no texto o largo y motivo de más de 1000', async () => {
      expect(await errores({ groupId: 'nada' })).toHaveLength(1);
      expect(await errores({ valor: 10 })).toHaveLength(1);
      expect(await errores({ valor: 'a'.repeat(41) })).toHaveLength(1);
      expect(await errores({ key: 'k'.repeat(81) })).toHaveLength(1);
      expect(await errores({ motivo: 'a'.repeat(1001) })).toHaveLength(1);
    });
  });
});

// ─── Aplicar el resultado ─────────────────────────────────────────────────────

interface FilaCambio {
  id: string;
  key: string;
  nivel: string;
  ambitoGroupId: string;
  valorPropuesto: string;
  estado: string;
  boardActionId: string | null;
  resueltoAt: Date | null;
  decision: { fase: string; resultado: string | null };
}

/** Base en memoria: el `updateMany` condicionado decide quién se queda con cada cambio. */
function fakeDb(filas: FilaCambio[]) {
  const cambios = new Map(filas.map((f) => [f.id, { ...f }]));
  const ruleValues: { id: string; key: string; groupId: string | null; value: string }[] = [];
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    cambioRegla: {
      findMany: vi.fn(async () =>
        [...cambios.values()]
          .filter((c) => c.estado === 'en_votacion' && ['contada', 'cancelada'].includes(c.decision.fase))
          .map((c) => ({ id: c.id })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const c = cambios.get(where.id);
        return c ? { ...c, proposal: { decision: { ...c.decision } } } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; estado: string }; data: Partial<FilaCambio> }) => {
        const c = cambios.get(where.id);
        if (!c || c.estado !== where.estado) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FilaCambio> }) => {
        const c = cambios.get(where.id)!;
        Object.assign(c, data);
        return c;
      }),
    },
    ruleValue: {
      findFirst: vi.fn(async ({ where }: { where: { key: string; groupId: string | null } }) =>
        ruleValues.find((r) => r.key === where.key && r.groupId === where.groupId) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { value: string } }) => {
        const r = ruleValues.find((x) => x.id === where.id)!;
        r.value = data.value;
        return r;
      }),
      create: vi.fn(async ({ data }: { data: { key: string; groupId: string | null; value: string } }) => {
        const r = { id: `rv-${ruleValues.length + 1}`, ...data };
        ruleValues.push(r);
        return r;
      }),
    },
    boardAction: { create: vi.fn().mockResolvedValue({ id: 'a-1' }) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(db)),
  };
  return { db, cambios, ruleValues };
}

const fila = (over: Partial<FilaCambio> = {}): FilaCambio => ({
  id: 'c-1',
  key: 'inquietud.plazo_respuesta_dias',
  nivel: 'local',
  ambitoGroupId: ORIGEN,
  valorPropuesto: '10',
  estado: 'en_votacion',
  boardActionId: null,
  resueltoAt: null,
  decision: { fase: 'contada', resultado: 'aprobada' },
  ...over,
});

describe('CambiosReglaService.procesarResultados()', () => {
  let audit: { log: ReturnType<typeof vi.fn> };

  const crear = (filas: FilaCambio[]) => {
    const f = fakeDb(filas);
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    const service = new CambiosReglaService(f.db as never, {} as never, {} as never, {} as never, audit as never, {} as never, {} as never);
    return { ...f, service };
  };

  it('local aprobado: guarda el valor del ámbito y queda aplicado, con la fila bloqueada', async () => {
    const { db, service, cambios, ruleValues } = crear([fila()]);
    expect(await service.procesarResultados()).toBe(1);
    expect(ruleValues).toEqual([{ id: 'rv-1', key: 'inquietud.plazo_respuesta_dias', groupId: ORIGEN, value: '10' }]);
    expect(cambios.get('c-1')).toMatchObject({ estado: 'aplicado' });
    expect(cambios.get('c-1')!.resueltoAt).toBeInstanceOf(Date);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.cambioRegla.updateMany.mock.calls[0]![0].where).toEqual({ id: 'c-1', estado: 'en_votacion' });
    expect(db.boardAction.create).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith({
      action: 'regla.cambio_aplicado',
      resource: 'cambio_regla:c-1',
      metadata: { cambioId: 'c-1', key: 'inquietud.plazo_respuesta_dias' },
    });
  });

  it('local aprobado con valor ya guardado: lo actualiza', async () => {
    const { service, ruleValues } = crear([fila()]);
    ruleValues.push({ id: 'rv-0', key: 'inquietud.plazo_respuesta_dias', groupId: ORIGEN, value: '7' });
    await service.procesarResultados();
    expect(ruleValues).toEqual([{ id: 'rv-0', key: 'inquietud.plazo_respuesta_dias', groupId: ORIGEN, value: '10' }]);
  });

  it('colmena aprobado: crea la acción de la mesa sin proponente ni persona objetivo y queda pendiente_mesa', async () => {
    const { db, service, cambios, ruleValues } = crear([
      fila({ key: 'reglas.participacion_minima', nivel: 'colmena', ambitoGroupId: GENERAL, valorPropuesto: '40' }),
    ]);
    expect(await service.procesarResultados()).toBe(1);
    expect(db.boardAction.create).toHaveBeenCalledWith({
      data: {
        type: 'change_rule',
        params: { key: 'reglas.participacion_minima', valor: '40', cambioId: 'c-1' },
        reason: 'Cambio de regla aprobado por la comunidad',
      },
      select: { id: true },
    });
    expect(cambios.get('c-1')).toMatchObject({ estado: 'pendiente_mesa', boardActionId: 'a-1', resueltoAt: null });
    expect(ruleValues).toEqual([]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'regla.cambio_enviado_a_mesa' }));
  });

  it('sin_quorum → sin_participacion; ninguna, empate y sin_soluciones → rechazado; cancelada → anulado', async () => {
    const { service, cambios, ruleValues } = crear([
      fila({ id: 'c-q', decision: { fase: 'contada', resultado: 'sin_quorum' } }),
      fila({ id: 'c-n', decision: { fase: 'contada', resultado: 'ninguna' } }),
      fila({ id: 'c-e', decision: { fase: 'contada', resultado: 'empate' } }),
      fila({ id: 'c-s', decision: { fase: 'contada', resultado: 'sin_soluciones' } }),
      fila({ id: 'c-x', decision: { fase: 'cancelada', resultado: null } }),
    ]);
    expect(await service.procesarResultados()).toBe(5);
    expect(cambios.get('c-q')!.estado).toBe('sin_participacion');
    expect(cambios.get('c-n')!.estado).toBe('rechazado');
    expect(cambios.get('c-e')!.estado).toBe('rechazado');
    expect(cambios.get('c-s')!.estado).toBe('rechazado');
    expect(cambios.get('c-x')!.estado).toBe('anulado');
    for (const id of ['c-q', 'c-n', 'c-e', 'c-s', 'c-x']) expect(cambios.get(id)!.resueltoAt).toBeInstanceOf(Date);
    expect(ruleValues).toEqual([]);
    const acciones = audit.log.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(acciones.filter((a) => a === 'regla.cambio_rechazado')).toHaveLength(5);
  });

  it('una votación que sigue abierta no se toca', async () => {
    const { service, cambios } = crear([fila({ decision: { fase: 'votacion', resultado: null } })]);
    expect(await service.procesarResultados()).toBe(0);
    expect(cambios.get('c-1')!.estado).toBe('en_votacion');
  });

  it('busca solo cambios en votación con la decisión contada o cancelada', async () => {
    const { db, service } = crear([]);
    await service.procesarResultados();
    expect(db.cambioRegla.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { estado: 'en_votacion', proposal: { decision: { fase: { in: ['contada', 'cancelada'] } } } },
    }));
  });

  it('puestos: un mínimo aprobado que ya pasa del máximo vigente del ámbito queda rechazado y no se guarda', async () => {
    const { service, cambios, ruleValues } = crear([
      fila({ id: 'c-min', key: 'comision.puestos_min', valorPropuesto: '6' }),
      fila({ id: 'c-max', key: 'comision.puestos_max', ambitoGroupId: GENERAL, valorPropuesto: '3' }),
      fila({ id: 'c-ok', key: 'comision.puestos_min', ambitoGroupId: 'g-otra', valorPropuesto: '4' }),
    ]);
    ruleValues.push({ id: 'rv-a', key: 'comision.puestos_max', groupId: ORIGEN, value: '5' });
    ruleValues.push({ id: 'rv-b', key: 'comision.puestos_min', groupId: GENERAL, value: '4' });
    await service.procesarResultados();
    expect(cambios.get('c-min')!.estado).toBe('rechazado');
    expect(cambios.get('c-max')!.estado).toBe('rechazado');
    // Sin valor guardado, el máximo vigente es el de por defecto (7).
    expect(cambios.get('c-ok')!.estado).toBe('aplicado');
    expect(ruleValues.map((r) => r.id)).toEqual(['rv-a', 'rv-b', 'rv-3']);
  });

  it('dos pasadas a la vez aplican el cambio una sola vez', async () => {
    const { service, ruleValues } = crear([fila()]);
    const [a, b] = await Promise.all([service.procesarResultados(), service.procesarResultados()]);
    expect(a + b).toBe(1);
    expect(ruleValues).toHaveLength(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('dos pasadas a la vez crean una sola acción de la mesa', async () => {
    const { db, service } = crear([fila({ key: 'reglas.participacion_minima', nivel: 'colmena', valorPropuesto: '40' })]);
    await Promise.all([service.procesarResultados(), service.procesarResultados()]);
    expect(db.boardAction.create).toHaveBeenCalledTimes(1);
  });

  it('un valor que ya no cabe en los límites al aplicar no se guarda: el cambio queda rechazado', async () => {
    const { db, service, cambios, ruleValues } = crear([
      fila({ id: 'c-l', valorPropuesto: '31' }),
      fila({ id: 'c-c', key: 'reglas.participacion_minima', nivel: 'colmena', valorPropuesto: '5' }),
      fila({ id: 'c-o', key: 'comision.forma', valorPropuesto: 'dedazo' }),
      fila({ id: 'c-k', key: 'no.existe' }),
      fila({ id: 'c-n', key: 'reglas.participacion_minima', nivel: 'local', valorPropuesto: '40' }),
    ]);
    await service.procesarResultados();
    for (const id of ['c-l', 'c-c', 'c-o', 'c-k', 'c-n']) expect(cambios.get(id)!.estado).toBe('rechazado');
    expect(ruleValues).toEqual([]);
    expect(db.boardAction.create).not.toHaveBeenCalled();
  });

  it('un error en un cambio no detiene a los demás', async () => {
    const { db, service, cambios } = crear([fila({ id: 'c-a' }), fila({ id: 'c-b', key: 'debate.plazo_dias', valorPropuesto: '5' })]);
    db.ruleValue.create.mockRejectedValueOnce(new Error('boom'));
    expect(await service.procesarResultados()).toBe(1);
    expect(cambios.get('c-b')!.estado).toBe('aplicado');
  });
});

describe('CambiosReglaService.vencerPendientesMesa()', () => {
  const AHORA = new Date('2026-12-15T12:00:00Z');
  const DIA = 86_400_000;

  function crear(acciones: { id: string; status: string; createdAt: Date }[], cambios: { id: string; key: string; boardActionId: string; estado: string; resueltoAt?: Date }[]) {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      boardAction: {
        findMany: vi.fn(async ({ where }: { where: { createdAt: { lt: Date } } }) =>
          acciones.filter((a) => a.status === 'pending' && a.createdAt < where.createdAt.lt).map((a) => ({ id: a.id })),
        ),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string; createdAt: { lt: Date } }; data: { status: string } }) => {
          const a = acciones.find((x) => x.id === where.id);
          if (!a || a.status !== where.status || !(a.createdAt < where.createdAt.lt)) return { count: 0 };
          a.status = data.status;
          return { count: 1 };
        }),
      },
      cambioRegla: {
        findFirst: vi.fn(async ({ where }: { where: { boardActionId: string; estado: string } }) => {
          const c = cambios.find((x) => x.boardActionId === where.boardActionId && x.estado === where.estado);
          return c ? { id: c.id, key: c.key } : null;
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; estado: string }; data: { estado: string; resueltoAt: Date } }) => {
          const c = cambios.find((x) => x.id === where.id);
          if (!c || c.estado !== where.estado) return { count: 0 };
          Object.assign(c, data);
          return { count: 1 };
        }),
      },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(db)),
    };
    const audit = { log: vi.fn().mockResolvedValue(undefined) };
    const service = new CambiosReglaService(db as never, {} as never, {} as never, {} as never, audit as never, {} as never, {} as never);
    return { db, audit, service };
  }

  it('pasados 30 días sin resolver, la acción de la mesa queda rechazada y el cambio rechazado_mesa (sin actor)', async () => {
    const acciones = [
      { id: 'a-vieja', status: 'pending', createdAt: new Date(AHORA.getTime() - 31 * DIA) },
      { id: 'a-nueva', status: 'pending', createdAt: new Date(AHORA.getTime() - 29 * DIA) },
    ];
    const cambios = [
      { id: 'c-v', key: 'reglas.participacion_minima', boardActionId: 'a-vieja', estado: 'pendiente_mesa' },
      { id: 'c-n', key: 'reglas.participacion_minima', boardActionId: 'a-nueva', estado: 'pendiente_mesa' },
    ];
    const { db, audit, service } = crear(acciones, cambios);

    expect(await service.vencerPendientesMesa(AHORA)).toBe(1);

    expect(db.boardAction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: 'change_rule', status: 'pending', createdAt: { lt: new Date(AHORA.getTime() - 30 * DIA) } },
    }));
    const bloqueo = db.$queryRaw.mock.calls[0]![0] as { strings: string[]; values: unknown[] };
    expect(bloqueo.strings.join('?')).toContain('FROM board_actions WHERE id = ?::uuid FOR UPDATE');
    expect(bloqueo.values).toEqual(['a-vieja']);
    expect(acciones.map((a) => a.status)).toEqual(['rejected', 'pending']);
    expect(cambios[0]).toMatchObject({ estado: 'rechazado_mesa', resueltoAt: AHORA });
    expect(cambios[1]!.estado).toBe('pendiente_mesa');
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith({
      action: 'regla.cambio_rechazado',
      resource: 'cambio_regla:c-v',
      metadata: { cambioId: 'c-v', key: 'reglas.participacion_minima' },
    });
  });

  it('si la mesa la resolvió justo antes, no se toca (condicionado a pending)', async () => {
    const acciones = [{ id: 'a-1', status: 'pending', createdAt: new Date(AHORA.getTime() - 40 * DIA) }];
    const cambios = [{ id: 'c-1', key: 'reglas.participacion_minima', boardActionId: 'a-1', estado: 'pendiente_mesa' }];
    const { db, audit, service } = crear(acciones, cambios);
    db.boardAction.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.vencerPendientesMesa(AHORA)).toBe(0);
    expect(cambios[0]!.estado).toBe('pendiente_mesa');
    expect(audit.log).not.toHaveBeenCalled();
  });
});
