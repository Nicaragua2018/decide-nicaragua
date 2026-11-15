import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENLACE_INVITACION, TEXTO_INVITACION } from '../app/portada/invitacion';

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
