import { describe, expect, it, vi } from 'vitest';
import { dosDeTres } from './dos-de-tres';

const secuencia = (...resultados: (string | null)[]) => {
  const f = vi.fn();
  for (const r of resultados) f.mockResolvedValueOnce(r);
  return f;
};

describe('dosDeTres', () => {
  it('si pasa a la primera, no repite', async () => {
    const intentar = secuencia(null);
    expect(await dosDeTres(intentar)).toEqual({ fallo: null, aciertos: 1, intentos: 1 });
    expect(intentar).toHaveBeenCalledTimes(1);
  });

  it('falla una vez y pasa las dos repeticiones: aprueba (2 de 3)', async () => {
    const intentar = secuencia('malo', null, null);
    expect(await dosDeTres(intentar)).toEqual({ fallo: null, aciertos: 2, intentos: 3 });
  });

  it('falla la primera y la segunda: reprueba sin una tercera', async () => {
    const intentar = secuencia('malo 1', 'malo 2');
    expect(await dosDeTres(intentar)).toEqual({ fallo: 'malo 1', aciertos: 0, intentos: 2 });
    expect(intentar).toHaveBeenCalledTimes(2);
  });

  it('falla, pasa, falla: reprueba (1 de 3)', async () => {
    const intentar = secuencia('malo 1', null, 'malo 3');
    expect(await dosDeTres(intentar)).toEqual({ fallo: 'malo 1', aciertos: 1, intentos: 3 });
  });
});
