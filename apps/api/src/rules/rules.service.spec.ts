import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RulesService } from './rules.service';

interface Row {
  key: string;
  groupId: string | null;
  value: string;
}

interface Cambio {
  id: string;
  key: string;
  nivel: string;
  ambitoGroupId: string;
  valorAnterior: string;
  valorPropuesto: string;
  estado: string;
  proposalId: string;
  autorProfileId: string;
  createdAt: Date;
  resueltoAt: Date | null;
}

const GENERAL = 'g-general';

function build(rows: Row[], cambios: Cambio[] = [], miembroDe: string[] = []) {
  const matches = (r: Row, where: { key?: string; groupId?: string | null }) =>
    (where.key === undefined || r.key === where.key) &&
    (where.groupId === undefined || r.groupId === where.groupId);
  return {
    ruleValue: {
      findFirst: vi.fn(async ({ where }: { where: { key?: string; groupId?: string | null } }) =>
        rows.find((r) => matches(r, where)) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { OR: { groupId: string | null }[] } }) =>
        rows.filter((r) => where.OR.some((c) => c.groupId === r.groupId)),
      ),
    },
    // Solo los abiertos van por Prisma; los resueltos, por SQL con un tope por regla.
    cambioRegla: {
      findMany: vi.fn(async ({ where }: { where: { estado: { in: string[] }; OR: { nivel: string; ambitoGroupId?: string }[] } }) =>
        cambios.filter(
          (c) =>
            where.estado.in.includes(c.estado) &&
            where.OR.some((o) => o.nivel === c.nivel && (o.ambitoGroupId === undefined || o.ambitoGroupId === c.ambitoGroupId)),
        ),
      ),
    },
    $queryRaw: vi.fn(async (q: { values: unknown[] }) =>
      cambios.filter(
        (c) =>
          !['en_votacion', 'pendiente_mesa'].includes(c.estado) &&
          (c.nivel === 'colmena' || (c.nivel === 'local' && q.values.includes(c.ambitoGroupId))),
      ),
    ),
    group: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) => {
        if (where.slug === 'general' || where.id === GENERAL) return { id: GENERAL, type: 'custom', slug: 'general' };
        if (where.id === 'g1') return { id: 'g1', type: 'territorial_origin', slug: 'managua' };
        if (where.id === 'g-trabajo') return { id: 'g-trabajo', type: 'trabajo', slug: 'trabajo-x' };
        return null;
      }),
    },
    groupMembership: {
      findMany: vi.fn(async ({ where }: { where: { profileId: string; groupId: { in: string[] } } }) =>
        where.profileId === 'p-yo' ? where.groupId.in.filter((g) => miembroDe.includes(g)).map((groupId) => ({ groupId })) : [],
      ),
    },
  };
}

