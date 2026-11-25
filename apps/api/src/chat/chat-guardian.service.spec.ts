import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGuardianService, GUARDIAN_FALLO, GUARDIAN_LIMITE, GUARDIAN_NO_DISPONIBLE } from './chat-guardian.service';

const QUIEN = { userId: 'u', profileId: 'p', status: 'verified_citizen' as const };

function montar() {
  const prisma = { chatMessage: { create: vi.fn().mockResolvedValue({}) } };
  const panel = { responderEnSala: vi.fn() };
  return { service: new ChatGuardianService(prisma as never, panel as never), prisma, panel };
}
const datos = (t: ReturnType<typeof montar>) =>
  (t.prisma.chatMessage.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

describe('ChatGuardianService', () => {
  let t: ReturnType<typeof montar>;
  beforeEach(() => {
    t = montar();
  });

  it('publica la respuesta como mensaje de Guardián, sin autor y enlazada a la pregunta', async () => {
    t.panel.responderEnSala.mockResolvedValue({ tipo: 'respuesta', texto: 'Ve a Reglas.', enlaces: [{ texto: 'Reglas', ruta: '/reglas' }] });
    await t.service.responder('g', 'q1', QUIEN, '@guardian ¿cómo cambio una regla?');
    expect(t.panel.responderEnSala).toHaveBeenCalledWith(QUIEN, '@guardian ¿cómo cambio una regla?');
    expect(datos(t)).toEqual({
      groupId: 'g',
      kind: 'guardian',
      authorProfileId: null,
      replyToId: 'q1',
      body: 'Ve a Reglas.',
      enlaces: [{ texto: 'Reglas', ruta: '/reglas' }],
    });
  });

  it.each([
    ['apagado', GUARDIAN_NO_DISPONIBLE],
    ['descansa', GUARDIAN_NO_DISPONIBLE],
    ['limite', GUARDIAN_LIMITE],
    ['fallo', GUARDIAN_FALLO],
  ])('%s → aviso del sistema', async (tipo, texto) => {
    t.panel.responderEnSala.mockResolvedValue({ tipo });
    await t.service.responder('g', 'q1', QUIEN, 'x');
    expect(datos(t)).toEqual({ groupId: 'g', kind: 'sistema', authorProfileId: null, replyToId: 'q1', body: texto });
  });

  it('si el asistente lanza, publica el aviso de fallo y no propaga', async () => {
    t.panel.responderEnSala.mockRejectedValue(new Error('boom'));
    await expect(t.service.responder('g', 'q1', QUIEN, 'x')).resolves.toBeUndefined();
    expect(datos(t)['body']).toBe(GUARDIAN_FALLO);
  });

  it('si no puede guardar la respuesta, tampoco propaga', async () => {
    t.panel.responderEnSala.mockResolvedValue({ tipo: 'fallo' });
    t.prisma.chatMessage.create.mockRejectedValue(new Error('db'));
    await expect(t.service.responder('g', 'q1', QUIEN, 'x')).resolves.toBeUndefined();
  });
});
