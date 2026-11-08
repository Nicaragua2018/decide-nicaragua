import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AsistenteController } from './asistente.controller';
import { SugerenciasService } from './sugerencias.service';

const G = '11111111-1111-4111-8111-111111111111';
const T = '33333333-3333-4333-8333-333333333333';
const YO = '22222222-2222-4222-8222-222222222222';
const AUTOR = '99999999-9999-4999-8999-999999999999';
const I1 = 'a0000000-0000-4000-8000-000000000001';
const I2 = 'a0000000-0000-4000-8000-000000000002';
const I3 = 'a0000000-0000-4000-8000-000000000003';
const F1 = 'f0000000-0000-4000-8000-000000000001';
const F2 = 'f0000000-0000-4000-8000-000000000002';
const BASE = { at: '2026-11-07T00:00:00.000Z', frases: 10, opiniones: 6 };
const FUTURO = new Date(Date.now() + 86_400_000);
const PASADO = new Date(Date.now() - 86_400_000);

function fila(tipo: string, objetoId: string, contenido: object, extra: Record<string, unknown> = {}) {
  return { id: 's1', tipo, objetoId, groupId: G, contenido, base: BASE, final: false, createdAt: PASADO, updatedAt: PASADO, ...extra };
}

describe('SugerenciasService', () => {
  let prisma: Record<string, any>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let access: { requireReader: ReturnType<typeof vi.fn> };
  let forums: { canOrganize: ReturnType<typeof vi.fn> };
  let service: SugerenciasService;

  beforeEach(() => {
    prisma = {
      sugerenciaAsistente: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}), update: vi.fn() },
      inquietud: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
      proposal: {
        findUnique: vi.fn().mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: false, deliberationEndsAt: FUTURO, decision: null }),
      },
      frase: { findMany: vi.fn().mockResolvedValue([]) },
      fraseVoto: { count: vi.fn().mockResolvedValue(5) },
    };
    audit = { log: vi.fn() };
    access = { requireReader: vi.fn().mockResolvedValue({ participa: true }) };
    forums = { canOrganize: vi.fn().mockResolvedValue(true) };
    service = new SugerenciasService(prisma as never, audit as never, access as never, forums as never);
  });

  describe('guardar', () => {
    it('guardar hace upsert y no pisa una fila final', async () => {
      await service.guardar('presentacion', T, G, { presentacion: 'x' }, BASE);
      expect(prisma.sugerenciaAsistente.upsert).toHaveBeenCalledTimes(1);
      const args = prisma.sugerenciaAsistente.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ tipo_objetoId: { tipo: 'presentacion', objetoId: T } });
      expect(args.create).toMatchObject({ tipo: 'presentacion', objetoId: T, groupId: G, final: false });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'asistente.sugerencia_guardada', metadata: { tipo: 'presentacion', objetoId: T } }),
      );

      prisma.sugerenciaAsistente.upsert.mockClear();
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue({ final: true });
      await service.guardar('presentacion', T, G, { presentacion: 'y' }, BASE);
      expect(prisma.sugerenciaAsistente.upsert).not.toHaveBeenCalled();
    });
  });

  describe('agrupar', () => {
    const contenido = {
      grupos: [
        { titulo: 'A', descripcion: 'da', inquietudIds: [I1, I2] },
        { titulo: 'B', descripcion: 'db', inquietudIds: [I3, I2] },
      ],
    };

    it('agrupar: quita inquietudes ocultas o ya debatidas y descarta grupos con menos de 2', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('agrupar', G, contenido));
      // I3 ya no está visible/abierta: el grupo B queda con 1 y desaparece.
      prisma.inquietud.findMany.mockResolvedValue([
        { id: I1, title: 'Uno' },
        { id: I2, title: 'Dos' },
      ]);
      const v = await service.ver(YO, 'agrupar', G);
      const where = prisma.inquietud.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ hidden: false, groupId: G, status: { in: ['abierta', 'en_plazo'] } });
      expect(v).toMatchObject({ tipo: 'agrupar', final: false });
      expect((v as any).contenido.grupos).toEqual([
        { titulo: 'A', descripcion: 'da', inquietudes: [{ id: I1, title: 'Uno' }, { id: I2, title: 'Dos' }] },
      ]);
    });

    it('agrupar: null si no queda ningún grupo', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('agrupar', G, contenido));
      prisma.inquietud.findMany.mockResolvedValue([{ id: I1, title: 'Uno' }]);
      expect(await service.ver(YO, 'agrupar', G)).toBeNull();
    });

    it('agrupar: 403 a quien no organiza', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('agrupar', G, contenido));
      forums.canOrganize.mockResolvedValue(false);
      await expect(service.ver(YO, 'agrupar', G)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('umbral', () => {
    it('umbral: null si la inquietud ya fue respondida', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('umbral', I1, { resumen: 'r', borradorRespuesta: 'b' }));
      prisma.inquietud.findUnique.mockResolvedValue({ hidden: false, status: 'respondida' });
      expect(await service.ver(YO, 'umbral', I1)).toBeNull();
      prisma.inquietud.findUnique.mockResolvedValue({ hidden: false, status: 'en_plazo' });
      expect(await service.ver(YO, 'umbral', I1)).toMatchObject({ tipo: 'umbral', contenido: { resumen: 'r', borradorRespuesta: 'b' } });
    });
  });

  describe('mapa', () => {
    const contenido = {
      resumen: 'res',
      grupos: [{ nombre: 'G1', tamano: 5, piensa: 'p', citaIds: [F1, F2] }],
      puentes: { texto: 'pt', citaIds: [F1] },
    };

    it('mapa: 204/null a quien votó menos de 3 frases con el debate abierto', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('mapa', T, contenido));
      prisma.fraseVoto.count.mockResolvedValue(2);
      expect(await service.ver(YO, 'mapa', T)).toBeNull();
      expect(prisma.fraseVoto.count.mock.calls[0][0].where).toMatchObject({ profileId: YO, frase: { proposalId: T, hidden: false } });
      // Quien solo lee tampoco lo ve con el debate abierto.
      access.requireReader.mockResolvedValue({ participa: false });
      prisma.fraseVoto.count.mockResolvedValue(9);
      expect(await service.ver(YO, 'mapa', T)).toBeNull();
    });

    it('mapa: visible con 3 o más votos', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('mapa', T, contenido));
      prisma.fraseVoto.count.mockResolvedValue(3);
      prisma.frase.findMany.mockResolvedValue([{ id: F1, text: 'uno' }]);
      expect(await service.ver(YO, 'mapa', T)).toMatchObject({ tipo: 'mapa', proposalId: T });
    });

    it('mapa: visible a cualquier lector con fila final', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('mapa', T, contenido, { final: true }));
      access.requireReader.mockResolvedValue({ participa: false });
      prisma.fraseVoto.count.mockResolvedValue(0);
      prisma.frase.findMany.mockResolvedValue([{ id: F1, text: 'uno' }, { id: F2, text: 'dos' }]);
      const v = (await service.ver(YO, 'mapa', T)) as any;
      expect(v.final).toBe(true);
      expect(v.contenido.grupos[0].citas).toEqual(['uno', 'dos']);
      expect(v.contenido.puentes.citas).toEqual(['uno']);
      expect(prisma.fraseVoto.count).not.toHaveBeenCalled();
    });

    it('mapa: visible a cualquier lector cuando el debate terminó', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('mapa', T, contenido));
      access.requireReader.mockResolvedValue({ participa: false });
      for (const tema of [
        { deliberationEndsAt: PASADO, decision: null, status: 'open' },
        { deliberationEndsAt: FUTURO, decision: { id: 'd' }, status: 'open' },
        { deliberationEndsAt: FUTURO, decision: null, status: 'closed' },
      ]) {
        prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, hidden: false, ...tema });
        expect(await service.ver(YO, 'mapa', T)).toMatchObject({ tipo: 'mapa' });
      }
    });

    it('mapa: una frase ocultada después desaparece de las citas', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('mapa', T, contenido, { final: true }));
      prisma.frase.findMany.mockResolvedValue([{ id: F2, text: 'dos' }]); // F1 quedó oculta
      const v = (await service.ver(YO, 'mapa', T)) as any;
      expect(prisma.frase.findMany.mock.calls[0][0].where).toMatchObject({ hidden: false, proposalId: T });
      expect(v.contenido.grupos[0].citas).toEqual(['dos']);
      expect(v.contenido.puentes.citas).toEqual([]);
    });

    it('mapa: 403 a quien no puede leer el tema (bifurcación ajena)', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('mapa', T, contenido, { final: true }));
      access.requireReader.mockRejectedValue(new ForbiddenException('no'));
      await expect(service.ver(YO, 'mapa', T)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('presentacion, borradores y comision', () => {
    it('presentacion: null si el tema está oculto', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('presentacion', T, { presentacion: 'hola' }));
      expect(await service.ver(YO, 'presentacion', T)).toMatchObject({ contenido: { presentacion: 'hola' } });
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, hidden: true, status: 'open', decision: null });
      expect(await service.ver(YO, 'presentacion', T)).toBeNull();
    });

    it('borradores: con índice y estado de adopción', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(
        fila('borradores', T, { borradores: [{ titulo: 'a', descripcion: 'da', adoptado: true }, { titulo: 'b', descripcion: 'db', adoptado: false }] }),
      );
      const v = (await service.ver(YO, 'borradores', T)) as any;
      expect(v.contenido.borradores).toEqual([
        { indice: 0, titulo: 'a', descripcion: 'da', adoptado: true },
        { indice: 1, titulo: 'b', descripcion: 'db', adoptado: false },
      ]);
    });

    it('comision: lo ve quien puede leer el grupo', async () => {
      prisma.sugerenciaAsistente.findUnique.mockResolvedValue(fila('comision', G, { capacidades: ['a'], comentario: 'c' }));
      expect(await service.ver(YO, 'comision', G)).toMatchObject({ contenido: { capacidades: ['a'], comentario: 'c' } });
      expect(access.requireReader).toHaveBeenCalledWith(G, YO);
    });

    it('null si no hay fila', async () => {
      expect(await service.ver(YO, 'presentacion', T)).toBeNull();
    });
  });

  it('la vista nunca contiene ids de persona', async () => {
    const vistas: unknown[] = [];
    prisma.sugerenciaAsistente.findUnique.mockResolvedValueOnce(
      fila('agrupar', G, { grupos: [{ titulo: 'A', descripcion: 'd', inquietudIds: [I1, I2] }] }),
    );
    prisma.inquietud.findMany.mockResolvedValue([{ id: I1, title: 'Uno' }, { id: I2, title: 'Dos' }]);
    vistas.push(await service.ver(YO, 'agrupar', G));
    prisma.sugerenciaAsistente.findUnique.mockResolvedValueOnce(
      fila('mapa', T, { resumen: 'r', grupos: [{ nombre: 'G', tamano: 5, piensa: 'p', citaIds: [F1] }], puentes: { texto: 't', citaIds: [F1] } }, { final: true }),
    );
    prisma.frase.findMany.mockResolvedValue([{ id: F1, text: 'uno', authorProfileId: AUTOR }]);
    vistas.push(await service.ver(YO, 'mapa', T));
    const json = JSON.stringify(vistas);
    expect(json).not.toContain(AUTOR);
    expect(json).not.toContain(YO);
    expect(prisma.frase.findMany.mock.calls[0][0].select).toEqual({ id: true, text: true });
  });

  describe('marcarBorradorAdoptado', () => {
    function tx(contenido: object | null) {
      return {
        $queryRaw: vi.fn().mockResolvedValue([]),
        sugerenciaAsistente: {
          findUnique: vi.fn().mockResolvedValue(contenido ? { id: 's1', contenido } : null),
          update: vi.fn().mockResolvedValue({}),
        },
      };
    }
    const c = { borradores: [{ titulo: 'a', descripcion: 'd', adoptado: false }, { titulo: 'b', descripcion: 'd', adoptado: true }] };

    it('marca el borrador, bloqueando la fila', async () => {
      const t = tx(c);
      expect(await service.marcarBorradorAdoptado(t as never, T, 0)).toBe(true);
      expect(t.$queryRaw).toHaveBeenCalled();
      const data = t.sugerenciaAsistente.update.mock.calls[0]![0].data;
      expect(data.contenido.borradores.map((b: any) => b.adoptado)).toEqual([true, true]);
    });

    it('false si no hay fila, el índice no existe o ya estaba adoptado', async () => {
      expect(await service.marcarBorradorAdoptado(tx(null) as never, T, 0)).toBe(false);
      const t = tx(c);
      expect(await service.marcarBorradorAdoptado(t as never, T, 5)).toBe(false);
      expect(await service.marcarBorradorAdoptado(t as never, T, 1)).toBe(false);
      expect(await service.marcarBorradorAdoptado(t as never, T, -1)).toBe(false);
      expect(t.sugerenciaAsistente.update).not.toHaveBeenCalled();
    });
  });

  describe('endpoint', () => {
    function ctrl(ver: ReturnType<typeof vi.fn>) {
      return new AsistenteController({} as never, {} as never, {} as never, {} as never, {} as never, { ver } as never);
    }
    const user = { sub: 'u', profileId: YO, status: 'verified_citizen' } as never;

    it('204 cuando no hay nada, 200 con la vista, 400 con tipo inválido, 403 sin perfil', async () => {
      const res = { status: vi.fn() };
      const ver = vi.fn().mockResolvedValue(null);
      expect(await ctrl(ver).sugerencia('mapa', T, user, res as never)).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(204);
      ver.mockResolvedValue({ tipo: 'mapa' });
      const res2 = { status: vi.fn() };
      expect(await ctrl(ver).sugerencia('mapa', T, user, res2 as never)).toEqual({ tipo: 'mapa' });
      expect(res2.status).not.toHaveBeenCalled();
      await expect(ctrl(ver).sugerencia('otro', T, user, res as never)).rejects.toThrow();
      await expect(ctrl(ver).sugerencia('mapa', T, { sub: 'u' } as never, res as never)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
