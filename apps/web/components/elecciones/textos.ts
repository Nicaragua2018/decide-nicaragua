import { CARGO_ETIQUETA, type EleccionResumen } from '@decide/shared';

const DIA_MS = 24 * 60 * 60 * 1000;

/** «Coordinación de la comunidad · León» o «Secretaría · Nicaragua». */
export function tituloEleccion(e: Pick<EleccionResumen, 'cargo' | 'ambito'>): string {
  return `${CARGO_ETIQUETA[e.cargo]} · ${e.ambito.nombre}`;
}

export function puestosTexto(n: number): string {
  return n === 1 ? '1 puesto' : `${n} puestos`;
}

/** La cuenta atrás grande: «Faltan 5 días para votar». Null si ya no hay plazo abierto. */
export function cuentaAtras(e: Pick<EleccionResumen, 'fase' | 'candidaturasEndsAt' | 'votacionEndsAt'>, ahora: number): string | null {
  if (e.fase === 'contada') return null;
  const fin = new Date(e.fase === 'candidaturas' ? e.candidaturasEndsAt : e.votacionEndsAt).getTime();
  const para = e.fase === 'candidaturas' ? 'para presentarse' : 'para votar';
  const resta = fin - ahora;
  if (resta <= 0) return e.fase === 'candidaturas' ? 'Se cerró el plazo para presentarse' : 'Se cerró la votación';
  const dias = Math.ceil(resta / DIA_MS);
  if (dias <= 1) return `Queda menos de un día ${para}`;
  return `Faltan ${dias} días ${para}`;
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' });
}
