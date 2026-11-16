// La sesión se sostiene con dos cookies: un permiso corto (15 minutos) y otro largo
// (30 días) que solo sirve para pedir un permiso corto nuevo. Si nadie lo pide, a los
// 15 minutos la persona queda fuera sin aviso y sus formularios no llegan al servidor.
// Aquí está la renovación, que corre en el navegador mientras haya una página abierta.

/** El permiso corto dura 15 minutos: se renueva con margen. */
export const RENOVAR_CADA_MS = 10 * 60 * 1000;

const CLAVE_RENOVADA = 'decide.sesion.renovada';
const CLAVE_REANUDAR = 'decide.sesion.reanudar';
const CANDADO = 'decide-sesion';
/** Si otra pestaña renovó hace menos que esto, un rechazo no significa que la sesión venció. */
const RECIEN_MS = 30_000;

export type Renovacion = 'renovada' | 'vigente' | 'vencida' | 'sin-conexion';

/** ¿Hace falta pedir un permiso nuevo? `ultima` es cuándo se pidió el último (ms), o null. */
export function tocaRenovar(ahora: number, ultima: number | null): boolean {
  if (ultima === null) return true;
  const pasado = ahora - ultima;
  return pasado < 0 || pasado >= RENOVAR_CADA_MS;
}

/** A dónde ir después de entrar: solo rutas del propio sitio; si no, al inicio. */
export function destinoSeguro(next: string | null | undefined): string {
  const inicio = '/dashboard';
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return inicio;
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return inicio;
  return next;
}

/** Cuándo se renovó por última vez en este navegador (lo comparten todas las pestañas). */
export function ultimaRenovacion(): number | null {
  try {
    const valor = Number(window.localStorage.getItem(CLAVE_RENOVADA));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

/** Anota que la sesión está recién estrenada (al entrar o al renovar). */
export function anotarRenovacion(): void {
  try {
    window.localStorage.setItem(CLAVE_RENOVADA, Date.now().toString());
  } catch {
    // sin almacenamiento: cada pestaña renueva por su cuenta
  }
}

async function pedirPermisoNuevo(forzar: boolean): Promise<Renovacion> {
  if (!forzar && !tocaRenovar(Date.now(), ultimaRenovacion())) return 'vigente';
  let res: Response;
  try {
    res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  } catch {
    return 'sin-conexion';
  }
  if (res.ok) {
    anotarRenovacion();
    return 'renovada';
  }
  if (res.status === 401) {
    // El permiso largo es de un solo uso: si otra pestaña lo acaba de cambiar, este rechazo es esperado.
    const ultima = ultimaRenovacion();
    if (ultima !== null && Math.abs(Date.now() - ultima) < RECIEN_MS) return 'vigente';
    return 'vencida';
  }
  return 'sin-conexion';
}

/**
 * Pide un permiso nuevo si ya toca (o siempre, con `forzar`). Las pestañas se turnan,
 * porque el permiso largo cambia en cada renovación y dos pedidos a la vez se pisarían.
 */
export async function renovarSesion(forzar = false): Promise<Renovacion> {
  const candados = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!candados) return pedirPermisoNuevo(forzar);
  return candados.request(CANDADO, () => pedirPermisoNuevo(forzar));
}

/**
 * En la página de entrada: si el permiso largo sigue vigente, la persona no tiene que
 * escribir su contraseña otra vez. Devuelve true si la sesión quedó abierta.
 */
export async function reanudarSesion(): Promise<boolean> {
  try {
    const ultimo = Number(window.sessionStorage.getItem(CLAVE_REANUDAR));
    // Un solo intento cada medio minuto: evita dar vueltas si la sesión no se sostiene.
    if (Number.isFinite(ultimo) && ultimo > 0 && Math.abs(Date.now() - ultimo) < RECIEN_MS) return false;
    window.sessionStorage.setItem(CLAVE_REANUDAR, Date.now().toString());
  } catch {
    return false;
  }
  return (await renovarSesion(true)) === 'renovada';
}