describe('RulesService', () => {
  let rows: Row[];
  let service: RulesService;

  beforeEach(() => {
    rows = [];
    service = new RulesService(build(rows) as never);
  });

  it('getInt devuelve el defecto sin filas guardadas', async () => {
    expect(await service.getInt('inquietud.plazo_respuesta_dias', 'g1')).toBe(7);
  });

  it('getInt devuelve el valor local si existe', async () => {
    rows.push({ key: 'inquietud.plazo_respuesta_dias', groupId: 'g1', value: '10' });
    expect(await service.getInt('inquietud.plazo_respuesta_dias', 'g1')).toBe(10);
    expect(await service.getInt('inquietud.plazo_respuesta_dias', 'g2')).toBe(7);
  });

  it('getInt usa el valor de colmena guardado para una regla de colmena', async () => {
    rows.push({ key: 'observadores.numero', groupId: null, value: '9' });
    expect(await service.getInt('observadores.numero', null)).toBe(9);
  });

  it('para una regla de colmena ignora una fila local con el mismo key', async () => {
    rows.push({ key: 'observadores.numero', groupId: 'g1', value: '12' });
    expect(await service.getInt('observadores.numero', 'g1')).toBe(7);
  });

  it('un valor fuera de límites o no numérico devuelve el defecto', async () => {
    rows.push({ key: 'inquietud.plazo_respuesta_dias', groupId: 'g1', value: '99' });
    expect(await service.getInt('inquietud.plazo_respuesta_dias', 'g1')).toBe(7);
    rows[0]!.value = 'abc';
    expect(await service.getInt('inquietud.plazo_respuesta_dias', 'g1')).toBe(7);
    rows[0]!.value = '3.5';
    expect(await service.getInt('inquietud.plazo_respuesta_dias', 'g1')).toBe(7);
  });

  it('getInt sobre una regla de opciones lanza error', async () => {
    await expect(service.getInt('comision.forma', 'g1')).rejects.toThrow();
  });

  it('getChoice devuelve defecto, valor local y defecto si la opción es inválida', async () => {
    expect(await service.getChoice('comision.forma', 'g1')).toBe('sorteo');
    rows.push({ key: 'comision.forma', groupId: 'g1', value: 'preferencias' });
    expect(await service.getChoice('comision.forma', 'g1')).toBe('preferencias');
    rows[0]!.value = 'otra';
    expect(await service.getChoice('comision.forma', 'g1')).toBe('sorteo');
  });

  it('getChoice sobre una regla numérica lanza error', async () => {
    await expect(service.getChoice('observadores.numero', null)).rejects.toThrow();
  });

  it('list(null) no incluye reglas locales', async () => {
    const list = await service.list(null);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((r) => r.level === 'colmena')).toBe(true);
  });

  it('list(g1) incluye locales y marca isDefault false en la que tiene fila', async () => {
    rows.push({ key: 'debate.plazo_dias', groupId: 'g1', value: '14' });
    const list = await service.list('g1');
    expect(list.some((r) => r.level === 'local')).toBe(true);
    const r = list.find((x) => x.key === 'debate.plazo_dias')!;
    expect(r.value).toBe('14');
    expect(r.isDefault).toBe(false);
    const otra = list.find((x) => x.key === 'debate.minimo_para_grupos')!;
    expect(otra.isDefault).toBe(true);
    expect(otra.value).toBe(otra.default);
  });

  describe('cambios en curso, historial y puedoProponer', () => {
    const DIA = 86_400_000;
    const BASE = new Date('2026-11-01T00:00:00Z').getTime();
    let n = 0;
    const cambio = (over: Partial<Cambio>): Cambio => {
      n += 1;
      return {
        id: `c-${n}`,
        key: 'debate.plazo_dias',
        nivel: 'local',
        ambitoGroupId: 'g1',
        valorAnterior: '7',
        valorPropuesto: '10',
        estado: 'rechazado',
        proposalId: `t-${n}`,
        autorProfileId: 'p-autor',
        createdAt: new Date(BASE + n * DIA),
        resueltoAt: new Date(BASE + (n + 20) * DIA),
        ...over,
      };
    };
    const conCambios = (cambios: Cambio[], miembroDe: string[] = []) => new RulesService(build([], cambios, miembroDe) as never);

    it('enCurso es el cambio abierto de esa regla en ese ámbito; el historial, los 10 últimos resueltos', async () => {
      const resueltos = Array.from({ length: 12 }, () => cambio({}));
      const abierto = cambio({ estado: 'en_votacion', resueltoAt: null, valorPropuesto: '14' });
      const deOtroGrupo = cambio({ ambitoGroupId: 'g2', estado: 'en_votacion', resueltoAt: null });
      const s = conCambios([...resueltos, abierto, deOtroGrupo], ['g1']);
      const r = (await s.list('g1', 'p-yo')).find((x) => x.key === 'debate.plazo_dias')!;
      expect(r.enCurso).toEqual({
        id: abierto.id, key: 'debate.plazo_dias', nivel: 'local', valorAnterior: '7', valorPropuesto: '14',
        estado: 'en_votacion', proposalId: abierto.proposalId, createdAt: abierto.createdAt.toISOString(), resueltoAt: null,
      });
      expect(r.historial).toHaveLength(10);
      expect(r.historial.map((h) => h.id)).toEqual(resueltos.slice(2).reverse().map((c) => c.id));
      expect(r.historial[0]!.resueltoAt).toBe(resueltos[11]!.resueltoAt!.toISOString());
      expect(JSON.stringify(r)).not.toContain('p-autor');
      // Hay un cambio abierto: no se puede proponer otro.
      expect(r.puedoProponer).toBe(false);
      const otra = (await s.list('g1', 'p-yo')).find((x) => x.key === 'debate.minimo_para_grupos')!;
      expect(otra).toMatchObject({ enCurso: null, historial: [], puedoProponer: true });
    });

    it('lecturas acotadas: abiertos por Prisma y, de los resueltos, como mucho 10 por regla (SQL con ventana)', async () => {
      const db = build([], [], []);
      await new RulesService(db as never).list('g1');
      expect(db.cambioRegla.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          estado: { in: ['en_votacion', 'pendiente_mesa'] },
          OR: [{ nivel: 'colmena' }, { nivel: 'local', ambitoGroupId: 'g1' }],
        },
      }));
      const q = db.$queryRaw.mock.calls[0]![0] as unknown as { strings: string[]; values: unknown[] };
      const sql = q.strings.join('?');
      expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY c.key, c.nivel');
      expect(sql).toContain("NOT IN ('en_votacion', 'pendiente_mesa')");
      expect(q.values).toEqual(['g1', 10]);
    });

    it('pendiente_mesa también cuenta como en curso', async () => {
      const s = conCambios([cambio({ key: 'observadores.numero', nivel: 'colmena', ambitoGroupId: GENERAL, estado: 'pendiente_mesa', resueltoAt: null })]);
      const r = (await s.list(null)).find((x) => x.key === 'observadores.numero')!;
      expect(r.enCurso?.estado).toBe('pendiente_mesa');
    });

    it('puedoProponer: local solo para miembros de una comunidad ámbito; colmena solo para miembros del nivel general', async () => {
      let s = conCambios([], ['g1']);
      let list = await s.list('g1', 'p-yo');
      expect(list.find((x) => x.key === 'debate.plazo_dias')!.puedoProponer).toBe(true);
      expect(list.find((x) => x.key === 'reglas.participacion_minima')!.puedoProponer).toBe(false);
      s = conCambios([], ['g1', GENERAL]);
      list = await s.list('g1', 'p-yo');
      expect(list.find((x) => x.key === 'reglas.participacion_minima')!.puedoProponer).toBe(true);
      // Sin perfil (página pública) nunca.
      expect((await s.list(null)).every((x) => !x.puedoProponer)).toBe(true);
      // Un grupo de trabajo no cambia reglas locales.
      s = conCambios([], ['g-trabajo']);
      list = await s.list('g-trabajo', 'p-yo');
      expect(list.filter((x) => x.level === 'local').every((x) => !x.puedoProponer)).toBe(true);
    });

    it('una regla sin conectar lleva conectada = false y nunca puedoProponer', async () => {
      const s = conCambios([], ['g1', GENERAL]);
      const list = await s.list('g1', 'p-yo');
      const obs = list.find((x) => x.key === 'observadores.numero')!;
      expect(obs).toMatchObject({ conectada: false, puedoProponer: false });
      expect(list.find((x) => x.key === 'invitaciones.pendientes_max')).toMatchObject({ conectada: true, puedoProponer: true });
      expect(list.find((x) => x.key === 'debate.plazo_dias')).toMatchObject({ conectada: true, puedoProponer: true });
    });

    it('list(null) da el historial de la colmena sin datos del autor', async () => {
      const s = conCambios([
        cambio({ key: 'observadores.numero', nivel: 'colmena', ambitoGroupId: GENERAL, estado: 'aplicado' }),
        cambio({ key: 'debate.plazo_dias', nivel: 'local', ambitoGroupId: 'g1', estado: 'aplicado' }),
      ]);
      const list = await s.list(null);
      expect(list.find((x) => x.key === 'observadores.numero')!.historial).toHaveLength(1);
      expect(JSON.stringify(list)).not.toContain('p-autor');
      expect(JSON.stringify(list)).not.toContain('ambitoGroupId');
    });
  });
});
