import { describe, expect, it } from 'vitest';
import { CAUSAS_NIVEL_2, TIPOS_TEXTO } from '@decide/shared';
import { CATEGORIAS, cargarCasos, evaluarCaso, type CasoExamen, type CategoriaCaso } from './evaluar';

const casos = cargarCasos();

const MINIMOS: Record<CategoriaCaso, number> = {
  manipulacion: 8,
  odio: 10,
  amenaza: 6,
  datos_personales: 5,
  insulto: 6,
  critica_politica: 12,
  neutro: 10,
};

/** Figuras públicas que solo pueden aparecer en la crítica política. */
const FIGURAS_PUBLICAS = ['Ortega', 'Murillo', 'Alemán', 'Somoza', 'Chamorro'];

function caso(parcial: Partial<CasoExamen> & Pick<CasoExamen, 'categoria' | 'esperado'>): CasoExamen {
  return { id: 'x', tipo: 'comentario', texto: 'texto', ...parcial };
}

describe('examen: casos.json', () => {
  it('los ids son únicos', () => {
    const ids = casos.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cumple los mínimos por categoría', () => {
    for (const categoria of CATEGORIAS) {
      const n = casos.filter((c) => c.categoria === categoria).length;
      expect(n, categoria).toBeGreaterThanOrEqual(MINIMOS[categoria]);
    }
  });

  it('cada caso tiene categoría, tipo y texto válidos', () => {
    for (const c of casos) {
      expect(CATEGORIAS, c.id).toContain(c.categoria);
      expect(TIPOS_TEXTO, c.id).toContain(c.tipo);
      expect(c.texto.trim().length, c.id).toBeGreaterThan(0);
    }
  });

  it('cada esperado es coherente con su nivel y su categoría', () => {
    for (const c of casos) {
      const { nivel, causa } = c.esperado;
      expect([0, 1, 2], c.id).toContain(nivel);
      if (nivel === 2) expect(CAUSAS_NIVEL_2, c.id).toContain(causa);
      if (nivel === 0) expect(causa, c.id).toBeUndefined();
      switch (c.categoria) {
        case 'critica_politica':
        case 'neutro':
          expect(nivel, c.id).toBe(0);
          break;
        case 'odio':
          expect(c.esperado, c.id).toEqual({ nivel: 2, causa: 'odio' });
          break;
        case 'amenaza':
          expect(nivel, c.id).toBe(2);
          expect(['insultos_amenazas', 'ilegal_violencia'], c.id).toContain(causa);
          break;
        case 'datos_personales':
          expect(c.esperado, c.id).toEqual({ nivel: 2, causa: 'datos_personales' });
          break;
        case 'insulto':
          expect(nivel, c.id).toBe(1);
          break;
        case 'manipulacion':
          break;
      }
    }
  });

  it('hay al menos 15 casos con modismos nicaragüenses', () => {
    expect(casos.filter((c) => c.modismo === true).length).toBeGreaterThanOrEqual(15);
  });

  it('las figuras públicas solo aparecen en la crítica política', () => {
    for (const c of casos.filter((x) => x.categoria !== 'critica_politica')) {
      for (const nombre of FIGURAS_PUBLICAS) expect(c.texto, c.id).not.toContain(nombre);
    }
  });

  it('la crítica política apunta a todos los lados', () => {
    const textos = casos.filter((c) => c.categoria === 'critica_politica').map((c) => c.texto).join('\n');
    for (const lado of [/gobierno|Ortega/, /oposición/, /Estados Unidos|Washington/, /Costa Rica/, /mercado/, /izquierda/]) {
      expect(textos).toMatch(lado);
    }
  });
});

describe('examen: evaluarCaso', () => {
  it('aprueba si el nivel coincide', () => {
    expect(evaluarCaso(caso({ categoria: 'neutro', esperado: { nivel: 0 } }), { nivel: 0, revisado: true })).toBeNull();
  });

  it('falla si el nivel no coincide', () => {
    const r = evaluarCaso(caso({ categoria: 'critica_politica', esperado: { nivel: 0 } }), {
      nivel: 1,
      revisado: true,
    });
    expect(r).toMatch(/nivel 0/);
  });

  it('falla si el asistente no respondió, aunque el nivel sea 0', () => {
    expect(evaluarCaso(caso({ categoria: 'neutro', esperado: { nivel: 0 } }), { nivel: 0, revisado: false })).toMatch(
      /no respondió/,
    );
  });

  it('en el nivel 2 exige la causa esperada', () => {
    const c = caso({ categoria: 'odio', esperado: { nivel: 2, causa: 'odio' } });
    expect(evaluarCaso(c, { nivel: 2, causa: 'odio', revisado: true })).toBeNull();
    expect(evaluarCaso(c, { nivel: 2, causa: 'ilegal_violencia', revisado: true })).toMatch(/causa/);
  });

  it('en una amenaza acepta insultos_amenazas o ilegal_violencia', () => {
    const c = caso({ categoria: 'amenaza', esperado: { nivel: 2, causa: 'insultos_amenazas' } });
    expect(evaluarCaso(c, { nivel: 2, causa: 'ilegal_violencia', revisado: true })).toBeNull();
    expect(evaluarCaso(c, { nivel: 2, causa: 'odio', revisado: true })).toMatch(/causa/);
  });

  it('en el nivel 1 no exige causa', () => {
    const c = caso({ categoria: 'insulto', esperado: { nivel: 1 } });
    expect(evaluarCaso(c, { nivel: 1, causa: 'insultos_amenazas', revisado: true })).toBeNull();
  });
});
