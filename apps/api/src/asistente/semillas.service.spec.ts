import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import { CUERPO_SEMILLA, MARCA_SEMILLAS, PREGUNTAS_INICIALES } from './semillas';
import { SemillasService } from './semillas.service';

const AHORA = new Date('2026-11-09T12:00:00Z');
const GENERAL = { id: 'g-general', type: 'custom', slug: GENERAL_GROUP_SLUG, isActive: true };

describe('PREGUNTAS_INICIALES', () => {
  it('tiene 12 preguntas, cada una empieza con «¿», termina con «?» y mide como mucho 200 caracteres', () => {
    expect(PREGUNTAS_INICIALES).toHaveLength(12);
    for (const p of PREGUNTAS_INICIALES) {
      expect(p.startsWith('¿')).toBe(true);
      expect(p.endsWith('?')).toBe(true);
      expect(p.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('SemillasService', () => {
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let asistente: { estado: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: SemillasService;

  beforeEach(() => {
    tx = {
      marcaAsistente: { create: vi.fn().mockResolvedValue({}) },
      inquietud: { createMany: vi.fn().mockResolvedValue({ count: 12 }) },
    };
    prisma = {
      marcaAsistente: { findUnique: vi.fn().mockResolvedValue(null) },
      group: { findFirst: vi.fn().mockResolvedValue(GENERAL) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    asistente = { estado: vi.fn().mockResolvedValue({ activo: true, topeAlcanzado: false }) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new SemillasService(prisma as never, asistente as never, audit as never);
  });

  it('siembra las 12 en el nivel general con origen asistente y sin autor', async () => {
    expect(await service.sembrar(AHORA)).toBe(12);
    const { data } = tx.inquietud.createMany.mock.calls[0][0];
    expect(data).toHaveLength(12);
    data.forEach((fila: any, i: number) => {
      expect(fila).toMatchObject({
        groupId: 'g-general',
        authorProfileId: null,
        origen: 'asistente',
        title: PREGUNTAS_INICIALES[i],
        body: CUERPO_SEMILLA,
      });
    });
    expect(tx.marcaAsistente.create).toHaveBeenCalledWith({ data: { clave: MARCA_SEMILLAS } });
  });

  it('no siembra dos veces', async () => {
    prisma.marcaAsistente.findUnique.mockResolvedValue({ clave: MARCA_SEMILLAS });
    expect(await service.sembrar(AHORA)).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.inquietud.createMany).not.toHaveBeenCalled();
  });

  it('no siembra con el asistente apagado', async () => {
    asistente.estado.mockResolvedValue({ activo: false, topeAlcanzado: false });
    expect(await service.sembrar(AHORA)).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([null, { ...GENERAL, isActive: false }])('no siembra sin nivel general activo (%j)', async (grupo) => {
    prisma.group.findFirst.mockResolvedValue(grupo);
    expect(await service.sembrar(AHORA)).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('una carrera entre dos procesos no duplica', async () => {
    tx.marcaAsistente.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.sembrar(AHORA)).toBe(0);
    expect(tx.inquietud.createMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('audita sin texto', async () => {
    await service.sembrar(AHORA);
    expect(audit.log).toHaveBeenCalledWith({
      action: 'asistente.semillas_sembradas',
      resource: `marca_asistente:${MARCA_SEMILLAS}`,
      metadata: { cantidad: 12 },
    });
  });
});
