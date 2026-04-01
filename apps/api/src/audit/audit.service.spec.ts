/**
 * Unit tests de AuditService — métodos de lectura pública.
 *
 * Estrategia:
 * - Instanciación directa — sin DI de NestJS.
 * - PrismaService y ConfigService mockeados con vi.fn().
 * - audit.log() ya probado implícitamente vía otros módulos;
 *   este archivo cubre getEvents() y getEventById().
 */

import 'reflect-metadata';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EVENT_ID = 'event-uuid-1';

const mockEvent = {
  id: EVENT_ID,
  createdAt: new Date('2026-01-15T10:00:00Z'),
  action: 'proposal.created',
  resource: 'proposal:proposal-uuid-1',
  metadata: { groupId: 'group-uuid-1' },
  actor: { profile: { displayName: 'Ana García' } },
};

const mockEventNoActor = {
  id: 'event-uuid-2',
  createdAt: new Date('2026-01-15T11:00:00Z'),
  action: 'user.login',
  resource: 'user:user-uuid-1',
  metadata: null,
  actor: null,
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    auditEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  };
}

function buildConfigMock() {
  return {
    get: vi.fn().mockReturnValue('test-salt'),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let config: ReturnType<typeof buildConfigMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = buildPrismaMock();
    config = buildConfigMock();
    service = new AuditService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  // ─── getEvents ────────────────────────────────────────────────────────────

  describe('getEvents', () => {
    it('devuelve lista paginada con valores por defecto', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([mockEvent, mockEventNoActor]);
      prisma.auditEvent.count.mockResolvedValue(2);

      const result = await service.getEvents({});

      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });

    it('mapea correctamente los campos del evento con actor', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.auditEvent.count.mockResolvedValue(1);

      const result = await service.getEvents({});
      const event = result.events[0]!;

      expect(event.id).toBe(EVENT_ID);
      expect(event.createdAt).toBe('2026-01-15T10:00:00.000Z');
      expect(event.action).toBe('proposal.created');
      expect(event.resource).toBe('proposal:proposal-uuid-1');
      expect(event.actorDisplayName).toBe('Ana García');
      expect(event.metadata).toEqual({ groupId: 'group-uuid-1' });
    });

    it('expone actorDisplayName como null cuando no hay actor', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([mockEventNoActor]);
      prisma.auditEvent.count.mockResolvedValue(1);

      const result = await service.getEvents({});

      expect(result.events[0]!.actorDisplayName).toBeNull();
    });

    it('aplica paginación correctamente en página 2', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([]);
      prisma.auditEvent.count.mockResolvedValue(75);

      await service.getEvents({ page: 2, limit: 25 });

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 25, take: 25 }),
      );
    });

    it('limita a 100 eventos por página aunque se pida más', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([]);
      prisma.auditEvent.count.mockResolvedValue(0);

      await service.getEvents({ limit: 999 });

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('filtra por prefijo de action', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.auditEvent.count.mockResolvedValue(1);

      await service.getEvents({ action: 'proposal.' });

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: { startsWith: 'proposal.' },
          }),
        }),
      );
    });

    it('filtra por resource exacto', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.auditEvent.count.mockResolvedValue(1);

      await service.getEvents({ resource: 'proposal:proposal-uuid-1' });

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resource: 'proposal:proposal-uuid-1',
          }),
        }),
      );
    });

    it('filtra por rango de fechas', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([]);
      prisma.auditEvent.count.mockResolvedValue(0);

      await service.getEvents({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
      });

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: new Date('2026-01-01T00:00:00Z'),
              lte: new Date('2026-01-31T23:59:59Z'),
            }),
          }),
        }),
      );
    });

    it('no incluye ipHash ni actorId en la respuesta', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.auditEvent.count.mockResolvedValue(1);

      const result = await service.getEvents({});
      const event = result.events[0]!;

      expect(event).not.toHaveProperty('ipHash');
      expect(event).not.toHaveProperty('payloadHash');
      expect(event).not.toHaveProperty('actorId');
    });
  });

  // ─── getEventById ─────────────────────────────────────────────────────────

  describe('getEventById', () => {
    it('devuelve el evento cuando existe', async () => {
      prisma.auditEvent.findUnique.mockResolvedValue(mockEvent);

      const result = await service.getEventById(EVENT_ID);

      expect(result.id).toBe(EVENT_ID);
      expect(result.action).toBe('proposal.created');
      expect(result.actorDisplayName).toBe('Ana García');
    });

    it('lanza NotFoundException si el evento no existe', async () => {
      prisma.auditEvent.findUnique.mockResolvedValue(null);

      await expect(service.getEventById('nonexistent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('no incluye campos sensibles en el detalle', async () => {
      prisma.auditEvent.findUnique.mockResolvedValue(mockEvent);

      const result = await service.getEventById(EVENT_ID);

      expect(result).not.toHaveProperty('ipHash');
      expect(result).not.toHaveProperty('payloadHash');
      expect(result).not.toHaveProperty('actorId');
    });
  });
});
