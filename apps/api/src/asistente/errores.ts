import { Prisma } from '@prisma/client';

/**
 * Lo único que se registra de un error: su nombre y, si es de Prisma, su código.
 * Nunca el mensaje ni la pila, que pueden repetir los argumentos (y con ellos texto de miembros).
 */
export function nombreDeError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return `${err.name} ${err.code}`;
  return err instanceof Error ? err.name : 'error';
}
