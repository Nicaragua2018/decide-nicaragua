import type { Prisma } from '@prisma/client';

/**
 * Miembros actuales de `groupId` que en el tema comentaron, señalaron, escribieron o votaron
 * una frase, o propusieron una solución. Función pura sobre Prisma: la usan las decisiones
 * (objeción al modo) y las comisiones (umbral de renovación) sin acoplar sus módulos.
 */
export async function participantesDelDebate(
  prisma: Prisma.TransactionClient,
  proposalId: string,
  groupId: string,
): Promise<Set<string>> {
  const [comentarios, senales, frases, votos, soluciones] = await Promise.all([
    prisma.proposalComment.findMany({ where: { proposalId }, select: { authorProfileId: true }, distinct: ['authorProfileId'] }),
    prisma.consensusSignal.findMany({ where: { proposalId }, select: { profileId: true } }),
    prisma.frase.findMany({ where: { proposalId }, select: { authorProfileId: true }, distinct: ['authorProfileId'] }),
    prisma.fraseVoto.findMany({ where: { frase: { proposalId } }, select: { profileId: true }, distinct: ['profileId'] }),
    prisma.solucion.findMany({ where: { proposalId }, select: { authorProfileId: true }, distinct: ['authorProfileId'] }),
  ]);
  const ids = new Set<string>([
    ...comentarios.map((c) => c.authorProfileId),
    ...senales.map((s) => s.profileId),
    ...frases.map((f) => f.authorProfileId),
    ...votos.map((v) => v.profileId),
    ...soluciones.map((s) => s.authorProfileId),
  ]);
  if (ids.size === 0) return new Set();
  const miembros = await prisma.groupMembership.findMany({
    where: { groupId, profileId: { in: [...ids] } },
    select: { profileId: true },
  });
  return new Set(miembros.map((m) => m.profileId));
}
