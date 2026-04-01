import type { Request } from 'express';

/**
 * Extrae la IP real del cliente.
 * Cuando la API está detrás de Traefik, X-Forwarded-For lleva la IP original.
 * Se toma solo el primer valor para evitar spoofing en cadenas de proxies.
 */
export function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  }
  return req.ip ?? 'unknown';
}
