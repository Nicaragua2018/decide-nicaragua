import { describe, expect, it } from 'vitest';
import { bloqueActivo, bloquesDeNavegacion, opcionesDeAvatar } from './navegacion';

describe('bloquesDeNavegacion', () => {
  it('persona verificada y observadora ve los tres bloques con las once opciones', () => {
    const b = bloquesDeNavegacion({ status: 'verified_citizen', esObservador: true });
    expect(b.map((x) => x.id)).toEqual(['participar', 'comunidad', 'transparencia']);
    expect(b[0]!.opciones.map((o) => o.ruta)).toEqual(['/inquietudes', '/foros', '/decisiones', '/grupos']);
    expect(b[1]!.opciones.map((o) => o.ruta)).toEqual(['/dashboard', '/elecciones', '/admin/mesa', '/observar']);
    expect(b[2]!.opciones.map((o) => o.ruta)).toEqual(['/reglas', '/verificaciones', '/audit']);
  });
  it('persona sin verificar no ve Participar ni Elecciones ni Mesa ni Observar', () => {
    const b = bloquesDeNavegacion({ status: 'pending_verification', esObservador: false });
    expect(b.map((x) => x.id)).toEqual(['comunidad', 'transparencia']);
    expect(b[0]!.opciones.map((o) => o.ruta)).toEqual(['/dashboard']);
  });
  it('Observar solo con el cargo', () => {
    const b = bloquesDeNavegacion({ status: 'verified_citizen', esObservador: false });
    expect(b[1]!.opciones.map((o) => o.ruta)).not.toContain('/observar');
  });
});

describe('bloqueActivo', () => {
  const b = bloquesDeNavegacion({ status: 'verified_citizen', esObservador: true });
  it.each([
    ['/inquietudes/abc', 'participar'], ['/foros/1', 'participar'], ['/proposals/2', 'participar'],
    ['/dashboard', 'comunidad'], ['/groups/9', 'comunidad'], ['/admin/mesa', 'comunidad'],
    ['/audit', 'transparencia'], ['/me', null], ['/admin/users', null],
  ])('%s → %s', (ruta, esperado) => { expect(bloqueActivo(ruta, b)).toBe(esperado); });
});

describe('opcionesDeAvatar', () => {
  it('verificado ve Administración con etiqueta admin', () => {
    expect(opcionesDeAvatar({ status: 'verified_citizen' })).toEqual([
      { titulo: 'Mi perfil', ruta: '/me' },
      { titulo: 'Administración', ruta: '/admin/users', etiqueta: 'admin' },
    ]);
  });
  it('sin verificar solo Mi perfil', () => {
    expect(opcionesDeAvatar({ status: 'pending_verification' })).toEqual([{ titulo: 'Mi perfil', ruta: '/me' }]);
  });
});
