import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RevisionPosteriorService } from './revision-posterior.service';
import { ESQUEMA_REVISION, esRevision, tareaRevision } from './moderacion-previa.service';

const AHORA = new Date('2026-11-10T03:00:00Z');
const FRASE = 'Los de ese barrio son una plaga';

type Fila = { id: string; target: string; targetId: string; creadaAt: Date; intentos: number };
const fila = (over: Partial<Fila> = {}): Fila => ({
  id: 'c1', target: 'frase', targetId: 'f1', creadaAt: new Date('2026-11-09T00:00:00Z'), intentos: 0, ...over,
});

function build() {
  const prisma = {
    colaRevisionPosterior: {
      findMany: vi.fn().mockResolvedValue([fila()]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    proposal: { findUnique: vi.fn().mockResolvedValue(null) },
    proposalComment: { findUnique: vi.fn().mockResolvedValue(null) },
    inquietud: { findUnique: vi.fn().mockResolvedValue(null) },
    frase: { findUnique: vi.fn().mockResolvedValue({ text: FRASE, hidden: false }) },
    solucion: { findUnique: vi.fn().mockResolvedValue(null) },
    comisionInforme: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const asistente = {
    activo: vi.fn().mockReturnValue(true),
    tieneMargen: vi.fn().mockResolvedValue(true),
    pedir: vi.fn().mockResolvedValue({ nivel: 2, causa: 'odio', explicacion: 'x', sugerencia: 'y' }),
  };
  const forums = { solicitarPorAsistente: vi.fn().mockResolvedValue({ id: 'ma1', estado: 'pendiente' }) };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const svc = new RevisionPosteriorService(prisma as never, asistente as never, forums as never, audit as never);
  return { svc, prisma, asistente, forums, audit };
}

describe('RevisionPosteriorService', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  it('posterior: nivel 2 abre solicitud del asistente y vacía la cola', async () => {
    expect(await t.svc.procesar(AHORA)).toBe(1);
    expect(t.prisma.colaRevisionPosterior.findMany).toHaveBeenCalledWith({
      where: { creadaAt: { lte: AHORA } },
      orderBy: { creadaAt: 'asc' },
      take: 50,
    });
    const op = t.asistente.pedir.mock.calls[0]![0];
    expect(op).toMatchObject({ modelo: 'rapido', prioridad: 'nocturna', material: FRASE, tarea: tareaRevision('frase') });
    expect(op.herramienta.esquema).toBe(ESQUEMA_REVISION);
    expect(op.validar).toBe(esRevision);
    expect(t.forums.solicitarPorAsistente).toHaveBeenCalledWith('frase', 'f1', 'odio');
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('posterior: solicitud abierta existente → null sin error', async () => {
    t.forums.solicitarPorAsistente.mockResolvedValue(null);
    expect(await t.svc.procesar(AHORA)).toBe(1);
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('posterior: nivel 0 o 1 solo vacía la cola', async () => {
    t.asistente.pedir.mockResolvedValueOnce({ nivel: 0 }).mockResolvedValueOnce({ nivel: 1, causa: 'insultos_amenazas' });
    t.prisma.colaRevisionPosterior.findMany.mockResolvedValue([fila(), fila({ id: 'c2', targetId: 'f2' })]);
    expect(await t.svc.procesar(AHORA)).toBe(2);
    expect(t.forums.solicitarPorAsistente).not.toHaveBeenCalled();
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('posterior: un nivel 2 con una causa que no es de nivel 2 no abre solicitud', async () => {
    t.asistente.pedir.mockResolvedValue({ nivel: 2, causa: 'spam' });
    await t.svc.procesar(AHORA);
    expect(t.forums.solicitarPorAsistente).not.toHaveBeenCalled();
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('posterior: sin margen nocturno no llama a pedir', async () => {
    t.asistente.tieneMargen.mockResolvedValue(false);
    expect(await t.svc.procesar(AHORA)).toBe(0);
    expect(t.asistente.tieneMargen).toHaveBeenCalledWith('nocturna');
    expect(t.asistente.pedir).not.toHaveBeenCalled();
    expect(t.prisma.colaRevisionPosterior.findMany).not.toHaveBeenCalled();
    expect(t.prisma.colaRevisionPosterior.updateMany).not.toHaveBeenCalled();
  });

  it('posterior: con el asistente apagado no toca la cola (no gasta intentos)', async () => {
    t.asistente.activo.mockReturnValue(false);
    expect(await t.svc.procesar(AHORA)).toBe(0);
    expect(t.asistente.pedir).not.toHaveBeenCalled();
    expect(t.prisma.colaRevisionPosterior.findMany).not.toHaveBeenCalled();
  });

  it('posterior: si el margen se acaba a mitad de la tanda, para', async () => {
    t.prisma.colaRevisionPosterior.findMany.mockResolvedValue([fila(), fila({ id: 'c2', targetId: 'f2' })]);
    t.asistente.tieneMargen.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    expect(await t.svc.procesar(AHORA)).toBe(1);
    expect(t.asistente.pedir).toHaveBeenCalledTimes(1);
  });

  it('posterior: cinco intentos fallidos lo abandonan', async () => {
    t.asistente.pedir.mockResolvedValue(null);
    t.prisma.colaRevisionPosterior.findMany.mockResolvedValue([fila({ intentos: 1 })]);
    expect(await t.svc.procesar(AHORA)).toBe(0);
    expect(t.prisma.colaRevisionPosterior.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { intentos: { increment: 1 } },
    });
    expect(t.prisma.colaRevisionPosterior.deleteMany).not.toHaveBeenCalled();
    expect(t.audit.log).not.toHaveBeenCalled();

    t.prisma.colaRevisionPosterior.findMany.mockResolvedValue([fila({ intentos: 4 })]);
    expect(await t.svc.procesar(AHORA)).toBe(1);
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(t.audit.log).toHaveBeenCalledWith({
      action: 'asistente.revision_abandonada',
      resource: 'frase:f1',
      metadata: { intentos: 5 },
    });
    expect(JSON.stringify(t.audit.log.mock.calls)).not.toContain('plaga');
    expect(t.forums.solicitarPorAsistente).not.toHaveBeenCalled();
  });

  it('posterior: si ya está oculto o no existe, lo borra sin pedir', async () => {
    t.prisma.frase.findUnique.mockResolvedValueOnce({ text: FRASE, hidden: true }).mockResolvedValueOnce(null);
    t.prisma.colaRevisionPosterior.findMany.mockResolvedValue([fila(), fila({ id: 'c2', targetId: 'f2' })]);
    expect(await t.svc.procesar(AHORA)).toBe(2);
    expect(t.asistente.pedir).not.toHaveBeenCalled();
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledWith({ where: { id: 'c2' } });
  });

  it('posterior: arma el texto como la revisión previa, con su tipo', async () => {
    t.asistente.pedir.mockResolvedValue({ nivel: 0 });
    t.prisma.colaRevisionPosterior.findMany.mockResolvedValue([
      fila({ id: 'c1', target: 'tema', targetId: 't1' }),
      fila({ id: 'c2', target: 'inquietud', targetId: 'q1' }),
      fila({ id: 'c3', target: 'respuesta', targetId: 'r1' }),
      fila({ id: 'c4', target: 'solucion', targetId: 's1' }),
      fila({ id: 'c5', target: 'informe', targetId: 'i1' }),
    ]);
    t.prisma.proposal.findUnique.mockResolvedValue({ title: 'Agua ', body: ' Falta agua', hidden: false });
    t.prisma.inquietud.findUnique.mockResolvedValue({ title: 'Luz', body: 'Sin luz', response: 'Lo vemos', hidden: false });
    t.prisma.proposalComment.findUnique.mockResolvedValue({ body: 'Un comentario', hidden: false });
    t.prisma.solucion.findUnique.mockResolvedValue({ title: 'Pozo', description: '', hidden: false });
    t.prisma.comisionInforme.findUnique.mockResolvedValue({ texto: 'Informe', hidden: false });
    expect(await t.svc.procesar(AHORA)).toBe(5);
    const llamadas = t.asistente.pedir.mock.calls.map(([op]) => [op.material, op.tarea]);
    expect(llamadas).toEqual([
      ['Agua\n\nFalta agua', tareaRevision('tema')],
      ['Luz\n\nSin luz\n\nLo vemos', tareaRevision('inquietud')],
      ['Un comentario', tareaRevision('comentario')],
      ['Pozo', tareaRevision('solucion')],
      ['Informe', tareaRevision('informe')],
    ]);
  });

  it('posterior: si abrir la solicitud falla, cuenta un intento y sigue con las demás', async () => {
    t.forums.solicitarPorAsistente.mockRejectedValueOnce(new Error('db'));
    t.prisma.colaRevisionPosterior.findMany.mockResolvedValue([fila(), fila({ id: 'c2', targetId: 'f2' })]);
    expect(await t.svc.procesar(AHORA)).toBe(1);
    expect(t.prisma.colaRevisionPosterior.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { intentos: { increment: 1 } },
    });
    expect(t.prisma.colaRevisionPosterior.deleteMany).toHaveBeenCalledWith({ where: { id: 'c2' } });
  });
});

describe('AsistenteScheduler', () => {
  it('scheduler: corre la revisión posterior cada hora aunque falle el vencimiento', async () => {
    const { AsistenteScheduler } = await import('./asistente.scheduler');
    const revisiones = { vencer: vi.fn().mockRejectedValue(new Error('db')) };
    const posterior = { procesar: vi.fn().mockResolvedValue(0) };
    await new AsistenteScheduler(revisiones as never, posterior as never).run();
    expect(posterior.procesar).toHaveBeenCalledTimes(1);
    expect(posterior.procesar.mock.calls[0]![0]).toBeInstanceOf(Date);
  });
});
