import { vi } from 'vitest';

/**
 * GuardiaService simulado para las pruebas de los servicios que publican texto:
 * por defecto todo pasa como revisado (nivel 0) y la cola no se usa.
 */
export function guardiaMock() {
  return {
    antesDePublicar: vi.fn().mockResolvedValue({ revisado: true }),
    despuesDePublicar: vi.fn().mockResolvedValue(undefined),
  };
}

export function publicadoresMock() {
  return { registrar: vi.fn() };
}
