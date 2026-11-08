/** Referencias cortas (i1, i2…) que sustituyen a los ids en lo que se envía a Claude. */
export function conReferencias(
  ids: string[],
  prefijo: 'i' | 'f',
): { ref: (id: string) => string; id: (ref: string) => string | null } {
  const aRef = new Map<string, string>();
  const aId = new Map<string, string>();
  for (const id of ids) {
    if (aRef.has(id)) continue;
    const r = `${prefijo}${aRef.size + 1}`;
    aRef.set(id, r);
    aId.set(r, id);
  }
  return {
    ref: (id) => aRef.get(id) ?? '',
    id: (ref) => (typeof ref === 'string' ? (aId.get(ref.trim().replace(/^\[+|\]+$/g, '').trim()) ?? null) : null),
  };
}
