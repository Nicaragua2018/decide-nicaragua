/**
 * Unit tests de SortitionService.
 *
 * Estrategia:
 * - Instanciación directa — sin DI de NestJS.
 * - El algoritmo de sortition se ejecuta realmente (cubierto por sortition-algorithm.spec.ts).
 * - PrismaService y AuditService mockeados con vi.fn().
 */

import 'reflect-metadata';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SortitionStatus } from '@decide/shared';

import { SortitionService } from './sortition.service';
import { selectMembers } from './sortition-algorithm';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GROUP_ID = 'group-uuid-1';
const PROFILE_ID = 'profile-uuid-creator';
const OTHER_PROFILE_ID = 'profile-uuid-other';
const DRAW_ID = 'draw-uuid-1';
const IP = '127.0.0.1';

const FIXED_SEED = 'a'.repeat(64);

const mockDraw = {
  id: DRAW_ID,
  groupId: GROUP_ID,
  createdByProfileId: PROFILE_ID,
  title: 'Sorteo de prueba',
  description: null,
  selectionSize: 2,
  status: 'pending',
  seed: null,
  algorithm: null,
  poolSnapshot: null,
  executedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  selectedMembers: [],
};

// Computar los IDs reales con el algoritmo para que el fixture sea correcto
const COMPLETED_POOL = ['profile-a', 'profile-b', 'profile-c'];
const ACTUAL_SELECTED_IDS = selectMembers(COMPLETED_POOL, 2, FIXED_SEED);

const mockCompletedDraw = {
  ...mockDraw,
  status: 'completed',
  seed: FIXED_SEED,
  algorithm: 'fisher-yates-sha256-v1',
  poolSnapshot: COMPLETED_POOL,
  executedAt: new Date('2026-01-02'),
  selectedMembers: ACTUAL_SELECTED_IDS.map((profileId, i) => ({
    profileId,
    selectionOrder: i + 1,
    profile: { displayName: `Usuario ${profileId}` },
  })),
};

