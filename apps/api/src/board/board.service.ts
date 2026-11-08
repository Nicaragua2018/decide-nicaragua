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
  BOARD_ROLES,
  BoardActionType,
  GENERAL_GROUP_SLUG,
  MODERACION_CAUSAS,
  NICARAGUA_DEPARTMENTS,
  type ModeracionCausaValue,
  RULE_DEFINITIONS,
  type BoardActionSummary,
  type ReactivacionPendiente,
  type BoardRole,
  type BoardSeatSummary,
  type CargoTipoValue,
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

/** Suplentes provisionales que puede haber cuando la mesa no llega a dos miembros verificados. */
const MAX_SUPLENTES = 2;
/** Los cargos de la mesa (los mismos que convoca la primera jornada). */
const CARGOS_MESA = ['administrador', 'coordinador_general', 'secretario'] as const;

/** Puesto que queda vacante al suspender a su titular (lo recibe la elección anticipada). */
export interface VacantePorSuspension {
  groupId: string;
  cargo: CargoTipoValue;
  /** Fin del mandato que faltaba; null para un asiento fundador sin cargo. */
  mandatoHasta: Date | null;
}

interface ResultadoCambioRegla {
  status: 'executed' | 'rejected';
  cambio: { id: string; key: string } | null;
}

@Injectable()
export class BoardService {
  private readonly logger = new Logger(BoardService.name);
  /** Ganchos de «al suspender» (los registra EleccionesModule: así este módulo no importa elecciones). */
  private readonly alSuspender: ((p: VacantePorSuspension) => Promise<unknown>)[] = [];

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

  /** Registra lo que se hace con cada puesto que deja vacante una suspensión (la elección anticipada). */
  registrarAlSuspender(fn: (p: VacantePorSuspension) => Promise<unknown>): void {
    this.alSuspender.push(fn);
  }

  /**
   * Mesa incompleta: si hay menos de 2 miembros de la mesa con cuenta verificada, hasta 2
   * observadores vigentes y verificados (que no ocupen un asiento) firman las revisiones de texto y
   * las moderaciones. Van primero los mejor colocados en el orden final de su elección; desempate
   * por antigüedad en el cargo y por id. Con la mesa completa no hay suplentes.
   */
  async suplentesProvisionales(now: Date = new Date()): Promise<string[]> {
    return (await this.firmantes(now)).suplentes;
  }

  /** Quien firma revisiones de texto y moderaciones: la mesa o un suplente provisional. Nunca una acción de la mesa. */
  async puedeFirmarRevision(profileId: string, now: Date = new Date()): Promise<boolean> {
    if ((await this.roleOf(profileId)) !== null) return true;
    return (await this.suplentesProvisionales(now)).includes(profileId);
  }

  /** Miembros verificados de la mesa más los suplentes provisionales. */
  async firmantesDisponibles(now: Date = new Date()): Promise<number> {
    const f = await this.firmantes(now);
    return f.mesa + f.suplentes.length;
  }

