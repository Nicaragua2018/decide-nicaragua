import { describe, expect, it } from 'vitest';
import { limpiarTexto } from './limpieza';

describe('limpiarTexto', () => {
  it('reemplaza correos por [correo]', () => {
    expect(limpiarTexto('escríbeme a ana@x.org hoy')).toBe('escríbeme a [correo] hoy');
  });

  it('reemplaza teléfonos con guion', () => {
    expect(limpiarTexto('8888-1234')).toBe('[teléfono]');
  });

  it('reemplaza teléfonos con + y espacios', () => {
    expect(limpiarTexto('llama al +505 8888 1234 ya')).toBe('llama al [teléfono] ya');
  });

  it('reemplaza 7 dígitos seguidos', () => {
    expect(limpiarTexto('es el 2223344')).toBe('es el [teléfono]');
  });

  it('un año de 4 dígitos sigue igual', () => {
    expect(limpiarTexto('en 2018')).toBe('en 2018');
  });

  it('una cifra con puntos sigue igual', () => {
    expect(limpiarTexto('35.000 personas')).toBe('35.000 personas');
  });

  it('6 dígitos siguen igual', () => {
    expect(limpiarTexto('código 123456')).toBe('código 123456');
  });

  it('correo y teléfono juntos', () => {
    expect(limpiarTexto('escríbeme a ana@x.org o al +505 8888 1234')).toBe('escríbeme a [correo] o al [teléfono]');
  });
});