const mockMembership = { groupId: GROUP_ID, profileId: PROFILE_ID };

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    sortitionDraw: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    sortitionMember: {
      create: vi.fn(),
    },
    groupMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function buildAuditMock() {
  return { log: vi.fn() };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SortitionService', () => {
  let service: SortitionService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let audit: ReturnType<typeof buildAuditMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = buildPrismaMock();
    audit = buildAuditMock();
    audit.log.mockResolvedValue(undefined);
    prisma.profile.findUnique.mockResolvedValue({ userId: 'user-uuid-1' });
    service = new SortitionService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  // ─── createDraw ───────────────────────────────────────────────────────────

  describe('createDraw', () => {
    const dto = { title: 'Sorteo de prueba MVP', selectionSize: 3 };

    it('crea un sorteo cuando el usuario es miembro', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);
      prisma.sortitionDraw.create.mockResolvedValue({ id: DRAW_ID });

      const result = await service.createDraw(GROUP_ID, dto, PROFILE_ID, IP);

      expect(result).toEqual({ id: DRAW_ID });
      expect(prisma.sortitionDraw.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            groupId: GROUP_ID,
            createdByProfileId: PROFILE_ID,
            selectionSize: 3,
          }),
        }),
      );
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.createDraw(GROUP_ID, dto, PROFILE_ID, IP)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── getDrawById ──────────────────────────────────────────────────────────

  describe('getDrawById', () => {
    it('devuelve el detalle del sorteo pendiente', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue({ ...mockDraw, selectedMembers: [] });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.getDrawById(DRAW_ID, PROFILE_ID);

      expect(result.id).toBe(DRAW_ID);
      expect(result.status).toBe(SortitionStatus.pending);
      expect(result.seed).toBeNull();
      expect(result.selectedMembers).toHaveLength(0);
    });

    it('devuelve miembros seleccionados en un sorteo completado', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockCompletedDraw);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.getDrawById(DRAW_ID, PROFILE_ID);

      expect(result.status).toBe(SortitionStatus.completed);
      expect(result.selectedMembers).toHaveLength(2);
      expect(result.seed).toBe(FIXED_SEED);
      expect(result.poolSize).toBe(3);
    });

    it('lanza NotFoundException si el sorteo no existe', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(null);

      await expect(service.getDrawById(DRAW_ID, PROFILE_ID)).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue({ ...mockDraw, selectedMembers: [] });
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.getDrawById(DRAW_ID, PROFILE_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── executeDraw ──────────────────────────────────────────────────────────

  describe('executeDraw', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const txMock = {
            sortitionDraw: { update: vi.fn().mockResolvedValue({}) },
            sortitionMember: { create: vi.fn().mockResolvedValue({}) },
          };
          return fn(txMock);
        },
      );
    });

    it('ejecuta el sorteo y llama a $transaction', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockDraw);
      prisma.groupMembership.findMany.mockResolvedValue([
        { profileId: 'profile-a' },
        { profileId: 'profile-b' },
        { profileId: 'profile-c' },
      ]);

      await service.executeDraw(DRAW_ID, PROFILE_ID, IP);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('lanza ForbiddenException si quien ejecuta no es el creador', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockDraw);

      await expect(service.executeDraw(DRAW_ID, OTHER_PROFILE_ID, IP)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza BadRequestException si el sorteo no está pendiente', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue({
        ...mockDraw,
        status: 'completed',
      });

      await expect(service.executeDraw(DRAW_ID, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el grupo no tiene miembros', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockDraw);
      prisma.groupMembership.findMany.mockResolvedValue([]);

      await expect(service.executeDraw(DRAW_ID, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── cancelDraw ───────────────────────────────────────────────────────────

  describe('cancelDraw', () => {
    it('el creador puede cancelar un sorteo pendiente', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockDraw);
      prisma.sortitionDraw.update.mockResolvedValue({});

      await service.cancelDraw(DRAW_ID, PROFILE_ID, IP);

      expect(prisma.sortitionDraw.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: SortitionStatus.cancelled },
        }),
      );
    });

    it('lanza ForbiddenException si quien cancela no es el creador', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockDraw);

      await expect(service.cancelDraw(DRAW_ID, OTHER_PROFILE_ID, IP)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza BadRequestException si el sorteo ya fue ejecutado', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue({
        ...mockDraw,
        status: 'completed',
      });

      await expect(service.cancelDraw(DRAW_ID, PROFILE_ID, IP)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── verifyDraw ───────────────────────────────────────────────────────────

  describe('verifyDraw', () => {
    it('verifica correctamente un sorteo completado', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockCompletedDraw);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.verifyDraw(DRAW_ID, PROFILE_ID);

      expect(result.verified).toBe(true);
      expect(result.seed).toBe(FIXED_SEED);
      expect(result.algorithm).toBe('fisher-yates-sha256-v1');
      expect(result.storedIds).toHaveLength(2);
      expect(result.recomputedIds).toHaveLength(2);
      expect(result.storedIds).toEqual(result.recomputedIds);
    });

    it('detecta manipulación en el resultado almacenado', async () => {
      // Sustituir los IDs seleccionados por IDs en orden inverso
      // (si hay un solo ID, sustituir por uno que no existe en el pool)
      const reversedIds = [...ACTUAL_SELECTED_IDS].reverse();
      const isTampered = reversedIds.some((id, i) => id !== ACTUAL_SELECTED_IDS[i]);

      // Si los IDs en orden inverso son iguales (pool de 1 o empate), forzar un ID inválido
      const tamperedIds = isTampered
        ? reversedIds
        : ['profile-not-in-pool', ...ACTUAL_SELECTED_IDS.slice(1)];

      const tamperedDraw = {
        ...mockCompletedDraw,
        selectedMembers: tamperedIds.map((profileId, i) => ({
          profileId,
          selectionOrder: i + 1,
          profile: { displayName: profileId },
        })),
      };
      prisma.sortitionDraw.findUnique.mockResolvedValue(tamperedDraw);
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      const result = await service.verifyDraw(DRAW_ID, PROFILE_ID);

      expect(result.verified).toBe(false);
    });

    it('lanza BadRequestException si el sorteo no está completado', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue({ ...mockDraw, selectedMembers: [] });
      prisma.groupMembership.findUnique.mockResolvedValue(mockMembership);

      await expect(service.verifyDraw(DRAW_ID, PROFILE_ID)).rejects.toThrow(BadRequestException);
    });

    it('lanza ForbiddenException si el usuario no es miembro', async () => {
      prisma.sortitionDraw.findUnique.mockResolvedValue(mockCompletedDraw);
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.verifyDraw(DRAW_ID, PROFILE_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});
