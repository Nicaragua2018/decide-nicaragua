import { describe, it, expect } from 'vitest';
import { RULE_DEFINITIONS, conUnidad, ruleDefinition } from '@decide/shared';

describe('RULE_DEFINITIONS', () => {
  it('cada regla tiene un valor por defecto dentro de sus límites', () => {
    for (const def of RULE_DEFINITIONS) {
      if (def.type === 'int') {
        const n = Number(def.default);
        expect(Number.isInteger(n), def.key).toBe(true);
        expect(def.min, def.key).toBeDefined();
        expect(def.max, def.key).toBeDefined();
        expect(n, def.key).toBeGreaterThanOrEqual(def.min as number);
        expect(n, def.key).toBeLessThanOrEqual(def.max as number);
      } else {
        expect(def.options, def.key).toContain(def.default);
      }
    }
  });

  it('las claves son únicas', () => {
    const keys = RULE_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ruleDefinition lanza error con una clave desconocida', () => {
    expect(() => ruleDefinition('no.existe')).toThrow();
    expect(ruleDefinition('debate.plazo_dias').default).toBe('7');
  });

  it('comision.forma es choice con sorteo por defecto', () => {
    const def = ruleDefinition('comision.forma');
    expect(def.type).toBe('choice');
    expect(def.default).toBe('sorteo');
    expect(def.options).toEqual(['sorteo', 'preferencias']);
  });

  it('las reglas de subgrupo tienen los límites esperados', () => {
    const min = ruleDefinition('subgrupo.minimo_personas');
    expect([min.level, min.default, min.min, min.max, min.unit]).toEqual(['local', '5', 3, 50, 'personas']);
    const plazo = ruleDefinition('subgrupo.plazo_dias');
    expect([plazo.level, plazo.default, plazo.min, plazo.max, plazo.unit]).toEqual(['local', '14', 7, 60, 'dias']);
  });

  it('todas las reglas están conectadas, también revocacion.fraccion (33)', () => {
    const sinConectar = RULE_DEFINITIONS.filter((d) => !d.conectada).map((d) => d.key);
    expect(sinConectar).toEqual([]);
    expect(ruleDefinition('revocacion.fraccion')).toMatchObject({ conectada: true, default: '33' });
    expect(ruleDefinition('invitaciones.pendientes_max').conectada).toBe(true);
    expect(ruleDefinition('reglas.participacion_minima').conectada).toBe(true);
    expect(ruleDefinition('comision.forma').conectada).toBe(true);
  });

  it('conUnidad (compartida con la web): el valor con su unidad', () => {
    expect(conUnidad(ruleDefinition('reglas.participacion_minima'), '40')).toBe('40 %');
    expect(conUnidad(ruleDefinition('debate.plazo_dias'), '1')).toBe('1 día');
    expect(conUnidad(ruleDefinition('debate.plazo_dias'), '10')).toBe('10 días');
    expect(conUnidad(ruleDefinition('comision.puestos_min'), '1')).toBe('1 persona');
    expect(conUnidad(ruleDefinition('cargos.periodo_mesa_meses'), '12')).toBe('12 meses');
    expect(conUnidad(ruleDefinition('comision.forma'), 'sorteo')).toBe('sorteo');
  });

  it('asistente.preguntas_por_dia es de la colmena, 30 de 10 a 100, conectada', () => {
    const d = ruleDefinition('asistente.preguntas_por_dia');
    expect([d.level, d.default, d.min, d.max, d.unit, d.conectada]).toEqual(['colmena', '30', 10, 100, 'preguntas', true]);
    expect(conUnidad(d, '1')).toBe('1 pregunta');
    expect(conUnidad(d, '30')).toBe('30 preguntas');
  });
});
