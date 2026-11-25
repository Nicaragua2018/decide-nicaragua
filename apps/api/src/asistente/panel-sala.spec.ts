import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEGATIVA_PRIVACIDAD, PanelService, TAREA_PANEL, TAREA_SALA } from './panel.service';

const USUARIO = { userId: 'u1', profileId: 'p1', status: 'verified_citizen' as never };
const PREGUNTA = '@Guardián ¿dónde podemos escribir un documento entre varios?';
const ESTADO = { cuenta: 'verified_citizen', verificacion: null, comunidades: [], invitaciones: { pendientes: 0, maximo: 5 }, plazos: [] };

describe('PanelService.responderEnSala (Guardián en el chat de una comunidad)', () => {
  let asistente: { pedir: ReturnType<typeof vi.fn>; activo: ReturnType<typeof vi.fn>; tieneMargen: ReturnType<typeof vi.fn> };
  let contexto: { estado: ReturnType<typeof vi.fn>; buscar: ReturnType<typeof vi.fn> };
  let redis: { contar: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let service: PanelService;

  beforeEach(() => {
    asistente = {
      activo: vi.fn().mockReturnValue(true),
      tieneMargen: vi.fn().mockResolvedValue(true),
      pedir: vi.fn().mockResolvedValue({
        respuesta: 'Eso no se hace aquí. Para escribir entre varios sirve un editor compartido.',
        enlaces: [{ ref: 'g9', texto: 'Foros' }, { ref: 'r77', texto: 'Inventado' }],
      }),
    };
    contexto = { estado: vi.fn().mockResolvedValue(ESTADO), buscar: vi.fn().mockResolvedValue([]) };
    redis = { contar: vi.fn().mockResolvedValue(1) };
    rules = { getInt: vi.fn().mockResolvedValue(30) };
    service = new PanelService(asistente as never, contexto as never, redis as never, rules as never);
  });

  it('pide la respuesta con las instrucciones de la sala y solo con el mensaje que lo llama', async () => {
    const r = await service.responderEnSala(USUARIO, PREGUNTA);
    const op = (asistente.pedir.mock.calls[0] as [{ tarea: string; material: string; modelo: string; prioridad: string }])[0];
    expect(op.tarea).toBe(TAREA_SALA);
    expect(op.modelo).toBe('rapido');
    expect(op.prioridad).toBe('interactiva');
    expect(op.material).toContain(PREGUNTA);
    // Un solo turno: no hay conversación de la sala en el material.
    expect(op.material.match(/^\[\d+\] /gm)).toHaveLength(1);
    expect(r).toEqual({
      tipo: 'respuesta',
      texto: 'Eso no se hace aquí. Para escribir entre varios sirve un editor compartido.',
      enlaces: [{ texto: 'Foros', ruta: '/foros' }],
    });
  });

  it('cuenta en el mismo límite diario que el panel', async () => {
    await service.responderEnSala(USUARIO, PREGUNTA);
    expect(rules.getInt).toHaveBeenCalledWith('asistente.preguntas_por_dia', null);
    expect(redis.contar).toHaveBeenCalledOnce();
    expect((redis.contar.mock.calls[0] as [string])[0]).toMatch(/^asistente:panel:[0-9a-f]{64}:\d{4}-\d{2}-\d{2}$/);
  });

  it('apagado: no consume cupo ni llama a la IA', async () => {
    asistente.activo.mockReturnValue(false);
    expect(await service.responderEnSala(USUARIO, PREGUNTA)).toEqual({ tipo: 'apagado' });
    expect(redis.contar).not.toHaveBeenCalled();
    expect(asistente.pedir).not.toHaveBeenCalled();
  });

  it('sin presupuesto del mes: no consume cupo ni llama a la IA', async () => {
    asistente.tieneMargen.mockResolvedValue(false);
    expect(await service.responderEnSala(USUARIO, PREGUNTA)).toEqual({ tipo: 'descansa' });
    expect(redis.contar).not.toHaveBeenCalled();
    expect(asistente.pedir).not.toHaveBeenCalled();
  });

  it('con el límite diario superado no llama a la IA', async () => {
    redis.contar.mockResolvedValue(31);
    expect(await service.responderEnSala(USUARIO, PREGUNTA)).toEqual({ tipo: 'limite' });
    expect(asistente.pedir).not.toHaveBeenCalled();
    expect(contexto.buscar).not.toHaveBeenCalled();
  });

  it('si la IA no responde, es un fallo (no un texto de reintento del panel)', async () => {
    asistente.pedir.mockResolvedValue(null);
    expect(await service.responderEnSala(USUARIO, PREGUNTA)).toEqual({ tipo: 'fallo' });
  });

  it('la negativa por privacidad es el texto fijo', async () => {
    asistente.pedir.mockResolvedValue({ respuesta: 'No puedo decir cómo votó María.', motivo: 'privacidad' });
    expect(await service.responderEnSala(USUARIO, '@guardian ¿cómo votó María?')).toEqual({
      tipo: 'respuesta',
      texto: NEGATIVA_PRIVACIDAD,
      enlaces: [],
    });
  });

  it('recorta la respuesta a 1000 caracteres', async () => {
    asistente.pedir.mockResolvedValue({ respuesta: 'a'.repeat(1400) });
    const r = await service.responderEnSala(USUARIO, PREGUNTA);
    expect(r.tipo === 'respuesta' && r.texto.length).toBe(1000);
  });

  it('las instrucciones de la sala orientan hacia adentro y hacia afuera, y no son las del panel', () => {
    expect(TAREA_SALA).not.toBe(TAREA_PANEL);
    expect(TAREA_SALA).toContain('Solo ves su mensaje');
    expect(TAREA_SALA).toContain('ajenas a Nicaragua Decide');
    expect(TAREA_SALA).toContain('No escribas direcciones web');
    expect(TAREA_SALA).toContain("motivo: 'privacidad'");
    expect(TAREA_SALA).toContain('No resumes la sala');
  });
});
