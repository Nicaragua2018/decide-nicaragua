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
 * Al volver a cargar la página reciente: se quedan los mensajes más viejos que esa página (cargados
 * con «Ver anteriores») y, de ahí en adelante, solo lo que la página trae. Así desaparece de la
 * pantalla lo que ya no existe en el servidor.
 */
export function reemplazarRecientes(actuales: ChatMensajeVista[], pagina: ChatMensajeVista[]): ChatMensajeVista[] {
  const primero = pagina[0];
  if (!primero) return [];
  return fusionar(
    actuales.filter((m) => m.createdAt < primero.createdAt),
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
