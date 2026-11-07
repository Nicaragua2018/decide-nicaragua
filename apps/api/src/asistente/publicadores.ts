import { Injectable } from '@nestjs/common';
import type { TipoTexto } from '@decide/shared';

export type FuncionPublicar = (autorProfileId: string, args: unknown, opts: { sinModeracion: true }) => Promise<unknown>;

/**
 * Registro de quién sabe publicar cada tipo de texto. Lo usa la revisión de la mesa (Task 4)
 * para publicar un texto aprobado reproduciendo la llamada original (`args`).
 *
 * Cada servicio registra su método en `onModuleInit`: así este módulo no depende de ellos y
 * no hay dependencias circulares. Si un tipo se publica por más de un camino (un tema nace en
 * «nuevo tema» o al abrir un debate desde inquietudes), el camino extra se registra con una
 * variante (`via`) y `args.via` la elige.
 */
@Injectable()
export class Publicadores {
  private readonly funciones = new Map<string, FuncionPublicar>();

  registrar(tipo: TipoTexto, fn: FuncionPublicar, via?: string): void {
    const clave = via ? `${tipo}:${via}` : tipo;
    if (this.funciones.has(clave)) throw new Error(`Ya hay un publicador para ${clave}`);
    this.funciones.set(clave, fn);
  }

  async publicar(tipo: TipoTexto, autorProfileId: string, args: unknown): Promise<unknown> {
    const via = typeof args === 'object' && args !== null ? (args as { via?: unknown }).via : undefined;
    const clave = typeof via === 'string' ? `${tipo}:${via}` : tipo;
    const fn = this.funciones.get(clave);
    if (!fn) throw new Error(`No hay publicador para ${clave}`);
    return fn(autorProfileId, args, { sinModeracion: true });
  }
}
