/**
 * Tests del cálculo de grupos de opinión (módulo puro, al estilo Pol.is).
 *
 * Cubren: determinismo, separación de bandos, frases puente y frases que
 * dividen, el umbral de votos para entrar al mapa y los casos degenerados.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeOpinions,
  seedFromId,
  isPuente,
  isDivisiva,
  type VoteRow,
  type OpinionResult,
} from './opinion-groups';

const SEED = 'a1b2c3d4';

function pid(prefix: string, i: number): string {
  return `${prefix}-${String(i).padStart(2, '0')}`;
}

/**
 * Dos bandos de 6 personas: el bando «a» está de acuerdo con A y B y en
 * desacuerdo con C y D; el bando «b», al revés. La frase P (puente) recibe
 * acuerdo de 5 de 6 en cada bando (83 %), y un «paso» del resto.
 */
function dosBandos(): VoteRow[] {
  const rows: VoteRow[] = [];
  for (let i = 0; i < 6; i++) {
    const a = pid('a', i);
    const b = pid('b', i);
    rows.push({ profileId: a, fraseId: 'A', value: 1 });
    rows.push({ profileId: a, fraseId: 'B', value: 1 });
    rows.push({ profileId: a, fraseId: 'C', value: -1 });
    rows.push({ profileId: a, fraseId: 'D', value: -1 });
    rows.push({ profileId: a, fraseId: 'P', value: i === 0 ? 0 : 1 });
    rows.push({ profileId: b, fraseId: 'A', value: -1 });
    rows.push({ profileId: b, fraseId: 'B', value: -1 });
    rows.push({ profileId: b, fraseId: 'C', value: 1 });
    rows.push({ profileId: b, fraseId: 'D', value: 1 });
    rows.push({ profileId: b, fraseId: 'P', value: i === 0 ? 0 : 1 });
  }
  return rows;
}

/** Tres bandos de 6: el bando i está de acuerdo con F(2i) y F(2i+1) y en desacuerdo con el resto. */
function tresBandos(): VoteRow[] {
  const rows: VoteRow[] = [];
  for (let camp = 0; camp < 3; camp++) {
    for (let i = 0; i < 6; i++) {
      const p = pid(`c${camp}`, i);
      for (let f = 0; f < 6; f++) {
        const propia = Math.floor(f / 2) === camp;
        // Una persona por bando pasa en una frase ajena, para que no todos los puntos coincidan.
        const value: -1 | 0 | 1 = propia ? 1 : i === 0 && f === (camp * 2 + 2) % 6 ? 0 : -1;
        rows.push({ profileId: p, fraseId: `F${f}`, value });
      }
    }
  }
  return rows;
}

