import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textoParaRevisar } from '@decide/shared';
import { huellaDe, type ModeracionDeEleccion } from '../forums/forums.service';
import { ModeracionEleccionesService } from './moderacion-elecciones.service';

const AHORA = new Date('2026-11-20T12:00:00Z');
const PRESENTACION = 'Soy de Masaya';
const COMPROMISOS = ['Escuchar', 'Rendir cuentas'];
const TEXTO_FICHA = textoParaRevisar(PRESENTACION, ...COMPROMISOS);

function buildPrisma() {
  return {
    candidatura: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    revocacion: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    observacionPublica: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

describe('ModeracionEleccionesService (la mesa decide, 3C)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let forums: { registrarModeracion: ReturnType<typeof vi.fn> };
  const registrados = new Map<string, ModeracionDeEleccion>();
  const m = (t: string) => registrados.get(t)!;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    registrados.clear();
    forums = { registrarModeracion: vi.fn((t: string, h: ModeracionDeEleccion) => registrados.set(t, h)) };
    new ModeracionEleccionesService(prisma as never, audit as never, forums as never).onModuleInit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registra los tres tipos en el foro', () => {
    expect([...registrados.keys()].sort()).toEqual(['candidatura', 'observacion', 'revocacion']);
  });

  describe('ficha de candidatura', () => {
    const ficha = (over: Record<string, unknown> = {}) => ({
      eleccionId: 'e1', presentacion: PRESENTACION, compromisos: COMPROMISOS, oculta: false, retiradaAt: null,
      eleccion: { fase: 'candidaturas', cargo: 'secretario', group: { name: 'Nicaragua Decide' } }, ...over,
    });

    it('texto, contexto y si ya no hay nada que moderar', async () => {
      prisma.candidatura.findUnique.mockResolvedValue(ficha());
      expect(await m('candidatura').texto('k1')).toBe(TEXTO_FICHA);
      expect(await m('candidatura').contexto('k1')).toBe('Ficha de candidatura · Secretaría · Nicaragua Decide');
      expect(await m('candidatura').estaOculto('k1')).toBe(false);
      prisma.candidatura.findUnique.mockResolvedValue(ficha({ oculta: true }));
      expect(await m('candidatura').estaOculto('k1')).toBe(true);
      prisma.candidatura.findUnique.mockResolvedValue(ficha({ retiradaAt: AHORA }));
      expect(await m('candidatura').estaOculto('k1')).toBe(true);
      prisma.candidatura.findUnique.mockResolvedValue(ficha({ eleccion: { fase: 'contada', cargo: 'secretario', group: { name: 'x' } } }));
      expect(await m('candidatura').estaOculto('k1')).toBe(true);
      prisma.candidatura.findUnique.mockResolvedValue(null);
      expect(await m('candidatura').estaOculto('k1')).toBeNull();
      expect(await m('candidatura').texto('k1')).toBeNull();
    });

    it('con 2 firmas la oculta solo si el texto es el revisado, con la elección abierta y sin retirar', async () => {
      prisma.candidatura.findUnique.mockResolvedValue(ficha());
      const auditar = await m('candidatura').ocultar(prisma as never, 'k1', 'odio', huellaDe(TEXTO_FICHA));
      const lock = prisma.$queryRaw.mock.calls[0]![0] as { strings: string[]; values: unknown[] };
      expect(lock.strings.join('?')).toContain('FROM elecciones WHERE id = ?::uuid FOR SHARE');
      expect(lock.values).toEqual(['e1']);
      expect(prisma.candidatura.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'k1', oculta: false, retiradaAt: null, presentacion: PRESENTACION, compromisos: { equals: COMPROMISOS },
          eleccion: { fase: { in: ['candidaturas', 'votacion'] } },
        },
        data: { oculta: true, ocultaCausa: 'odio' },
      });
      expect(audit.log).not.toHaveBeenCalled();
      auditar!();
      expect(audit.log).toHaveBeenCalledWith({
        action: 'candidatura.ocultada',
        resource: 'candidatura:k1',
        metadata: { eleccionId: 'e1', causa: 'odio', origen: 'revision_posterior' },
      });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('Masaya');
    });

    it('una ficha editada desde la revisión no se oculta', async () => {
      prisma.candidatura.findUnique.mockResolvedValue(ficha({ presentacion: 'Texto nuevo' }));
      expect(await m('candidatura').ocultar(prisma as never, 'k1', 'odio', huellaDe(TEXTO_FICHA))).toBeNull();
      expect(prisma.candidatura.updateMany).not.toHaveBeenCalled();
    });

    it('si ya no aplica (count 0: contada, retirada u oculta), no hay auditoría', async () => {
      prisma.candidatura.findUnique.mockResolvedValue(ficha());
      prisma.candidatura.updateMany.mockResolvedValue({ count: 0 });
      expect(await m('candidatura').ocultar(prisma as never, 'k1', 'odio', huellaDe(TEXTO_FICHA))).toBeNull();
    });
  });

  describe('pedido de revocación', () => {
    const pedido = (over: Record<string, unknown> = {}) => ({
      motivo: 'No rinde cuentas', estado: 'abierta', venceAt: new Date(AHORA.getTime() + 86_400_000),
      cargo: { tipo: 'secretario', profile: { displayName: 'Ana' } }, ...over,
    });

    it('texto, contexto y si ya no hay nada que moderar (cerrado o vencido)', async () => {
      prisma.revocacion.findUnique.mockResolvedValue(pedido());
      expect(await m('revocacion').texto('v1')).toBe('No rinde cuentas');
      expect(await m('revocacion').contexto('v1')).toBe('Pedido de revocación de Ana (Secretaría)');
      expect(await m('revocacion').estaOculto('v1')).toBe(false);
      prisma.revocacion.findUnique.mockResolvedValue(pedido({ estado: 'lograda' }));
      expect(await m('revocacion').estaOculto('v1')).toBe(true);
      prisma.revocacion.findUnique.mockResolvedValue(pedido({ venceAt: AHORA }));
      expect(await m('revocacion').estaOculto('v1')).toBe(true);
    });

    it('con 2 firmas queda retirada si sigue abierta y sin vencer, y se audita', async () => {
      const auditar = await m('revocacion').ocultar(prisma as never, 'v1', 'odio', null);
      expect(prisma.revocacion.updateMany).toHaveBeenCalledWith({
        where: { id: 'v1', estado: 'abierta', venceAt: { gt: AHORA } },
        data: { estado: 'retirada' },
      });
      auditar!();
      expect(audit.log).toHaveBeenCalledWith({
        action: 'revocacion.retirada_por_moderacion',
        resource: 'revocacion:v1',
        metadata: { causa: 'odio', origen: 'revision_posterior' },
      });
    });

    it('si ya no está abierta, no hace nada', async () => {
      prisma.revocacion.updateMany.mockResolvedValue({ count: 0 });
      expect(await m('revocacion').ocultar(prisma as never, 'v1', 'odio', null)).toBeNull();
    });
  });

  describe('observación pública', () => {
    it('texto, contexto y si ya está oculta', async () => {
      prisma.observacionPublica.findUnique.mockResolvedValue({ texto: 'Se contó bien', oculta: false, auditEventId: 'ev1' });
      expect(await m('observacion').texto('o1')).toBe('Se contó bien');
      expect(await m('observacion').contexto('o1')).toBe('Observación pública de una persona observadora');
      expect(await m('observacion').estaOculto('o1')).toBe(false);
      prisma.observacionPublica.findUnique.mockResolvedValue({ texto: 'x', oculta: true, auditEventId: 'ev1' });
      expect(await m('observacion').estaOculto('o1')).toBe(true);
    });

    it('con 2 firmas se oculta (no se borra) con la causa, y se audita sin texto', async () => {
      prisma.observacionPublica.findUnique.mockResolvedValue({ texto: 'Una plaga', oculta: false, auditEventId: 'ev1' });
      const auditar = await m('observacion').ocultar(prisma as never, 'o1', 'odio', huellaDe('Una plaga'));
      expect(prisma.observacionPublica.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', oculta: false },
        data: { oculta: true, ocultaCausa: 'odio' },
      });
      auditar!();
      expect(audit.log).toHaveBeenCalledWith({
        action: 'observacion.ocultada',
        resource: 'observacion:o1',
        metadata: { auditEventId: 'ev1', causa: 'odio', origen: 'revision_posterior' },
      });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('plaga');
    });
  });
});
