import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RulesService } from './rules.service';

interface Row {
  key: string;
  groupId: string | null;
  value: string;
}

function build(rows: Row[]) {
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
});
