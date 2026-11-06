import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SOLO_EN_LA_COMUNIDAD =
  'Los grupos de trabajo deciden con soluciones y votación; lo demás se lleva a la comunidad.';

/** Inquietudes, elecciones y sorteos no existen dentro de un grupo de trabajo (400). */
export async function rechazarGrupoDeTrabajo(
  prisma: Pick<PrismaService, 'group'>,
  groupId: string,
): Promise<void> {
  const g = await prisma.group.findUnique({ where: { id: groupId }, select: { type: true } });
  if ((g?.type as string | undefined) === 'trabajo') throw new BadRequestException(SOLO_EN_LA_COMUNIDAD);
}

const NO_LEE = 'Solo los miembros de esta comunidad pueden ver esto.';
const NO_PARTICIPA_COMUNIDAD = 'Solo los miembros de esta comunidad pueden participar.';
const NO_PARTICIPA_GRUPO = 'Solo los miembros de este grupo pueden participar.';
const GRUPO_NO_ACTIVO = 'Este grupo de trabajo no está activo.';
/** Una bifurcación pausada (o lo que cuelga de ella, como su comisión) no admite escrituras. */
export const EN_PAUSA = 'Esta iniciativa está en pausa.';

/** Cómo accede una persona a un grupo: participa (es miembro), solo lee (desde el ámbito) o nada. */
export type NivelDeAcceso = 'participa' | 'lee' | null;

/**
 * Lectura y participación en un grupo.
 * - Participan solo sus miembros.
 * - Un grupo de trabajo, además, lo leen los miembros actuales de su ámbito (`parentGroupId`).
 */
@Injectable()
export class GroupAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isParticipant(groupId: string, profileId: string): Promise<boolean> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_profileId: { groupId, profileId } },
    });
    return Boolean(m);
  }

  /** Nivel de acceso: miembro → participa; miembro del ámbito de un grupo de trabajo → lee. */
  async nivel(groupId: string, profileId: string): Promise<NivelDeAcceso> {
    if (await this.isParticipant(groupId, profileId)) return 'participa';
    const grupo = await this.grupo(groupId);
    // Una bifurcación solo la leen sus miembros (R4): nombres y foro delatarían el voto.
    if (grupo?.type === 'trabajo' && grupo.parentGroupId && grupo.trabajoTipo !== 'bifurcacion') {
      if (await this.isParticipant(grupo.parentGroupId, profileId)) return 'lee';
    }
    return null;
  }

  /**
   * Grupo reservado: una bifurcación o un grupo que cuelga de una (su comisión). Lo que se hace
   * dentro no se audita con actor, ip ni el id del grupo: delataría quiénes la forman.
   */
  async esReservado(groupId: string): Promise<boolean> {
    const g = await this.grupo(groupId);
    if (!g || g.type !== 'trabajo') return false;
    if (g.trabajoTipo === 'bifurcacion') return true;
    if (!g.parentGroupId) return false;
    return (await this.grupo(g.parentGroupId))?.trabajoTipo === 'bifurcacion';
  }

  /**
   * Rastro de quien actúa para la auditoría: `{ actorId, ip }` fuera de lo reservado; nada dentro de
   * un grupo reservado o cuando quien llama ya sabe que el contenido es reservado (`forzar`).
   */
  async rastro(
    groupId: string,
    profileId: string,
    ip?: string,
    forzar = false,
  ): Promise<{ reservado: boolean; quien: { actorId?: string; ip?: string } }> {
    try {
      if (forzar || (await this.esReservado(groupId))) return { reservado: true, quien: {} };
      const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
      return { reservado: false, quien: { ...(p?.userId ? { actorId: p.userId } : {}), ...(ip ? { ip } : {}) } };
    } catch {
      // La auditoría no debe romper la acción; ante la duda, sin rastro.
      return { reservado: true, quien: {} };
    }
  }

  async canRead(groupId: string, profileId: string): Promise<boolean> {
    return (await this.nivel(groupId, profileId)) !== null;
  }

  /** 403 si no puede leer. Devuelve si además participa (para las banderas de quien solo lee). */
  async requireReader(groupId: string, profileId: string): Promise<{ participa: boolean }> {
    const nivel = await this.nivel(groupId, profileId);
    if (!nivel) throw new ForbiddenException(NO_LEE);
    return { participa: nivel === 'participa' };
  }

  /** 403 si no es miembro (sin mirar el estado del grupo). */
  async requireMember(groupId: string, profileId: string): Promise<void> {
    if (await this.isParticipant(groupId, profileId)) return;
    const grupo = await this.grupo(groupId);
    throw new ForbiddenException(grupo?.type === 'trabajo' ? NO_PARTICIPA_GRUPO : NO_PARTICIPA_COMUNIDAD);
  }

  /**
   * 403 si no es miembro; en un grupo de trabajo, además, 409 si no está activo
   * (convocando, pausado, cerrado o archivado se leen pero no se escriben) o si cuelga de una
   * bifurcación pausada (su comisión se detiene con ella).
   */
  async requireParticipant(groupId: string, profileId: string): Promise<void> {
    await this.requireMember(groupId, profileId);
    const grupo = await this.grupo(groupId);
    if (grupo?.type !== 'trabajo') return;
    if (grupo.trabajoTipo === 'bifurcacion' && grupo.trabajoEstado === 'pausado') throw new ConflictException(EN_PAUSA);
    if (grupo.trabajoEstado !== 'activo') throw new ConflictException(GRUPO_NO_ACTIVO);
    if (grupo.parentGroupId && (await this.bifurcacionPausada(grupo.parentGroupId))) throw new ConflictException(EN_PAUSA);
  }

  /** El grupo es una bifurcación en pausa. */
  async bifurcacionPausada(groupId: string): Promise<boolean> {
    const g = await this.grupo(groupId);
    return g?.type === 'trabajo' && g.trabajoTipo === 'bifurcacion' && g.trabajoEstado === 'pausado';
  }

  private async grupo(
    groupId: string,
  ): Promise<{ type: string; parentGroupId: string | null; trabajoEstado: string | null; trabajoTipo: string | null } | null> {
    const g = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { type: true, parentGroupId: true, trabajoEstado: true, trabajoTipo: true },
    });
    return g
      ? {
          type: g.type as string,
          parentGroupId: g.parentGroupId ?? null,
          trabajoEstado: (g.trabajoEstado as string | null | undefined) ?? null,
          trabajoTipo: (g.trabajoTipo as string | null | undefined) ?? null,
        }
      : null;
  }
}
