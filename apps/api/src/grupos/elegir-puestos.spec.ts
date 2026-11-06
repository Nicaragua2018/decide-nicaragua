/**
 * Tests del cálculo puro de varios puestos por preferencias (Schulze repetido).
 */

import { describe, it, expect } from 'vitest';
import { elegirPuestos } from './elegir-puestos';

describe('elegirPuestos', () => {
  it('elige un ganador claro y luego un segundo claro', () => {
    const papeletas = [
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['b', 'a', 'c'],
    ];
    const r = elegirPuestos(papeletas, ['a', 'b', 'c'], 2);
    expect(r.elegidos).toEqual(['a', 'b']);
    expect(r.rondas).toHaveLength(2);
    expect(r.rondas[0]!.candidatos).toEqual(['a', 'b', 'c']);
    expect(r.rondas[1]!.candidatos).toEqual(['b', 'c']);
  });

  it('el segundo puesto se calcula sin el ya elegido', () => {
    const papeletas = [
      ['a', 'c', 'b'],
      ['a', 'c', 'b'],
      ['b', 'a', 'c'],
    ];
    const r = elegirPuestos(papeletas, ['a', 'b', 'c'], 2);
    expect(r.elegidos).toEqual(['a', 'c']);
  });

  it('un empate se resuelve por orden lexicográfico', () => {
    const papeletas = [['b'], ['a']];
    const r = elegirPuestos(papeletas, ['b', 'a'], 1);
    expect(r.elegidos).toEqual(['a']);
  });

  it('sin papeletas elige por orden lexicográfico', () => {
    const r = elegirPuestos([], ['c', 'a', 'b'], 2);
    expect(r.elegidos).toEqual(['a', 'b']);
    expect(r.rondas).toHaveLength(2);
  });

  it('con candidatos menos o igual que puestos, elige a todos sin rondas', () => {
    const r = elegirPuestos([['a', 'b']], ['b', 'a'], 3);
    expect(r.elegidos).toEqual(['b', 'a']);
    expect(r.rondas).toEqual([]);
  });

  it('ignora ids que no son candidatos', () => {
    const r = elegirPuestos([['x', 'b', 'a']], ['a', 'b'], 1);
    expect(r.elegidos).toEqual(['b']);
  });

  it('es determinista', () => {
    const papeletas = [['a', 'b', 'c'], ['c', 'b', 'a'], ['b']];
    const r1 = elegirPuestos(papeletas, ['a', 'b', 'c'], 2);
    const r2 = elegirPuestos(papeletas, ['a', 'b', 'c'], 2);
    expect(r2).toEqual(r1);
  });
});
