import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AccountStatus, Prisma } from '@prisma/client';
import {
  CHAT_MAX,
  CHAT_PAGINA,
  llamaAGuardian,
  type ChatMensajeVista,
  type ChatNovedades,
  type ChatPagina,
  type ChatTipoValue,
} from '@decide/shared';
import { AuditService } from '../audit/audit.service';
import { iniciales } from '../elecciones/elecciones.service';
import { ForumsService } from '../forums/forums.service';
import { GroupAccessService } from '../groups/group-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { ChatGuardianService } from './chat-guardian.service';

export interface Quien {
  userId: string;
  profileId: string;
  /** Estado según el token: solo para el contexto de Guardián. Los permisos lo leen de la base. */
  status: AccountStatus;
}

export const SIN_CHAT = 'Esta comunidad no tiene chat.';
export const SOLO_MIEMBROS = 'Solo los miembros verificados de esta comunidad pueden entrar a su chat.';
const MENSAJE_NO_EXISTE = 'Ese mensaje ya no existe.';
const SOLO_PROPIO = 'Solo puedes eliminar tus propios mensajes.';
const SIN_PERFIL = 'Miembro que ya no está';
/** Tope de mensajes que trae una consulta de «solo posteriores». */
const MAX_POSTERIORES = 200;
/** Cuánto se muestra «Guardián está escribiendo…» antes de darlo por perdido. */
const ESPERA_GUARDIAN_MS = 30_000;
/** Solicitudes de moderación que aún necesitan el texto del mensaje. */
const MODERACION_ABIERTA = ['apelado', 'pendiente', 'provisional'] as const;

const CON_AUTOR = { author: { select: { displayName: true } }, _count: { select: { avisos: true } } } as const;
type Fila = Prisma.ChatMessageGetPayload<{ include: typeof CON_AUTOR }>;

function enlacesDe(valor: unknown): { texto: string; ruta: string }[] {
  if (!Array.isArray(valor)) return [];
  const salida: { texto: string; ruta: string }[] = [];
  for (const e of valor as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const { texto, ruta } = e as Record<string, unknown>;
    if (typeof texto === 'string' && typeof ruta === 'string' && ruta.startsWith('/')) salida.push({ texto, ruta });
  }
  return salida;
}

