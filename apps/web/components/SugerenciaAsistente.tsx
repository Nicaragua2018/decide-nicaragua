import type { ReactNode } from 'react';
import type { BaseSugerencia } from '@decide/shared';
import { formatDate } from '@/app/(app)/inquietudes/status';

export const ETIQUETA_SUGERENCIA = 'Sugerencia del asistente';

/** «Basado en N frases y M opiniones, al <fecha>», con lo que haya en `base`. */
export function lineaBase(base: BaseSugerencia): string {
  const plural = (n: number, uno: string, varios: string) => `${n.toString()} ${n === 1 ? uno : varios}`;
  const partes: string[] = [];
  if (base.inquietudes !== undefined) partes.push(plural(base.inquietudes, 'inquietud', 'inquietudes'));
  if (base.frases !== undefined) partes.push(plural(base.frases, 'frase', 'frases'));
  if (base.opiniones !== undefined) partes.push(plural(base.opiniones, 'opinión', 'opiniones'));
  const fecha = formatDate(base.at);
  if (partes.length === 0) return `Hecha el ${fecha}`;
  const texto = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  return `Basado en ${texto}, al ${fecha}`;
}

/** Etiqueta pequeña para contenido creado por el asistente (inquietudes y temas). */
export function MarcaAsistente() {
  return <span className="badge badge-asistente">{ETIQUETA_SUGERENCIA}</span>;
}

/** Marco común de toda sugerencia del asistente. */
export function SugerenciaAsistente({
  titulo,
  base,
  children,
}: {
  titulo?: string;
  base: BaseSugerencia;
  children: ReactNode;
}) {
  return (
    <aside className="card sugerencia-asistente mb-4" aria-label={ETIQUETA_SUGERENCIA}>
      <p className="sugerencia-asistente-etiqueta">{ETIQUETA_SUGERENCIA}</p>
      {titulo && <p className="card-title">{titulo}</p>}
      {children}
      <p className="card-meta mt-2">{lineaBase(base)}</p>
      <p className="card-meta">Puedes usarla, cambiarla o descartarla.</p>
    </aside>
  );
}
