import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashIp, hashPayload } from '../common/utils/hash.util';
import { ConfigService } from '@nestjs/config';
import type { AuditEventSummary, AuditListResponse } from '@decide/shared';
import type { QueryAuditEventsDto } from './dto/query-events.dto';

export interface AuditEventParams {
  /** ID del usuario que realiza la acción. Null para eventos de sistema. */
  actorId?: string;
  /** Tipo de evento. Formato: "dominio.accion" (ej: "user.login") */
  action: string;
  /** Recurso afectado. Formato: "tipo:id" (ej: "user:uuid") */
  resource?: string;
  /** IP del cliente (se almacenará como hash) */
  ip?: string;
  /** Payload completo del evento (se almacenará como hash para integridad) */
  payload?: unknown;
  /** Metadatos no sensibles del contexto */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registra un evento en el audit log append-only.
   *
   * Nunca lanza excepción: un fallo en la auditoría no debe
   * interrumpir el flujo de negocio. El error se loguea internamente.
   * En Fase 2 esto se hará vía cola BullMQ para mayor durabilidad.
   */
  async log(params: AuditEventParams): Promise<void> {
    try {
      const salt = this.config.getOrThrow<string>('IP_HASH_SALT');

      await this.prisma.auditEvent.create({
        data: {
          actorId: params.actorId ?? null,
          action: params.action,
          resource: params.resource ?? null,
          ipHash: params.ip ? hashIp(params.ip, salt) : null,
          payloadHash: params.payload ? hashPayload(params.payload) : null,
          // Prisma requiere cast explícito para campos Json? y Prisma.DbNull para null
          metadata: params.metadata !== undefined
            ? (params.metadata as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });
    } catch (err) {
      // Loguear sin relanzar: la auditoría no debe bloquear el request
      this.logger.error(`Failed to write audit event [${params.action}]`, err);
    }
  }

  // ─── Lectura pública ────────────────────────────────────────────────────────

  /**
   * Devuelve una lista paginada de eventos de auditoría.
   *
   * Campos sensibles (ipHash, payloadHash, actorId) excluidos de la respuesta.
   * El actor se expone solo como displayName del perfil.
   */
  async getEvents(dto: QueryAuditEventsDto): Promise<AuditListResponse> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where = this.buildWhere(dto);

    const [rows, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          createdAt: true,
          action: true,
          resource: true,
          metadata: true,
          actor: {
            select: {
              profile: { select: { displayName: true } },
            },
          },
        },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    const events: AuditEventSummary[] = rows.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      action: e.action,
      resource: e.resource,
      actorDisplayName: e.actor?.profile?.displayName ?? null,
      metadata: e.metadata as Record<string, unknown> | null,
    }));

    return { events, total, page, limit };
  }

  /**
   * Devuelve el detalle de un único evento de auditoría.
   * Lanza NotFoundException si no existe.
   */
  async getEventById(id: string): Promise<AuditEventSummary> {
    const event = await this.prisma.auditEvent.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        action: true,
        resource: true,
        metadata: true,
        actor: {
          select: {
            profile: { select: { displayName: true } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Audit event ${id} not found`);
    }

    return {
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      action: event.action,
      resource: event.resource,
      actorDisplayName: event.actor?.profile?.displayName ?? null,
      metadata: event.metadata as Record<string, unknown> | null,
    };
  }

  // ─── Privados ───────────────────────────────────────────────────────────────

  private buildWhere(dto: QueryAuditEventsDto): Prisma.AuditEventWhereInput {
    const where: Prisma.AuditEventWhereInput = {};

    if (dto.action) {
      // Prefix o match exacto: "user." filtra user.login, user.invited, etc.
      where.action = { startsWith: dto.action };
    }

    if (dto.resource) {
      where.resource = dto.resource;
    }

    if (dto.from ?? dto.to) {
      where.createdAt = {
        ...(dto.from ? { gte: new Date(dto.from) } : {}),
        ...(dto.to ? { lte: new Date(dto.to) } : {}),
      };
    }

    return where;
  }
}