  private async firmantes(now: Date): Promise<{ mesa: number; suplentes: string[] }> {
    const asientos = await this.prisma.boardSeat.findMany({
      select: { profileId: true, profile: { select: { user: { select: { status: true } } } } },
    });
    const mesa = asientos.filter((a) => (a.profile.user.status as string) === 'verified_citizen').length;
    if (mesa >= VOTOS_PARA_RESOLVER) return { mesa, suplentes: [] };

    const conAsiento = new Set(asientos.map((a) => a.profileId));
    const observadores = (
      await this.prisma.cargo.findMany({
        where: {
          tipo: 'observador',
          terminadoAt: null,
          desde: { lte: now },
          profile: { user: { status: 'verified_citizen' } },
        },
        select: { id: true, profileId: true, eleccionId: true, desde: true, profile: { select: { user: { select: { status: true } } } } },
      })
    ).filter((c) => (c.profile.user.status as string) === 'verified_citizen' && !conAsiento.has(c.profileId));
    if (observadores.length === 0) return { mesa, suplentes: [] };

    const conEleccion = observadores.filter((c): c is typeof c & { eleccionId: string } => c.eleccionId !== null);
    const [candidaturas, elecciones] = conEleccion.length
      ? await Promise.all([
          this.prisma.candidatura.findMany({
            where: { OR: conEleccion.map((c) => ({ eleccionId: c.eleccionId, profileId: c.profileId })) },
            select: { id: true, eleccionId: true, profileId: true },
          }),
          this.prisma.eleccion.findMany({
            where: { id: { in: [...new Set(conEleccion.map((c) => c.eleccionId))] } },
            select: { id: true, ordenFinal: true },
          }),
        ])
      : [[], []];
    const posicion = (c: (typeof observadores)[number]): number => {
      const k = candidaturas.find((x) => x.eleccionId === c.eleccionId && x.profileId === c.profileId);
      const i = k ? (elecciones.find((e) => e.id === c.eleccionId)?.ordenFinal.indexOf(k.id) ?? -1) : -1;
      return i < 0 ? Number.POSITIVE_INFINITY : i;
    };
    const ordenados = observadores
      .map((c) => ({ c, pos: posicion(c) }))
      .sort(
        (a, b) =>
          a.pos - b.pos ||
          a.c.desde.getTime() - b.c.desde.getTime() ||
          (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0),
      );
    const suplentes: string[] = [];
    for (const { c } of ordenados) {
      if (!suplentes.includes(c.profileId)) suplentes.push(c.profileId);
      if (suplentes.length === MAX_SUPLENTES) break;
    }
    return { mesa, suplentes };
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
      if (dto.type === BoardActionType.reactivate_user || dto.type === BoardActionType.rechazar_reactivacion) {
        if ((target.status as string) !== 'suspended') throw new BadRequestException('Esa cuenta ya no está suspendida.');
        params = { solicitudId: await this.validarSolicitud(dto.params, targetUserId) };
      }
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
      action.reason,
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
    reason: string,
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

        const ejecutada =
          aFavor >= VOTOS_PARA_RESOLVER && (await this.execute(tx, actionId, type, targetUserId, params, reason, despues));
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

  /** La solicitud de reactivación de la propuesta: existe, sigue pendiente y es de esa persona. */
  private async validarSolicitud(params: Record<string, unknown>, targetUserId: string): Promise<string> {
    const solicitudId = params['solicitudId'];
    if (typeof solicitudId !== 'string') throw new BadRequestException('Indica la solicitud de reactivación.');
    const s = await this.prisma.solicitudReactivacion.findUnique({
      where: { id: solicitudId },
      select: { userId: true, estado: true },
    });
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    if (s.userId !== targetUserId) throw new BadRequestException('Esa solicitud es de otra persona.');
    if ((s.estado as string) !== 'pendiente') throw new BadRequestException('Esa solicitud ya se resolvió.');
    return solicitudId;
  }

  /** Pedidos de reactivación pendientes, para la mesa: nombre visible (nunca el correo) y motivo de la suspensión. */
  async listarReactivaciones(): Promise<ReactivacionPendiente[]> {
    const pendientes = await this.prisma.solicitudReactivacion.findMany({
      where: { estado: 'pendiente' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, texto: true, createdAt: true },
    });
    if (pendientes.length === 0) return [];
    const userIds = [...new Set(pendientes.map((p) => p.userId))];
    const [perfiles, suspensiones] = await Promise.all([
      this.prisma.profile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, displayName: true } }),
      this.prisma.boardAction.findMany({
        where: { type: 'suspend_user', status: 'executed', targetUserId: { in: userIds } },
        orderBy: { resolvedAt: 'desc' },
        select: { targetUserId: true, reason: true },
      }),
    ]);
    return pendientes.map((p) => ({
      id: p.id,
      userId: p.userId,
      nombre: perfiles.find((x) => x.userId === p.userId)?.displayName ?? 'Sin nombre',
      // La más reciente primero (orderBy): el motivo de la suspensión vigente.
      motivoSuspension: suspensiones.find((x) => x.targetUserId === p.userId)?.reason ?? 'La mesa no dejó un motivo.',
      texto: p.texto,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  /**
   * Reactiva la cuenta dentro de la transacción de la firma. Se bloquean la cuenta y la solicitud
   * (una suspensión o la otra resolución de la misma solicitud, a la vez, esperan). La cuenta vuelve
   * al estado previo a la última suspensión (`params.estadoPrevio`, sea cual sea, también `rejected`;
   * solo si falta, no es un estado válido o es `suspended`, `pending_verification`). No recupera cargos ni asientos. Si la solicitud ya no está
   * pendiente o la cuenta ya no está suspendida, devuelve false sin tocar nada.
   */
  private async reactivar(
    tx: Prisma.TransactionClient,
    targetUserId: string,
    params: Record<string, unknown>,
    despues: (() => Promise<void>)[],
  ): Promise<boolean> {
    const solicitudId = String(params['solicitudId']);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${targetUserId}::uuid FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM solicitudes_reactivacion WHERE id = ${solicitudId}::uuid FOR UPDATE`);
    const solicitud = await tx.solicitudReactivacion.findFirst({
      where: { id: solicitudId, userId: targetUserId, estado: 'pendiente' },
      select: { id: true },
    });
    if (!solicitud) return false;

    const suspension = await tx.boardAction.findFirst({
      where: { type: 'suspend_user', targetUserId, status: 'executed' },
      orderBy: { resolvedAt: 'desc' },
      select: { params: true },
    });
    const previo = (suspension?.params as Record<string, unknown> | null | undefined)?.['estadoPrevio'];
    const estado =
      typeof previo === 'string' &&
      previo !== (AccountStatus.suspended as string) &&
      (Object.values(AccountStatus) as string[]).includes(previo)
        ? previo
        : AccountStatus.pending_verification;

    const r = await tx.user.updateMany({
      where: { id: targetUserId, status: 'suspended' },
      data: { status: estado as never },
    });
    if (r.count === 0) return false;
    const cerrada = await tx.solicitudReactivacion.updateMany({
      where: { id: solicitudId, userId: targetUserId, estado: 'pendiente' },
      data: { estado: 'aprobada', resueltaAt: new Date() },
    });
    // Imposible con los bloqueos; si pasara, se deshace la reactivación entera.
    if (cerrada.count === 0) throw new ConflictException('La solicitud ya se resolvió.');

    if (estado === (AccountStatus.verified_citizen as string)) {
      const perfil = await tx.profile.findUnique({
        where: { userId: targetUserId },
        select: { birthDepartment: true, currentCountry: true, currentRegion: true },
      });
      if (perfil) {
        despues.push(() =>
          this.groups.syncMemberships(targetUserId, perfil.birthDepartment, perfil.currentCountry, perfil.currentRegion),
        );
      }
    }
    despues.push(async () => {
      void this.audit.log({ action: 'reactivacion.aprobada', resource: `user:${targetUserId}`, metadata: { solicitudId } });
    });
    return true;
  }

  /** Rechaza la solicitud con el `reason` de la acción, que la persona verá. False si ya no está pendiente. */
  private async rechazarReactivacion(
    tx: Prisma.TransactionClient,
    targetUserId: string,
    params: Record<string, unknown>,
    reason: string,
    despues: (() => Promise<void>)[],
  ): Promise<boolean> {
    const solicitudId = String(params['solicitudId']);
    const r = await tx.solicitudReactivacion.updateMany({
      where: { id: solicitudId, userId: targetUserId, estado: 'pendiente' },
      data: { estado: 'rechazada', motivoRechazo: reason, resueltaAt: new Date() },
    });
    if (r.count === 0) return false;
    despues.push(async () => {
      void this.audit.log({ action: 'reactivacion.rechazada', resource: `user:${targetUserId}`, metadata: { solicitudId } });
    });
    return true;
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
   * Suspende la cuenta dentro de la transacción de la firma. Guarda en la acción el estado previo
   * (para una reactivación), quita las membresías (los guards de participación las miran), termina
   * todos sus cargos vigentes y borra sus asientos de la mesa. Tras confirmar, cada puesto vacante
   * va a los ganchos `alSuspender` (la elección anticipada); un asiento fundador sin cargo, con
   * `mandatoHasta: null`, pero solo si ya hubo alguna elección de mesa (si no, la cubre la primera
   * jornada). Cierra también los pedidos de revocación abiertos de esos cargos. Si un gancho falla no se deshace la suspensión: la convocatoria de cada
   * hora cubre después la vacante.
   */
  private async suspender(
    tx: Prisma.TransactionClient,
    actionId: string,
    targetUserId: string,
    params: Record<string, unknown>,
    despues: (() => Promise<void>)[],
  ): Promise<boolean> {
    const now = new Date();
    const previo = await tx.user.findUnique({ where: { id: targetUserId }, select: { status: true } });
    await tx.user.update({ where: { id: targetUserId }, data: { status: 'suspended' } });
    await tx.groupMembership.deleteMany({ where: { profile: { userId: targetUserId } } });
    await tx.boardAction.update({
      where: { id: actionId },
      data: { params: { ...params, estadoPrevio: (previo?.status as string | undefined) ?? null } as Prisma.InputJsonValue },
    });

    const cargos = await tx.cargo.findMany({
      where: { profile: { userId: targetUserId }, terminadoAt: null },
      select: { id: true, tipo: true, groupId: true, hasta: true },
    });
    if (cargos.length > 0) {
      await tx.cargo.updateMany({
        where: { id: { in: cargos.map((c) => c.id) }, terminadoAt: null },
        data: { terminadoAt: now, finCausa: 'suspension', enFunciones: false },
      });
      // Un pedido de revocación de un cargo que ya terminó no tiene objeto: se cierra con el cargo.
      await tx.revocacion.updateMany({
        where: { cargoId: { in: cargos.map((c) => c.id) }, estado: 'abierta' },
        data: { estado: 'vencida' },
      });
    }
    const asientos = await tx.boardSeat.findMany({ where: { profile: { userId: targetUserId } }, select: { role: true } });
    await tx.boardSeat.deleteMany({ where: { profile: { userId: targetUserId } } });

    const vacantes: VacantePorSuspension[] = cargos.map((c) => ({
      groupId: c.groupId,
      cargo: c.tipo as CargoTipoValue,
      mandatoHasta: c.hasta,
    }));
    const fundadores = asientos.filter((a) => !cargos.some((c) => (c.tipo as string) === (a.role as string)));
    // Antes de la primera jornada (nunca hubo una elección de mesa) no se abre anticipada para un
    // asiento fundador: bloquearía la primera jornada, que ya cubre el puesto vacante.
    const huboEleccionMesa =
      fundadores.length > 0 && (await tx.eleccion.count({ where: { cargo: { in: [...CARGOS_MESA] } } })) > 0;
    if (huboEleccionMesa) {
      const general = await tx.group.findUnique({ where: { slug: GENERAL_GROUP_SLUG }, select: { id: true } });
      if (general) {
        for (const a of fundadores) vacantes.push({ groupId: general.id, cargo: a.role as CargoTipoValue, mandatoHasta: null });
      }
    }
    if (vacantes.length > 0) despues.push(() => this.avisarVacantes(vacantes));
    return true;
  }

  private async avisarVacantes(vacantes: VacantePorSuspension[]): Promise<void> {
    for (const v of vacantes) {
      for (const fn of this.alSuspender) {
        try {
          await fn(v);
        } catch (err) {
          const nombre = err instanceof Error ? err.name : 'Error';
          this.logger.warn(`No se abrió la elección anticipada de un puesto vacante por suspensión (${v.cargo}): ${nombre}`);
        }
      }
    }
  }

  /**
   * Aplica la acción aprobada dentro de la transacción de la firma. Devuelve false si ya no se
   * puede aplicar (queda rechazada). Lo que no cabe en la transacción va a `despues`.
   */
  private async execute(
    tx: Prisma.TransactionClient,
    actionId: string,
    type: BoardActionType,
    targetUserId: string | null,
    params: Record<string, unknown>,
    reason: string,
    despues: (() => Promise<void>)[],
  ): Promise<boolean> {
    if (type === BoardActionType.ocultar_candidatura) return this.ocultarCandidatura(tx, params, despues);
    // change_rule se resuelve aparte (votarCambioRegla); las demás acciones exigen persona objetivo.
    if (targetUserId === null) throw new BadRequestException('La acción no tiene persona objetivo');
    if (type === BoardActionType.suspend_user) return this.suspender(tx, actionId, targetUserId, params, despues);
    if (type === BoardActionType.reactivate_user) return this.reactivar(tx, targetUserId, params, despues);
    if (type === BoardActionType.rechazar_reactivacion) {
      return this.rechazarReactivacion(tx, targetUserId, params, reason, despues);
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
