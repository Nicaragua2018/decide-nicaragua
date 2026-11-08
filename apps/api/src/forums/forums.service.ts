import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ASISTENTE_NOMBRE,
  MODERACION_CAUSAS,
  type ForumDetail,
  type ForumSummary,
  type ModeracionCausaValue,
  type ModeracionPorConfirmar,
  type ModerationAppeal,
  type PublicConsensus,
  type ProposalSummary,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BoardService } from '../board/board.service';
import { RulesService } from '../rules/rules.service';
import { GroupAccessService } from '../groups/group-access.service';
import { NOMBRE_INICIATIVA, solucionesDeIniciativa, temasDeIniciativa } from '../grupos/bifurcacion-reglas';
import type { CreateForumDto } from './dto/create-forum.dto';
import type { CloseTopicDto } from './dto/close-topic.dto';
import type { ModerateDto } from './dto/moderate.dto';

const DIA_MS = 86_400_000;

/** Título que toma la votación de un tema oculto, para que no repita el título del tema. */
const HIDDEN_VOTE_TITLE = 'Votación de un tema oculto';

type ModTarget = 'tema' | 'respuesta' | 'inquietud' | 'frase' | 'solucion' | 'informe';

/**
 * Contenido de las elecciones (3C) que solo llega aquí como solicitud del asistente (revisión
 * posterior). El foro no lo oculta a mano ni lo conoce: cada tipo lo registra su módulo con
 * `registrarModeracion` (así forums no importa elecciones). La mesa lo resuelve con 2 firmas.
 */
export type ObjetivoEleccion = 'candidatura' | 'revocacion' | 'observacion';

export interface ModeracionDeEleccion {
  /** El texto como lo revisa el asistente (`textoParaRevisar`), o null si ya no existe. */
  texto(id: string): Promise<string | null>;
  /** true si ya no hay nada que moderar (oculto, retirado, cerrado); null si no existe. */
  estaOculto(id: string): Promise<boolean | null>;
  /** Qué es, para la mesa: «Ficha de candidatura · Secretaría · Nicaragua». */
  contexto(id: string): Promise<string | null>;
  /**
   * Con la segunda firma, dentro de la transacción: oculta si el texto sigue siendo el revisado
   * (`huella`) y aún aplica. Devuelve la auditoría que se escribe tras confirmar, o null si ya no aplica.
   */
  ocultar(tx: Prisma.TransactionClient, id: string, causa: ModeracionCausaValue, huella: string | null): Promise<(() => void) | null>;
  /** Conflicto de interés: el motivo (en español) por el que esta persona no firma, o null si puede. */
  puedeFirmar(profileId: string, id: string): Promise<string | null>;
}

type Objetivo = ModTarget | ObjetivoEleccion;

const esDeEleccion = (t: Objetivo): t is ObjetivoEleccion =>
  t === 'candidatura' || t === 'revocacion' || t === 'observacion';

/** sha256 del texto revisado: se guarda en la solicitud en lugar del texto. */
export const huellaDe = (texto: string): string => createHash('sha256').update(texto, 'utf8').digest('hex');

/** Tipos de una solicitud ya registrada: los del foro y los de las elecciones. */
function checkObjetivo(target: string): Objetivo {
  if (target === 'candidatura' || target === 'revocacion' || target === 'observacion') return target;
  return checkTarget(target);
}

/** Cada tipo de contenido tiene su propia rama: ninguno cae en otro por descarte. */
function checkTarget(target: string): ModTarget {
  if (
    target === 'tema' ||
    target === 'respuesta' ||
    target === 'inquietud' ||
    target === 'frase' ||
    target === 'solucion' ||
    target === 'informe'
  ) {
    return target;
  }
  throw new BadRequestException('Tipo de contenido no válido.');
}

const NO_CONTADA = 'Una propuesta formal se cierra cuando su votación ya fue contada.';

const voteTitle = (topicTitle: string): string => `Votación: ${topicTitle}`.slice(0, 200);

/** Motivo de la moderación que oculta el debate abierto por la comunidad junto con su inquietud. */
export const LINKED_TOPIC_REASON = 'Oculto junto con la inquietud de origen.';

/** Una ocultación vinculada sigue a su inquietud: no se apela ni se resuelve por separado. */
function rejectLinkedTopicAction(action: { target: string; reason: string }): void {
  if (action.target === 'tema' && action.reason === LINKED_TOPIC_REASON) {
    throw new BadRequestException('Esta ocultación se apela desde la inquietud de origen.');
  }
}

type Tx = Prisma.TransactionClient;

/** Estado con el que queda una moderación al pedirse. */
type EstadoSolicitud = 'oculto' | 'provisional' | 'pendiente';

/** Solicitudes que esperan la segunda firma de la mesa. */
const ABIERTAS = ['pendiente', 'provisional'] as const;

/** Causa urgente: se oculta ya; si nadie confirma en 48 h, el contenido vuelve. */
const PLAZO_PROVISIONAL_MS = 48 * 3_600_000;
/** Causa no urgente: la solicitud espera la segunda firma 7 días; el contenido sigue visible. */
const PLAZO_PENDIENTE_MS = 7 * DIA_MS;

const SOLICITUD_ABIERTA = 'Ya hay una solicitud de moderación abierta para este contenido.';
const YA_RESUELTA = 'Esta solicitud ya fue resuelta.';
const YA_VENCIO = 'Esta solicitud ya venció.';
const OTRA_FIRMA = 'Otra persona de la mesa acaba de firmar esta solicitud. Vuelve a cargar la página.';

/** Solicitud vinculada que se cerró al restaurarse su inquietud (para auditarla después). */
type VinculadaCerrada = { id: string; topicId: string; causa: ModeracionCausaValue | null };

/** Debate abierto por la comunidad que se modera junto con su inquietud, y cómo queda. */
type Vinculo = { topicId: string; estado: EstadoSolicitud };

const plazoDe = (estado: EstadoSolicitud): number | null =>
  estado === 'provisional' ? PLAZO_PROVISIONAL_MS : estado === 'pendiente' ? PLAZO_PENDIENTE_MS : null;

const esUrgente = (causa: string): boolean => MODERACION_CAUSAS.some((c) => c.value === causa && c.urgente);

