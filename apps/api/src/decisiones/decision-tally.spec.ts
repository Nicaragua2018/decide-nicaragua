/**
 * Tests del cálculo puro del resultado de una decisión (soluciones).
 *
 * Cubren: dejar fuera es rechazar, la aprobación por mayoría de papeletas
 * válidas, el quórum (con abstenciones), los modos compatibles y excluyentes,
 * los empates y la regla R1 (un empate de Schulze lo gana la aprobada).
 */

import { describe, it, expect } from 'vitest';
import { tallyDecision, type PapeletaInput, type TallyInput } from './decision-tally';

function p(...orden: string[]): PapeletaInput {
  return { abstencion: false, orden };
}

const ABST: PapeletaInput = { abstencion: true, orden: [] };

function input(
  over: Partial<TallyInput> & Pick<TallyInput, 'candidatas' | 'papeletas'>,
): TallyInput {
  return { modo: 'compatibles', miembros: 10, quorumPct: 20, ...over };
}

describe('tallyDecision', () => {
  it('dejar fuera es rechazar', () => {
    const r = tallyDecision(
      input({
        candidatas: ['a', 'b'],
        papeletas: [p('a'), p('a'), p('b')],
        miembros: 10,
      }),
    );
    expect(r.aprobaciones).toEqual([2, 1]);
    expect(r.ganadoras).toEqual(['a']);
    expect(r.resultado).toBe('aprobada');
  });

  it('la preferida no aprobada no gana', () => {
    const r = tallyDecision(
      input({
        candidatas: ['a', 'b'],
        modo: 'excluyentes',
        papeletas: [p('a', 'b'), p('a', 'b'), p('b'), p(), p()],
      }),
    );
    // Schulze prefiere a (2 contra 1), pero a solo está en 2 de 5 papeletas.
    expect(r.pairwiseMatrix).toEqual([
      [0, 2],
      [1, 0],
    ]);
    expect(r.aprobaciones).toEqual([2, 3]);
    expect(r.resultado).toBe('ninguna');
    expect(r.ganadoras).toEqual([]);
  });

  it('rechazo todas cuenta como válida', () => {
    const r = tallyDecision(input({ candidatas: ['a'], papeletas: [p('a'), p(), p()] }));
    expect(r.resultado).toBe('ninguna');
    expect(r.validas).toBe(3);
    expect(r.ganadoras).toEqual([]);
  });

  it('la abstención cuenta para el quórum pero no para aprobar', () => {
    const r = tallyDecision(input({ candidatas: ['a'], papeletas: [p('a'), ABST], miembros: 10 }));
    expect(r.papeletasTotal).toBe(2);
    expect(r.abstenciones).toBe(1);
    expect(r.validas).toBe(1);
    expect(r.resultado).toBe('aprobada');
    expect(r.ganadoras).toEqual(['a']);

    const r11 = tallyDecision(
      input({ candidatas: ['a'], papeletas: [p('a'), ABST], miembros: 11 }),
    );
    expect(r11.resultado).toBe('sin_quorum');
    expect(r11.ganadoras).toEqual([]);
  });

  it('compatibles aprueba varias', () => {
    const r = tallyDecision(
      input({
        candidatas: ['a', 'b'],
        papeletas: [p('a', 'b'), p('b', 'a'), p('a')],
      }),
    );
    expect(r.resultado).toBe('aprobada');
    expect(r.ganadoras).toEqual(['a', 'b']);
  });

  it('excluyentes elige la preferida aprobada', () => {
    const r = tallyDecision(
      input({
        candidatas: ['a', 'b'],
        modo: 'excluyentes',
        papeletas: [p('a', 'b'), p('b', 'a'), p('a')],
      }),
    );
    expect(r.resultado).toBe('aprobada');
    expect(r.ganadoras).toEqual(['a']);
  });

  it('empate entre aprobadas', () => {
    const r = tallyDecision(
      input({
        candidatas: ['a', 'b'],
        modo: 'excluyentes',
        papeletas: [p('a', 'b'), p('b', 'a')],
      }),
    );
    expect(r.resultado).toBe('empate');
    expect(r.ganadoras).toEqual([]);
  });

  it('empate con una no aprobada lo gana la aprobada', () => {
    const r = tallyDecision(
      input({
        candidatas: ['a', 'b'],
        modo: 'excluyentes',
        papeletas: [p('a'), p('b', 'a')],
      }),
    );
    // Schulze empata 1 contra 1; a está en 2 de 2 papeletas y b en 1 de 2.
    expect(r.pairwiseMatrix).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(r.aprobaciones).toEqual([2, 1]);
    expect(r.resultado).toBe('aprobada');
    expect(r.ganadoras).toEqual(['a']);
  });

  it('sin miembros no hay quórum', () => {
    const r = tallyDecision(input({ candidatas: ['a'], papeletas: [p('a')], miembros: 0 }));
    expect(r.resultado).toBe('sin_quorum');
    expect(r.ganadoras).toEqual([]);
  });

  it('las matrices se publican también sin quórum', () => {
    const r = tallyDecision(
      input({
        candidatas: ['a', 'b', 'c'],
        modo: 'excluyentes',
        papeletas: [p('a', 'b')],
        miembros: 100,
      }),
    );
    expect(r.resultado).toBe('sin_quorum');
    expect(r.pairwiseMatrix).toHaveLength(3);
    for (const fila of r.pairwiseMatrix) expect(fila).toHaveLength(3);
    expect(r.schulzeMatrix).toHaveLength(3);
    for (const fila of r.schulzeMatrix) expect(fila).toHaveLength(3);
  });

  describe('excluidas (soluciones ocultas al contar)', () => {
    it('compatibles: una excluida aprobada no gana; las demás aprobadas sí', () => {
      const r = tallyDecision(
        input({ candidatas: ['a', 'b'], papeletas: [p('a', 'b'), p('a', 'b'), p('b')], excluidas: ['a'] }),
      );
      expect(r.aprobaciones).toEqual([2, 3]);
      expect(r.ganadoras).toEqual(['b']);
      expect(r.resultado).toBe('aprobada');
    });

    it('compatibles: si la única aprobada está excluida, ninguna', () => {
      const r = tallyDecision(input({ candidatas: ['a', 'b'], papeletas: [p('a'), p('a'), p('b')], excluidas: ['a'] }));
      expect(r.ganadoras).toEqual([]);
      expect(r.resultado).toBe('ninguna');
    });

    it('excluyentes: la ganadora de Schulze excluida no gana y no se pasa a la siguiente', () => {
      const r = tallyDecision(
        input({
          candidatas: ['a', 'b'],
          modo: 'excluyentes',
          papeletas: [p('a', 'b'), p('a', 'b'), p('b', 'a')],
          excluidas: ['a'],
        }),
      );
      expect(r.resultado).toBe('ninguna');
      expect(r.ganadoras).toEqual([]);
      // Las matrices la siguen incluyendo.
      expect(r.pairwiseMatrix).toHaveLength(2);
    });

    it('excluyentes: en un empate de Schulze con una excluida, gana la otra aprobada', () => {
      const r = tallyDecision(
        input({
          candidatas: ['a', 'b'],
          modo: 'excluyentes',
          papeletas: [p('a', 'b'), p('b', 'a')],
          excluidas: ['a'],
        }),
      );
      expect(r.resultado).toBe('aprobada');
      expect(r.ganadoras).toEqual(['b']);
    });
  });
});
