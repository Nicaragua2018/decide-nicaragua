import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  CHAT_MAX,
  CHAT_PAGINA,
  llamaAGuardian,
  type ChatAvisoMesa,
  type ChatMensajeVista,
  type ChatNovedades,
  type ChatPagina,
  type ChatTipoValue,
} from '@decide/shared';
import { conLimite } from '../asistente/con-limite';
import { AuditService } from '../audit/audit.service';
import { iniciales } from '../elecciones/elecciones.service';
import { ForumsService } from '../forums/forums.service';
import { GroupAccessService } from '../groups/group-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RulesService } from '../rules/rules.service';
import { ChatGuardianService } from './chat-guardian.service';

export interface Quien {
  userId: string;
  profileId: string;
}

export const SIN_CHAT = 'Esta comunidad no tiene chat.';
export const SOLO_MIEMBROS = 'Solo los miembros verificados de esta comunidad pueden entrar a su chat.';
export const MUY_RAPIDO = 'Vas muy rápido. Espera un momento antes de enviar otro mensaje.';
const MENSAJE_NO_EXISTE = 'Ese mensaje ya no existe.';
const SOLO_PROPIO = 'Solo puedes eliminar tus propios mensajes.';
const SOLO_MESA = 'Solo la mesa directiva ve los avisos de todas las comunidades.';
const SIN_PERFIL = 'Miembro que ya no está';
/** Tope de mensajes que trae una consulta de «solo posteriores». */
const MAX_POSTERIORES = 200;
/** Cuánto se muestra «Guardián está escribiendo…» antes de darlo por perdido. */
const ESPERA_GUARDIAN_MS = 30_000;
/** Solicitudes de moderación que aún necesitan el texto del mensaje. */
const MODERACION_ABIERTA = ['apelado', 'pendiente', 'provisional'] as const;
/** Mensajes (y avisos) por persona y minuto. El límite es por persona, no por IP. */
const MAX_POR_MINUTO = 10;
const REDIS_MAXIMO_MS = 300;
/** Cuántos mensajes vencidos se borran por tanda. */
const TANDA_LIMPIEZA = 500;
const MAX_AVISOS_MESA = 100;

const CON_AUTOR = { author: { select: { displayName: true } }, _count: { select: { avisos: true } } } as const;
type Fila = Prisma.ChatMessageGetPayload<{ include: typeof CON_AUTOR }>;

