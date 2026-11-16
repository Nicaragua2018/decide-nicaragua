import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RENOVAR_CADA_MS, destinoSeguro, tocaRenovar } from './sesion';

const MIN = 60_000;

describe('renovación de la sesión', () => {
  it('renueva antes de que venza el permiso de 15 minutos', () => {
    const api = readFileSync(join(__dirname, '../../api/src/auth/auth.controller.ts'), 'utf8');
    expect(api).toContain('ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000');
    expect(RENOVAR_CADA_MS).toBeLessThanOrEqual(10 * MIN);
  });

  it('toca renovar cuando nunca se renovó o ya pasó el plazo', () => {
    const ahora = 1_000 * MIN;
    expect(tocaRenovar(ahora, null)).toBe(true);
    expect(tocaRenovar(ahora, ahora - RENOVAR_CADA_MS)).toBe(true);
    expect(tocaRenovar(ahora, ahora - 60 * MIN)).toBe(true);
  });

  it('no renueva si otra pestaña acaba de hacerlo', () => {
    const ahora = 1_000 * MIN;
    expect(tocaRenovar(ahora, ahora - 1 * MIN)).toBe(false);
    expect(tocaRenovar(ahora, ahora)).toBe(false);
  });

  it('un reloj movido hacia atrás no deja la sesión sin renovar', () => {
    const ahora = 1_000 * MIN;
    expect(tocaRenovar(ahora, ahora + 5 * MIN)).toBe(true);
  });
});

describe('destino después de entrar', () => {
  it('acepta rutas del propio sitio', () => {
    expect(destinoSeguro('/admin/invite')).toBe('/admin/invite');
    expect(destinoSeguro('/inquietudes?orden=apoyo')).toBe('/inquietudes?orden=apoyo');
  });

  it('manda al inicio si falta o apunta fuera del sitio', () => {
    expect(destinoSeguro(null)).toBe('/dashboard');
    expect(destinoSeguro('')).toBe('/dashboard');
    expect(destinoSeguro('https://otro.example')).toBe('/dashboard');
    expect(destinoSeguro('//otro.example')).toBe('/dashboard');
    expect(destinoSeguro('/\\otro.example')).toBe('/dashboard');
    expect(destinoSeguro('admin')).toBe('/dashboard');
  });

  it('no devuelve a la propia página de entrada', () => {
    expect(destinoSeguro('/login')).toBe('/dashboard');
    expect(destinoSeguro('/login?next=/x')).toBe('/dashboard');
  });
});

describe('dónde se usa', () => {
  it('las páginas con sesión mantienen la sesión viva', () => {
    const layout = readFileSync(join(__dirname, '../app/(app)/layout.tsx'), 'utf8');
    expect(layout).toContain('<SesionViva />');
  });

  it('la página de entrada intenta reanudar la sesión guardada', () => {
    const login = readFileSync(join(__dirname, '../app/login/page.tsx'), 'utf8');
    expect(login).toContain('reanudarSesion');
    expect(login).toContain('destinoSeguro');
  });
});
