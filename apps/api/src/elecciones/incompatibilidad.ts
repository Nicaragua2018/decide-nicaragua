import type { CargoTipoValue } from '@decide/shared';
import type { PrismaService } from '../prisma/prisma.service';

export const MESA: readonly CargoTipoValue[] = ['administrador', 'coordinador_general', 'secretario'];

/**
 * Personas que ya ocupan un cargo incompatible con el de esta elección. La misma regla bloquea
 * al presentarse (EleccionesService) y excluye al contar (PosesionService):
 * - un cargo vigente de otro tipo o ámbito (repetir el mismo cargo no es incompatible);
 * - un asiento de la mesa elegido por votación para otro rol (cualquiera, si esta elección no
 *   es de la mesa);
 * - los asientos fundadores no cuentan, salvo en elecciones de coordinadores: ahí excluyen (la
 *   comunidad puede contar antes que la mesa y liberar el asiento la dejaría corta).
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
      where: { profileId: { in: perfiles }, ...(e.cargo === 'coordinador' ? {} : { source: 'eleccion' as const }) },
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
