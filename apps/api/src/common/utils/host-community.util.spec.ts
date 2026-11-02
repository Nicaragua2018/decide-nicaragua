import { describe, it, expect } from 'vitest';
import { hostCommunity, sameHostCommunity } from './host-community.util';

describe('hostCommunity()', () => {
  it('país de la lista: slug por código y nombre en español', () => {
    expect(hostCommunity('CR', null)).toEqual({ slug: 'country-cr', name: 'Costa Rica' });
  });

  it('EE. UU. con estado: comunidad por estado', () => {
    expect(hostCommunity('US', 'fl')).toEqual({ slug: 'country-us-fl', name: 'Florida, EE. UU.' });
  });

  it('EE. UU. sin estado o con estado desconocido: comunidad del país', () => {
    expect(hostCommunity('US', null)).toEqual({ slug: 'country-us', name: 'Estados Unidos' });
    expect(hostCommunity('US', 'ZZ')).toEqual({ slug: 'country-us', name: 'Estados Unidos' });
  });

  it('país fuera de la lista: usa el código como nombre', () => {
    expect(hostCommunity('de', null)).toEqual({ slug: 'country-de', name: 'DE' });
  });

  it('la región se ignora fuera de EE. UU.', () => {
    expect(hostCommunity('CR', 'FL')).toEqual({ slug: 'country-cr', name: 'Costa Rica' });
  });

  it('sin país: null', () => {
    expect(hostCommunity(null, 'FL')).toBeNull();
  });
});

describe('sameHostCommunity()', () => {
  it('mismo país (fuera de EE. UU.) aunque difiera la región', () => {
    expect(
      sameHostCommunity({ currentCountry: 'CR', currentRegion: null }, { currentCountry: 'cr', currentRegion: 'X' }),
    ).toBe(true);
  });

  it('EE. UU.: hace falta el mismo estado', () => {
    expect(
      sameHostCommunity({ currentCountry: 'US', currentRegion: 'FL' }, { currentCountry: 'US', currentRegion: 'TX' }),
    ).toBe(false);
    expect(
      sameHostCommunity({ currentCountry: 'US', currentRegion: 'FL' }, { currentCountry: 'US', currentRegion: 'fl' }),
    ).toBe(true);
  });

  it('sin país en alguno: false', () => {
    expect(
      sameHostCommunity({ currentCountry: null, currentRegion: null }, { currentCountry: null, currentRegion: null }),
    ).toBe(false);
  });
});
