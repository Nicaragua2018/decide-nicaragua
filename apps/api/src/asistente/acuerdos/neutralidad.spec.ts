import { describe, expect, it } from 'vitest';
import { REGLA_DE_PALABRAS, explicarTomaDePartido, sinTomaDePartido } from './neutralidad';

describe('sinTomaDePartido', () => {
  it('acepta una salida neutral', () => {
    expect(sinTomaDePartido({ resumen: 'Hay acuerdo en la salud del campo.', grupos: [{ piensa: 'Quiere más impuestos.' }] })).toBe(true);
  });

  it('rechaza «tiene razón» en cualquier campo, incluso anidado y sin tilde ni mayúsculas', () => {
    expect(sinTomaDePartido({ grupos: [{ piensa: 'El grupo B TIENE RAZON en todo.' }] })).toBe(false);
    expect(sinTomaDePartido({ puentes: { texto: 'Nadie tiene razón del todo.' } })).toBe(false);
  });

  it('rechaza las otras frases de tomar partido', () => {
    for (const frase of [
      'está en lo cierto',
      'tienen razón',
      'tiene la verdad',
      'la verdad es',
      'el gobierno debe',
      'la oposición debe',
      'es culpable',
      'tienen la culpa',
      'la oposición miente',
      'el gobierno miente',
    ]) {
      expect(sinTomaDePartido({ resumen: `Algo: ${frase} y más.` })).toBe(false);
    }
  });

  it('busca frases enteras: «sostiene razones» o «inculpable» no cuentan', () => {
    expect(sinTomaDePartido({ piensa: 'El grupo sostiene razones económicas y mantiene razones de fondo.' })).toBe(true);
    expect(sinTomaDePartido({ piensa: 'Nadie lo considera inculpable ni que obtiene la verdadera solución.' })).toBe(true);
    expect(sinTomaDePartido({ resumen: 'Quieren que se diga la verdad establecida.' })).toBe(true);
  });

  it('no mira las referencias ni los números', () => {
    expect(sinTomaDePartido({ refs: ['f1', 'f2'], tamano: 3 })).toBe(true);
  });
});

describe('explicarTomaDePartido', () => {
  it('nombra las expresiones usadas, sin el resto del texto', () => {
    const motivo = explicarTomaDePartido({ grupos: [{ piensa: 'Cree que El Gobierno debe bajar precios; nadie tiene razón.' }] });
    expect(motivo).toBe('usó «tiene razon», «el gobierno debe»');
    expect(motivo).not.toContain('precios');
  });

  it('null si la salida es neutral', () => {
    expect(explicarTomaDePartido({ resumen: 'El grupo A apoya que el gobierno controle los precios.' })).toBeNull();
  });
});

describe('REGLA_DE_PALABRAS', () => {
  it('trae un ejemplo de cómo contar lo que un grupo pide al gobierno o a la oposición', () => {
    expect(REGLA_DE_PALABRAS).toContain('apoya que el gobierno controle');
  });
});
