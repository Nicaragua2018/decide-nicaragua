import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  ENLACE_INVITACION,
  TEXTO_INVITACION,
  VIDEO_INVITACION,
  mensajeInvitacionPersonal,
} from '../app/portada/invitacion';

describe('texto de invitación', () => {
  it('lleva el enlace completo al sitio, pulsable en cualquier aplicación', () => {
    expect(ENLACE_INVITACION).toBe('https://nicaraguadecide.org');
    expect(TEXTO_INVITACION).toContain(`regístrate en ${ENLACE_INVITACION} con`);
  });

  it('nombra el botón de la portada tal como está escrito allí', () => {
    const hero = readFileSync(join(__dirname, '../app/portada/Hero.tsx'), 'utf8');
    expect(hero).toContain('Únete a la comunidad');
    expect(TEXTO_INVITACION).toContain('«Únete a la comunidad»');
  });

  it('usa el nombre correcto del proyecto', () => {
    expect(TEXTO_INVITACION).toContain('Nicaragua Decide');
    expect(TEXTO_INVITACION).not.toMatch(/Decide Nicaragua/i);
  });

  it('no promete como público lo que solo ven los miembros', () => {
    expect(TEXTO_INVITACION).not.toMatch(/Auditoría pública|visibles para todos/);
  });

  it('es lo que copia el botón «Compartir»', () => {
    const boton = readFileSync(join(__dirname, '../app/components/ShareButton.tsx'), 'utf8');
    expect(boton).toContain('TEXTO_INVITACION');
  });
});

describe('pantalla «Invitar usuario»', () => {
  const pagina = readFileSync(join(__dirname, '../app/(app)/admin/invite/page.tsx'), 'utf8');

  it('el formulario va arriba y el resultado debajo, para invitar a la siguiente persona sin buscarlo', () => {
    expect(pagina.indexOf('<form action={formAction}>')).toBeLessThan(pagina.indexOf('<CompartirInvitacion'));
  });

  it('cada invitación estrena su mensaje y dice para quién es', () => {
    expect(pagina).toContain('key={state.inviteUrl}');
    expect(pagina).toContain('para={state.invitado}');
  });
});

describe('invitación personal (WhatsApp)', () => {
  const enlace = 'https://nicaraguadecide.org/invite/abc-123';
  const m = mensajeInvitacionPersonal(enlace, 72);

  it('lleva el enlace personal en su propia línea y el plazo en días', () => {
    expect(m).toContain(`
${enlace}
`);
    expect(m).toContain('Vence en 3 días.');
    expect(mensajeInvitacionPersonal(enlace, 36)).toContain('Vence en 36 horas.');
  });

  it('no manda a registrarse por la portada: la persona ya tiene su enlace', () => {
    expect(m).not.toContain('«Únete a la comunidad»');
    expect(m).toContain('no lo reenvíes');
  });

  it('comparte el cuerpo y la despedida con la invitación pública', () => {
    expect(m.split('👉')[0]).toBe(TEXTO_INVITACION.split('👉')[0]);
    expect(m).toContain('Gracias a RENACER');
  });

  it('el video de invitación existe y es público', () => {
    expect(VIDEO_INVITACION.startsWith('/portada/')).toBe(true);
    expect(existsSync(join(__dirname, '../public', VIDEO_INVITACION))).toBe(true);
  });
});
