import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BOARD_ROLES,
  BoardActionType,
  NICARAGUA_DEPARTMENTS,
  RULE_DEFINITIONS,
  type BoardActionSummary,
  type BoardRole,
  type BoardSeatSummary,
  type JwtPayload,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
// Funciones puras: no importa RulesModule (cerraría un ciclo de módulos).
import { guardarValor, normalizarValor } from '../rules/ambito-reglas';
import type { ProposeActionDto } from './dto/propose-action.dto';

/** Aprobaciones (o rechazos) de personas distintas para resolver una acción. */
const VOTOS_PARA_RESOLVER = 2;

@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly groups: GroupsService,
  ) {}

  // ─── Cargos ────────────────────────────────────────────────────────────────

  /**
   * Cargo con el que la persona puede actuar. Si su cuenta ya no está
   * verificada (p. ej. suspendida), no actúa, aunque el asiento siga registrado.
   */
  async roleOf(profileId: string): Promise<BoardRole | null> {
    const seat = await this.prisma.boardSeat.findFirst({
      where: { profileId },
      include: { profile: { select: { user: { select: { status: true } } } } },
    });
    if (!seat || (seat.profile.user.status as string) !== 'verified_citizen') return null;
    return seat.role as BoardRole;
  }

  async isAdministrator(profileId: string): Promise<boolean> {
    return (await this.roleOf(profileId)) === 'administrador';
  }

  async getSeats(): Promise<BoardSeatSummary[]> {
    const seats = await this.prisma.boardSeat.findMany({
      include: { profile: { select: { id: true, displayName: true } } },
    });
    return BOARD_ROLES.map((role) => {
      const s = seats.find((x) => (x.role as string) === role);
      return {
        role,
        holder: s ? { profileId: s.profile.id, displayName: s.profile.displayName } : null,
        source: s ? (s.source as 'fundador' | 'eleccion') : null,
        since: s ? s.since.toISOString() : null,
      };
    });
  }

  /**
   * Arranque (spec §3): el administrador fundador asigna los otros cargos
   * mientras ningún cargo haya salido de una elección.
   */
  async assignFounderSeat(actor: JwtPayload, role: BoardRole, targetProfileId: string, ip: string): Promise<void> {
    const actorRole = actor.profileId ? await this.roleOf(actor.profileId) : null;
    if (actorRole !== 'administrador') {
      throw new ForbiddenException('Solo el administrador puede asignar los cargos fundadores.');
    }
    if ((await this.prisma.boardSeat.count({ where: { source: 'eleccion' } })) > 0) {
      throw new ForbiddenException('Los cargos de la mesa ya se eligen por votación.');
    }
    if ((role as string) === 'administrador') {
      throw new BadRequestException('El cargo de administrador no se asigna desde aquí.');
    }
    if (await this.prisma.boardSeat.findUnique({ where: { role } })) {
      throw new BadRequestException('Ese cargo ya está ocupado. Para reemplazar a alguien hace falta una decisión de la mesa.');
    }
    const target = await this.prisma.profile.findUnique({
      where: { id: targetProfileId },
      include: { user: { select: { status: true } } },
    });
    if (!target || (target.user.status as string) !== 'verified_citizen') {
      throw new BadRequestException('Solo un miembro verificado puede ocupar un cargo.');
    }
    const otroCargo = await this.prisma.boardSeat.findFirst({
      where: { profileId: targetProfileId, NOT: { role } },
    });
    if (otroCargo) throw new BadRequestException('Esa persona ya ocupa otro cargo de la mesa.');

    await this.prisma.boardSeat.create({
      data: { role, profileId: targetProfileId, source: 'fundador' },
    });

    void this.audit.log({
      actorId: actor.sub,
      action: 'board.seat_assigned',
      resource: `board_seat:${role}`,
      ip,
      metadata: { role, profileId: targetProfileId, source: 'fundador' },
    });
  }

  // ─── Acciones 2 de 3 ──────────────────────────────────────────────────────

  async proposeAction(actor: JwtPayload, dto: ProposeActionDto, ip: string): Promise<{ id: string }> {
    const role = actor.profileId ? await this.roleOf(actor.profileId) : null;
    if (!role) throw new ForbiddenException('Solo la mesa directiva puede proponer esta acción.');

    // change_rule solo lo crea el sistema cuando la comunidad aprueba un cambio de regla.
    if (dto.type === BoardActionType.change_rule) {
      throw new BadRequestException('Los cambios de regla llegan a la mesa desde una votación de la comunidad.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: dto.targetUserId } });
    if (!target) throw new NotFoundException('Persona no encontrada');

    if (dto.type === BoardActionType.change_origin) {
      const dept = dto.params['birthDepartment'];
      if (typeof dept !== 'string' || !(NICARAGUA_DEPARTMENTS as readonly string[]).includes(dept)) {
        throw new BadRequestException('Elige uno de los 17 territorios de origen.');
      }
    }

    const action = await this.prisma.boardAction.create({
      data: {
        type: dto.type,
        targetUserId: dto.targetUserId,
        params: dto.params as Prisma.InputJsonValue,
        reason: dto.reason,
        proposedByProfileId: actor.profileId!,
        approvals: { create: { profileId: actor.profileId!, role, approve: true } },
      },
    });

    void this.audit.log({
      actorId: actor.sub,
      action: 'board.action_proposed',
      resource: `board_action:${action.id}`,
      ip,
      metadata: { type: dto.type, targetUserId: dto.targetUserId },
    });
    return { id: action.id };
  }

  async voteAction(actor: JwtPayload, actionId: string, approve: boolean, ip: string): Promise<void> {
    const role = actor.profileId ? await this.roleOf(actor.profileId) : null;
    if (!role) throw new ForbiddenException('Solo la mesa directiva puede votar esta acción.');

    const action = await this.prisma.boardAction.findUnique({
      where: { id: actionId },
      include: { approvals: true },
    });
    if (!action) throw new NotFoundException('Acción no encontrada');
    if ((action.status as string) !== 'pending') throw new BadRequestException('Esta acción ya se resolvió.');
    if (action.approvals.some((a) => a.profileId === actor.profileId)) {
      throw new ConflictException('Ya votaste esta acción.');
    }

    await this.prisma.boardApproval.create({
      data: { actionId, profileId: actor.profileId!, role, approve },
    });

    const votos = [...action.approvals.map((a) => a.approve), approve];
    const aFavor = votos.filter(Boolean).length;
    const enContra = votos.length - aFavor;

    if ((action.type as string) === BoardActionType.change_rule && (aFavor >= VOTOS_PARA_RESOLVER || enContra >= VOTOS_PARA_RESOLVER)) {
      const r = await this.resolverCambioRegla(actionId, action.params as Record<string, unknown>, aFavor >= VOTOS_PARA_RESOLVER);
      const ejecutada = r.status === 'executed';
      void this.audit.log({
        actorId: actor.sub,
        action: ejecutada ? 'board.action_executed' : 'board.action_rejected',
        resource: `board_action:${actionId}`,
        ip,
        metadata: { type: action.type },
      });
      if (r.cambio) {
        void this.audit.log({
          action: ejecutada ? 'regla.cambio_aplicado' : 'regla.cambio_rechazado',
          resource: `cambio_regla:${r.cambio.id}`,
          metadata: { cambioId: r.cambio.id, key: r.cambio.key },
        });
      }
      return;
    }

    if (aFavor >= VOTOS_PARA_RESOLVER) {
      await this.execute(action.type as unknown as BoardActionType, action.targetUserId, action.params as Record<string, unknown>);
      await this.prisma.boardAction.update({
        where: { id: actionId },
        data: { status: 'executed', resolvedAt: new Date() },
      });
      void this.audit.log({ actorId: actor.sub, action: 'board.action_executed', resource: `board_action:${actionId}`, ip, metadata: { type: action.type } });
    } else if (enContra >= VOTOS_PARA_RESOLVER) {
      await this.prisma.boardAction.update({
        where: { id: actionId },
        data: { status: 'rejected', resolvedAt: new Date() },
      });
      void this.audit.log({ actorId: actor.sub, action: 'board.action_rejected', resource: `board_action:${actionId}`, ip, metadata: { type: action.type } });
    } else {
      void this.audit.log({ actorId: actor.sub, action: 'board.action_voted', resource: `board_action:${actionId}`, ip, metadata: { approve } });
    }
  }

  async listActions(): Promise<BoardActionSummary[]> {
    const actions = await this.prisma.boardAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        approvals: { select: { role: true, approve: true } },
        proposedBy: { select: { displayName: true } },
      },
    });
    const targets = await Promise.all(
      actions.map((a) =>
        a.targetUserId === null
          ? Promise.resolve(null)
          : this.prisma.profile.findUnique({ where: { userId: a.targetUserId }, select: { displayName: true } }),
      ),
    );
    return actions.map((a, i) => ({
      id: a.id,
      type: a.type as unknown as BoardActionType,
      targetDisplayName: targets[i]?.displayName ?? null,
      params: a.params as Record<string, unknown>,
      reason: a.reason,
      status: a.status as BoardActionSummary['status'],
      proposedBy: a.proposedBy?.displayName ?? null,
      approvals: a.approvals.map((x) => ({ role: x.role as unknown as BoardRole, approve: x.approve })),
      createdAt: a.createdAt.toISOString(),
    }));
  }

  /**
   * Resuelve una acción `change_rule` en una sola transacción. Solo vale para el cambio de la
   * colmena ligado a esta acción y pendiente de la mesa (nunca uno local). Al aprobarse valida
   * otra vez el valor con la definición actual de la regla: si ya no cabe, o el cambio no existe,
   * la acción queda rechazada. El `updateMany` condicionado a `pending` evita resolverla dos veces.
   */
  private async resolverCambioRegla(
    actionId: string,
    params: Record<string, unknown>,
    aprobar: boolean,
  ): Promise<{ status: 'executed' | 'rejected'; cambio: { id: string; key: string } | null }> {
    const cambioId = typeof params['cambioId'] === 'string' ? params['cambioId'] : null;
    return this.prisma.$transaction(async (tx) => {
      const cambio = cambioId
        ? await tx.cambioRegla.findFirst({
            where: { id: cambioId, boardActionId: actionId, nivel: 'colmena', estado: 'pendiente_mesa' },
            select: { id: true, key: true, valorPropuesto: true },
          })
        : null;
      const def = cambio ? RULE_DEFINITIONS.find((d) => d.key === cambio.key) : undefined;
      const valor = aprobar && cambio && def?.level === 'colmena' ? normalizarValor(def, cambio.valorPropuesto) : null;
      const status = valor !== null ? 'executed' : 'rejected';
      const ahora = new Date();

      const tomada = await tx.boardAction.updateMany({
        where: { id: actionId, status: 'pending' },
        data: { status, resolvedAt: ahora },
      });
      if (tomada.count === 0) throw new BadRequestException('Esta acción ya se resolvió.');
      if (!cambio) return { status, cambio: null };

      const cerrado = await tx.cambioRegla.updateMany({
        where: { id: cambio.id, estado: 'pendiente_mesa' },
        data: { estado: valor !== null ? 'aplicado' : 'rechazado_mesa', resueltoAt: ahora },
      });
      if (cerrado.count === 0) throw new ConflictException('El cambio de regla ya se resolvió.');
      if (valor !== null) await guardarValor(tx, cambio.key, null, valor);
      return { status, cambio: { id: cambio.id, key: cambio.key } };
    });
  }

  private async execute(type: BoardActionType, targetUserId: string | null, params: Record<string, unknown>): Promise<void> {
    // change_rule se resuelve aparte (resolverCambioRegla); las demás acciones exigen persona objetivo.
    if (targetUserId === null) throw new BadRequestException('La acción no tiene persona objetivo');
    if (type === BoardActionType.suspend_user) {
      // Los guards de participación miran la membresía: suspender también la quita.
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: targetUserId }, data: { status: 'suspended' } });
        await tx.groupMembership.deleteMany({ where: { profile: { userId: targetUserId } } });
      });
      return;
    }
    const birthDepartment = params['birthDepartment'] as string;
    const profile = await this.prisma.profile.update({
      where: { userId: targetUserId },
      data: { birthDepartment },
    });
    // Membresías solo al verificarse: a un no verificado se le corrige el origen sin unirlo a comunidades.
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { status: true } });
    if ((user?.status as string | undefined) === 'verified_citizen') {
      await this.groups.syncMemberships(targetUserId, birthDepartment, profile.currentCountry, profile.currentRegion);
    }
  }
}
