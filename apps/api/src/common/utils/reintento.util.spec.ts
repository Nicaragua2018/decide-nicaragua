import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { conReintento, esConflictoDeBloqueo } from './reintento.util';

const conocido = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('fallo', { code, clientVersion: '6', meta });

describe('esConflictoDeBloqueo()', () => {
  it('P2034 (conflicto de escritura o interbloqueo) cuenta', () => {
    expect(esConflictoDeBloqueo(conocido('P2034'))).toBe(true);
  });

  it('un error de consulta cruda con código 40P01 o 40001 de Postgres cuenta', () => {
    expect(esConflictoDeBloqueo(conocido('P2010', { code: '40P01' }))).toBe(true);
    expect(esConflictoDeBloqueo(conocido('P2010', { code: '40001' }))).toBe(true);
    expect(esConflictoDeBloqueo(conocido('P2010', { message: 'ERROR: deadlock detected (40P01)' }))).toBe(true);
  });

  it('otros errores no cuentan', () => {
    expect(esConflictoDeBloqueo(conocido('P2002'))).toBe(false);
    expect(esConflictoDeBloqueo(conocido('P2010', { code: '23505' }))).toBe(false);
    expect(esConflictoDeBloqueo(new Error('40P01'))).toBe(false);
    expect(esConflictoDeBloqueo(null)).toBe(false);
  });
});

describe('conReintento()', () => {
  it('reintenta una vez tras un interbloqueo y devuelve el segundo resultado', async () => {
    const fn = vi.fn().mockRejectedValueOnce(conocido('P2034')).mockResolvedValueOnce('ok');
    await expect(conReintento(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('si el segundo intento también choca, el error sube', async () => {
    const err = conocido('P2034');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(conReintento(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('otro error sube sin reintentar', async () => {
    const err = new Error('boom');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(conReintento(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
