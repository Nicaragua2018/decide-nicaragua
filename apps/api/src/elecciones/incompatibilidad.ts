import type { CargoTipoValue } from '@decide/shared';
import type { PrismaService } from '../prisma/prisma.service';

export const MESA: readonly CargoTipoValue[] = ['administrador', 'coordinador_general', 'secretario'];

/**
 * Personas que ya ocupan un cargo incompatible con el de esta elección. La misma regla bloquea
 * al presentarse (EleccionesService) y excluye al contar (PosesionService):
 * - un cargo vigente de otro tipo o ámbito (repetir el mismo cargo no es incompatible);
 * - un asiento de la mesa elegido por votación para otro rol (cualquiera, si esta elección no
 *   es de la mesa);
 * - los asientos fundadores solo dejan presentarse a un cargo de la mesa (y ahí se liberan al
 *   ganar otro rol); en coordinadores y observadores excluyen: liberar el asiento podría dejar la
 *   mesa con menos de 2 personas.
 */
export async function conOtroCargo(
  prisma: Pick<PrismaService, 'cargo' | 'boardSeat'>,
  e: { groupId: string; cargo: CargoTipoValue },
  perfiles: string[],
): Promise<Set<string>> {
  if (perfiles.length === 0) return new Set();
  const [cargos, asientos] = await Promise.all([
    prisma.cargo.findMany({
      where: { profileId: { in: perfiles }, terminadoAt: null },
      select: { profileId: true, tipo: true, groupId: true },
    }),
    prisma.boardSeat.findMany({
      where: { profileId: { in: perfiles }, ...(MESA.includes(e.cargo) ? { source: 'eleccion' as const } : {}) },
      select: { profileId: true, role: true },
    }),
  ]);
  const otros = new Set<string>();
  for (const c of cargos) {
    if (c.tipo !== e.cargo || c.groupId !== e.groupId) otros.add(c.profileId);
  }
  for (const a of asientos) {
    if (!MESA.includes(e.cargo) || (a.role as string) !== e.cargo) otros.add(a.profileId);
  }
  return otros;
}
