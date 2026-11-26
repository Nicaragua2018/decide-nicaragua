import { describe, expect, it } from 'vitest';
import { llamaAGuardian, partirEnlaces, RULE_DEFINITIONS } from '@decide/shared';

describe('llamaAGuardian', () => {
  it.each(['@Guardián ¿cómo invito?', '@guardian hola', '  @GUARDIAN: ayuda', '@Guardian,', '@guardián'])('llama: %s', (t) => {
    expect(llamaAGuardian(t)).toBe(true);
  });
  it.each(['hola @Guardián', 'guardian ayuda', '@guardianes', '@guardian_2', ''])('no llama: %s', (t) => {
    expect(llamaAGuardian(t)).toBe(false);
  });
});

describe('partirEnlaces', () => {
  it('solo http(s) es enlace', () => {
    expect(partirEnlaces('mira https://a.org/x. y javascript:alert(1)')).toEqual([
      { tipo: 'texto', valor: 'mira ' },
      { tipo: 'enlace', valor: 'https://a.org/x' },
      { tipo: 'texto', valor: '. y javascript:alert(1)' },
    ]);
  });
  it('un texto sin enlaces queda entero', () => {
    expect(partirEnlaces('data:text/html,<b>hola</b>')).toEqual([{ tipo: 'texto', valor: 'data:text/html,<b>hola</b>' }]);
  });
  it('varios enlaces seguidos', () => {
    expect(partirEnlaces('http://a.org https://b.org/c?d=1)')).toEqual([
      { tipo: 'enlace', valor: 'http://a.org' },
      { tipo: 'texto', valor: ' ' },
      { tipo: 'enlace', valor: 'https://b.org/c?d=1' },
      { tipo: 'texto', valor: ')' },
    ]);
  });
  it('texto vacío', () => {
    expect(partirEnlaces('')).toEqual([]);
  });
});

describe('regla de conservación del chat', () => {
  it('es general, de 90 días, entre 30 y 365', () => {
    const r = RULE_DEFINITIONS.find((d) => d.key === 'chat.conservacion_dias');
    expect(r).toMatchObject({ level: 'colmena', default: '90', min: 30, max: 365, unit: 'dias', conectada: true });
  });
});