@Injectable()
export class ForumsService {
  /** Moderación de los tipos de las elecciones (los registra EleccionesModule). */
  private readonly deEleccion = new Map<ObjetivoEleccion, ModeracionDeEleccion>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly board: BoardService,
    private readonly rules: RulesService,
    private readonly access: GroupAccessService,
  ) {}

  /** Registra cómo se modera un tipo de las elecciones (ver `ModeracionDeEleccion`). */
  registrarModeracion(target: ObjetivoEleccion, m: ModeracionDeEleccion): void {
    this.deEleccion.set(target, m);
  }

  // ─── Permisos ─────────────────────────────────────────────────────────────

  /**
   * Quién puede crear foros y moderar en un grupo: la mesa directiva (titular verificado) o
   * un coordinador vigente de la comunidad. En un grupo de trabajo cuenta también el coordinador
   * de la comunidad de la que cuelga (subgrupos y comisiones), pero no en las bifurcaciones, que están reservadas a su ámbito y las modera solo la mesa (también la pausa, que se decide en la comunidad madre: ver `BifurcacionesService.puedePausarEn`). Las apelaciones y la segunda firma siguen siendo solo de la mesa.
   */
  async canModerate(profileId: string, groupId: string): Promise<boolean> {
    if ((await this.board.roleOf(profileId)) !== null) return true;
    return this.esCoordinador(profileId, groupId);
  }

  /** Organizar la agenda de inquietudes: quienes pueden moderar en el grupo. */
  async canOrganize(profileId: string, groupId: string): Promise<boolean> {
    return this.canModerate(profileId, groupId);
  }

  private async esCoordinador(profileId: string, groupId: string): Promise<boolean> {
    const g = await this.prisma.group.findUnique({ where: { id: groupId }, select: { type: true, parentGroupId: true, trabajoTipo: true } });
    const ambitos = [groupId];
    // Una bifurcación está reservada a su ámbito: no hereda a los coordinadores de la comunidad.
    if (g && (g.type as string) === 'trabajo' && g.parentGroupId && (g.trabajoTipo as string | null) !== 'bifurcacion') {
      ambitos.push(g.parentGroupId);
    }
    const cargo = await this.prisma.cargo.findFirst({
      where: {
        profileId,
        tipo: 'coordinador',
        terminadoAt: null,
        groupId: { in: ambitos },
        profile: { user: { status: 'verified_citizen' } },
      },
      select: { id: true },
    });
    return cargo !== null;
  }

  /** La mesa directiva (titular verificado); también resuelve las apelaciones de pausas de bifurcaciones. */
  async esMesa(profileId: string): Promise<boolean> {
    return (await this.board.roleOf(profileId)) !== null;
  }

  private async actorId(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
    return p?.userId ? { actorId: p.userId } : {};
  }

  // ─── Foros ────────────────────────────────────────────────────────────────

  async listMine(profileId: string): Promise<ForumSummary[]> {
    // Los foros de los grupos de trabajo se ven dentro de su grupo, no en la lista propia.
    const memberships = await this.prisma.groupMembership.findMany({
      where: { profileId, group: { type: { not: 'trabajo' } } },
      include: { group: true },
    });
    const result: ForumSummary[] = [];
    for (const m of memberships) {
      await this.ensureDefault(m.groupId, m.group.name);
      const forums = await this.prisma.forum.findMany({
        where: { groupId: m.groupId },
        include: { _count: { select: { proposals: true } } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      for (const f of forums) {
        result.push({
          id: f.id,
          groupId: f.groupId,
          groupName: m.group.name,
          title: f.title,
          description: f.description,
          isDefault: f.isDefault,
          topicCount: f._count.proposals,
        });
      }
    }
    return result;
  }

  private async ensureDefault(groupId: string, groupName: string): Promise<void> {
    const existing = await this.prisma.forum.findFirst({ where: { groupId, isDefault: true } });
    if (!existing) {
      try {
        await this.prisma.forum.create({ data: { groupId, title: `Foro de ${groupName}`, isDefault: true } });
      } catch (err) {
        // Otra petición lo creó a la vez (índice único parcial): basta con releerlo.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
        await this.prisma.forum.findFirst({ where: { groupId, isDefault: true } });
      }
    }
  }

  async getForum(profileId: string, forumId: string): Promise<ForumDetail> {
    const forum = await this.prisma.forum.findUnique({
      where: { id: forumId },
      include: { group: true, _count: { select: { proposals: true } } },
    });
    if (!forum) throw new NotFoundException('Foro no encontrado');
    // Lo leen los miembros y, si es de un grupo de trabajo, los miembros de su ámbito.
    const { participa } = await this.access.requireReader(forum.groupId, profileId);

    const topics = await this.prisma.proposal.findMany({
      where: { forumId },
      include: {
        author: { select: { displayName: true } },
        signals: { select: { signal: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Temas que llegaron desde una bifurcación: su autor no se muestra (delataría su voto).
    const anonimos = await temasDeIniciativa(this.prisma, topics);

    return {
      id: forum.id,
      groupId: forum.groupId,
      groupName: forum.group.name,
      title: forum.title,
      description: forum.description,
      isDefault: forum.isDefault,
      topicCount: forum._count.proposals,
      canModerate: await this.canModerate(profileId, forum.groupId),
      soloLectura: !participa,
      topics: topics.map((t): ProposalSummary => {
        const counts = { support: 0, neutral: 0, object: 0 };
        for (const s of t.signals) counts[s.signal as keyof typeof counts] += 1;
        return {
          id: t.id,
          groupId: t.groupId,
          forumId: t.forumId,
          title: t.hidden ? 'Tema oculto por moderación' : t.title,
          status: t.status as unknown as ProposalSummary['status'],
          kind: t.kind as unknown as ProposalSummary['kind'],
          hidden: t.hidden,
          authorDisplayName: anonimos.has(t.id) ? NOMBRE_INICIATIVA : (t.author?.displayName ?? ASISTENTE_NOMBRE),
          origen: t.origen,
          signalCounts: counts,
          commentCount: t._count.comments,
          createdAt: t.createdAt.toISOString(),
        };
      }),
    };
  }

  async createForum(profileId: string, dto: CreateForumDto, ip: string): Promise<{ id: string }> {
    if (!(await this.canModerate(profileId, dto.groupId))) {
      throw new ForbiddenException('Solo la mesa directiva o quienes coordinan la comunidad pueden abrir foros.');
    }
    const group = await this.prisma.group.findUnique({ where: { id: dto.groupId } });
    if (!group) throw new NotFoundException('Comunidad no encontrada');
    const forum = await this.prisma.forum.create({
      data: {
        groupId: dto.groupId,
        title: dto.title,
        description: dto.description ?? null,
        createdByProfileId: profileId,
      },
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'forum.created',
      resource: `forum:${forum.id}`,
      ip,
      metadata: { groupId: dto.groupId },
    });
    return { id: forum.id };
  }

  // ─── Propuesta formal, votación y consenso ────────────────────────────────

  private async topicForAction(profileId: string, topicId: string) {
    const topic = await this.prisma.proposal.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException('Tema no encontrado');
    if (topic.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    const esAutor = topic.authorProfileId !== null && topic.authorProfileId === profileId;
    if (!(await this.canModerate(profileId, topic.groupId))) {
      if (!esAutor) throw new ForbiddenException('Solo quien abrió el tema o la moderación pueden hacer esto.');
      // Como autor (no como moderador) hay que seguir siendo miembro: una persona suspendida pierde sus membresías.
      await this.access.requireParticipant(topic.groupId, profileId);
    }
    return topic;
  }

  async formalize(profileId: string, topicId: string, ip: string): Promise<void> {
    const topic = await this.topicForAction(profileId, topicId);
    if ((topic.kind as string) === 'propuesta') throw new ConflictException('Este tema ya es una propuesta formal.');
    if ((topic.status as string) !== 'open') throw new BadRequestException('Solo un tema abierto puede convertirse en propuesta.');
    const dias = await this.rules.getInt('debate.plazo_dias', topic.groupId);
    await this.prisma.$transaction(async (tx) => {
      // Condicionado: dos envíos a la vez no siembran dos veces ni mueven el plazo.
      const r = await tx.proposal.updateMany({
        where: { id: topicId, kind: { not: 'propuesta' }, status: 'open', hidden: false },
        data: { kind: 'propuesta', deliberationEndsAt: new Date(Date.now() + dias * DIA_MS) },
      });
      if (r.count === 0) throw new ConflictException('Este tema ya es una propuesta formal.');
      // Si nadie propuso soluciones, el propio tema pasa a ser la primera.
      const visibles = await tx.solucion.count({ where: { proposalId: topicId, hidden: false, mergedIntoId: null } });
      // Un tema del asistente no tiene autor al que atribuir la solución: no se siembra.
      if (visibles === 0 && topic.authorProfileId !== null) {
        // Hereda el título del tema: puede tener menos de 10 caracteres (el mínimo del DTO solo rige las propuestas manuales).
        const title = topic.title.slice(0, 140);
        await tx.solucion.create({
          data: {
            proposalId: topicId,
            authorProfileId: topic.authorProfileId,
            title,
            description: (topic.body.length > 0 ? topic.body : title).slice(0, 2000),
            origen: 'persona',
          },
        });
      }
    });
    void this.audit.log({ ...(await this.rastroDelTema(topic, profileId, ip)), action: 'proposal.formalized', resource: `proposal:${topicId}` });
  }

  async closeWithConsensus(profileId: string, topicId: string, dto: CloseTopicDto, ip: string): Promise<void> {
    const topic = await this.topicForAction(profileId, topicId);
    if ((topic.status as string) !== 'open') throw new BadRequestException('Solo se cierra un tema abierto.');
    if (topic.electionId) {
      // Propuesta del plan 2: se cierra cuando su votación (elección) ya fue contada o cancelada.
      const election = await this.prisma.election.findUnique({ where: { id: topic.electionId }, select: { status: true } });
      if (!election || !['tallied', 'cancelled'].includes(election.status as string)) {
        throw new BadRequestException(NO_CONTADA);
      }
    } else if ((topic.kind as string) === 'propuesta') {
      const decision = await this.prisma.decision.findUnique({ where: { proposalId: topicId }, select: { fase: true } });
      if (!decision || !['contada', 'cancelada'].includes(decision.fase as string)) {
        throw new BadRequestException(NO_CONTADA);
      }
    }
    await this.prisma.proposal.update({
      where: { id: topicId },
      data: {
        status: 'closed',
        closedAt: new Date(),
        conclusion: dto.conclusion,
        objections: dto.objections ?? null,
      },
    });
    void this.audit.log({
      ...(await this.rastroDelTema(topic, profileId, ip)),
      action: 'proposal.closed_with_consensus',
      resource: `proposal:${topicId}`,
    });
  }

  // ─── Moderación ───────────────────────────────────────────────────────────

  /**
   * Oculta un contenido o pide ocultarlo. Soluciones y propuestas formales necesitan la segunda
   * firma de otra persona de la mesa: con causa urgente se ocultan ya («provisional», 48 h); con
   * otra causa queda una solicitud «pendiente» (7 días) y el contenido sigue visible.
   */
  async hide(profileId: string, dto: ModerateDto, ip: string): Promise<{ id: string; estado: EstadoSolicitud }> {
    const target = checkTarget(dto.target);
    let groupId: string;
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id: dto.targetId } });
      if (!t) throw new NotFoundException('Tema no encontrado');
      if (t.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = t.groupId;
    } else if (target === 'inquietud') {
      const q = await this.prisma.inquietud.findUnique({ where: { id: dto.targetId } });
      if (!q) throw new NotFoundException('Inquietud no encontrada');
      if (q.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = q.groupId;
    } else if (target === 'frase') {
      const f = await this.prisma.frase.findUnique({
        where: { id: dto.targetId },
        include: { proposal: { select: { groupId: true } } },
      });
      if (!f) throw new NotFoundException('Frase no encontrada');
      if (f.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = f.proposal.groupId;
    } else if (target === 'solucion') {
      const so = await this.prisma.solucion.findUnique({
        where: { id: dto.targetId },
        include: { proposal: { select: { groupId: true } } },
      });
      if (!so) throw new NotFoundException('Solución no encontrada');
      if (so.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = so.proposal.groupId;
    } else if (target === 'informe') {
      // Informe de una comisión: se modera en el grupo de la comisión, con una sola firma.
      const inf = await this.prisma.comisionInforme.findUnique({ where: { id: dto.targetId } });
      if (!inf) throw new NotFoundException('Informe no encontrado');
      if (inf.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = inf.grupoId;
    } else {
      const c = await this.prisma.proposalComment.findUnique({
        where: { id: dto.targetId },
        include: { proposal: { select: { groupId: true } } },
      });
      if (!c) throw new NotFoundException('Respuesta no encontrada');
      if (c.hidden) throw new ConflictException('Este contenido ya está oculto.');
      groupId = c.proposal.groupId;
    }
    if (!(await this.canModerate(profileId, groupId))) {
      throw new ForbiddenException('No tienes permiso para moderar en esta comunidad.');
    }
    const abierta = await this.prisma.moderationAction.findFirst({
      where: { target, targetId: dto.targetId, status: { in: [...ABIERTAS] } },
      select: { id: true },
    });
    if (abierta) throw new ConflictException(SOLICITUD_ABIERTA);

    const causa = dto.causa;
    const canceladas: string[] = [];
    let resultado: { id: string; estado: EstadoSolicitud; vinculada: (Vinculo & { id: string }) | null };
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        // Se lee dentro de la transacción: un tema formalizado justo antes ya cuenta como propuesta.
        const estado: EstadoSolicitud = (await this.requiereQuorumTx(tx, target, dto.targetId))
          ? await this.estadoConQuorumTx(tx, target, dto.targetId, causa)
          : 'oculto';
        let vinculo: Vinculo | null = null;
        if (estado !== 'pendiente') {
          const o = await this.aplicarOcultacion(tx, target, dto.targetId, causa, estado === 'oculto');
          canceladas.push(...o.canceladas);
          vinculo = o.vinculo;
        }
        const plazo = plazoDe(estado);
        const created = await tx.moderationAction.create({
          data: {
            target,
            targetId: dto.targetId,
            causa,
            reason: dto.reason ?? '',
            moderatorProfileId: profileId,
            status: estado,
            venceAt: plazo === null ? null : new Date(Date.now() + plazo),
            ...(estado === 'provisional' ? { fueProvisional: true } : {}),
          },
        });
        const vinculada = vinculo ? { ...vinculo, id: await this.crearVinculadaTx(tx, vinculo, causa, profileId) } : null;
        return { id: created.id, estado, vinculada };
      });
    } catch (err) {
      // Otra solicitud abierta se registró a la vez (índice único parcial).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(SOLICITUD_ABIERTA);
      }
      throw err;
    }
    const actor = await this.actorId(profileId);
    this.auditarSolicitud(actor, ip, `${target}:${dto.targetId}`, resultado.id, causa, resultado.estado);
    // La moderación vinculada de una propuesta formal es una solicitud propia: queda en la auditoría.
    const v = resultado.vinculada;
    if (v && v.estado !== 'oculto') this.auditarSolicitud(actor, ip, `tema:${v.topicId}`, v.id, causa, v.estado);
    this.auditarCanceladas(canceladas, actor, ip);
    return { id: resultado.id, estado: resultado.estado };
  }

  /**
   * Solicitud de moderación abierta por el asistente (revisión posterior, nivel 2). Nunca oculta
   * en firme: con causa urgente queda «provisional» (oculta ya, 48 h), salvo que el contenido ya
   * haya tenido una provisional; si no, «pendiente» (7 días, sigue visible). La resuelve la mesa
   * en `confirmar`. Devuelve null si el contenido no existe, ya está oculto o ya tiene una
   * solicitud abierta.
   */
  async solicitarPorAsistente(
    target: Objetivo,
    targetId: string,
    causa: ModeracionCausaValue,
    textoRevisado?: string,
  ): Promise<{ id: string; estado: EstadoSolicitud } | null> {
    if (esDeEleccion(target)) return this.solicitarDeEleccion(target, targetId, causa, textoRevisado ?? null);
    if ((await this.estaOculto(target, targetId)) !== false) return null;
    const abierta = await this.prisma.moderationAction.findFirst({
      where: { target, targetId, status: { in: [...ABIERTAS] } },
      select: { id: true },
    });
    if (abierta) return null;

    const canceladas: string[] = [];
    let resultado: { id: string; estado: 'provisional' | 'pendiente'; vinculada: (Vinculo & { id: string }) | null } | null;
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        // Un tema se bloquea, como en hide(): una formalización u otra moderación simultánea espera.
        if (target === 'tema' && (await this.bloquearTemaTx(tx, targetId))?.hidden === true) return null;
        const previas = esUrgente(causa)
          ? await tx.moderationAction.count({ where: { target, targetId, fueProvisional: true } })
          : 0;
        const estado: 'provisional' | 'pendiente' = esUrgente(causa) && previas === 0 ? 'provisional' : 'pendiente';
        let vinculo: Vinculo | null = null;
        if (estado === 'provisional') {
          const o = await this.aplicarOcultacion(tx, target, targetId, causa, false);
          canceladas.push(...o.canceladas);
          vinculo = o.vinculo;
        }
        const plazo = plazoDe(estado);
        const created = await tx.moderationAction.create({
          data: {
            target,
            targetId,
            causa,
            reason: '',
            moderatorProfileId: null,
            origen: 'asistente',
            status: estado,
            venceAt: plazo === null ? null : new Date(Date.now() + plazo),
            ...(estado === 'provisional' ? { fueProvisional: true } : {}),
          },
        });
        const vinculada = vinculo
          ? { ...vinculo, id: await this.crearVinculadaTx(tx, vinculo, causa, null, 'asistente') }
          : null;
        return { id: created.id, estado, vinculada };
      });
    } catch (err) {
      // Otra solicitud abierta se registró a la vez (índice único parcial).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
    if (!resultado) return null;
    this.auditarSolicitudDelAsistente(`${target}:${targetId}`, resultado.id, causa, resultado.estado);
    const v = resultado.vinculada;
    if (v && v.estado !== 'oculto') this.auditarSolicitudDelAsistente(`tema:${v.topicId}`, v.id, causa, v.estado);
    for (const proposalId of canceladas) {
      void this.audit.log({ action: 'decision.cancelled', resource: `proposal:${proposalId}`, metadata: { proposalId, origen: 'asistente' } });
    }
    return { id: resultado.id, estado: resultado.estado };
  }

  /**
   * Solicitud del asistente sobre una ficha, un pedido de revocación o una observación (3C).
   * Siempre «pendiente», aun con causa urgente: el contenido sigue visible hasta que la mesa
   * confirme con 2 firmas (ADR-029). Si el texto cambió desde la revisión, no se abre.
   */
  private async solicitarDeEleccion(
    target: ObjetivoEleccion,
    targetId: string,
    causa: ModeracionCausaValue,
    textoRevisado: string | null,
  ): Promise<{ id: string; estado: EstadoSolicitud } | null> {
    const m = this.deEleccion.get(target);
    if (!m) return null;
    if ((await m.estaOculto(targetId)) !== false) return null;
    const actual = await m.texto(targetId);
    if (actual === null || (textoRevisado !== null && actual !== textoRevisado)) return null;
    const abierta = await this.prisma.moderationAction.findFirst({
      where: { target, targetId, status: { in: [...ABIERTAS] } },
      select: { id: true },
    });
    if (abierta) return null;
    let id: string;
    try {
      const created = await this.prisma.moderationAction.create({
        data: {
          target,
          targetId,
          causa,
          reason: '',
          moderatorProfileId: null,
          origen: 'asistente',
          status: 'pendiente',
          venceAt: new Date(Date.now() + PLAZO_PENDIENTE_MS),
          huella: huellaDe(actual),
        },
      });
      id = created.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
    this.auditarSolicitudDelAsistente(`${target}:${targetId}`, id, causa, 'pendiente');
    return { id, estado: 'pendiente' };
  }

  /**
   * Segunda firma de la mesa sobre una solicitud pendiente o provisional. La da otra persona
   * de la mesa, nunca quien la pidió. Todo cambio pasa por un updateMany condicionado al estado:
   * si el vencimiento u otra persona la resolvió antes, responde 409 sin tocar el contenido.
   */
  async confirmar(profileId: string, moderationId: string, aprobar: boolean, ip: string): Promise<void> {
    // También un suplente provisional cuando la mesa está incompleta (no las apelaciones).
    if (!(await this.board.puedeFirmarRevision(profileId))) {
      throw new ForbiddenException('Solo la mesa directiva confirma las solicitudes de moderación.');
    }
    const action = await this.prisma.moderationAction.findUnique({ where: { id: moderationId } });
    if (!action) throw new NotFoundException('Moderación no encontrada');
    const previo = action.status as string;
    if (previo !== 'pendiente' && previo !== 'provisional') throw new ConflictException(YA_RESUELTA);
    // La pidió el asistente: no hay «quien la pidió»; la primera firma humana ocupa ese lugar.
    const delAsistente = (action.origen as string | undefined) === 'asistente';
    if (action.moderatorProfileId === profileId) {
      throw new ForbiddenException(
        delAsistente ? 'Ya firmaste esta solicitud: falta otra persona de la mesa.' : 'No puedes confirmar tu propia solicitud.',
      );
    }
    const now = new Date();
    // Pasado el plazo nadie firma ni rechaza: el vencimiento la cierra (aunque aún no haya corrido).
    const vencida = (al: Date): boolean => action.venceAt === null || action.venceAt.getTime() <= al.getTime();
    if (vencida(now)) throw new ConflictException(YA_VENCIO);
    const target = checkObjetivo(action.target);
    if (esDeEleccion(target)) {
      // Fichas, pedidos y observaciones: solo la mesa elegida (no los suplentes, ADR-029) y sin
      // conflicto de interés, en la primera firma y en la segunda (también para rechazar).
      if ((await this.board.roleOf(profileId)) === null) {
        throw new ForbiddenException('Solo la mesa directiva confirma las solicitudes sobre elecciones.');
      }
      const motivo = (await this.deEleccion.get(target)?.puedeFirmar(profileId, action.targetId)) ?? null;
      if (motivo) throw new ForbiddenException(motivo);
    }
    const canceladas: string[] = [];
    let auditarEfecto: (() => void) | null = null;
    const resultado = await this.prisma.$transaction(async (tx): Promise<'primera_firma' | 'resuelta' | 'sin_efecto'> => {
      if (aprobar && delAsistente && action.moderatorProfileId === null && (await this.requiereQuorumTx(tx, target, action.targetId))) {
        // Donde una persona de la mesa necesitaría la segunda firma, el asistente no cuenta como una:
        // la primera aprobación queda como firma y la solicitud sigue abierta.
        const r = await tx.moderationAction.updateMany({
          where: { id: moderationId, status: previo, venceAt: { gt: now }, moderatorProfileId: null },
          data: { moderatorProfileId: profileId },
        });
        if (r.count === 0) throw new ConflictException(vencida(new Date()) ? YA_VENCIO : OTRA_FIRMA);
        return 'primera_firma';
      }
      const r = await tx.moderationAction.updateMany({
        where: { id: moderationId, status: previo, venceAt: { gt: now } },
        data: aprobar
          ? { status: 'oculto', confirmadorProfileId: profileId }
          : { status: 'rechazado', confirmadorProfileId: profileId, resolvedAt: now },
      });
      if (r.count === 0) throw new ConflictException(vencida(new Date()) ? YA_VENCIO : YA_RESUELTA);
      if (esDeEleccion(target)) {
        // Fichas, pedidos y observaciones: nunca provisionales; el efecto lo aplica su módulo.
        if (!aprobar) return 'resuelta';
        const m = this.deEleccion.get(target);
        auditarEfecto = m && action.causa ? await m.ocultar(tx, action.targetId, action.causa, action.huella ?? null) : null;
        if (auditarEfecto) return 'resuelta';
        // Ya no aplica (texto editado, elección contada, pedido cerrado): se cierra sin efecto.
        await tx.moderationAction.update({ where: { id: moderationId }, data: { status: 'rechazado', resolvedAt: now } });
        return 'sin_efecto';
      }
      if (aprobar && previo === 'pendiente') {
        // Las de personas son soluciones y temas (sin vinculada); las del asistente pueden ser de
        // cualquier tipo: una inquietud arrastra a su debate como en hide(), con el mismo origen.
        const o = await this.aplicarOcultacion(tx, target, action.targetId, action.causa, true);
        canceladas.push(...o.canceladas);
        if (o.vinculo) {
          await this.crearVinculadaTx(tx, o.vinculo, action.causa, action.moderatorProfileId, delAsistente ? 'asistente' : undefined);
        }
      } else if (aprobar && previo === 'provisional' && target === 'tema') {
        // La provisional solo pausaba la decisión: con la segunda firma se cancela (y la votación del plan 2).
        const t = await tx.proposal.findUnique({ where: { id: action.targetId }, select: { electionId: true } });
        if (await this.cancelarVotacionesTx(tx, action.targetId, t?.electionId ?? null, true)) canceladas.push(action.targetId);
      } else if (!aprobar && previo === 'provisional') {
        await this.aplicarRestauracion(tx, target, action.targetId);
        if (target === 'tema') await this.extenderPlazosTx(tx, action.targetId, action.createdAt, now);
      }
      return 'resuelta';
    });
    const actor = await this.actorId(profileId);
    if (resultado === 'primera_firma') {
      // Sigue abierta: como una solicitud pendiente, no dice qué contenido ni por qué causa.
      void this.audit.log({ ...actor, action: 'moderation.first_signature', resource: `moderation:${moderationId}`, ip, metadata: {} });
      return;
    }
    if (resultado === 'sin_efecto') {
      void this.audit.log({
        ...actor,
        action: 'moderation.sin_efecto',
        resource: `${target}:${action.targetId}`,
        ip,
        metadata: { moderationId, causa: action.causa },
      });
      return;
    }
    // Ya resuelta, la auditoría dice qué contenido fue (nunca el texto).
    void this.audit.log({
      ...actor,
      action: aprobar ? 'moderation.confirmed_by_board' : 'moderation.rejected_by_board',
      resource: `${target}:${action.targetId}`,
      ip,
      metadata: { moderationId, causa: action.causa },
    });
    this.auditarCanceladas(canceladas, actor, ip);
    (auditarEfecto as (() => void) | null)?.();
  }

  /** Cola de solicitudes que esperan la segunda firma. Solo la mesa (o un suplente) la ve, con el texto original. */
  async listPorConfirmar(profileId: string): Promise<ModeracionPorConfirmar[]> {
    if (!(await this.board.puedeFirmarRevision(profileId))) {
      throw new ForbiddenException('Solo la mesa directiva ve las solicitudes por confirmar.');
    }
    const actions = await this.prisma.moderationAction.findMany({
      where: { status: { in: [...ABIERTAS] } },
      orderBy: { createdAt: 'asc' },
    });
    const result: ModeracionPorConfirmar[] = [];
    // Un suplente no firma las solicitudes sobre elecciones: no se las mostramos.
    const esMesaElegida = (await this.board.roleOf(profileId)) !== null;
    for (const a of actions) {
      const estado = a.status as string;
      if (!esMesaElegida && esDeEleccion(checkObjetivo(a.target))) continue;
      // Toda solicitud abierta nace con causa; una fila sin ella no se puede mostrar bien.
      if ((estado !== 'pendiente' && estado !== 'provisional') || !a.causa) continue;
      const target = checkObjetivo(a.target);
      const m = esDeEleccion(target) ? this.deEleccion.get(target) : undefined;
      result.push({
        id: a.id,
        target,
        targetId: a.targetId,
        causa: a.causa as ModeracionCausaValue,
        detalle: a.reason === LINKED_TOPIC_REASON ? '' : a.reason,
        originalText: esDeEleccion(target) ? ((await m?.texto(a.targetId)) ?? '') : await this.textOf(target, a.targetId),
        estado,
        venceAt: (a.venceAt ?? a.createdAt).toISOString(),
        createdAt: a.createdAt.toISOString(),
        esMia: a.moderatorProfileId === profileId,
        contexto: esDeEleccion(target) ? ((await m?.contexto(a.targetId)) ?? null) : await this.contextoDe(target, a.targetId, a.reason),
        solicitadaPorAsistente: (a.origen as string | undefined) === 'asistente',
      });
    }
    return result;
  }

  /**
   * Cierra las solicitudes vencidas: una provisional vuelve a mostrar el contenido y una
   * pendiente se cierra sin tocarlo; ambas quedan «rechazado». Si otra corrida o una firma
   * llegó antes (updateMany sin filas), no restaura ni audita. Devuelve cuántas cerró.
   */
  async processModerationDeadlines(now: Date): Promise<number> {
    const vencidas = await this.prisma.moderationAction.findMany({
      where: { status: { in: [...ABIERTAS] }, venceAt: { lte: now } },
      select: { id: true, target: true, targetId: true, causa: true, status: true, createdAt: true },
      orderBy: { venceAt: 'asc' },
    });
    let cerradas = 0;
    for (const a of vencidas) {
      const previo = a.status as string;
      if (previo !== 'pendiente' && previo !== 'provisional') continue;
      const target = checkObjetivo(a.target);
      const hecho = await this.prisma.$transaction(async (tx) => {
        const r = await tx.moderationAction.updateMany({
          where: { id: a.id, status: previo },
          data: { status: 'rechazado', resolvedAt: now },
        });
        if (r.count === 0) return false;
        // Las de las elecciones nunca son provisionales: no hay nada que volver a mostrar.
        if (previo === 'provisional' && !esDeEleccion(target)) {
          await this.aplicarRestauracion(tx, target, a.targetId);
          if (target === 'tema') await this.extenderPlazosTx(tx, a.targetId, a.createdAt, now);
        }
        return true;
      });
      if (!hecho) continue;
      cerradas += 1;
      void this.audit.log({
        action: 'moderation.expired',
        resource: `${target}:${a.targetId}`,
        metadata: { moderationId: a.id, causa: a.causa },
      });
    }
    return cerradas;
  }

  async appeal(profileId: string, moderationId: string, text: string, ip: string): Promise<void> {
    const action = await this.prisma.moderationAction.findUnique({ where: { id: moderationId } });
    if (!action) throw new NotFoundException('Moderación no encontrada');
    rejectLinkedTopicAction(action);
    if (esDeEleccion(checkObjetivo(action.target))) {
      throw new BadRequestException(
        'Esta moderación no se apela: ya la confirmaron dos personas de la mesa. Una ficha se puede corregir mientras dure el plazo de candidaturas.',
      );
    }
    const contenido = await this.authorOf(checkTarget(action.target), action.targetId);
    if (!contenido || contenido.authorProfileId === null || contenido.authorProfileId !== profileId) {
      throw new ForbiddenException('Solo quien escribió el contenido puede apelar.');
    }
    // Apelar es defenderse de la moderación, no participar: vale aunque el grupo de trabajo ya no esté activo.
    await this.access.requireMember(contenido.groupId, profileId);
    // Solo se apela lo ya ocultado en firme: una solicitud pendiente o provisional aún no lo está.
    if ((action.status as string) !== 'oculto') throw new ConflictException('Esta moderación ya fue apelada o resuelta.');
    await this.prisma.moderationAction.update({
      where: { id: moderationId },
      data: { status: 'apelado', appealText: text, appealedAt: new Date() },
    });
    // Dentro de una bifurcación, o si el contenido llegó desde una, sin actor ni ip.
    const forzar = await this.esDeIniciativa(checkTarget(action.target), action.targetId);
    const { quien } = await this.access.rastro(contenido.groupId, profileId, ip, forzar);
    void this.audit.log({ ...quien, action: 'moderation.appealed', resource: `moderation:${moderationId}` });
  }

  async listAppeals(profileId: string): Promise<ModerationAppeal[]> {
    if (!(await this.esMesa(profileId))) throw new ForbiddenException('Solo la mesa directiva resuelve apelaciones.');
    const actions = await this.prisma.moderationAction.findMany({
      where: { status: 'apelado' },
      orderBy: { appealedAt: 'asc' },
    });
    const result: ModerationAppeal[] = [];
    for (const a of actions) {
      result.push({
        id: a.id,
        target: checkTarget(a.target),
        targetId: a.targetId,
        reason: a.reason,
        causa: (a.causa ?? null) as ModeracionCausaValue | null,
        appealText: a.appealText ?? '',
        originalText: await this.textOf(checkTarget(a.target), a.targetId),
        appealedAt: (a.appealedAt ?? a.createdAt).toISOString(),
      });
    }
    return result;
  }

  async resolveAppeal(profileId: string, moderationId: string, restore: boolean, ip: string): Promise<void> {
    if (!(await this.esMesa(profileId))) throw new ForbiddenException('Solo la mesa directiva resuelve apelaciones.');
    const action = await this.prisma.moderationAction.findUnique({ where: { id: moderationId } });
    if (!action) throw new NotFoundException('Moderación no encontrada');
    if ((action.status as string) !== 'apelado') throw new BadRequestException('Esta moderación no tiene una apelación pendiente.');
    rejectLinkedTopicAction(action);
    const target = checkTarget(action.target);
    const cerrada = await this.prisma.$transaction(async (tx) => {
      const c = restore ? await this.aplicarRestauracion(tx, target, action.targetId) : null;
      await tx.moderationAction.update({
        where: { id: moderationId },
        data: { status: restore ? 'restaurado' : 'confirmado', resolvedAt: new Date() },
      });
      return c;
    });
    const actor = await this.actorId(profileId);
    void this.audit.log({
      ...actor,
      action: restore ? 'moderation.restored' : 'moderation.confirmed',
      resource: `moderation:${moderationId}`,
      ip,
    });
    if (cerrada) {
      void this.audit.log({
        ...actor,
        action: 'moderation.closed_with_origin',
        resource: `tema:${cerrada.topicId}`,
        ip,
        metadata: { moderationId: cerrada.id, causa: cerrada.causa },
      });
    }
  }

  /**
   * Soluciones y propuestas formales necesitan la segunda firma; el resto, una sola persona.
   * El tema se bloquea antes de leer su tipo: una formalización simultánea espera a esta decisión.
   */
  private async requiereQuorumTx(tx: Tx, target: Objetivo, targetId: string): Promise<boolean> {
    // Fichas, pedidos y observaciones: siempre 2 firmas humanas (ADR-029).
    if (esDeEleccion(target)) return true;
    if (target === 'solucion') return true;
    // Los informes de comisión, como frases y respuestas, se ocultan con una sola firma.
    if (target === 'informe') return false;
    if (target !== 'tema') return false;
    return (await this.bloquearTemaTx(tx, targetId))?.kind === 'propuesta';
  }

  /** Lee el tema bloqueando su fila: formalizaciones y otras moderaciones del mismo tema esperan. */
  private async bloquearTemaTx(
    tx: Tx,
    topicId: string,
  ): Promise<{ kind: string; hidden: boolean; abiertoPorComunidad: boolean } | null> {
    const filas = await tx.$queryRaw<{ kind: string; hidden: boolean; abiertoPorComunidad: boolean }[]>(
      Prisma.sql`SELECT kind, hidden, "abiertoPorComunidad" FROM proposals WHERE id = ${topicId}::uuid FOR UPDATE`,
    );
    return filas[0] ?? null;
  }

  /**
   * Estado de una solicitud que necesita la segunda firma. Una causa urgente oculta ya
   * («provisional»), salvo que el contenido ya haya tenido una provisional rechazada o vencida:
   * entonces queda «pendiente» y sigue visible, para que repetir la urgencia no lo oculte sin fin.
   */
  private async estadoConQuorumTx(
    tx: Tx,
    target: ModTarget,
    targetId: string,
    causa: ModeracionCausaValue | null,
  ): Promise<'provisional' | 'pendiente'> {
    if (causa === null || !esUrgente(causa)) return 'pendiente';
    const previas = await tx.moderationAction.count({
      where: { target, targetId, status: 'rechazado', fueProvisional: true },
    });
    return previas > 0 ? 'pendiente' : 'provisional';
  }

  /** Contexto de una solicitud para la mesa: qué tipo de tema es o por qué llegó. */
  private async contextoDe(target: ModTarget, targetId: string, reason: string): Promise<string | null> {
    if (target !== 'tema') return null;
    if (reason === LINKED_TOPIC_REASON) return 'Debate vinculado a una inquietud oculta';
    const t = await this.prisma.proposal.findUnique({ where: { id: targetId }, select: { kind: true } });
    return (t?.kind as string | undefined) === 'propuesta' ? 'Propuesta formal' : null;
  }

  /**
   * Oculta el contenido. Un tema ocultado en firme cancela su votación y su decisión activas;
   * uno provisional solo las pausa (`firme = false`). Una inquietud arrastra al debate que abrió
   * la comunidad con su texto (devuelve cómo queda, para registrar la moderación vinculada): si
   * ese debate ya es una propuesta formal, sigue la regla de la segunda firma con la misma causa;
   * si ya tiene una solicitud abierta, no se toca.
   */
  private async aplicarOcultacion(
    tx: Tx,
    target: ModTarget,
    targetId: string,
    causa: ModeracionCausaValue | null,
    firme: boolean,
  ): Promise<{ canceladas: string[]; vinculo: Vinculo | null }> {
    const canceladas: string[] = [];
    let vinculo: Vinculo | null = null;
    if (target === 'tema') {
      if (await this.hideTopicTx(tx, targetId, firme)) canceladas.push(targetId);
    } else if (target === 'inquietud') {
      const q = await tx.inquietud.update({ where: { id: targetId }, data: { hidden: true } });
      // El debate que abrió la comunidad copia el título y el texto de la inquietud: se oculta con ella.
      // Un debate abierto a mano por quien organiza tiene su propio texto y no se toca.
      const proposalId = (q as { proposalId?: string | null } | undefined)?.proposalId ?? null;
      if (proposalId) {
        // Con la fila bloqueada: una formalización u otra moderación del debate espera a esta.
        const p = await this.bloquearTemaTx(tx, proposalId);
        if (p?.abiertoPorComunidad === true && p.hidden === false) {
          if (p.kind !== 'propuesta') {
            if (await this.hideTopicTx(tx, proposalId, true)) canceladas.push(proposalId);
            vinculo = { topicId: proposalId, estado: 'oculto' };
          } else {
            // Bajo el bloqueo: si el debate ya tiene su propia solicitud abierta, queda esa y no se
            // crea la vinculada (así no choca con el índice único ni hace fallar la de la inquietud).
            const abierta = await tx.moderationAction.findFirst({
              where: { target: 'tema', targetId: proposalId, status: { in: [...ABIERTAS] } },
              select: { id: true },
            });
            if (!abierta) {
              const estado = await this.estadoConQuorumTx(tx, 'tema', proposalId, causa);
              if (estado === 'provisional') await this.hideTopicTx(tx, proposalId, false);
              vinculo = { topicId: proposalId, estado };
            }
          }
        }
      }
    } else if (target === 'frase') {
      await tx.frase.update({ where: { id: targetId }, data: { hidden: true } });
    } else if (target === 'solucion') {
      await tx.solucion.update({ where: { id: targetId }, data: { hidden: true } });
    } else if (target === 'informe') {
      await tx.comisionInforme.update({ where: { id: targetId }, data: { hidden: true } });
    } else {
      await tx.proposalComment.update({ where: { id: targetId }, data: { hidden: true } });
    }
    return { canceladas, vinculo };
  }

  /** Vuelve a mostrar el contenido. Una decisión o votación cancelada no se reabre. */
  private async aplicarRestauracion(tx: Tx, target: ModTarget, targetId: string): Promise<VinculadaCerrada | null> {
    if (target === 'tema') {
      await this.restoreTopicTx(tx, targetId);
    } else if (target === 'inquietud') {
      // El estado y el umbral los reevalúa InquietudesService al leerla (sin ciclo entre módulos).
      const q = await tx.inquietud.update({ where: { id: targetId }, data: { hidden: false } });
      const proposalId = (q as { proposalId?: string | null } | undefined)?.proposalId ?? null;
      if (proposalId) return this.restoreLinkedTopicTx(tx, proposalId);
    } else if (target === 'frase') {
      await tx.frase.update({ where: { id: targetId }, data: { hidden: false } });
    } else if (target === 'solucion') {
      await tx.solucion.update({ where: { id: targetId }, data: { hidden: false } });
    } else if (target === 'informe') {
      await tx.comisionInforme.update({ where: { id: targetId }, data: { hidden: false } });
    } else {
      await tx.proposalComment.update({ where: { id: targetId }, data: { hidden: false } });
    }
    return null;
  }

  /** Moderación del debate moderado junto con su inquietud; copia la causa de la de origen. */
  private async crearVinculadaTx(
    tx: Tx,
    vinculo: Vinculo,
    causa: ModeracionCausaValue | null,
    moderatorProfileId: string | null,
    origen?: 'asistente',
  ): Promise<string> {
    const plazo = plazoDe(vinculo.estado);
    const created = await tx.moderationAction.create({
      data: {
        target: 'tema',
        targetId: vinculo.topicId,
        causa,
        reason: LINKED_TOPIC_REASON,
        moderatorProfileId,
        ...(origen ? { origen } : {}),
        status: vinculo.estado,
        venceAt: plazo === null ? null : new Date(Date.now() + plazo),
        ...(vinculo.estado === 'provisional' ? { fueProvisional: true } : {}),
      },
    });
    return created.id;
  }

  /**
   * Audita una moderación nueva: «requested» si espera la firma, «hidden» si ya ocultó. Sin texto.
   * La auditoría la lee cualquier persona verificada: una solicitud pendiente no dice qué contenido
   * ni por qué causa (el contenido sigue visible); eso se registra al confirmarse, rechazarse o vencer.
   */
  private auditarSolicitud(
    actor: { actorId: string } | Record<never, never>,
    ip: string,
    resource: string,
    moderationId: string,
    causa: ModeracionCausaValue,
    estado: EstadoSolicitud,
  ): void {
    if (estado === 'pendiente') {
      void this.audit.log({ ...actor, action: 'moderation.requested', resource: `moderation:${moderationId}`, ip, metadata: {} });
      return;
    }
    void this.audit.log({ ...actor, action: 'moderation.hidden', resource, ip, metadata: { moderationId, causa, estado } });
  }

  /**
   * Audita una solicitud del asistente: sin actor ni ip y con `origen`. Como en las de personas,
   * una pendiente no dice qué contenido ni por qué causa; una provisional ya ocultó el contenido.
   */
  private auditarSolicitudDelAsistente(
    resource: string,
    moderationId: string,
    causa: ModeracionCausaValue,
    estado: 'provisional' | 'pendiente' | 'oculto',
  ): void {
    if (estado === 'pendiente') {
      void this.audit.log({ action: 'moderacion.solicitada', resource: `moderation:${moderationId}`, metadata: { origen: 'asistente' } });
      return;
    }
    void this.audit.log({ action: 'moderacion.solicitada', resource, metadata: { origen: 'asistente', moderationId, causa, estado } });
  }

  /** true si el contenido está oculto, false si está visible, null si no existe. */
  private async estaOculto(target: ModTarget, id: string): Promise<boolean | null> {
    const where = { where: { id }, select: { hidden: true } };
    let fila: { hidden: boolean } | null;
    if (target === 'tema') fila = await this.prisma.proposal.findUnique(where);
    else if (target === 'inquietud') fila = await this.prisma.inquietud.findUnique(where);
    else if (target === 'frase') fila = await this.prisma.frase.findUnique(where);
    else if (target === 'solucion') fila = await this.prisma.solucion.findUnique(where);
    else if (target === 'informe') fila = await this.prisma.comisionInforme.findUnique(where);
    else fila = await this.prisma.proposalComment.findUnique(where);
    return fila ? fila.hidden : null;
  }

  private auditarCanceladas(
    canceladas: string[],
    actor: { actorId: string } | Record<never, never>,
    ip: string,
  ): void {
    for (const proposalId of canceladas) {
      void this.audit.log({
        ...actor,
        action: 'decision.cancelled',
        resource: `proposal:${proposalId}`,
        ip,
        metadata: { proposalId },
      });
    }
  }

  /**
   * Oculta un tema; su votación pierde el título. En firme (`firme`), además se cancelan su
   * votación del plan 2 si sigue activa y su decisión activa (plan 3); devuelve si canceló una
   * decisión. Una ocultación provisional solo pausa: con el tema oculto ningún paso de la
   * decisión avanza (bloquearTema exige hidden = false) y nadie vota ni objeta.
   */
  private async hideTopicTx(tx: Tx, topicId: string, firme: boolean): Promise<boolean> {
    // electionId se relee dentro de la transacción: así se ve una votación abierta justo antes.
    const t = await tx.proposal.update({ where: { id: topicId }, data: { hidden: true } });
    return this.cancelarVotacionesTx(tx, topicId, t?.electionId ?? null, firme);
  }

  /**
   * Quita el título a la votación del plan 2 (repetía el del tema) y, si `cancelar`, la cancela
   * si sigue activa y cancela la decisión activa del tema. Devuelve si canceló una decisión.
   */
  private async cancelarVotacionesTx(tx: Tx, topicId: string, electionId: string | null, cancelar: boolean): Promise<boolean> {
    if (electionId) {
      const e = await tx.election.findUnique({ where: { id: electionId }, select: { status: true } });
      const activa = ['draft', 'open'].includes((e?.status as string | undefined) ?? '');
      await tx.election.update({
        where: { id: electionId },
        data: activa && cancelar ? { title: HIDDEN_VOTE_TITLE, status: 'cancelled' } : { title: HIDDEN_VOTE_TITLE },
      });
    }
    if (!cancelar) return false;
    const d = await tx.decision.updateMany({
      where: { proposalId: topicId, fase: { in: ['modo', 'objecion', 'votacion'] } },
      data: { fase: 'cancelada' },
    });
    await this.anularCambioReglaTx(tx, topicId);
    return d.count > 0;
  }

  /**
   * Un tema de cambio de regla ocultado en firme anula su cambio abierto, haya o no decisión:
   * en votación queda «anulado»; si esperaba a la mesa, también, y su acción de la mesa queda
   * rechazada. Primero la acción y luego el cambio, el mismo orden de bloqueo que usa la mesa.
   */
  private async anularCambioReglaTx(tx: Tx, topicId: string): Promise<void> {
    const ahora = new Date();
    await tx.cambioRegla.updateMany({
      where: { proposalId: topicId, estado: 'en_votacion' },
      data: { estado: 'anulado', resueltoAt: ahora },
    });
    const enMesa = await tx.cambioRegla.findFirst({
      where: { proposalId: topicId, estado: 'pendiente_mesa' },
      select: { id: true, boardActionId: true },
    });
    if (!enMesa) return;
    if (enMesa.boardActionId) {
      await tx.boardAction.updateMany({
        where: { id: enMesa.boardActionId, status: 'pending' },
        data: { status: 'rejected', resolvedAt: ahora },
      });
    }
    await tx.cambioRegla.updateMany({
      where: { id: enMesa.id, estado: 'pendiente_mesa' },
      data: { estado: 'anulado', resueltoAt: ahora },
    });
  }

  /** Vuelve a mostrar un tema; su votación recupera el título, pero una cancelada no se reabre. */
  private async restoreTopicTx(tx: Tx, topicId: string): Promise<void> {
    const t = await tx.proposal.update({ where: { id: topicId }, data: { hidden: false } });
    if (t?.electionId) {
      await tx.election.update({ where: { id: t.electionId }, data: { title: voteTitle(t.title) } });
    }
  }

  /**
   * Al restaurar una inquietud, su debate abierto por la comunidad vuelve solo si se ocultó
   * junto con ella (última moderación del tema = la vinculada, aún en «oculto»). Si se ocultó
   * por su propio motivo, sigue oculto. Una vinculada que aún espera la segunda firma se cierra
   * como «rechazado»; si era provisional, el debate vuelve salvo otra ocultación en firme.
   */
  private async restoreLinkedTopicTx(tx: Tx, topicId: string): Promise<VinculadaCerrada | null> {
    const p = await tx.proposal.findUnique({
      where: { id: topicId },
      select: { abiertoPorComunidad: true, hidden: true },
    });
    if (p?.abiertoPorComunidad !== true) return null;
    // Si la vinculada aún espera la segunda firma, se cierra («rechazado») con la inquietud restaurada.
    const abierta = await tx.moderationAction.findFirst({
      where: { target: 'tema', targetId: topicId, reason: LINKED_TOPIC_REASON, status: { in: [...ABIERTAS] } },
      select: { id: true, status: true, causa: true, createdAt: true },
    });
    const previo = abierta?.status as string | undefined;
    if (abierta && (previo === 'pendiente' || previo === 'provisional')) {
      const now = new Date();
      const r = await tx.moderationAction.updateMany({
        where: { id: abierta.id, status: previo },
        data: { status: 'rechazado', resolvedAt: now },
      });
      if (r.count === 0) return null;
      const cerrada: VinculadaCerrada = { id: abierta.id, topicId, causa: abierta.causa ?? null };
      if (previo !== 'provisional' || p.hidden !== true) return cerrada;
      // La provisional lo había ocultado: vuelve, salvo que otra ocultación firme lo mantenga oculto.
      const firmes = await tx.moderationAction.count({
        where: { target: 'tema', targetId: topicId, id: { not: abierta.id }, status: { in: ['oculto', 'apelado', 'confirmado'] } },
      });
      if (firmes === 0) {
        await this.restoreTopicTx(tx, topicId);
        await this.extenderPlazosTx(tx, topicId, abierta.createdAt, now);
      }
      return cerrada;
    }
    if (p.hidden !== true) return null;
    const latest = await tx.moderationAction.findFirst({
      where: { target: 'tema', targetId: topicId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reason: true, status: true },
    });
    if (!latest || latest.reason !== LINKED_TOPIC_REASON || (latest.status as string) !== 'oculto') return null;
    // Otra moderación del tema que sigue en pie (oculta, apelada, confirmada o abierta) lo mantiene oculto.
    const otras = await tx.moderationAction.count({
      where: {
        target: 'tema',
        targetId: topicId,
        id: { not: latest.id },
        status: { in: ['oculto', 'apelado', 'confirmado', 'provisional', 'pendiente'] },
      },
    });
    if (otras > 0) return null;
    await tx.moderationAction.update({
      where: { id: latest.id },
      data: { status: 'restaurado', resolvedAt: new Date() },
    });
    await this.restoreTopicTx(tx, topicId);
    return null;
  }

  /**
   * La pausa de una ocultación provisional no acorta los plazos: al levantarse, el cierre de la
   * objeción o de la votación activa se corre lo que duró la pausa (desde que se pidió). El plazo
   * del debate no se toca.
   */
  private async extenderPlazosTx(tx: Tx, topicId: string, desde: Date, ahora: Date): Promise<void> {
    const pausa = ahora.getTime() - desde.getTime();
    if (pausa <= 0) return;
    const d = await tx.decision.findUnique({
      where: { proposalId: topicId },
      select: { id: true, fase: true, objecionEndsAt: true, votacionEndsAt: true },
    });
    if (!d) return;
    if ((d.fase as string) === 'objecion' && d.objecionEndsAt) {
      await tx.decision.updateMany({
        where: { id: d.id, fase: 'objecion' },
        data: { objecionEndsAt: new Date(d.objecionEndsAt.getTime() + pausa) },
      });
    } else if ((d.fase as string) === 'votacion' && d.votacionEndsAt) {
      await tx.decision.updateMany({
        where: { id: d.id, fase: 'votacion' },
        data: { votacionEndsAt: new Date(d.votacionEndsAt.getTime() + pausa) },
      });
    }
  }

  /**
   * Rastro de quien actúa sobre un tema: nada si el tema es de un grupo reservado o lo abrió la
   * comunidad desde una inquietud llevada por una bifurcación (su autor es miembro de ella).
   */
  private async rastroDelTema(
    topic: { id: string; groupId: string; abiertoPorComunidad: boolean },
    profileId: string,
    ip: string,
  ): Promise<{ actorId?: string; ip?: string }> {
    // La escritura ya se hizo: si la consulta falla, sin rastro (nunca un 500 después).
    let forzar = true;
    try {
      forzar = (await temasDeIniciativa(this.prisma, [topic])).size > 0;
    } catch {
      forzar = true;
    }
    return (await this.access.rastro(topic.groupId, profileId, ip, forzar)).quien;
  }

  /** Inquietud o tema llevados a la colmena desde una bifurcación. Si la consulta falla, true (sin rastro). */
  private async esDeIniciativa(target: ModTarget, id: string): Promise<boolean> {
    try {
      return await this.consultarIniciativa(target, id);
    } catch {
      return true;
    }
  }

  private async consultarIniciativa(target: ModTarget, id: string): Promise<boolean> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id }, select: { id: true, abiertoPorComunidad: true } });
      return t ? (await temasDeIniciativa(this.prisma, [t])).size > 0 : false;
    }
    if (target === 'inquietud') {
      const q = await this.prisma.inquietud.findUnique({ where: { id }, select: { origenSolucionId: true } });
      return q?.origenSolucionId ? (await solucionesDeIniciativa(this.prisma, [q.origenSolucionId])).size > 0 : false;
    }
    return false;
  }

  private async authorOf(
    target: ModTarget,
    id: string,
  ): Promise<{ authorProfileId: string | null; groupId: string } | null> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id } });
      return t ? { authorProfileId: t.authorProfileId, groupId: t.groupId } : null;
    }
    if (target === 'inquietud') {
      const q = await this.prisma.inquietud.findUnique({ where: { id } });
      return q ? { authorProfileId: q.authorProfileId, groupId: q.groupId } : null;
    }
    if (target === 'frase') {
      const f = await this.prisma.frase.findUnique({
        where: { id },
        include: { proposal: { select: { groupId: true } } },
      });
      return f ? { authorProfileId: f.authorProfileId, groupId: f.proposal.groupId } : null;
    }
    if (target === 'solucion') {
      const so = await this.prisma.solucion.findUnique({
        where: { id },
        include: { proposal: { select: { groupId: true } } },
      });
      return so ? { authorProfileId: so.authorProfileId, groupId: so.proposal.groupId } : null;
    }
    if (target === 'informe') {
      const inf = await this.prisma.comisionInforme.findUnique({ where: { id } });
      return inf ? { authorProfileId: inf.autorProfileId, groupId: inf.grupoId } : null;
    }
    const c = await this.prisma.proposalComment.findUnique({
      where: { id },
      include: { proposal: { select: { groupId: true } } },
    });
    return c ? { authorProfileId: c.authorProfileId, groupId: c.proposal.groupId } : null;
  }

  private async textOf(target: ModTarget, id: string): Promise<string> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id } });
      return t ? `${t.title}\n\n${t.body}` : '';
    }
    if (target === 'inquietud') {
      const q = await this.prisma.inquietud.findUnique({ where: { id } });
      return q ? `${q.title}\n\n${q.body}` : '';
    }
    if (target === 'frase') {
      return (await this.prisma.frase.findUnique({ where: { id } }))?.text ?? '';
    }
    if (target === 'solucion') {
      const so = await this.prisma.solucion.findUnique({ where: { id } });
      return so ? `${so.title}\n\n${so.description}` : '';
    }
    if (target === 'informe') {
      return (await this.prisma.comisionInforme.findUnique({ where: { id } }))?.texto ?? '';
    }
    return (await this.prisma.proposalComment.findUnique({ where: { id } }))?.body ?? '';
  }

  /** Consensos publicados para cualquier visitante (spec §3 y §7). Sin nombres. */
  async publicConsensus(): Promise<PublicConsensus[]> {
    const topics = await this.prisma.proposal.findMany({
      // Lo de un grupo de trabajo no es público por sí solo: llega a la comunidad al llevarlo.
      where: { status: 'closed', hidden: false, conclusion: { not: null }, group: { type: { not: 'trabajo' } } },
      select: {
        id: true, title: true, kind: true, conclusion: true, objections: true, closedAt: true, electionId: true,
        group: { select: { name: true } },
        signals: { select: { signal: true } },
      },
      orderBy: { closedAt: 'desc' },
      take: 100,
    });
    // Soluciones ganadoras de las decisiones contadas (plan 3), en dos consultas para toda la lista.
    const decisiones = topics.length
      ? await this.prisma.decision.findMany({
          where: { proposalId: { in: topics.map((t) => t.id) }, fase: 'contada' },
          select: { proposalId: true, ganadoras: true },
        })
      : [];
    const ganadorasDe = new Map(decisiones.map((d) => [d.proposalId, d.ganadoras]));
    const idsGanadoras = [...new Set(decisiones.flatMap((d) => d.ganadoras))];
    const soluciones = idsGanadoras.length
      ? await this.prisma.solucion.findMany({
          where: { id: { in: idsGanadoras } },
          select: { id: true, title: true, hidden: true },
        })
      : [];
    // Informes finales no ocultos de comisiones cerradas de esas soluciones, en una sola consulta
    // y del más reciente al más antiguo: por tema vale el primero de una de sus ganadoras.
    const informes = idsGanadoras.length
      ? await this.prisma.comisionInforme.findMany({
          where: {
            final: true,
            hidden: false,
            // Solo comisiones de la comunidad: la de una bifurcación (origenGrupoId) no es pública.
            grupo: { trabajoTipo: 'comision', trabajoEstado: 'cerrado', origenSolucionId: { in: idsGanadoras }, origenGrupoId: null },
          },
          select: { texto: true, grupo: { select: { origenSolucionId: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const informeFinalDe = (ganadoras: string[]): string | null =>
      informes.find((i) => i.grupo.origenSolucionId !== null && ganadoras.includes(i.grupo.origenSolucionId))?.texto ?? null;
    // Una solución ocultada después del conteo sale enmascarada.
    const tituloDe = new Map(
      soluciones.map((s) => [s.id, s.hidden ? 'Solución oculta por moderación' : s.title]),
    );

    const result: PublicConsensus[] = [];
    for (const t of topics) {
      const counts = { support: 0, neutral: 0, object: 0 };
      for (const s of t.signals) counts[s.signal as keyof typeof counts] += 1;
      let winningOption: string | null = null;
      if (t.electionId) {
        const res = await this.prisma.electionResult.findUnique({ where: { electionId: t.electionId } });
        const winners = (res?.winners as string[] | undefined) ?? [];
        const winnerId = winners[0];
        if (winners.length === 1 && winnerId) {
          winningOption = (await this.prisma.electionCandidate.findUnique({ where: { id: winnerId } }))?.title ?? null;
        }
      }
      result.push({
        id: t.id,
        title: t.title,
        communityName: t.group.name,
        kind: t.kind as unknown as PublicConsensus['kind'],
        conclusion: t.conclusion ?? '',
        objections: t.objections,
        signalCounts: counts,
        closedAt: (t.closedAt ?? new Date(0)).toISOString(),
        winningOption,
        approvedSolutions: (ganadorasDe.get(t.id) ?? []).flatMap((id) => {
          const titulo = tituloDe.get(id);
          return titulo === undefined ? [] : [titulo];
        }),
        informeFinal: informeFinalDe(ganadorasDe.get(t.id) ?? []),
      });
    }
    return result;
  }
}
