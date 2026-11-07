import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { textoParaRevisar } from '@decide/shared';
import type { InquietudDetail, InquietudStatusValue, InquietudSummary } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { rechazarGrupoDeTrabajo } from '../groups/group-access.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { ForumsService } from '../forums/forums.service';
import { motivoVisible } from '../forums/moderacion-motivo';
import { DeliberationService } from '../deliberation/deliberation.service';
import { NOMBRE_INICIATIVA, solucionesDeIniciativa } from '../grupos/bifurcacion-reglas';
import { GuardiaService, type OpcionesPublicar } from '../asistente/guardia.service';
import { Publicadores } from '../asistente/publicadores';

const DIA_MS = 86_400_000;
const ESTADOS_ABIERTOS = ['abierta', 'en_plazo'] as const;
const HIDDEN_TITLE = 'Inquietud oculta por moderación';

interface InquietudRow {
  id: string;
  groupId: string;
  authorProfileId: string;
  title: string;
  body: string;
  status: string;
  hidden: boolean;
  deadlineAt: Date | null;
  response: string | null;
  respondedAt: Date | null;
  proposalId: string | null;
  createdAt: Date;
  author: { displayName: string };
  origenSolucionId?: string | null;
}

@Injectable()
export class InquietudesService implements OnModuleInit {
  private readonly logger = new Logger(InquietudesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
    private readonly forums: ForumsService,
    private readonly deliberation: DeliberationService,
    private readonly guardia: GuardiaService,
    private readonly publicadores: Publicadores,
  ) {}

  /** La revisión de la mesa publica un texto aprobado con la misma llamada (sin ip). */
  onModuleInit(): void {
    this.publicadores.registrar('inquietud', (autor, args, opts) =>
      this.create(autor, args as { groupId: string; title: string; body: string }, '', opts),
    );
    this.publicadores.registrar('respuesta_inquietud', (autor, args, opts) => {
      const a = args as { id: string; text: string };
      return this.respond(autor, a.id, a.text, '', opts);
    });
    // Un tema también nace al juntar inquietudes en un debate: variante «abrir_debate».
    this.publicadores.registrar(
      'tema',
      (autor, args, opts) =>
        this.openDebate(autor, args as { groupId: string; inquietudIds: string[]; title: string; body: string }, '', opts),
      'abrir_debate',
    );
  }

