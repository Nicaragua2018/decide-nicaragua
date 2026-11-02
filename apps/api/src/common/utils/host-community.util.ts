import { HOST_COUNTRIES, US_STATES } from '@decide/shared';

export interface HostCommunity {
  slug: string;
  name: string;
}

/**
 * Comunidad de acogida a partir del país (ISO alfa-2) y, en EE. UU., del estado.
 * Fuera de EE. UU. la región se ignora. Sin país no hay comunidad de acogida.
 */
export function hostCommunity(country: string | null, region: string | null): HostCommunity | null {
  if (!country) return null;
  const cc = country.toUpperCase();
  if (cc === 'US' && region) {
    const rc = region.toUpperCase();
    const state = US_STATES.find((s) => s.code === rc);
    if (state) return { slug: `country-us-${rc.toLowerCase()}`, name: `${state.name}, EE. UU.` };
  }
  const known = HOST_COUNTRIES.find((c) => c.code === cc);
  return { slug: `country-${cc.toLowerCase()}`, name: known ? known.name : cc };
}

type ConHogar = { currentCountry: string | null; currentRegion: string | null };

/** Dos perfiles comparten comunidad de acogida si producen el mismo slug. */
export function sameHostCommunity(a: ConHogar, b: ConHogar): boolean {
  const ha = hostCommunity(a.currentCountry, a.currentRegion);
  const hb = hostCommunity(b.currentCountry, b.currentRegion);
  return ha !== null && hb !== null && ha.slug === hb.slug;
}
