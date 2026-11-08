import { describe, expect, it } from 'vitest';
import { contarEleccion, ordenSchulze } from './conteo';

const pap = (...orden: string[]) => ({ abstencion: false, orden });
const abst = () => ({ abstencion: true, orden: [] as string[] });
const repetir = <T>(n: number, x: T): T[] => Array.from({ length: n }, () => x);

const base = { miembros: 10, quorumPct: 20, semilla: 'semilla-publica' };

describe('ordenSchulze', () => {
  it('devuelve niveles con empates', () => {
    // A gana a todas; B y C empatan; D pierde contra todas.
    const m = [
      [0, 5, 5, 5],
      [1, 0, 3, 5],
      [1, 3, 0, 5],
      [1, 1, 1, 0],
    ];
    expect(ordenSchulze(m, ['A', 'B', 'C', 'D'])).toEqual([['A'], ['B', 'C'], ['D']]);
  });

  it('sin candidatas devuelve sin niveles', () => {
    expect(ordenSchulze([], [])).toEqual([]);
  });
});

describe('contarEleccion', () => {
  it('un puesto: gana la preferida de Schulze si está en más de la mitad', () => {
    const r = contarEleccion({
      ...base,
      candidatas: ['A', 'B'],
      puestos: 1,
      papeletas: [pap('A', 'B'), pap('A', 'B'), pap('B', 'A')],
    });
    expect(r.sinQuorum).toBe(false);
    expect(r.electas).toEqual(['A']);
    expect(r.ordenFinal).toEqual(['A', 'B']);
    expect(r.desempateUsado).toBe(false);
  });

  it('nadie elegido si nadie está en más de la mitad de las no abstenidas', () => {
    const r = contarEleccion({
      ...base,
      candidatas: ['A', 'B', 'C'],
      puestos: 1,
      papeletas: [pap('A'), pap('B'), pap('C'), pap('A'), pap('B'), pap('C')],
    });
    expect(r.electas).toEqual([]);
    expect(r.ordenFinal).toHaveLength(3);
  });

  it('las abstenciones cuentan para la participación pero no para la mitad', () => {
    const papeletas = [pap('A'), pap('A'), pap('B'), abst(), abst(), abst()];
    const r = contarEleccion({ ...base, candidatas: ['A', 'B'], puestos: 1, papeletas });
    expect(r.papeletasTotal).toBe(6);
    expect(r.abstenciones).toBe(3);
    expect(r.validas).toBe(3);
    expect(r.aprobaciones).toEqual([2, 1]);
    expect(r.electas).toEqual(['A']);
  });

  it('sin participación mínima no hay electas pero sí matrices', () => {
    const r = contarEleccion({
      candidatas: ['A', 'B'],
      puestos: 1,
      papeletas: [pap('A', 'B')],
      miembros: 100,
      quorumPct: 20,
      semilla: 's',
    });
    expect(r.sinQuorum).toBe(true);
    expect(r.electas).toEqual([]);
    expect(r.pairwiseMatrix).toEqual([
      [0, 1],
      [0, 0],
    ]);
    expect(r.schulzeMatrix).toHaveLength(2);
  });

  it('siete puestos: los siete primeros aprobados en orden Schulze', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const papeletas = [
      ...repetir(5, pap(...ids)),
      ...repetir(1, pap('I', 'H')),
    ];
    const r = contarEleccion({ ...base, candidatas: ids, puestos: 7, papeletas });
    expect(r.electas).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(r.ordenFinal.slice(0, 7)).toEqual(r.electas);
    expect(r.desempateUsado).toBe(false);
  });

  it('dos puestos con empate exacto en el segundo: el desempate es reproducible con la misma semilla y cambia con otra', () => {
    const entrada = {
      candidatas: ['A', 'B', 'C'],
      puestos: 2,
      papeletas: [pap('A', 'B', 'C'), pap('A', 'B', 'C'), pap('A', 'C', 'B'), pap('A', 'C', 'B')],
      miembros: 10,
      quorumPct: 20,
    };
    const una = contarEleccion({ ...entrada, semilla: 'x' });
    const otra = contarEleccion({ ...entrada, semilla: 'x' });
    expect(una).toEqual(otra);
    expect(una.desempateUsado).toBe(true);
    expect(una.electas[0]).toBe('A');
    expect(una.electas).toHaveLength(2);

    const segundas = new Set(
      Array.from({ length: 20 }, (_, i) => contarEleccion({ ...entrada, semilla: `s${i}` }).electas[1]),
    );
    expect(segundas).toEqual(new Set(['B', 'C']));
  });

  it('una excluida no queda elegida aunque gane, y sigue en las matrices', () => {
    const r = contarEleccion({
      ...base,
      candidatas: ['A', 'B'],
      puestos: 1,
      papeletas: [pap('A', 'B'), pap('A', 'B'), pap('A', 'B')],
      excluidas: ['A'],
    });
    expect(r.electas).toEqual(['B']);
    expect(r.pairwiseMatrix[0]![1]).toBe(3);
    expect(r.aprobaciones).toEqual([3, 3]);
    expect(r.ordenFinal).toEqual(['B', 'A']);
  });

  it('menos aprobadas que puestos deja vacantes (electas.length < puestos)', () => {
    const r = contarEleccion({
      ...base,
      candidatas: ['A', 'B', 'C'],
      puestos: 3,
      papeletas: [pap('A'), pap('A'), pap('B')],
    });
    expect(r.electas).toEqual(['A']);
    expect(r.electas.length).toBeLessThan(3);
    expect(r.ordenFinal).toHaveLength(3);
  });
});