  private async requireMembership(groupId: string, profileId: string): Promise<void> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_profileId: { groupId, profileId } },
    });
    if (!m) throw new ForbiddenException('Solo los miembros de esta comunidad pueden participar.');
  }

  private async actorId(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
    return p?.userId ? { actorId: p.userId } : {};
  }

  /** max(mínimo de personas, ⌈porcentaje % × miembros⌉). */
  async threshold(groupId: string): Promise<number> {
    const [minPeople, pct, members] = await Promise.all([
      this.rules.getInt('inquietud.apoyo_minimo_personas', groupId),
      this.rules.getInt('inquietud.apoyo_minimo_porcentaje', groupId),
      this.prisma.groupMembership.count({ where: { groupId } }),
    ]);
    return Math.max(minPeople, Math.ceil((pct * members) / 100));
  }

  /** Solo cuentan los apoyos de quienes siguen siendo miembros del grupo. */
  private supportCount(inquietudId: string, groupId: string): Promise<number> {
    return this.prisma.inquietudApoyo.count({
      where: { inquietudId, profile: { memberships: { some: { groupId } } } },
    });
  }

  /** Consulta aparte solo por el apoyo de quien mira; nunca se lista a quienes apoyaron. */
  private async supportedBy(inquietudId: string, profileId: string): Promise<boolean> {
    const mine = await this.prisma.inquietudApoyo.findUnique({
      where: { inquietudId_profileId: { inquietudId, profileId } },
      select: { id: true },
    });
    return mine !== null;
  }

  private async summary(row: InquietudRow, viewerProfileId: string, threshold: number): Promise<InquietudSummary> {
    // Llevada desde una bifurcación: quien la llevó es miembro y su nombre delataría su voto.
    const anonima = row.origenSolucionId
      ? (await solucionesDeIniciativa(this.prisma, [row.origenSolucionId])).size > 0
      : false;
    return {
      id: row.id,
      groupId: row.groupId,
      title: row.hidden ? HIDDEN_TITLE : row.title,
      status: row.status as InquietudStatusValue,
      hidden: row.hidden,
      supportCount: await this.supportCount(row.id, row.groupId),
      supportedByMe: await this.supportedBy(row.id, viewerProfileId),
      threshold,
      deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
      // Oculta, ni siquiera el enlace al debate: ese tema puede repetir su texto.
      proposalId: row.hidden ? null : row.proposalId,
      authorDisplayName: anonima ? NOMBRE_INICIATIVA : row.author.displayName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(
    profileId: string,
    dto: { groupId: string; title: string; body: string },
    ip: string,
    opts: OpcionesPublicar = {},
  ): Promise<{ id: string }> {
    await this.requireMembership(dto.groupId, profileId);
    await rechazarGrupoDeTrabajo(this.prisma, dto.groupId);
    const { revisado } = await this.guardia.antesDePublicar({
      tipo: 'inquietud',
      texto: textoParaRevisar(dto.title, dto.body),
      autorProfileId: profileId,
      args: { groupId: dto.groupId, title: dto.title, body: dto.body },
      ...opts,
    });
    const created = await this.prisma.inquietud.create({
      data: { groupId: dto.groupId, authorProfileId: profileId, title: dto.title, body: dto.body },
    });
    await this.guardia.despuesDePublicar('inquietud', created.id, revisado);
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'inquietud.created',
      resource: `inquietud:${created.id}`,
      ip,
      metadata: { groupId: dto.groupId },
    });
    return { id: created.id };
  }

  async list(profileId: string, groupId: string): Promise<InquietudSummary[]> {
    await this.requireMembership(groupId, profileId);
    // Reevaluación perezosa: una restaurada o con apoyos nuevos entra en plazo al leer (barata e idempotente).
    const pendientes = await this.prisma.inquietud.findMany({
      where: { groupId, status: 'abierta', hidden: false },
      select: { id: true },
    });
    for (const p of pendientes) await this.evaluateThreshold(p.id);
    const rows = (await this.prisma.inquietud.findMany({
      where: { groupId },
      include: { author: { select: { displayName: true } } },
    })) as InquietudRow[];
    const threshold = await this.threshold(groupId);
    const result: InquietudSummary[] = [];
    for (const r of rows) result.push(await this.summary(r, profileId, threshold));
    return result.sort((a, b) => b.supportCount - a.supportCount || a.createdAt.localeCompare(b.createdAt));
  }

  async get(profileId: string, id: string): Promise<InquietudDetail> {
    const read = async (): Promise<InquietudRow | null> =>
      (await this.prisma.inquietud.findUnique({
        where: { id },
        include: { author: { select: { displayName: true } } },
      })) as InquietudRow | null;
    const first = await read();
    if (!first) throw new NotFoundException('Inquietud no encontrada');
    // Miembros, y quien organiza la agenda aunque no sea miembro (para leer y responder).
    const organiza = await this.forums.canOrganize(profileId, first.groupId);
    if (!organiza) await this.requireMembership(first.groupId, profileId);
    // Quien organiza sin ser miembro puede leer, pero no apoyar ni entrar al debate.
    const isMember = organiza
      ? (await this.prisma.groupMembership.findUnique({
          where: { groupId_profileId: { groupId: first.groupId, profileId } },
          select: { id: true },
        })) !== null
      : true;
    // Solo después de los permisos: un extraño no debe poder mover el estado al leer.
    await this.evaluateThreshold(id);
    const row = (await read()) ?? first;
    const base = await this.summary(row, profileId, await this.threshold(row.groupId));
    const isAuthor = row.authorProfileId === profileId;

    let hiddenReason: string | null = null;
    let moderationId: string | null = null;
    if (row.hidden) {
      const action = await this.prisma.moderationAction.findFirst({
        where: { target: 'inquietud', targetId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, causa: true, reason: true, status: true },
      });
      hiddenReason = motivoVisible(action);
      if (action && isAuthor && (action.status as string) === 'oculto') moderationId = action.id;
    }

    return {
      ...base,
      body: row.hidden ? '' : row.body,
      response: row.hidden ? null : row.response,
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      canOrganize: organiza,
      isMember,
      isAuthor,
      hiddenReason,
      moderationId,
    };
  }

  async support(profileId: string, id: string, _ip: string): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({
      where: { id },
      select: { id: true, groupId: true, hidden: true },
    });
    if (!row) throw new NotFoundException('Inquietud no encontrada');
    await this.requireMembership(row.groupId, profileId);
    if (row.hidden) throw new BadRequestException('Esta inquietud está oculta por moderación.');
    try {
      await this.prisma.inquietudApoyo.upsert({
        where: { inquietudId_profileId: { inquietudId: id, profileId } },
        create: { inquietudId: id, profileId },
        update: {},
      });
    } catch (err) {
      // Dos peticiones a la vez: la otra ya creó el apoyo, que es justo lo que se pedía.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
    // Apoyar y retirar el apoyo no se audita: la hora exacta podría delatar a quien apoyó.
    await this.evaluateThreshold(id);
  }

  async unsupport(profileId: string, id: string, _ip: string): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({ where: { id }, select: { id: true, groupId: true } });
    if (!row) throw new NotFoundException('Inquietud no encontrada');
    await this.requireMembership(row.groupId, profileId);
    await this.prisma.inquietudApoyo.deleteMany({ where: { inquietudId: id, profileId } });
  }

  async evaluateThreshold(id: string): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({
      where: { id },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (!row || row.hidden || (row.status as string) !== 'abierta') return;
    const [count, threshold] = await Promise.all([this.supportCount(id, row.groupId), this.threshold(row.groupId)]);
    if (count < threshold) return;
    const days = await this.rules.getInt('inquietud.plazo_respuesta_dias', row.groupId);
    const now = new Date();
    const res = await this.prisma.inquietud.updateMany({
      where: { id, status: 'abierta', hidden: false, thresholdReachedAt: null },
      data: { status: 'en_plazo', thresholdReachedAt: now, deadlineAt: new Date(now.getTime() + days * DIA_MS) },
    });
    if (res.count > 0) {
      void this.audit.log({
        action: 'inquietud.threshold_reached',
        resource: `inquietud:${id}`,
        metadata: { inquietudId: id },
      });
    }
  }
  private async requireOrganizer(profileId: string, groupId: string): Promise<void> {
    if (!(await this.forums.canOrganize(profileId, groupId))) {
      throw new ForbiddenException('Solo quien organiza la agenda puede hacer esto.');
    }
  }

  /** Inquietudes que la mesa debe atender: en plazo, o abiertas con al menos un apoyo. */
  async agenda(profileId: string): Promise<InquietudSummary[]> {
    const rows = (await this.prisma.inquietud.findMany({
      where: {
        hidden: false,
        OR: [{ status: 'en_plazo' }, { status: 'abierta', apoyos: { some: {} } }],
      },
      include: { author: { select: { displayName: true } } },
    })) as InquietudRow[];
    const organiza = new Map<string, boolean>();
    const puede = async (groupId: string): Promise<boolean> => {
      if (!organiza.has(groupId)) organiza.set(groupId, await this.forums.canOrganize(profileId, groupId));
      return organiza.get(groupId) === true;
    };
    const thresholds = new Map<string, number>();
    const result: InquietudSummary[] = [];
    for (const r of rows) {
      if (!(await puede(r.groupId))) continue;
      if (!thresholds.has(r.groupId)) thresholds.set(r.groupId, await this.threshold(r.groupId));
      const s = await this.summary(r, profileId, thresholds.get(r.groupId) ?? 0);
      if (s.status === 'abierta' && s.supportCount < 1) continue;
      result.push(s);
    }
    if (result.length === 0 && !(await this.organizaAlgunaComunidad(profileId, puede))) {
      throw new ForbiddenException('Solo quien organiza la agenda puede verla.');
    }
    return result.sort((a, b) => {
      if (a.deadlineAt === b.deadlineAt) return 0;
      if (a.deadlineAt === null) return 1;
      if (b.deadlineAt === null) return -1;
      return a.deadlineAt.localeCompare(b.deadlineAt);
    });
  }

  /** Quien organiza alguna comunidad de la que es miembro (o por regla general) puede ver la agenda. */
  private async organizaAlgunaComunidad(
    profileId: string,
    puede: (groupId: string) => Promise<boolean>,
  ): Promise<boolean> {
    const mine = await this.prisma.groupMembership.findMany({ where: { profileId }, select: { groupId: true } });
    for (const m of mine ?? []) if (await puede(m.groupId)) return true;
    return false;
  }

  async openDebate(
    profileId: string,
    dto: { groupId: string; inquietudIds: string[]; title: string; body: string },
    ip: string,
    opts: OpcionesPublicar = {},
  ): Promise<{ proposalId: string }> {
    await this.requireOrganizer(profileId, dto.groupId);
    const ids = [...new Set(dto.inquietudIds)];
    const rows = await this.prisma.inquietud.findMany({
      where: { id: { in: ids } },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (rows.length !== ids.length) throw new BadRequestException('Alguna inquietud no existe.');
    if (rows.some((r) => r.groupId !== dto.groupId)) {
      throw new BadRequestException('Todas las inquietudes deben ser de la misma comunidad.');
    }
    if (rows.some((r) => r.hidden || !(ESTADOS_ABIERTOS as readonly string[]).includes(r.status as string))) {
      throw new BadRequestException('Solo se pueden juntar inquietudes abiertas o en plazo.');
    }

    // El tema lo escribe quien organiza: se revisa antes de la transacción (no se espera al asistente dentro).
    const { revisado } = await this.guardia.antesDePublicar({
      tipo: 'tema',
      texto: textoParaRevisar(dto.title, dto.body),
      autorProfileId: profileId,
      args: { via: 'abrir_debate', groupId: dto.groupId, inquietudIds: ids, title: dto.title, body: dto.body },
      ...opts,
    });
    const actor = await this.actorId(profileId);
    await this.deliberation.ensureDefaultForum(dto.groupId);
    const proposalId = await this.prisma.$transaction(async (tx) => {
      const res = await tx.inquietud.updateMany({
        where: { id: { in: ids }, groupId: dto.groupId, hidden: false, status: { in: [...ESTADOS_ABIERTOS] } },
        data: { status: 'en_debate' },
      });
      if (res.count !== ids.length) throw new ConflictException('Alguna inquietud ya cambió de estado.');
      const topic = await this.deliberation.createTopicInDefaultForum(tx, {
        groupId: dto.groupId,
        authorProfileId: profileId,
        title: dto.title,
        body: dto.body,
        abiertoPorComunidad: false,
      });
      await tx.inquietud.updateMany({ where: { id: { in: ids } }, data: { proposalId: topic.id } });
      return topic.id;
    });
    await this.guardia.despuesDePublicar('tema', proposalId, revisado);

    void this.audit.log({
      ...actor,
      action: 'inquietud.debate_opened',
      resource: `proposal:${proposalId}`,
      ip,
      metadata: { proposalId, count: ids.length },
    });
    return { proposalId };
  }

  async respond(profileId: string, id: string, text: string, ip: string, opts: OpcionesPublicar = {}): Promise<void> {
    const row = await this.prisma.inquietud.findUnique({
      where: { id },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (!row) throw new NotFoundException('Inquietud no encontrada');
    await this.requireOrganizer(profileId, row.groupId);
    if (row.hidden || !(ESTADOS_ABIERTOS as readonly string[]).includes(row.status as string)) {
      throw new BadRequestException('Esta inquietud ya no admite respuesta.');
    }
    // La revisión previa sigue (puede bloquear el nivel 2). Una respuesta sin revisar no se encola:
    // ocultar la inquietud del miembro por las palabras de quien organiza no corresponde (Ruling 16);
    // la mesa puede moderarla a mano.
    await this.guardia.antesDePublicar({
      tipo: 'respuesta_inquietud',
      texto: text,
      autorProfileId: profileId,
      args: { id, text },
      ...opts,
    });
    const actor = await this.actorId(profileId);
    const res = await this.prisma.inquietud.updateMany({
      where: { id, hidden: false, status: { in: [...ESTADOS_ABIERTOS] } },
      data: { status: 'respondida', response: text, respondedAt: new Date(), respondedByProfileId: profileId },
    });
    if (res.count === 0) throw new ConflictException('Esta inquietud ya cambió de estado.');
    void this.audit.log({
      ...actor,
      action: 'inquietud.responded',
      resource: `inquietud:${id}`,
      ip,
      metadata: { inquietudId: id },
    });
  }

  /** Abre como debate las inquietudes en plazo vencido sin respuesta. Devuelve cuántas abrió. */
  async processDeadlines(now: Date): Promise<number> {
    const due = await this.prisma.inquietud.findMany({
      where: { status: 'en_plazo', hidden: false, deadlineAt: { lte: now } },
      select: { id: true, groupId: true, authorProfileId: true, title: true, body: true },
    });
    let opened = 0;
    for (const i of due) {
      try {
        await this.deliberation.ensureDefaultForum(i.groupId);
        const proposalId = await this.prisma.$transaction(async (tx) => {
          const res = await tx.inquietud.updateMany({
            where: { id: i.id, status: 'en_plazo', hidden: false, deadlineAt: { lte: now } },
            data: { status: 'abierta_por_la_comunidad' },
          });
          if (res.count !== 1) return null;
          const topic = await this.deliberation.createTopicInDefaultForum(tx, {
            groupId: i.groupId,
            authorProfileId: i.authorProfileId,
            title: i.title,
            body: i.body,
            abiertoPorComunidad: true,
          });
          await tx.inquietud.updateMany({ where: { id: i.id }, data: { proposalId: topic.id } });
          return topic.id;
        });
        if (!proposalId) continue;
        opened += 1;
        void this.audit.log({
          action: 'inquietud.opened_by_community',
          resource: `inquietud:${i.id}`,
          metadata: { inquietudId: i.id, proposalId },
        });
      } catch (err) {
        this.logger.error(`No se pudo abrir la inquietud ${i.id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return opened;
  }
}
