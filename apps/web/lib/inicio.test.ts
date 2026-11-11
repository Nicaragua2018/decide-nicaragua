import { describe, expect, it } from 'vitest';
import { agruparGrupos, comunidadPrincipal, contarEleccionesEnCurso, pasoQueToca } from './inicio';
const g = (id: string, type: any) => ({ id, name: id, slug: id, type, description: null });

describe('pasoQueToca', () => {
  it('comunidad sin activar → 1', () => expect(pasoQueToca({ miembros: 1, preguntas: 12, elecciones: 0, activada: false })).toBe(1));
  it('sin preguntas → 2', () => expect(pasoQueToca({ miembros: 25, preguntas: 0, elecciones: 0, activada: true })).toBe(2));
  it('con preguntas y sin elección → 3', () => expect(pasoQueToca({ miembros: 25, preguntas: 12, elecciones: 0, activada: true })).toBe(3));
  it('con elección → 4', () => expect(pasoQueToca({ miembros: 25, preguntas: 12, elecciones: 1, activada: true })).toBe(4));
  it('sin datos (todo null) → 3', () => expect(pasoQueToca({ miembros: null, preguntas: null, elecciones: null, activada: null })).toBe(3));
});

describe('comunidadPrincipal', () => {
  it('prefiere la custom', () => expect(comunidadPrincipal([g('a', 'territorial_origin'), g('b', 'custom')])?.id).toBe('b'));
  it('si no hay custom, la primera', () => expect(comunidadPrincipal([g('a', 'territorial_origin')])?.id).toBe('a'));
  it('vacío → null', () => expect(comunidadPrincipal([])).toBeNull());
});
describe('agruparGrupos', () => {
  it('reparte por tipo y conserva el orden', () => {
    const r = agruparGrupos([g('m', 'territorial_origin'), g('f', 'territorial_residence'), g('e', 'custom'), g('t', 'trabajo'), g('l', 'territorial_origin')]);
    expect(r.origen.map((x) => x.id)).toEqual(['m', 'l']);
    expect(r.acogida.map((x) => x.id)).toEqual(['f']);
    expect(r.otras.map((x) => x.id)).toEqual(['e', 't']);
  });
});

describe('contarEleccionesEnCurso', () => {
  const e = (ambitoId: string, fase: string) => ({ ambito: { id: ambitoId, nombre: ambitoId }, fase }) as any;
  it('cuenta solo las de la comunidad indicada y que no estén contadas', () =>
    expect(contarEleccionesEnCurso([e('a', 'votacion'), e('b', 'votacion'), e('a', 'contada'), e('a', 'candidaturas')], 'a')).toBe(2));
  it('sin elecciones de esa comunidad → 0', () => expect(contarEleccionesEnCurso([e('b', 'votacion')], 'a')).toBe(0));
});
