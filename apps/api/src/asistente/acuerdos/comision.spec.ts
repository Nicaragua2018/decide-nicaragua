import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AcuerdosService } from '../acuerdos.service';
import { asistenteMock, redisMock } from '../../test/acuerdos-mock';
import { esSalidaComision } from './comision';

const AHORA = new Date('2026-11-09T12:00:00Z');
const C = '33333333-3333-4333-8333-333333333333';

describe('AcuerdosService: comentario para comisiones', () => {
  let prisma: Record<string, any>;
  let asistente: ReturnType<typeof asistenteMock>;
  let sugerencias: { guardar: ReturnType<typeof vi.fn>; existe: ReturnType<typeof vi.fn> };
  let service: AcuerdosService;

  beforeEach(() => {
    prisma = {
      inquietud: { findMany: vi.fn().mockResolvedValue([]) },
      proposal: { findMany: vi.fn().mockResolvedValue([]) },
      group: { findMany: vi.fn().mockResolvedValue([{ id: C, proposito: 'Cuidar el parque', tarea: 'Limpiar y plantar' }]) },
    };
    asistente = asistenteMock({ capacidades: [' jardinería ', 'organizar'], comentario: ' Conviene coordinar. ' });
    sugerencias = { guardar: vi.fn().mockResolvedValue(undefined), existe: vi.fn().mockResolvedValue(null) };
    service = new AcuerdosService(prisma as never, asistente as never, sugerencias as never, redisMock() as never);
  });

  const pedidos = () => asistente.pedir.mock.calls.map((c: any[]) => c[0]).filter((p: any) => p.herramienta.nombre === 'comentar_comision');

  it('solo comisiones convocando y una sola vez', async () => {
    await service.procesar(AHORA);
    expect(prisma.group.findMany.mock.calls[0]![0].where).toMatchObject({ trabajoTipo: 'comision', trabajoEstado: 'convocando' });
    const p = pedidos()[0];
    expect(p.modelo).toBe('rapido');
    expect(p.prioridad).toBe('nocturna');
    expect(p.timeoutMs).toBe(120_000);
    expect(p.material).toContain('Cuidar el parque');
    expect(p.tarea).not.toContain('Cuidar el parque');
    expect(sugerencias.guardar).toHaveBeenCalledWith(
      'comision',
      C,
      C,
      { capacidades: ['jardinería', 'organizar'], comentario: 'Conviene coordinar.' },
      { at: AHORA.toISOString() },
    );

    asistente.pedir.mockClear();
    sugerencias.guardar.mockClear();
    sugerencias.existe.mockImplementation(async (tipo: string) => (tipo === 'comision' ? { updatedAt: AHORA, final: false, base: {} } : null));
    await service.procesar(AHORA);
    expect(pedidos()).toHaveLength(0);
    expect(sugerencias.guardar).not.toHaveBeenCalled();
  });

  it('una comisión sin propósito ni tarea no recibe pedido', async () => {
    prisma.group.findMany.mockResolvedValue([
      { id: C, proposito: null, tarea: '  ' },
      { id: 'otra', proposito: '', tarea: null },
    ]);
    await service.procesar(AHORA);
    expect(pedidos()).toHaveLength(0);
    expect(sugerencias.guardar).not.toHaveBeenCalled();
  });

  it('valida los límites de la salida', () => {
    expect(esSalidaComision({ capacidades: ['a'], comentario: 'c' })).toBe(true);
    expect(esSalidaComision({ capacidades: [], comentario: 'c' })).toBe(false);
    expect(esSalidaComision({ capacidades: ['a', 'b', 'c', 'd', 'e', 'f'], comentario: 'c' })).toBe(false);
    expect(esSalidaComision({ capacidades: ['a'.repeat(81)], comentario: 'c' })).toBe(false);
    expect(esSalidaComision({ capacidades: ['a'], comentario: 'c'.repeat(601) })).toBe(false);
  });
});
