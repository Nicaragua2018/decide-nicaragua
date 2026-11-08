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
  MODERACION_CAUSAS,
  NICARAGUA_DEPARTMENTS,
  type ModeracionCausaValue,
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
/** Una ficha solo se oculta mientras la elección está abierta (después ya está contada). */
const ELECCION_ABIERTA = ['candidaturas', 'votacion'] as const;

interface ResultadoCambioRegla {
  status: 'executed' | 'rejected';
  cambio: { id: string; key: string } | null;
}

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

    let targetUserId: string;
    let params = dto.params;
    if (dto.type === BoardActionType.ocultar_candidatura) {
      await this.sinConflicto(actor.profileId!);
      const o = await this.validarOcultar(dto.params);
      targetUserId = o.targetUserId;
      params = { candidaturaId: o.candidaturaId, causa: o.causa };
    } else {
      if (!dto.targetUserId) throw new BadRequestException('Indica la persona.');
      const target = await this.prisma.user.findUnique({ where: { id: dto.targetUserId } });
      if (!target) throw new NotFoundException('Persona no encontrada');
      targetUserId = dto.targetUserId;
    }

    if (dto.type === BoardActionType.change_origin) {
      const dept = dto.params['birthDepartment'];
      if (typeof dept !== 'string' || !(NICARAGUA_DEPARTMENTS as readonly string[]).includes(dept)) {
        throw new BadRequestException('Elige uno de los 17 territorios de origen.');
      }
    }

    const action = await this.prisma.boardAction.create({
      data: {
        type: dto.type,
        targetUserId,
        params: params as Prisma.InputJsonValue,
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
      metadata: { type: dto.type, targetUserId },
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

    if ((action.type as string) === BoardActionType.change_rule) {
      const r = await this.votarCambioRegla(actionId, actor.profileId!, role, approve);
      if (r === null) {
        void this.audit.log({ actorId: actor.sub, action: 'board.action_voted', resource: `board_action:${actionId}`, ip, metadata: { approve } });
        return;
      }
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

    if ((action.type as string) === BoardActionType.ocultar_candidatura) await this.sinConflicto(actor.profileId!);

    const r = await this.votarYResolver(
      actionId,
      actor.profileId!,
      role,
      approve,
      action.type as unknown as BoardActionType,
      action.targetUserId,
      action.params as Record<string, unknown>,
    );
    // Lo que va fuera de la transacción, solo si se confirmó: comunidades del nuevo origen y auditoría.
    for (const tarea of r.despues) await tarea();
    if (r.status === 'executed') {
      void this.audit.log({ actorId: actor.sub, action: 'board.action_executed', resource: `board_action:${actionId}`, ip, metadata: { type: action.type } });
    } else if (r.status === 'rejected') {
      // Dos rechazos, o aprobada cuando ya no se podía aplicar (p. ej. la elección ya se contó).
      void this.audit.log({ actorId: actor.sub, action: 'board.action_rejected', resource: `board_action:${actionId}`, ip, metadata: { type: action.type } });
    } else {
      void this.audit.log({ actorId: actor.sub, action: 'board.action_voted', resource: `board_action:${actionId}`, ip, metadata: { approve } });
    }
  }

  /**
   * Firma de una acción (que no sea change_rule) en una sola transacción con la fila de la acción
   * bloqueada (como `votarCambioRegla`): se vuelve a comprobar que sigue pendiente, se registra la
   * firma, se cuentan los votos desde la base y, con 2 a favor, se aplica; con 2 en contra (o si ya
   * no se puede aplicar) queda rechazada. Dos firmas finales a la vez no ejecutan dos veces: la
   * segunda espera y ve la acción resuelta. Una edición de la ficha que canceló la propuesta justo
   * antes también se ve aquí.
   */
  private async votarYResolver(
    actionId: string,
    profileId: string,
    role: BoardRole,
    approve: boolean,
    type: BoardActionType,
    targetUserId: string | null,
    params: Record<string, unknown>,
  ): Promise<{ status: 'pending' | 'executed' | 'rejected'; despues: (() => Promise<void>)[] }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM board_actions WHERE id = ${actionId}::uuid FOR UPDATE`);
        const a = await tx.boardAction.findUnique({ where: { id: actionId }, select: { status: true } });
        if (!a || (a.status as string) !== 'pending') throw new BadRequestException('Esta acción ya se resolvió.');
        await tx.boardApproval.create({ data: { actionId, profileId, role, approve } });
        const votos = await tx.boardApproval.findMany({ where: { actionId }, select: { approve: true } });
        const aFavor = votos.filter((v) => v.approve).length;
        const enContra = votos.length - aFavor;
        const despues: (() => Promise<void>)[] = [];
        if (aFavor < VOTOS_PARA_RESOLVER && enContra < VOTOS_PARA_RESOLVER) return { status: 'pending' as const, despues };

        const ejecutada = aFavor >= VOTOS_PARA_RESOLVER && (await this.execute(tx, type, targetUserId, params, despues));
        const status = ejecutada ? ('executed' as const) : ('rejected' as const);
        const tomada = await tx.boardAction.updateMany({
          where: { id: actionId, status: 'pending' },
          data: { status, resolvedAt: new Date() },
        });
        if (tomada.count === 0) throw new BadRequestException('Esta acción ya se resolvió.');
        return { status, despues: ejecutada ? despues : [] };
      });
    } catch (err) {
      // Índice único (acción, persona): el mismo voto llegó dos veces a la vez.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya votaste esta acción.');
      }
      throw err;
    }
  }

  /**
   * Conflicto de interés: quien tiene una candidatura viva en una elección abierta no propone ni
   * firma ocultar fichas. Si eso deja a la mesa sin dos firmantes, la ficha no se oculta (la
   * revisión previa sigue actuando).
   */
  private async sinConflicto(profileId: string): Promise<void> {
    const propias = await this.prisma.candidatura.count({
      where: { profileId, retiradaAt: null, eleccion: { fase: { in: [...ELECCION_ABIERTA] } } },
    });
    if (propias > 0) {
      throw new ForbiddenException('Te presentaste a una elección abierta: no puedes proponer ni firmar que se oculte una ficha.');
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
   * Voto sobre una acción `change_rule`, en una sola transacción con la fila de la acción
   * bloqueada: se registra el voto, se cuentan los votos desde la base y, con 2 a favor o 2 en
   * contra, se resuelve. Así dos primeros votos a la vez se ven entre sí (el segundo espera al
   * primero y resuelve), y si algo falla no queda un voto suelto. Devuelve null si aún no se resuelve.
   */
  private async votarCambioRegla(
    actionId: string,
    profileId: string,
    role: BoardRole,
    approve: boolean,
  ): Promise<ResultadoCambioRegla | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM board_actions WHERE id = ${actionId}::uuid FOR UPDATE`);
        const a = await tx.boardAction.findUnique({ where: { id: actionId }, select: { status: true, params: true } });
        if (!a || (a.status as string) !== 'pending') throw new BadRequestException('Esta acción ya se resolvió.');
        await tx.boardApproval.create({ data: { actionId, profileId, role, approve } });
        const votos = await tx.boardApproval.findMany({ where: { actionId }, select: { approve: true } });
        const aFavor = votos.filter((v) => v.approve).length;
        const enContra = votos.length - aFavor;
        if (aFavor < VOTOS_PARA_RESOLVER && enContra < VOTOS_PARA_RESOLVER) return null;
        return this.resolverCambioReglaTx(tx, actionId, a.params as Record<string, unknown>, aFavor >= VOTOS_PARA_RESOLVER);
      });
    } catch (err) {
      // Índice único (acción, persona): el mismo voto llegó dos veces a la vez.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya votaste esta acción.');
      }
      throw err;
    }
  }

  /**
   * Resuelve una acción `change_rule` dentro de la transacción del voto. Solo vale para el cambio
   * de la colmena ligado a esta acción y pendiente de la mesa (nunca uno local). Al aprobarse
   * valida otra vez el valor con la definición actual de la regla: si ya no cabe, o el cambio no
   * existe, la acción queda rechazada. El `updateMany` condicionado a `pending` evita resolverla dos veces.
   */
  private async resolverCambioReglaTx(
    tx: Prisma.TransactionClient,
    actionId: string,
    params: Record<string, unknown>,
    aprobar: boolean,
  ): Promise<ResultadoCambioRegla> {
    const cambioId = typeof params['cambioId'] === 'string' ? params['cambioId'] : null;
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
  }

  /** Valida una propuesta de ocultar una ficha: causa de la lista cerrada y elección abierta. */
  private async validarOcultar(
    params: Record<string, unknown>,
  ): Promise<{ candidaturaId: string; causa: ModeracionCausaValue; targetUserId: string }> {
    const candidaturaId = params['candidaturaId'];
    const causa = params['causa'];
    if (typeof candidaturaId !== 'string') throw new BadRequestException('Indica la candidatura.');
    const valida = MODERACION_CAUSAS.find((c) => c.value === causa);
    if (!valida) throw new BadRequestException('Elige una de las causas de moderación.');
    const c = await this.prisma.candidatura.findUnique({
      where: { id: candidaturaId },
      select: { oculta: true, retiradaAt: true, eleccion: { select: { fase: true } }, profile: { select: { userId: true } } },
    });
    if (!c) throw new NotFoundException('Candidatura no encontrada');
    if (c.retiradaAt || !(ELECCION_ABIERTA as readonly string[]).includes(c.eleccion.fase as string)) {
      throw new BadRequestException('Solo se oculta una ficha mientras la elección está abierta.');
    }
    if (c.oculta) throw new BadRequestException('Esa ficha ya está oculta.');
    return { candidaturaId, causa: valida.value, targetUserId: c.profile.userId };
  }

  /**
   * Oculta la ficha si la elección sigue abierta. Devuelve false si ya no se puede (contada o
   * retirada): la acción queda rechazada. La elección se toma en FOR SHARE: si el conteo (FOR
   * UPDATE) va a la vez, o esto termina antes y el conteo ve la ficha oculta, o el conteo termina
   * antes y aquí ya no se oculta. La auditoría no lleva el texto y se escribe tras confirmar.
   */
  private async ocultarCandidatura(
    tx: Prisma.TransactionClient,
    params: Record<string, unknown>,
    despues: (() => Promise<void>)[],
  ): Promise<boolean> {
    const candidaturaId = String(params['candidaturaId']);
    const causa = params['causa'] as ModeracionCausaValue;
    const c = await tx.candidatura.findUnique({ where: { id: candidaturaId }, select: { eleccionId: true } });
    if (!c) return false;
    await tx.$queryRaw(Prisma.sql`SELECT id FROM elecciones WHERE id = ${c.eleccionId}::uuid FOR SHARE`);
    const r = await tx.candidatura.updateMany({
      // `oculta: false`: una segunda acción aprobada no pisa la causa ni audita dos veces.
      where: { id: candidaturaId, oculta: false, retiradaAt: null, eleccion: { fase: { in: [...ELECCION_ABIERTA] } } },
      data: { oculta: true, ocultaCausa: causa },
    });
    if (r.count === 0) return false;
    despues.push(async () => {
      void this.audit.log({
        action: 'candidatura.ocultada',
        resource: `candidatura:${candidaturaId}`,
        metadata: { eleccionId: c.eleccionId, causa },
      });
    });
    return true;
  }

  /**
   * Aplica la acción aprobada dentro de la transacción de la firma. Devuelve false si ya no se
   * puede aplicar (queda rechazada). Lo que no cabe en la transacción va a `despues`.
   */
  private async execute(
    tx: Prisma.TransactionClient,
    type: BoardActionType,
    targetUserId: string | null,
    params: Record<string, unknown>,
    despues: (() => Promise<void>)[],
  ): Promise<boolean> {
    if (type === BoardActionType.ocultar_candidatura) return this.ocultarCandidatura(tx, params, despues);
    // change_rule se resuelve aparte (votarCambioRegla); las demás acciones exigen persona objetivo.
    if (targetUserId === null) throw new BadRequestException('La acción no tiene persona objetivo');
    if (type === BoardActionType.suspend_user) {
      // Los guards de participación miran la membresía: suspender también la quita.
      await tx.user.update({ where: { id: targetUserId }, data: { status: 'suspended' } });
      await tx.groupMembership.deleteMany({ where: { profile: { userId: targetUserId } } });
      return true;
    }
    const birthDepartment = params['birthDepartment'] as string;
    const profile = await tx.profile.update({
      where: { userId: targetUserId },
      data: { birthDepartment },
    });
    // Membresías solo al verificarse: a un no verificado se le corrige el origen sin unirlo a comunidades.
    const user = await tx.user.findUnique({ where: { id: targetUserId }, select: { status: true } });
    if ((user?.status as string | undefined) === 'verified_citizen') {
      despues.push(() =>
        this.groups.syncMemberships(targetUserId, birthDepartment, profile.currentCountry, profile.currentRegion),
      );
    }
    return true;
  }
}
