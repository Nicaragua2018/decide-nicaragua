import { vi } from 'vitest';

/** AsistenteService simulado para AcuerdosService: encendido y con margen salvo que la prueba diga otra cosa. */
export function asistenteMock(pedir: unknown = null) {
  return {
    pedir: vi.fn().mockResolvedValue(pedir),
    activo: vi.fn().mockReturnValue(true),
    tieneMargen: vi.fn().mockResolvedValue(true),
  };
}

/** RedisService simulado en memoria (get/set con plazo). */
export function redisMock() {
  const datos = new Map<string, string>();
  return {
    datos,
    get: vi.fn(async (k: string) => datos.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, _ttl: number) => {
      datos.set(k, v);
      return 'OK' as const;
    }),
  };
}
