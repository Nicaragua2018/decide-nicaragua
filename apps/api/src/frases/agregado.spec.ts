import { describe, expect, it } from 'vitest';
import { agregadoPublico } from './agregado';
import { isDivisiva, isPuente, type OpinionResult } from './opinion-groups';

const porGrupo = (grupo: number, votantes: number, deAcuerdo: number) => ({ grupo, votantes, deAcuerdo, total: votantes });
const miembros = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function resultado(): OpinionResult {
  return {
    participants: 12,
    grupos: [
      { id: 0, size: 7, members: miembros(7) },
      { id: 1, size: 3, members: miembros(3) },
      { id: 2, size: 2, members: miembros(2) },
    ],
    frases: [
      { fraseId: 'f1', porGrupo: [porGrupo(0, 7, 6), porGrupo(1, 3, 3), porGrupo(2, 2, 2)] },
      { fraseId: 'f2', porGrupo: [porGrupo(0, 7, 6), porGrupo(1, 3, 0), porGrupo(2, 2, 0)] },
    ],
  };
}

const textos = new Map([['f1', 'Una'], ['f2', 'Otra']]);

describe('agregadoPublico', () => {
  it('oculta grupos de menos de 3 y redondea tamaños', () => {
    const a = agregadoPublico(resultado(), textos);
    expect(a.participantes).toBe(10);
    expect(a.grupos).toEqual([{ id: 0, tamano: 5 }, { id: 1, tamano: 5 }]);
    expect(a.frases[0]!.acuerdoPorGrupo.map((g) => g.grupo)).toEqual([0, 1]);
  });

  it('acuerdoPct null con menos de 5 votantes', () => {
    const a = agregadoPublico(resultado(), textos);
    expect(a.frases[0]!.acuerdoPorGrupo).toEqual([
      { grupo: 0, acuerdoPct: 85 },
      { grupo: 1, acuerdoPct: null },
    ]);
  });

  it('marca puentes y divisivas igual que isPuente/isDivisiva', () => {
    const r = resultado();
    const a = agregadoPublico(r, textos);
    for (const f of a.frases) {
      const orig = r.frases.find((x) => x.fraseId === f.fraseId)!;
      const visibles = { ...orig, porGrupo: orig.porGrupo.filter((g) => g.grupo < 2) };
      expect(f.puente).toBe(isPuente(visibles));
      expect(f.divisiva).toBe(isDivisiva(visibles));
    }
    expect(a.frases[0]!.puente).toBe(true);
    expect(a.frases[1]!.divisiva).toBe(true);
    expect(a.frases[0]!.texto).toBe('Una');
  });
});
