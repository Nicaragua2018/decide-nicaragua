import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AccountStatus,
  BOOTSTRAP_VERIFIED_LIMIT,
  type JwtPayload,
  type PendingVerification,
  type VerificationStatus,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
import { hostCommunity, sameHostCommunity } from '../common/utils/host-community.util';

type Kind = 'invitador' | 'segunda';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly groups: GroupsService,
  ) {}

  /**
   * Da una referencia. Con las dos (spec §4) la persona queda verificada y
   * entra a sus comunidades. En la fundación, la del administrador basta.
   */
  async confirm(referee: JwtPayload, subjectUserId: string, ip: string): Promise<void> {
    if ((referee.status as string) !== AccountStatus.verified_citizen || !referee.profileId) {
      throw new ForbiddenException('Solo un miembro verificado puede dar una referencia.');
    }
    if (referee.sub === subjectUserId) throw new BadRequestException('No puedes confirmarte a ti mismo.');

    const subject = await this.prisma.user.findUnique({
      where: { id: subjectUserId },
      include: { profile: true, referencesReceived: true },
    });
    if (!subject || !subject.profile) throw new NotFoundException('Persona no encontrada');
    if ((subject.status as string) !== AccountStatus.pending_verification) {
      throw new BadRequestException('Esta persona no está esperando verificación.');
    }
    if (subject.referencesReceived.some((r) => r.refereeProfileId === referee.profileId)) {
      throw new ConflictException('Ya diste tu referencia a esta persona.');
    }

    const refereeProfile = await this.prisma.profile.findUnique({ where: { id: referee.profileId } });
    if (!refereeProfile) throw new ForbiddenException('Perfil no encontrado');

    const esAdministrador = !!(await this.prisma.boardSeat.findFirst({
      where: { role: 'administrador', profileId: referee.profileId },
    }));
    // Los suspendidos cuentan: la ventana de fundación no se reabre si baja el número de verificados.
    const verificados = await this.prisma.user.count({
      where: { status: { in: ['verified_citizen', 'suspended'] } },
    });
    const fundacion = esAdministrador && verificados < BOOTSTRAP_VERIFIED_LIMIT;

    let kind: Kind;
    if (subject.invitedById === referee.sub) {
      kind = 'invitador';
    } else {
      const mismoOrigen =
        !!refereeProfile.birthDepartment && refereeProfile.birthDepartment === subject.profile.birthDepartment;
      if (!esAdministrador && !mismoOrigen && !sameHostCommunity(refereeProfile, subject.profile)) {
        throw new ForbiddenException(
          'La segunda referencia debe darla el administrador o un miembro de su mismo territorio de origen o de su misma comunidad de acogida.',
        );
      }
      kind = 'segunda';
    }
    if (subject.referencesReceived.some((r) => (r.kind as string) === kind)) {
      throw new ConflictException(
        kind === 'invitador' ? 'La referencia de quien invitó ya está dada.' : 'Esta persona ya tiene su segunda referencia.',
      );
    }

    const profileId = referee.profileId;
    // Insertar, releer y decidir en una sola transacción: confirmaciones
    // simultáneas no pueden dejar a nadie sin verificar.
    const outcome = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.verificationReference.create({ data: { subjectUserId, refereeProfileId: profileId, kind } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Esta persona ya tiene esa referencia.');
        }
        throw err;
      }
      const tipos = new Set<string>(
        (await tx.verificationReference.findMany({ where: { subjectUserId }, select: { kind: true } })).map(
          (r) => r.kind as string,
        ),
      );
      const completa = tipos.has('invitador') && tipos.has('segunda');
      if (!completa && !fundacion) return { verified: false as const };
      await tx.user.update({ where: { id: subjectUserId }, data: { status: 'verified_citizen' } });
      return { verified: true as const, via: completa ? 'dos_referencias' : 'fundacion' };
    });

    void this.audit.log({
      actorId: referee.sub,
      action: 'verification.reference',
      resource: `user:${subjectUserId}`,
      ip,
      metadata: { kind },
    });
    if (!outcome.verified) return;

    try {
      await this.groups.syncMemberships(
        subjectUserId,
        subject.profile.birthDepartment,
        subject.profile.currentCountry,
        subject.profile.currentRegion,
      );
    } catch (err) {
      // La persona ya está verificada; una próxima actualización de perfil vuelve a sincronizar.
      this.logger.error(`syncMemberships falló para ${subjectUserId}: ${(err as Error).message}`);
    }
    void this.audit.log({
      actorId: referee.sub,
      action: 'user.verified',
      resource: `user:${subjectUserId}`,
      ip,
      metadata: { via: outcome.via },
    });
  }

  /** Lo que ve la propia persona: qué referencias tiene y cuáles faltan. */
  async statusFor(userId: string): Promise<VerificationStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { referencesReceived: { include: { referee: { select: { displayName: true } } } } },
    });
    if (!user) throw new NotFoundException('Persona no encontrada');
    const refs = user.referencesReceived.map((r) => ({
      kind: r.kind as Kind,
      displayName: r.referee.displayName,
    }));
    const missing = (['invitador', 'segunda'] as Kind[]).filter((k) => !refs.some((r) => r.kind === k));
    return { status: user.status as string, references: refs, missing };
  }

  /** Personas pendientes a las que el miembro actual puede dar una referencia. */
  async pendingFor(referee: JwtPayload): Promise<PendingVerification[]> {
    if ((referee.status as string) !== AccountStatus.verified_citizen || !referee.profileId) return [];
    const yo = await this.prisma.profile.findUnique({ where: { id: referee.profileId } });
    if (!yo) return [];
    const esAdministrador = !!(await this.prisma.boardSeat.findFirst({
      where: { role: 'administrador', profileId: referee.profileId },
    }));

    const pendientes = await this.prisma.user.findMany({
      where: { status: 'pending_verification', NOT: { id: referee.sub } },
      include: { profile: true, referencesReceived: true },
      orderBy: { createdAt: 'asc' },
    });

    return pendientes
      .filter((u) => u.profile && !u.referencesReceived.some((r) => r.refereeProfileId === referee.profileId))
      .filter((u) => {
        if (u.invitedById === referee.sub) return !u.referencesReceived.some((r) => (r.kind as string) === 'invitador');
        if (u.referencesReceived.some((r) => (r.kind as string) === 'segunda')) return false;
        const mismoOrigen = !!yo.birthDepartment && yo.birthDepartment === u.profile!.birthDepartment;
        return esAdministrador || mismoOrigen || sameHostCommunity(yo, u.profile!);
      })
      .map((u) => ({
        userId: u.id,
        displayName: u.profile!.displayName,
        birthDepartment: u.profile!.birthDepartment,
        hostCommunity: hostCommunity(u.profile!.currentCountry, u.profile!.currentRegion)?.name ?? null,
        invitedByMe: u.invitedById === referee.sub,
        referencesCount: u.referencesReceived.length,
      }));
  }
}