/** Barajado determinista (Fisher-Yates con un LCG simple). */
function barajar<T>(arr: T[], semilla: number): T[] {
  const out = [...arr];
  let s = semilla;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function frase(r: OpinionResult, id: string): OpinionResult['frases'][number] {
  const f = r.frases.find((x) => x.fraseId === id);
  if (!f) throw new Error(`frase ${id} no encontrada`);
  return f;
}

describe('seedFromId', () => {
  it('devuelve 8 caracteres hex y es estable', () => {
    const s = seedFromId('x');
    expect(s).toMatch(/^[0-9a-f]{8}$/);
    expect(seedFromId('x')).toBe(s);
    // sha256('x') = 2d711642b726b044...
    expect(s).toBe('2d711642');
  });
});

describe('analyzeOpinions', () => {
  it('el mismo input y la misma semilla dan exactamente el mismo resultado', () => {
    const rows = dosBandos();
    expect(analyzeOpinions(rows, SEED)).toEqual(analyzeOpinions(rows, SEED));
  });

  it('barajar el orden de las filas no cambia el resultado', () => {
    const rows = tresBandos();
    const base = analyzeOpinions(rows, SEED);
    expect(analyzeOpinions(barajar(rows, 7), SEED)).toEqual(base);
    expect(analyzeOpinions(barajar(rows, 99), SEED)).toEqual(base);
  });

  it('con dos bandos claros forma 2 grupos de 6', () => {
    const r = analyzeOpinions(dosBandos(), SEED);
    expect(r.participants).toBe(12);
    expect(r.grupos).toHaveLength(2);
    expect(r.grupos.map((g) => g.size)).toEqual([6, 6]);
    const miembros = r.grupos.map((g) => g.members);
    // Cada grupo contiene un bando completo, en orden.
    const bandoA = Array.from({ length: 6 }, (_, i) => pid('a', i));
    const bandoB = Array.from({ length: 6 }, (_, i) => pid('b', i));
    expect(miembros).toContainEqual(bandoA);
    expect(miembros).toContainEqual(bandoB);
    expect(r.grupos.map((g) => g.id)).toEqual([0, 1]);
  });

  it('con tres bandos de 6 forma 3 grupos', () => {
    const r = analyzeOpinions(tresBandos(), SEED);
    expect(r.participants).toBe(18);
    expect(r.grupos).toHaveLength(3);
    expect(r.grupos.map((g) => g.size)).toEqual([6, 6, 6]);
    for (const g of r.grupos) {
      const prefijos = new Set(g.members.map((m) => m.slice(0, 2)));
      expect(prefijos.size).toBe(1);
    }
  });

  it('la frase con acuerdo en ambos bandos es puente; la de un solo bando divide', () => {
    const r = analyzeOpinions(dosBandos(), SEED);
    const p = frase(r, 'P');
    const a = frase(r, 'A');
    expect(p.porGrupo).toHaveLength(2);
    for (const g of p.porGrupo) {
      expect(g.votantes).toBe(6);
      expect(g.total).toBe(6);
      expect(g.deAcuerdo).toBe(5);
    }
    expect(isPuente(p)).toBe(true);
    expect(isDivisiva(p)).toBe(false);
    expect(isPuente(a)).toBe(false);
    expect(isDivisiva(a)).toBe(true);
  });

  it('isPuente exige el mínimo de votantes en cada grupo', () => {
    const f = {
      fraseId: 'X',
      porGrupo: [
        { grupo: 0, votantes: 5, deAcuerdo: 5, total: 5 },
        { grupo: 1, votantes: 2, deAcuerdo: 2, total: 2 },
      ],
    };
    expect(isPuente(f)).toBe(false);
    expect(isPuente(f, 2)).toBe(true);
  });

  it('isDivisiva requiere al menos 2 grupos; con 1 grupo, puente = consenso general', () => {
    const f = { fraseId: 'X', porGrupo: [{ grupo: 0, votantes: 10, deAcuerdo: 9, total: 10 }] };
    expect(isDivisiva(f)).toBe(false);
    expect(isPuente(f)).toBe(true);
  });

  it('las personas con menos de 3 votos no entran al mapa', () => {
    const rows = dosBandos();
    rows.push({ profileId: 'z-01', fraseId: 'A', value: 1 });
    rows.push({ profileId: 'z-01', fraseId: 'B', value: 0 });
    rows.push({ profileId: 'z-02', fraseId: 'C', value: -1 });
    // Una frase votada solo por quien no entra no aparece.
    rows.push({ profileId: 'z-02', fraseId: 'Q', value: 1 });
    const r = analyzeOpinions(rows, SEED);
    expect(r.participants).toBe(12);
    const todos = r.grupos.flatMap((g) => g.members);
    expect(todos).not.toContain('z-01');
    expect(todos).not.toContain('z-02');
    expect(r.frases.map((f) => f.fraseId)).not.toContain('Q');
  });

  it('cuenta los «paso» para llegar al mínimo de votos', () => {
    const rows = dosBandos();
    for (const f of ['A', 'B', 'C']) rows.push({ profileId: 'z-01', fraseId: f, value: 0 });
    expect(analyzeOpinions(rows, SEED).participants).toBe(13);
  });

  it('respeta minVotos', () => {
    const rows = dosBandos();
    rows.push({ profileId: 'z-01', fraseId: 'A', value: 1 });
    expect(analyzeOpinions(rows, SEED, { minVotos: 1 }).participants).toBe(13);
  });

  it('si todos votan igual, devuelve 1 grupo sin lanzar error', () => {
    const rows: VoteRow[] = [];
    for (let i = 0; i < 10; i++) {
      for (const f of ['A', 'B', 'C']) rows.push({ profileId: pid('p', i), fraseId: f, value: 1 });
    }
    const r = analyzeOpinions(rows, SEED);
    expect(r.participants).toBe(10);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]?.size).toBe(10);
    expect(isPuente(frase(r, 'A'))).toBe(true);
  });

  it('si todo es «paso», devuelve 1 grupo', () => {
    const rows: VoteRow[] = [];
    for (let i = 0; i < 10; i++) {
      for (const f of ['A', 'B', 'C']) rows.push({ profileId: pid('p', i), fraseId: f, value: 0 });
    }
    const r = analyzeOpinions(rows, SEED);
    expect(r.grupos).toHaveLength(1);
    expect(frase(r, 'A').porGrupo[0]).toEqual({ grupo: 0, votantes: 10, deAcuerdo: 0, total: 10 });
  });

  it('con una sola frase devuelve 1 grupo', () => {
    const rows: VoteRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push({ profileId: pid('p', i), fraseId: 'A', value: i % 2 === 0 ? 1 : -1 });
    }
    const r = analyzeOpinions(rows, SEED, { minVotos: 1 });
    expect(r.participants).toBe(10);
    expect(r.grupos).toHaveLength(1);
  });

  it('sin participantes no lanza error', () => {
    const r = analyzeOpinions([], SEED);
    expect(r.participants).toBe(0);
    expect(r.frases).toEqual([]);
  });

  it('con 5 participantes devuelve 1 grupo', () => {
    const rows = dosBandos().filter((r) => ['a-00', 'a-01', 'a-02', 'b-00', 'b-01'].includes(r.profileId));
    const r = analyzeOpinions(rows, SEED);
    expect(r.participants).toBe(5);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]?.members).toEqual(['a-00', 'a-01', 'a-02', 'b-00', 'b-01']);
  });

  it('respeta maxK', () => {
    const r = analyzeOpinions(tresBandos(), SEED, { maxK: 2 });
    expect(r.grupos.length).toBeLessThanOrEqual(2);
  });
});
