import { describe, expect, it } from 'vitest';
import type { ChatMensajeVista } from '@decide/shared';
import { fusionar, reemplazarRecientes, sinLaSalaAbierta, textoSinLeer, totalSinLeer } from './chat';

const m = (id: string, seg: number, over: Partial<ChatMensajeVista> = {}): ChatMensajeVista => ({
  id,
  tipo: 'miembro',
  autor: 'Ana',
  iniciales: 'A',
  texto: `texto ${id}`,
  estado: 'visible',
  enlaces: [],
  respondeA: null,
  esMio: false,
  avisos: null,
  apelacionId: null,
  createdAt: new Date(Date.UTC(2026, 10, 25, 10, 0, seg)).toISOString(),
  ...over,
});

describe('fusionar', () => {
  it('dos lotes con el mismo mensaje no lo duplican', () => {
    const r = fusionar([m('a', 1), m('b', 2)], [m('b', 2), m('c', 3)]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('la versión nueva reemplaza a la vieja: un mensaje que vuelve oculto deja de mostrar su texto', () => {
    const r = fusionar([m('a', 1)], [m('a', 1, { estado: 'oculto', texto: null })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ estado: 'oculto', texto: null });
  });
  it('ordena por fecha aunque lleguen desordenados, y por id si coinciden', () => {
    const r = fusionar([m('z', 5)], [m('b', 2), m('a', 2), m('y', 9)]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'z', 'y']);
  });
});

describe('reemplazarRecientes', () => {
  it('conserva lo anterior a la página y quita lo que el servidor ya no trae', () => {
    const actuales = [m('viejo', 1), m('a', 10), m('borrado', 11), m('b', 12)];
    const r = reemplazarRecientes(actuales, [m('a', 10), m('b', 12), m('c', 13)]);
    expect(r.map((x) => x.id)).toEqual(['viejo', 'a', 'b', 'c']);
  });
  it('un mensaje recién enviado, más nuevo que la página en camino, no desaparece', () => {
    const r = reemplazarRecientes([m('a', 10), m('recien', 20)], [m('a', 10), m('b', 12)]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'recien']);
  });
  it('una sala que quedó vacía se vacía', () => {
    expect(reemplazarRecientes([m('a', 1)], [])).toEqual([]);
  });
});

describe('mensajes sin leer', () => {
  const salas = [
    { groupId: 'a', sinLeer: 3 },
    { groupId: 'b', sinLeer: 2 },
  ];
  it('suma todas las salas', () => {
    expect(totalSinLeer(salas)).toBe(5);
    expect(totalSinLeer([])).toBe(0);
  });
  it('dice el número en singular y en plural', () => {
    expect(textoSinLeer(1)).toBe('1 mensaje sin leer');
    expect(textoSinLeer(4)).toBe('4 mensajes sin leer');
  });
  it('la sala abierta en el chat no cuenta; en otra pestaña o en otra página sí', () => {
    expect(totalSinLeer(sinLaSalaAbierta(salas, '/groups/a', ''))).toBe(2);
    expect(totalSinLeer(sinLaSalaAbierta(salas, '/groups/a', '?tab=chat'))).toBe(2);
    expect(totalSinLeer(sinLaSalaAbierta(salas, '/groups/a', '?tab=proposals'))).toBe(5);
    expect(totalSinLeer(sinLaSalaAbierta(salas, '/dashboard', ''))).toBe(5);
  });
});
