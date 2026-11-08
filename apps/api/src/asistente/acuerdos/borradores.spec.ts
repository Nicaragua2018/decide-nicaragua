import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frases/agregado', async (orig) => ({
  ...(await orig<typeof import('../../frases/agregado')>()),
  agregadoPublico: vi.fn(),
}));

import { agregadoPublico } from '../../frases/agregado';
import { AcuerdosService } from '../acuerdos.service';
import { asistenteMock, redisMock } from '../../test/acuerdos-mock';
import { esSalidaBorradores } from './borradores';

const AHORA = new Date('2026-11-09T12:00:00Z');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const G = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const id = (pre: string, n: number) => `${pre}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FRASES = [1, 2, 3].map((n) => ({ id: id('f', n), text: `Frase visible ${n}` }));

const tema = (extra: Record<string, unknown> = {}) => ({
  id: T,
  groupId: G,
  title: 'Titulo del tema',
  body: 'Cuerpo del tema',
  ...extra,
});

const agregado = (puentes: number) => ({
  participantes: 10,
  grupos: [{ id: 0, tamano: 5 }],
  frases: FRASES.map((f, i) => ({ fraseId: f.id, texto: f.text, acuerdoPorGrupo: [], puente: i < puentes, divisiva: false })),
});

const b = (n: number, refs = ['f1']) => ({ titulo: `Titulo ${n}`, descripcion: `Descripcion ${n}`, refs });

describe('AcuerdosService: borradores de soluciones', () => {
  let prisma: Record<string, any>;
  let asistente: ReturnType<typeof asistenteMock>;
  let sugerencias: { guardar: ReturnType<typeof vi.fn>; existe: ReturnType<typeof vi.fn> };
  let service: AcuerdosService;

  beforeEach(() => {
    vi.mocked(agregadoPublico).mockReturnValue(agregado(2));
    prisma = {
      inquietud: { findMany: vi.fn().mockResolvedValue([]) },
      group: { findMany: vi.fn().mockResolvedValue([]) },
      proposal: {
        findMany: vi.fn().mockImplementation(async (args: any) => (args.where.kind === 'propuesta' ? [tema()] : [])),
      },
      frase: { findMany: vi.fn().mockResolvedValue(FRASES) },
      fraseVoto: { findMany: vi.fn().mockResolvedValue([{ profileId: id('a', 1), fraseId: FRASES[0]!.id, value: 'de_acuerdo' }]) },
    };
    asistente = asistenteMock({ borradores: [b(1), b(2, ['f2', 'f9'])] });
    sugerencias = { guardar: vi.fn().mockResolvedValue(undefined), existe: vi.fn().mockResolvedValue(null) };
    service = new AcuerdosService(prisma as never, asistente as never, sugerencias as never, redisMock() as never);
  });

  const pedidos = () => asistente.pedir.mock.calls.map((c: any[]) => c[0]).filter((p: any) => p.herramienta.nombre === 'proponer_soluciones');
  const guardados = () => sugerencias.guardar.mock.calls.filter((c) => c[0] === 'borradores');

  it('guarda los borradores sin adoptar, sin ids en el material', async () => {
    await service.procesar(AHORA);
    const p = pedidos()[0];
    expect(p.modelo).toBe('capaz');
    expect(p.prioridad).toBe('nocturna');
    expect(p.timeoutMs).toBe(120_000);
    expect(p.material).not.toMatch(UUID);
    expect(p.material).toContain('[f1] Frase visible 1');
    expect(p.material).not.toContain('Frase visible 3');
    expect(guardados()).toEqual([
      [
        'borradores',
        T,
        G,
        {
          borradores: [
            { titulo: 'Titulo 1', descripcion: 'Descripcion 1', adoptado: false },
            { titulo: 'Titulo 2', descripcion: 'Descripcion 2', adoptado: false },
          ],
        },
        { at: AHORA.toISOString(), frases: 2, opiniones: 1 },
      ],
    ]);
  });

  it('sin frases puente no pide', async () => {
    vi.mocked(agregadoPublico).mockReturnValue(agregado(0));
    await service.procesar(AHORA);
    expect(pedidos()).toHaveLength(0);
    expect(guardados()).toHaveLength(0);
  });

  it('no pide para cambios de regla ni temas con decisión', async () => {
    await service.procesar(AHORA);
    const donde = prisma.proposal.findMany.mock.calls.map((c: any[]) => c[0].where).find((w: any) => w.kind === 'propuesta');
    expect(donde).toMatchObject({ kind: 'propuesta', status: 'open', hidden: false, decision: null, cambioRegla: null });
  });

  it('no vuelve a pedir si ya hay sugerencia', async () => {
    sugerencias.existe.mockImplementation(async (tipo: string) => (tipo === 'borradores' ? { updatedAt: AHORA, final: false, base: {} } : null));
    await service.procesar(AHORA);
    expect(pedidos()).toHaveLength(0);
  });

  it('descarta 1 o 4 borradores', () => {
    expect(esSalidaBorradores({ borradores: [b(1)] })).toBe(false);
    expect(esSalidaBorradores({ borradores: [b(1), b(2), b(3), b(4)] })).toBe(false);
    expect(esSalidaBorradores({ borradores: [b(1), b(2), b(3)] })).toBe(true);
    expect(esSalidaBorradores({ borradores: [b(1), b(2, [])] })).toBe(false);
    expect(esSalidaBorradores({ borradores: [{ ...b(1), titulo: 'x'.repeat(141) }, b(2)] })).toBe(false);
  });

  it('descarta borradores sin una cita real y no guarda si quedan menos de 2', async () => {
    asistente.pedir.mockResolvedValue({ borradores: [b(1), b(2, ['f9'])] });
    await service.procesar(AHORA);
    expect(guardados()).toHaveLength(0);
  });
});
