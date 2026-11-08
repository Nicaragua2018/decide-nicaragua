import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AcuerdosService } from '../acuerdos.service';

const AHORA = new Date('2026-11-09T12:00:00Z');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const G = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const id = (pre: string, n: number) => `${pre}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FRASES = [1, 2, 3, 4].map((n) => ({ id: id('f', n), text: `Frase visible ${n}` }));
const PERSONAS = [1, 2, 3, 4, 5, 6].map((n) => id('a', n));

/** 6 personas x 4 frases = 24 votos de acuerdo (un solo grupo de 6). */
const votos = (n = 24) =>
  PERSONAS.flatMap((p) => FRASES.map((f) => ({ profileId: p, fraseId: f.id, value: 'de_acuerdo' }))).slice(0, n);

const tema = (extra: Record<string, unknown> = {}) => ({
  id: T,
  groupId: G,
  status: 'open',
  deliberationEndsAt: null,
  decision: null,
  ...extra,
});

const salidaBuena = {
  resumen: 'Hay acuerdo general.',
  grupos: [{ grupo: 'A', nombre: 'Grupo único', piensa: 'Piensan parecido.', refs: ['f1', 'f2', 'f99'] }],
  puentes: { texto: 'Todos coinciden.', refs: ['f3', 'f77'] },
};

describe('AcuerdosService: mapa de opiniones', () => {
  let prisma: Record<string, any>;
  let asistente: { pedir: ReturnType<typeof vi.fn> };
  let sugerencias: { guardar: ReturnType<typeof vi.fn>; existe: ReturnType<typeof vi.fn> };
  let service: AcuerdosService;

  beforeEach(() => {
    prisma = {
      inquietud: { findMany: vi.fn().mockResolvedValue([]) },
      proposal: { findMany: vi.fn().mockResolvedValue([tema()]) },
      frase: { findMany: vi.fn().mockResolvedValue(FRASES) },
      fraseVoto: { findMany: vi.fn().mockResolvedValue(votos()) },
    };
    asistente = { pedir: vi.fn().mockResolvedValue(salidaBuena) };
    sugerencias = { guardar: vi.fn().mockResolvedValue(undefined), existe: vi.fn().mockResolvedValue(null) };
    service = new AcuerdosService(prisma as never, asistente as never, sugerencias as never);
  });

  const pedidosMapa = () => asistente.pedir.mock.calls.map((c: any[]) => c[0]).filter((p: any) => p.herramienta.nombre === 'mapear_opiniones');
  const guardadosMapa = () => sugerencias.guardar.mock.calls.filter((c) => c[0] === 'mapa');
  const previaMapa = (p: object) =>
    sugerencias.existe.mockImplementation(async (tipo: string) => (tipo === 'mapa' ? p : null));

  it('genera el mapa, traduce refs, descarta las inventadas y pone el tamaño el servidor', async () => {
    await service.procesar(AHORA);
    const pedido = pedidosMapa()[0];
    expect(pedido.modelo).toBe('capaz');
    expect(pedido.prioridad).toBe('nocturna');
    expect(guardadosMapa()).toEqual([
      [
        'mapa',
        T,
        G,
        {
          resumen: 'Hay acuerdo general.',
          grupos: [{ nombre: 'Grupo único', tamano: 5, piensa: 'Piensan parecido.', citaIds: [FRASES[0]!.id, FRASES[1]!.id] }],
          puentes: { texto: 'Todos coinciden.', citaIds: [FRASES[2]!.id] },
        },
        { at: AHORA.toISOString(), frases: 4, opiniones: 24 },
        false,
      ],
    ]);
  });

  it('acepta refs con corchetes y espacios', async () => {
    asistente.pedir.mockResolvedValue({
      ...salidaBuena,
      grupos: [{ ...salidaBuena.grupos[0]!, refs: ['[f1]', ' f2 '] }],
      puentes: { texto: 'Todos coinciden.', refs: ['[f3]'] },
    });
    await service.procesar(AHORA);
    const c = guardadosMapa()[0]![3];
    expect(c.grupos[0].citaIds).toEqual([FRASES[0]!.id, FRASES[1]!.id]);
    expect(c.puentes.citaIds).toEqual([FRASES[2]!.id]);
  });

  it('no genera con menos de 20 votos', async () => {
    prisma.fraseVoto.findMany.mockResolvedValue(votos(19));
    await service.procesar(AHORA);
    expect(pedidosMapa()).toHaveLength(0);
    expect(guardadosMapa()).toHaveLength(0);
  });

  it('no genera si el tema esta oculto: la consulta lo excluye', async () => {
    await service.procesar(AHORA);
    const donde = prisma.proposal.findMany.mock.calls.map((c: any) => c[0].where).find((w: any) => w.hidden === false && !w.abiertoPorComunidad);
    expect(donde).toBeTruthy();
    expect(prisma.fraseVoto.findMany.mock.calls[0]![0].where.frase).toEqual({ proposalId: T, hidden: false });
    expect(prisma.fraseVoto.findMany.mock.calls[0]![0].where.profile).toEqual({ memberships: { some: { groupId: G } } });
  });

  it('no regenera antes de 24 horas ni si no cambiaron los votos', async () => {
    previaMapa({ updatedAt: new Date(AHORA.getTime() - 23 * 3_600_000), final: false, base: { at: 'x', opiniones: 10 } });
    await service.procesar(AHORA);
    expect(pedidosMapa()).toHaveLength(0);

    previaMapa({ updatedAt: new Date(AHORA.getTime() - 30 * 3_600_000), final: false, base: { at: 'x', opiniones: 24 } });
    await service.procesar(AHORA);
    expect(pedidosMapa()).toHaveLength(0);

    previaMapa({ updatedAt: new Date(AHORA.getTime() - 30 * 3_600_000), final: false, base: { at: 'x', opiniones: 22 } });
    await service.procesar(AHORA);
    expect(pedidosMapa()).toHaveLength(1);
  });

  it('al terminar el debate guarda final y no vuelve a generar', async () => {
    prisma.proposal.findMany.mockResolvedValue([tema({ deliberationEndsAt: new Date(AHORA.getTime() - 1000) })]);
    previaMapa({ updatedAt: new Date(AHORA.getTime() - 3_600_000), final: false, base: { at: 'x', opiniones: 24 } });
    await service.procesar(AHORA);
    expect(pedidosMapa()).toHaveLength(1);
    expect(guardadosMapa()[0]![5]).toBe(true);

    asistente.pedir.mockClear();
    sugerencias.guardar.mockClear();
    previaMapa({ updatedAt: AHORA, final: true, base: { at: 'x', opiniones: 24 } });
    await service.procesar(AHORA);
    expect(pedidosMapa()).toHaveLength(0);
    expect(guardadosMapa()).toHaveLength(0);
  });

  it('el debate termina tambien con una decision o un estado distinto de abierto', async () => {
    prisma.proposal.findMany.mockResolvedValue([tema({ decision: { id: 'd' } })]);
    await service.procesar(AHORA);
    expect(guardadosMapa()[0]![5]).toBe(true);

    sugerencias.guardar.mockClear();
    prisma.proposal.findMany.mockResolvedValue([tema({ status: 'closed' })]);
    await service.procesar(AHORA);
    expect(guardadosMapa()[0]![5]).toBe(true);
  });

  it('descarta la salida si nombra un grupo que no existe', async () => {
    asistente.pedir.mockResolvedValue({ ...salidaBuena, grupos: [{ ...salidaBuena.grupos[0]!, grupo: 'B' }] });
    await service.procesar(AHORA);
    expect(pedidosMapa()).toHaveLength(1);
    expect(guardadosMapa()).toHaveLength(0);

    asistente.pedir.mockResolvedValue({
      ...salidaBuena,
      grupos: [salidaBuena.grupos[0]!, { ...salidaBuena.grupos[0]!, grupo: 'B' }],
    });
    await service.procesar(AHORA);
    expect(guardadosMapa()).toHaveLength(0);
  });

  it('el material no lleva profileIds ni conteos exactos por persona', async () => {
    await service.procesar(AHORA);
    const { material, tarea } = pedidosMapa()[0];
    expect(material).not.toMatch(UUID);
    for (const p of PERSONAS) expect(material).not.toContain(p);
    expect(material).toContain('[f1] Frase visible 1');
    expect(material).toContain('Grupo A: unas 5 personas');
    expect(material).toContain('grupo A 100 %');
    expect(material).not.toMatch(/\b6 personas|votantes|deAcuerdo/);
    expect(tarea).not.toContain('Frase visible');
  });
});
