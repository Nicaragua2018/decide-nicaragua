import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { REACTIVACION_ESPERA_DIAS, type CasoSuspension } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Propósito del token: lo distingue de una sesión (JwtStrategy rechaza cualquier token con propósito). */
export const PROPOSITO_REACTIVACION = 'reactivacion';
const TOKEN_DURACION = '30m';
const TEXTO_MIN = 10;
const DIA_MS = 24 * 60 * 60 * 1000;
const SIN_MOTIVO = 'La mesa no dejó un motivo.';
const TOKEN_INVALIDO = 'Este enlace ya no sirve. Vuelve a entrar con tu contraseña.';

interface Contexto {
  userId: string;
  suspension: { motivo: string; suspendidaAt: Date; porLaMesa: boolean };
  solicitudes: { estado: string; motivoRechazo: string | null; createdAt: Date; resueltaAt: Date | null }[];
}

/**
 * Reactivación de una cuenta suspendida (3C-2). Quien entra con su contraseña correcta y está
 * suspendida recibe un token corto (30 min) que solo sirve aquí: ver por qué se la suspendió y
 * pedir a la mesa que la reactive. La mesa resuelve con 2 de 3 (BoardService).
 */
@Injectable()
export class ReactivacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Mismo secreto que el token de acceso; el propósito impide usarlo como sesión. */
  firmarToken(userId: string): string {
    return this.jwt.sign({ sub: userId, proposito: PROPOSITO_REACTIVACION }, { expiresIn: TOKEN_DURACION });
  }

  /** Devuelve el userId. 401 si el token no vale, no es de reactivación o la cuenta ya no está suspendida. */
  async verificarToken(token: string): Promise<string> {
    let payload: { sub?: unknown; proposito?: unknown };
    try {
      payload = this.jwt.verify<{ sub?: unknown; proposito?: unknown }>(token);
    } catch {
      throw new UnauthorizedException(TOKEN_INVALIDO);
    }
    if (payload.proposito !== PROPOSITO_REACTIVACION || typeof payload.sub !== 'string') {
      throw new UnauthorizedException(TOKEN_INVALIDO);
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, status: true } });
    if (!user || (user.status as string) !== 'suspended') throw new UnauthorizedException(TOKEN_INVALIDO);
    return user.id;
  }

  async caso(token: string, now: Date = new Date()): Promise<CasoSuspension> {
    return this.vista(await this.contexto(await this.verificarToken(token)), now);
  }

  async pedir(token: string, texto: string, now: Date = new Date()): Promise<CasoSuspension> {
    const userId = await this.verificarToken(token);
    const limpio = texto.trim();
    if (limpio.length < TEXTO_MIN) {
      throw new BadRequestException(`Escribe al menos ${TEXTO_MIN.toString()} caracteres.`);
    }
    const pendiente = await this.prisma.solicitudReactivacion.findFirst({
      where: { userId, estado: 'pendiente' },
      select: { id: true },
    });
    if (pendiente) throw new ConflictException('Ya tienes un pedido pendiente.');

    const ctx = await this.contexto(userId);
    const desde = this.puedePedirDesde(ctx, now);
    if (desde) {
      throw new ConflictException(
        `Tras un rechazo hay que esperar ${REACTIVACION_ESPERA_DIAS.toString()} días. Podrás pedirlo de nuevo desde el ${fecha(desde)}.`,
      );
    }

    let solicitud: { id: string };
    try {
      solicitud = await this.prisma.solicitudReactivacion.create({ data: { userId, texto: limpio, createdAt: now } });
    } catch (err) {
      // Índice único parcial: un solo pedido pendiente por persona (dos envíos a la vez).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya tienes un pedido pendiente.');
      }
      throw err;
    }
    // Sin el texto: lo lee solo la mesa.
    void this.audit.log({
      actorId: userId,
      action: 'reactivacion.pedida',
      resource: `user:${userId}`,
      metadata: { solicitudId: solicitud.id },
    });
    return this.vista(await this.contexto(userId), now);
  }

  /** La última suspensión de la mesa y las solicitudes hechas desde entonces (las anteriores son de otro caso). */
  private async contexto(userId: string): Promise<Contexto> {
    const [accion, user] = await Promise.all([
      this.prisma.boardAction.findFirst({
        where: { type: 'suspend_user', targetUserId: userId, status: 'executed' },
        orderBy: { resolvedAt: 'desc' },
        select: { reason: true, resolvedAt: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { updatedAt: true } }),
    ]);
    const suspension = accion?.resolvedAt
      ? { motivo: accion.reason, suspendidaAt: accion.resolvedAt, porLaMesa: true }
      : { motivo: accion?.reason ?? SIN_MOTIVO, suspendidaAt: user?.updatedAt ?? new Date(0), porLaMesa: false };
    const solicitudes = await this.prisma.solicitudReactivacion.findMany({
      where: { userId, ...(suspension.porLaMesa ? { createdAt: { gte: suspension.suspendidaAt } } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { estado: true, motivoRechazo: true, createdAt: true, resueltaAt: true },
    });
    return { userId, suspension, solicitudes: solicitudes.map((s) => ({ ...s, estado: s.estado as string })) };
  }

  private puedePedirDesde(ctx: Contexto, now: Date): Date | null {
    const rechazo = ctx.solicitudes.find((s) => s.estado === 'rechazada' && s.resueltaAt);
    if (!rechazo?.resueltaAt) return null;
    const desde = new Date(rechazo.resueltaAt.getTime() + REACTIVACION_ESPERA_DIAS * DIA_MS);
    return desde > now ? desde : null;
  }

  private vista(ctx: Contexto, now: Date): CasoSuspension {
    const ultima = ctx.solicitudes[0];
    return {
      motivo: ctx.suspension.motivo,
      suspendidaAt: ctx.suspension.suspendidaAt.toISOString(),
      solicitud: ultima
        ? {
            estado: ultima.estado as 'pendiente' | 'aprobada' | 'rechazada',
            motivoRechazo: ultima.motivoRechazo,
            createdAt: ultima.createdAt.toISOString(),
          }
        : null,
      puedePedirDesde: this.puedePedirDesde(ctx, now)?.toISOString() ?? null,
    };
  }
}

function fecha(d: Date): string {
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Managua' });
}
