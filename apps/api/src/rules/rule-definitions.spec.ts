import { describe, it, expect } from 'vitest';
import { RULE_DEFINITIONS, ruleDefinition } from '@decide/shared';

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

  it('las reglas de la colmena que aún no lee ningún código están marcadas sin conectar', () => {
    const sinConectar = RULE_DEFINITIONS.filter((d) => !d.conectada).map((d) => d.key);
    expect(sinConectar).toEqual([
      'observadores.numero',
      'comunidad.minimo_activacion',
      'eleccion.minimo_primera',
      'revocacion.fraccion',
      'cargos.periodo_mesa_meses',
      'cargos.periodo_coordinadores_meses',
      'eleccion.plazo_candidaturas_dias',
      'eleccion.plazo_votacion_dias',
    ]);
    expect(ruleDefinition('invitaciones.pendientes_max').conectada).toBe(true);
    expect(ruleDefinition('reglas.participacion_minima').conectada).toBe(true);
    expect(ruleDefinition('comision.forma').conectada).toBe(true);
  });
});
