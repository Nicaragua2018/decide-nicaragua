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
    service = new CambiosReglaService(
      prisma as never,
      rules as never,
      deliberation as never,
      new GroupAccessService(prisma as never),
      audit as never,
    );
  });

  const proponer = (over: Record<string, unknown> = {}) =>
    service.proponer(YO, { groupId: ORIGEN, key: 'inquietud.plazo_respuesta_dias', valor: '10', ...over } as never, 'ip');

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
