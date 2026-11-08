import { Prisma } from '@prisma/client';

/** Códigos de Postgres de un interbloqueo (40P01) o de un fallo de serialización (40001). */
const CODIGOS_PG = ['40P01', '40001'];

/**
 * ¿La transacción falló por chocar con otra (interbloqueo o serialización)? Prisma lo da como
 * P2034; en una consulta cruda llega como otro código con el de Postgres en `meta`.
 */
export function esConflictoDeBloqueo(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === 'P2034') return true;
  const meta = (err.meta ?? {}) as Record<string, unknown>;
  const textos = [meta['code'], meta['message'], err.message].filter((t): t is string => typeof t === 'string');
  return textos.some((t) => CODIGOS_PG.some((c) => t.includes(c)));
}

/** Ejecuta la transacción; si choca con otra, la repite una sola vez antes de fallar. */
export async function conReintento<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!esConflictoDeBloqueo(err)) throw err;
    return fn();
  }
}