/**
 * Sala de chat de una comunidad. La sala es la comunidad: no hay tabla de salas.
 * Solo leen y escriben sus miembros verificados; ni la mesa ni los observadores entran por su cargo.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GroupAccessService,
    private readonly forums: ForumsService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
    private readonly guardian: ChatGuardianService,
  ) {}

  /** 404 si la comunidad no existe o es un grupo de trabajo; 403 si no es miembro verificado. */
  async requerirSala(groupId: string, q: Quien): Promise<void> {
    const grupo = await this.prisma.group.findUnique({ where: { id: groupId }, select: { type: true } });
    if (!grupo || (grupo.type as string) === 'trabajo') throw new NotFoundException(SIN_CHAT);
    if (!(await this.verificado(q.profileId))) throw new ForbiddenException(SOLO_MIEMBROS);
    if (!(await this.access.isParticipant(groupId, q.profileId))) throw new ForbiddenException(SOLO_MIEMBROS);
  }

  /** El estado se lee de la base, no del token: una suspensión cierra la sala al instante. */
  private async verificado(profileId: string): Promise<boolean> {
    const p = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { user: { select: { status: true } } },
    });
    return (p?.user.status as string | undefined) === 'verified_citizen';
  }

  async listar(groupId: string, q: Quien, cursor: { antes?: string; despues?: string } = {}): Promise<ChatPagina> {
    await this.requerirSala(groupId, q);
    const ahora = new Date();

    let filas: Fila[];
    let hayAnteriores = false;
    const ancla = cursor.despues ?? cursor.antes;
    const fechaAncla = ancla
      ? ((await this.prisma.chatMessage.findFirst({ where: { id: ancla, groupId }, select: { createdAt: true } }))?.createdAt ?? null)
      : null;

    if (cursor.despues && fechaAncla) {
      filas = await this.prisma.chatMessage.findMany({
        where: { groupId, createdAt: { gt: fechaAncla } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_POSTERIORES,
        include: CON_AUTOR,
      });
    } else {
      const recientes = await this.prisma.chatMessage.findMany({
        where: { groupId, ...(cursor.antes && fechaAncla ? { createdAt: { lt: fechaAncla } } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: CHAT_PAGINA + 1,
        include: CON_AUTOR,
      });
      hayAnteriores = recientes.length > CHAT_PAGINA;
      filas = recientes.slice(0, CHAT_PAGINA).reverse();
    }

    const [puedoModerar, esperandoGuardian] = await Promise.all([
      this.forums.canModerate(q.profileId, groupId),
      this.esperaAGuardian(groupId, q.profileId, ahora),
      this.prisma.chatLectura.upsert({
        where: { groupId_profileId: { groupId, profileId: q.profileId } },
        create: { groupId, profileId: q.profileId, lastReadAt: ahora },
        update: { lastReadAt: ahora },
      }),
    ]);

    // Quien escribió un mensaje ocultado puede apelar, igual que en los foros.
    const mios = filas.filter((f) => f.hidden && !f.deletedAt && f.authorProfileId === q.profileId).map((f) => f.id);
    const apelables =
      mios.length > 0
        ? await this.prisma.moderationAction.findMany({
            where: { target: 'mensaje', targetId: { in: mios }, status: 'oculto' },
            select: { id: true, targetId: true },
          })
        : [];
    const apelacionDe = new Map(apelables.map((a) => [a.targetId, a.id]));

    return {
      mensajes: filas.map((f) => ({ ...this.vista(f, q.profileId, puedoModerar), apelacionId: apelacionDe.get(f.id) ?? null })),
      hayAnteriores,
      puedoModerar,
      esperandoGuardian,
    };
  }

  async publicar(groupId: string, q: Quien, texto: string, llamarGuardian: boolean, ip: string): Promise<ChatMensajeVista> {
    await this.requerirSala(groupId, q);
    const body = texto.trim();
    if (body.length === 0) throw new BadRequestException('Escribe un mensaje.');
    if (body.length > CHAT_MAX) throw new BadRequestException(`El mensaje puede tener hasta ${CHAT_MAX.toString()} caracteres.`);

    const paraGuardian = llamarGuardian || llamaAGuardian(body);
    const fila = await this.prisma.chatMessage.create({
      data: { groupId, authorProfileId: q.profileId, kind: paraGuardian ? 'pregunta_guardian' : 'miembro', body },
      include: CON_AUTOR,
    });
    this.auditar('chat.message_added', groupId, q.profileId, ip);

    // Guardián responde aparte: quien pregunta no espera a la IA. Solo recibe este mensaje.
    if (paraGuardian) void this.guardian.responder(groupId, fila.id, q, body);

    return this.vista(fila, q.profileId, false);
  }

  /** El autor elimina su mensaje: el texto se borra de la base y queda la marca. */
  async borrarPropio(messageId: string, q: Quien, ip: string): Promise<void> {
    const m = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { groupId: true, authorProfileId: true, deletedAt: true },
    });
    if (!m) throw new NotFoundException(MENSAJE_NO_EXISTE);
    await this.requerirSala(m.groupId, q);
    if (m.authorProfileId !== q.profileId) throw new ForbiddenException(SOLO_PROPIO);
    if (m.deletedAt) return;
    await this.prisma.chatMessage.update({ where: { id: messageId }, data: { body: null, deletedAt: new Date() } });
    this.auditar('chat.message_deleted', m.groupId, q.profileId, ip);
  }

  /** Avisa a la coordinación de un mensaje. No lo oculta. Repetir el aviso no hace nada. */
  async avisar(messageId: string, q: Quien): Promise<void> {
    const m = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { groupId: true, deletedAt: true },
    });
    if (!m || m.deletedAt) throw new NotFoundException(MENSAJE_NO_EXISTE);
    await this.requerirSala(m.groupId, q);
    await this.prisma.chatAviso.upsert({
      where: { messageId_profileId: { messageId, profileId: q.profileId } },
      create: { messageId, profileId: q.profileId },
      update: {},
    });
  }

  /** En cuáles de sus comunidades hay mensajes de otras personas posteriores a su última lectura. */
  async novedades(q: Quien): Promise<ChatNovedades> {
    if (!(await this.verificado(q.profileId))) return [];
    const membresias = await this.prisma.groupMembership.findMany({
      where: { profileId: q.profileId, group: { type: { not: 'trabajo' } } },
      select: { groupId: true },
    });
    const ids = membresias.map((m) => m.groupId);
    if (ids.length === 0) return [];
    const [ultimos, lecturas] = await Promise.all([
      this.prisma.chatMessage.groupBy({
        by: ['groupId'],
        where: { groupId: { in: ids }, OR: [{ authorProfileId: null }, { authorProfileId: { not: q.profileId } }] },
        _max: { createdAt: true },
      }),
      this.prisma.chatLectura.findMany({ where: { profileId: q.profileId, groupId: { in: ids } } }),
    ]);
    return ids.map((groupId) => {
      const ultimo = ultimos.find((u) => u.groupId === groupId)?._max.createdAt ?? null;
      const leido = lecturas.find((l) => l.groupId === groupId)?.lastReadAt ?? null;
      return { groupId, nuevos: ultimo !== null && (leido === null || ultimo > leido) };
    });
  }

  /**
   * Borra los mensajes más viejos que la regla «chat.conservacion_dias». Un mensaje con una
   * solicitud de moderación o una apelación sin resolver espera: su texto todavía hace falta.
   */
  async limpiar(ahora: Date): Promise<number> {
    const dias = await this.rules.getInt('chat.conservacion_dias', null);
    const limite = new Date(ahora.getTime() - dias * 24 * 3600_000);
    const abiertas = await this.prisma.moderationAction.findMany({
      where: { target: 'mensaje', status: { in: [...MODERACION_ABIERTA] } },
      select: { targetId: true },
    });
    const { count } = await this.prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: limite }, id: { notIn: abiertas.map((a) => a.targetId) } },
    });
    return count;
  }

  private async esperaAGuardian(groupId: string, profileId: string, ahora: Date): Promise<boolean> {
    const pregunta = await this.prisma.chatMessage.findFirst({
      where: {
        groupId,
        authorProfileId: profileId,
        kind: 'pregunta_guardian',
        createdAt: { gt: new Date(ahora.getTime() - ESPERA_GUARDIAN_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!pregunta) return false;
    return (await this.prisma.chatMessage.count({ where: { replyToId: pregunta.id } })) === 0;
  }

  private vista(f: Fila, profileId: string, puedoModerar: boolean): ChatMensajeVista {
    const tipo = f.kind as ChatTipoValue;
    const dePersona = tipo === 'miembro' || tipo === 'pregunta_guardian';
    const estado = f.deletedAt ? 'eliminado' : f.hidden ? 'oculto' : 'visible';
    const nombre = dePersona ? (f.author?.displayName ?? SIN_PERFIL) : null;
    return {
      id: f.id,
      tipo,
      autor: nombre,
      iniciales: nombre && f.author ? iniciales(nombre) : null,
      texto: estado === 'visible' ? f.body : null,
      estado,
      enlaces: estado === 'visible' && tipo === 'guardian' ? enlacesDe(f.enlaces) : [],
      respondeA: f.replyToId,
      esMio: f.authorProfileId !== null && f.authorProfileId === profileId,
      avisos: puedoModerar ? f._count.avisos : null,
      apelacionId: null,
      createdAt: f.createdAt.toISOString(),
    };
  }

  /** Solo el hecho: nunca el texto ni metadatos con contenido. */
  private auditar(action: string, groupId: string, profileId: string, ip: string): void {
    void this.access
      .rastro(groupId, profileId, ip)
      .then(({ quien }) => this.audit.log({ ...quien, action, resource: `group:${groupId}` }))
      .catch((err: unknown) => this.logger.error(`Audit log failed: ${err instanceof Error ? err.name : 'error'}`));
  }
}
