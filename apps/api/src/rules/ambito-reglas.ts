import { GENERAL_GROUP_SLUG } from '@decide/shared';
import type { RuleDefinition } from '@decide/shared';
import type { Prisma } from '@prisma/client';

/** Estados de un cambio abierto: como mucho uno por regla y ámbito (índice parcial único). */
export const CAMBIO_ABIERTO = ['en_votacion', 'pendiente_mesa'] as const;

/**
 * Comunidad donde se cambian reglas: origen, acogida o el nivel general «Exilio y diáspora».
 * Los grupos de trabajo y las demás comunidades no cambian reglas.
 */
export function esAmbitoDeReglas(g: { type: string; slug: string }): boolean {
  return g.type === 'territorial_origin' || g.type === 'territorial_residence' || esNivelGeneral(g);
}

export function esNivelGeneral(g: { type: string; slug: string }): boolean {
  return g.type === 'custom' && g.slug === GENERAL_GROUP_SLUG;
}

/**
 * Valor normalizado si cabe en la definición actual de la regla, o null. Un entero se acepta
 * solo como `-?\d+` dentro de `min`/`max` (sin ceros a la izquierda); una opción, solo si está
 * en `options`. Se usa al proponer y otra vez al aplicar: los límites pueden cambiar entre medio.
 */
export function normalizarValor(def: RuleDefinition, crudo: string): string | null {
  const v = crudo.trim();
  if (def.type === 'int') {
    const n = /^-?\d+$/.test(v) ? Number(v) : NaN;
    const min = def.min ?? Number.MIN_SAFE_INTEGER;
    const max = def.max ?? Number.MAX_SAFE_INTEGER;
    return Number.isSafeInteger(n) && n >= min && n <= max ? String(n) : null;
  }
  return def.options?.includes(v) ? v : null;
}

/**
 * Guarda el valor de una regla (colmena con `groupId` null, o local) dentro de la transacción.
 * Los índices únicos de `rule_values` son parciales, así que no sirve el upsert de Prisma:
 * busca y actualiza o crea.
 */
export async function guardarValor(
  tx: Prisma.TransactionClient,
  key: string,
  groupId: string | null,
  value: string,
): Promise<void> {
  const fila = await tx.ruleValue.findFirst({ where: { key, groupId } });
  if (fila) await tx.ruleValue.update({ where: { id: fila.id }, data: { value } });
  else await tx.ruleValue.create({ data: { key, groupId, value } });
}

/** Reglas que se comprueban juntas: el mínimo de puestos de una comisión no pasa del máximo. */
const PAR_DE_PUESTOS: Readonly<Record<string, string>> = {
  'comision.puestos_min': 'comision.puestos_max',
  'comision.puestos_max': 'comision.puestos_min',
};

export const PUESTOS_INCOHERENTES = 'El mínimo de puestos no puede ser mayor que el máximo.';

/** La otra regla del par mínimo/máximo de puestos, o null si la regla no forma parte de él. */
export function parDePuestos(key: string): string | null {
  return PAR_DE_PUESTOS[key] ?? null;
}

/** true si, con `valor` para `key` y `otro` para su par, el mínimo quedaría por encima del máximo. */
export function puestosIncoherentes(key: string, valor: string, otro: string): boolean {
  if (key === 'comision.puestos_min') return Number(valor) > Number(otro);
  if (key === 'comision.puestos_max') return Number(otro) > Number(valor);
  return false;
}

/** Valor vigente de una regla dentro de la transacción: el guardado si cabe en la definición, o el de por defecto. */
export async function valorVigenteTx(
  tx: Prisma.TransactionClient,
  def: RuleDefinition,
  groupId: string | null,
): Promise<string> {
  const fila = await tx.ruleValue.findFirst({ where: { key: def.key, groupId } });
  return (fila ? normalizarValor(def, fila.value) : null) ?? def.default;
}
