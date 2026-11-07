import { describe, expect, it, vi } from 'vitest';
import { Publicadores } from './publicadores';

describe('Publicadores', () => {
  it('publica con la función registrada para el tipo, siempre sin moderación', async () => {
    const p = new Publicadores();
    const fn = vi.fn().mockResolvedValue({ id: 'x' });
    p.registrar('frase', fn);
    expect(await p.publicar('frase', 'p1', { a: 1 })).toEqual({ id: 'x' });
    expect(fn).toHaveBeenCalledWith('p1', { a: 1 }, { sinModeracion: true });
  });

  it('un tipo sin publicador lanza', async () => {
    await expect(new Publicadores().publicar('informe', 'p1', {})).rejects.toThrow();
  });

  it('una variante (via) se elige por los argumentos', async () => {
    const p = new Publicadores();
    const tema = vi.fn().mockResolvedValue('tema');
    const debate = vi.fn().mockResolvedValue('debate');
    p.registrar('tema', tema);
    p.registrar('tema', debate, 'abrir_debate');
    expect(await p.publicar('tema', 'p1', { groupId: 'g' })).toBe('tema');
    expect(await p.publicar('tema', 'p1', { via: 'abrir_debate', groupId: 'g' })).toBe('debate');
  });

  it('registrar dos veces el mismo tipo es un error de programación', () => {
    const p = new Publicadores();
    p.registrar('frase', vi.fn());
    expect(() => p.registrar('frase', vi.fn())).toThrow();
  });
});