function enlacesDe(valor: unknown): { texto: string; ruta: string }[] {
  if (!Array.isArray(valor)) return [];
  const salida: { texto: string; ruta: string }[] = [];
  for (const e of valor as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const { texto, ruta } = e as Record<string, unknown>;
    // Solo rutas internas: «/reglas» sí, «//otro.sitio» y direcciones completas no.
    if (typeof texto === 'string' && typeof ruta === 'string' && /^\/(?!\/)/.test(ruta)) salida.push({ texto, ruta });
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
    private readonly redis: RedisService,
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
    const idAncla = cursor.despues ?? cursor.antes;
    const ancla = idAncla
      ? await this.prisma.chatMessage.findFirst({ where: { id: idAncla, groupId }, select: { id: true, createdAt: true } })
      : null;

    if (cursor.despues && ancla) {
      // Posteriores al ancla; si dos mensajes comparten instante, desempata el id.
      filas = await this.prisma.chatMessage.findMany({
        where: {
          groupId,
          OR: [{ createdAt: { gt: ancla.createdAt } }, { createdAt: ancla.createdAt, id: { gt: ancla.id } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_POSTERIORES,
        include: CON_AUTOR,
      });
    } else {
      const recientes = await this.prisma.chatMessage.findMany({
        where:
          cursor.antes && ancla
            ? { groupId, OR: [{ createdAt: { lt: ancla.createdAt } }, { createdAt: ancla.createdAt, id: { lt: ancla.id } }] }
            : { groupId },
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

  async publicar(groupId: string, q: Quien, texto: string, llamarGuardian: boolean): Promise<ChatMensajeVista> {
    await this.requerirSala(groupId, q);
    const body = texto.trim();
    if (body.length === 0) throw new BadRequestException('Escribe un mensaje.');
    if (body.length > CHAT_MAX) throw new BadRequestException(`El mensaje puede tener hasta ${CHAT_MAX.toString()} caracteres.`);
    await this.frenar('envio', q.profileId);

    const paraGuardian = llamarGuardian || llamaAGuardian(body);
    const fila = await this.prisma.chatMessage.create({
      data: { groupId, authorProfileId: q.profileId, kind: paraGuardian ? 'pregunta_guardian' : 'miembro', body },
      include: CON_AUTOR,
    });
    this.auditar('chat.message_added', groupId);

    // Guardián responde aparte: quien pregunta no espera a la IA. Solo recibe este mensaje.
    if (paraGuardian) void this.guardian.responder(groupId, fila.id, q.profileId, body);

    return this.vista(fila, q.profileId, false);
  }

  /**
   * El autor elimina su mensaje: el texto se borra de la base y queda la marca. Basta con ser el
   * autor: quien salió de la comunidad o quedó suspendido también puede retirar lo que escribió.
   */
  async borrarPropio(messageId: string, q: Quien): Promise<void> {
    const m = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { groupId: true, authorProfileId: true, deletedAt: true },
    });
    if (!m) throw new NotFoundException(MENSAJE_NO_EXISTE);
    if (m.authorProfileId !== q.profileId) throw new ForbiddenException(SOLO_PROPIO);
    if (m.deletedAt) return;
    await this.prisma.chatMessage.update({ where: { id: messageId }, data: { body: null, deletedAt: new Date() } });
    this.auditar('chat.message_deleted', m.groupId);
  }

  /**
   * Avisa de un mensaje. No lo oculta. Lo ven la coordinación de la comunidad (en la sala) y la
   * mesa (en su página). Repetir el aviso no hace nada.
   */
  async avisar(messageId: string, q: Quien): Promise<void> {
    const m = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { groupId: true, deletedAt: true },
    });
    if (!m || m.deletedAt) throw new NotFoundException(MENSAJE_NO_EXISTE);
    await this.requerirSala(m.groupId, q);
    await this.frenar('aviso', q.profileId);
    await this.prisma.chatAviso.upsert({
      where: { messageId_profileId: { messageId, profileId: q.profileId } },
      create: { messageId, profileId: q.profileId },
      update: {},
    });
  }

  /**
   * Mensajes con avisos y aún visibles, de todas las comunidades, para la mesa. Es la única
   * lectura del chat fuera de la sala y solo alcanza a los mensajes que un miembro señaló: sin
   * ella, en una comunidad sin coordinación un aviso no llegaría a nadie. No lleva nombres.
   */
  async avisosParaMesa(q: Quien): Promise<ChatAvisoMesa[]> {
    if (!(await this.forums.esMesa(q.profileId))) throw new ForbiddenException(SOLO_MESA);
    const filas = await this.prisma.chatMessage.findMany({
      where: { hidden: false, deletedAt: null, body: { not: null }, avisos: { some: {} } },
      orderBy: { createdAt: 'desc' },
      take: MAX_AVISOS_MESA,
      select: {
        id: true,
        body: true,
        createdAt: true,
        group: { select: { id: true, name: true } },
        _count: { select: { avisos: true } },
      },
    });
    return filas.map((f) => ({
      id: f.id,
      texto: f.body ?? '',
      comunidad: f.group.name,
      groupId: f.group.id,
      avisos: f._count.avisos,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  /**
   * Sus comunidades con sala y, en cada una, cuántos mensajes de otras personas (visibles) son
   * posteriores a su última lectura. Son pocas comunidades por persona: una cuenta por cada una.
   */
  async novedades(q: Quien): Promise<ChatNovedades> {
    if (!(await this.verificado(q.profileId))) return [];
    const membresias = await this.prisma.groupMembership.findMany({
      where: { profileId: q.profileId, group: { type: { not: 'trabajo' } } },
      select: { groupId: true, group: { select: { name: true } } },
    });
    if (membresias.length === 0) return [];
    const lecturas = await this.prisma.chatLectura.findMany({
      where: { profileId: q.profileId, groupId: { in: membresias.map((m) => m.groupId) } },
    });
    return Promise.all(
      membresias.map(async (m) => {
        const leido = lecturas.find((l) => l.groupId === m.groupId)?.lastReadAt ?? null;
        const sinLeer = await this.prisma.chatMessage.count({
          where: {
            groupId: m.groupId,
            deletedAt: null,
            hidden: false,
            OR: [{ authorProfileId: null }, { authorProfileId: { not: q.profileId } }],
            ...(leido ? { createdAt: { gt: leido } } : {}),
          },
        });
        return { groupId: m.groupId, nombre: m.group.name, sinLeer };
      }),
    );
  }

  /**
   * Borra los mensajes más viejos que la regla «chat.conservacion_dias», en tandas. Un mensaje con
   * una solicitud de moderación o una apelación sin resolver espera: su texto todavía hace falta.
   * Con cada mensaje se va también lo que lo cita (el detalle de la moderación y el texto de la
   * apelación), y las marcas de lectura igual de viejas.
   */
  async limpiar(ahora: Date): Promise<number> {
    const dias = await this.rules.getInt('chat.conservacion_dias', null);
    const limite = new Date(ahora.getTime() - dias * 24 * 3600_000);
    let total = 0;
    for (;;) {
      const tanda = await this.prisma.$transaction(async (tx) => {
        // Dentro de la transacción: una apelación que llega a la vez no pierde su mensaje.
        const abiertas = await tx.moderationAction.findMany({
          where: { target: 'mensaje', status: { in: [...MODERACION_ABIERTA] } },
          select: { targetId: true },
        });
        const vencidos = await tx.chatMessage.findMany({
          where: { createdAt: { lt: limite }, id: { notIn: abiertas.map((a) => a.targetId) } },
          select: { id: true },
          take: TANDA_LIMPIEZA,
        });
        if (vencidos.length === 0) return 0;
        const ids = vencidos.map((v) => v.id);
        await tx.moderationAction.updateMany({
          where: { target: 'mensaje', targetId: { in: ids } },
          data: { reason: '', appealText: null },
        });
        return (await tx.chatMessage.deleteMany({ where: { id: { in: ids } } })).count;
      });
      total += tanda;
      if (tanda < TANDA_LIMPIEZA) break;
    }
    await this.prisma.chatLectura.deleteMany({ where: { lastReadAt: { lt: limite } } });
    return total;
  }

  /** 429 si la persona pasa de 10 por minuto. Si Redis falla o tarda, se permite. */
  private async frenar(que: 'envio' | 'aviso', profileId: string): Promise<void> {
    const minuto = Math.floor(Date.now() / 60_000);
    const perfil = createHash('sha256').update(profileId).digest('hex');
    const n = await conLimite(
      Promise.resolve().then(() => this.redis.contar(`chat:${que}:${perfil}:${minuto.toString()}`, 120)),
      REDIS_MAXIMO_MS,
    );
    if (n !== null && n > MAX_POR_MINUTO) throw new HttpException(MUY_RAPIDO, HttpStatus.TOO_MANY_REQUESTS);
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

  /**
   * Solo el hecho y la comunidad: sin texto, sin persona y sin IP. La auditoría la lee cualquier
   * miembro verificado; con el nombre, sería un registro de quién escribe en cada territorio y cuándo.
   */
  private auditar(action: string, groupId: string): void {
    void this.audit
      .log({ action, resource: `group:${groupId}` })
      .catch((err: unknown) => this.logger.error(`Audit log failed: ${err instanceof Error ? err.name : 'error'}`));
  }
}
