import { createHash } from 'crypto';

/**
 * Genera un hash SHA-256 de una IP con salt.
 * Protege la privacidad del usuario sin perder trazabilidad operacional.
 * El salt debe rotarse periódicamente para limitar la correlación a largo plazo.
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex');
}

/**
 * Genera un hash SHA-256 del payload de un evento de auditoría.
 * Permite verificar integridad sin exponer el contenido.
 */
export function hashPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}
