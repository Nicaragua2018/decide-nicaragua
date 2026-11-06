import { describe, it, expect, vi } from 'vitest';
import { CambiosReglaScheduler } from './cambios-regla.scheduler';

describe('CambiosReglaScheduler', () => {
  it('cada pasada resuelve los resultados y vence lo que lleva 30 días en la mesa', async () => {
    const cambios = { procesarResultados: vi.fn().mockResolvedValue(0), vencerPendientesMesa: vi.fn().mockResolvedValue(1) };
    await new CambiosReglaScheduler(cambios as never).run();
    expect(cambios.procesarResultados).toHaveBeenCalledTimes(1);
    expect(cambios.vencerPendientesMesa).toHaveBeenCalledTimes(1);
  });

  it('si falla la primera parte, igual vence las de la mesa', async () => {
    const cambios = { procesarResultados: vi.fn().mockRejectedValue(new Error('x')), vencerPendientesMesa: vi.fn().mockResolvedValue(0) };
    await new CambiosReglaScheduler(cambios as never).run();
    expect(cambios.vencerPendientesMesa).toHaveBeenCalledTimes(1);
  });
});
