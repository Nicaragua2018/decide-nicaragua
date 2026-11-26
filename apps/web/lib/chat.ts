import type { ChatMensajeVista } from '@decide/shared';

/**
 * Une los mensajes que ya están en pantalla con los que llegan: sin duplicados por id (la versión
 * nueva reemplaza a la vieja, p. ej. un mensaje que vuelve oculto) y en orden de llegada.
 */
export function fusionar(actuales: ChatMensajeVista[], nuevos: ChatMensajeVista[]): ChatMensajeVista[] {
  const porId = new Map<string, ChatMensajeVista>();
  for (const m of actuales) porId.set(m.id, m);
  for (const m of nuevos) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.createdAt < b.createdAt ? -1 : 1,
  );
}

/**
 * Al volver a cargar la página reciente: dentro del tramo que la página cubre, solo vale lo que
 * ella trae (así desaparece de la pantalla lo que ya no existe en el servidor). Se conserva lo más
 * viejo (cargado con «Ver anteriores») y lo más nuevo que la página: un mensaje que la persona
 * acaba de enviar mientras la consulta estaba en camino no debe desaparecer.
 */
export function reemplazarRecientes(actuales: ChatMensajeVista[], pagina: ChatMensajeVista[]): ChatMensajeVista[] {
  const primero = pagina[0];
  const ultimo = pagina[pagina.length - 1];
  if (!primero || !ultimo) return [];
  return fusionar(
    actuales.filter((m) => m.createdAt < primero.createdAt || m.createdAt > ultimo.createdAt),
    pagina,
  );
}

/** Hora local corta de un mensaje; si no es de hoy, con el día. */
export function horaDe(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
  const mismoDia = d.toDateString() === ahora.toDateString();
  return mismoDia ? hora : `${d.toLocaleDateString('es-NI', { day: 'numeric', month: 'short' })}, ${hora}`;
}

/** Suma de los mensajes sin leer de todas las salas. */
export function totalSinLeer(salas: { sinLeer: number }[]): number {
  return salas.reduce((n, s) => n + s.sinLeer, 0);
}

export function textoSinLeer(n: number): string {
  return n === 1 ? '1 mensaje sin leer' : `${n} mensajes sin leer`;
}

/**
 * La sala que la persona tiene abierta ahora mismo se da por leída: el servidor la marca al
 * consultarla, pero el contador puede llegar unos segundos antes.
 */
export function sinLaSalaAbierta<T extends { groupId: string; sinLeer: number }>(salas: T[], pathname: string, search: string): T[] {
  const tab = new URLSearchParams(search).get('tab');
  if (tab !== null && tab !== 'chat') return salas;
  return salas.map((s) => (pathname === `/groups/${s.groupId}` ? { ...s, sinLeer: 0 } : s));
}
