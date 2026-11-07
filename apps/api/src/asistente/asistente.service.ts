import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { INSTRUCCIONES_BASE } from './instrucciones';
import { limpiarTexto } from './limpieza';
import { costoMicrodolares, mesUtc, topeMicrodolares, type UsoTokens } from './gasto';
import { nombreDeError } from './errores';

/** Token de inyección del cliente de Anthropic (null si falta ANTHROPIC_API_KEY). */
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');
export type ClienteAnthropic = Pick<Anthropic, 'messages'>;

export type ModeloAsistente = 'rapido' | 'capaz';
export type PrioridadAsistente = 'interactiva' | 'nocturna';

export interface PedidoAsistente<T> {
  modelo: ModeloAsistente;
  prioridad: PrioridadAsistente;
  /** Instrucción fija de la tarea (código, nunca texto de miembros). */
  tarea: string;
  /** Texto a analizar: va solo en el turno de usuario, dentro de <material>. */
  material: string;
  herramienta: { nombre: string; esquema: Record<string, unknown> };
  validar: (x: unknown) => x is T;
  timeoutMs?: number;
}

export interface EstadoAsistente {
  activo: boolean;
  topeAlcanzado: boolean;
}

const TOPE_POR_DEFECTO_USD = 20;
const MODELO_RAPIDO_POR_DEFECTO = 'claude-haiku-5-5';
const MODELO_CAPAZ_POR_DEFECTO = 'claude-sonnet-5-5';
const TIMEOUT_POR_DEFECTO_MS = 30_000;

/**
 * Forzar la herramienta (`tool_choice: {type: 'tool'}`) solo lo aceptan algunos
 * modelos: Haiku 5.5 sí; Sonnet 5.5, Opus 5.5 y Fable 5.1 responden 400 (skill
 * claude-api, typescript/claude-api/tool-use.md). Con el resto se usa `auto` y
 * las instrucciones nombran la herramienta; `validar` descarta cualquier otra salida.
 */
function admiteHerramientaForzada(modelo: string): boolean {
  return modelo.startsWith('claude-haiku-');
}

/**
 * La puerta única hacia Claude. Toda llamada al servicio de IA pasa por `pedir()`,
 * que aplica el interruptor, el tope de gasto, la limpieza del texto, el tiempo
 * máximo y la validación de la salida. Nunca lanza: ante cualquier problema
 * devuelve null y quien llama sigue como si el asistente no existiera.
 */
@Injectable()
export class AsistenteService {
  private readonly logger = new Logger(AsistenteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    @Inject(ANTHROPIC_CLIENT) private readonly cliente: ClienteAnthropic | null,
  ) {
    if (this.interruptor() && !this.cliente) {
      this.logger.warn('ASISTENTE_ACTIVO="true" pero falta ANTHROPIC_API_KEY: el asistente queda apagado.');
    }
  }

  /** Encendido solo si ASISTENTE_ACTIVO vale exactamente "true" y hay clave. */
  activo(): boolean {
    return this.interruptor() && this.cliente !== null;
  }

  /** Si queda presupuesto este mes: la nocturna para al 80 % del tope, la interactiva al 100 %. */
  async tieneMargen(prioridad: PrioridadAsistente): Promise<boolean> {
    try {
      const gasto = await this.gastoDelMes();
      const tope = this.tope();
      const limite = prioridad === 'nocturna' ? (tope * 8n) / 10n : tope;
      return gasto < limite;
    } catch (err) {
      this.logger.error(`No se pudo leer el gasto del asistente: ${nombreDeError(err)}`);
      return false;
    }
  }

  async estado(): Promise<EstadoAsistente> {
    return { activo: this.activo(), topeAlcanzado: !(await this.tieneMargen('interactiva')) };
  }

  async pedir<T>(op: PedidoAsistente<T>): Promise<T | null> {
    try {
      if (!this.activo() || !this.cliente) return null;
      if (!(await this.tieneMargen(op.prioridad))) return null;

      const modelo = this.modelo(op.modelo);
      const forzada = admiteHerramientaForzada(modelo);
      const herramienta: Anthropic.Tool = {
        name: op.herramienta.nombre,
        description: 'Entrega aquí el resultado de la tarea.',
        input_schema: op.herramienta.esquema as Anthropic.Tool.InputSchema,
      };
      const system =
        INSTRUCCIONES_BASE +
        '\n\n' +
        op.tarea +
        `\n\nEntrega el resultado llamando a la herramienta «${op.herramienta.nombre}».`;

      const respuesta = await this.conTiempoMaximo(op.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS, (signal) =>
        this.cliente!.messages.create(
          {
            model: modelo,
            max_tokens: forzada ? 2048 : 16_000,
            system,
            tools: [herramienta],
            tool_choice: forzada ? { type: 'tool', name: op.herramienta.nombre } : { type: 'auto' },
            messages: [{ role: 'user', content: `<material>\n${limpiarTexto(op.material)}\n</material>` }],
          },
          { signal, ...(op.prioridad === 'interactiva' ? { maxRetries: 0 } : {}) },
        ),
      );
      if (!respuesta) return null;

      await this.registrarGasto(modelo, respuesta.usage);

      const bloque = respuesta.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === op.herramienta.nombre,
      );
      if (!bloque || !op.validar(bloque.input)) {
        this.logger.warn(`Salida del asistente descartada (herramienta ${op.herramienta.nombre})`);
        return null;
      }
      return bloque.input;
    } catch (err) {
      this.logger.warn(`El asistente no respondió: ${err instanceof Error ? err.name : 'error'}`);
      return null;
    }
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  private interruptor(): boolean {
    return this.config.get<string>('ASISTENTE_ACTIVO') === 'true';
  }

  private modelo(m: ModeloAsistente): string {
    return m === 'rapido'
      ? (this.config.get<string>('ASISTENTE_MODELO_RAPIDO') || MODELO_RAPIDO_POR_DEFECTO)
      : (this.config.get<string>('ASISTENTE_MODELO_CAPAZ') || MODELO_CAPAZ_POR_DEFECTO);
  }

  private tope(): bigint {
    const crudo = this.config.get<string>('ASISTENTE_TOPE_MENSUAL_USD');
    const usd = crudo === undefined || crudo === '' ? NaN : Number(crudo);
    return topeMicrodolares(Number.isFinite(usd) && usd >= 0 ? usd : TOPE_POR_DEFECTO_USD);
  }

  private async gastoDelMes(): Promise<bigint> {
    const fila = await this.prisma.usoAsistente.findUnique({ where: { mes: mesUtc() } });
    return fila?.costoMicrodolares ?? 0n;
  }

  /** Corre la llamada con un tiempo máximo; al vencer, la aborta y devuelve null. */
  private async conTiempoMaximo<R>(ms: number, llamada: (signal: AbortSignal) => Promise<R>): Promise<R | null> {
    const control = new AbortController();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const vencido = new Promise<null>((resolve) => {
      temporizador = setTimeout(() => {
        control.abort();
        resolve(null);
      }, ms);
    });
    try {
      return await Promise.race([llamada(control.signal), vencido]);
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Suma el costo de la llamada al mes UTC (upsert + increment, atómico). Si con
   * eso se cruza el 100 % por primera vez en el mes, avisa una sola vez: el
   * updateMany condicionado a `avisoTopeAt: null` solo lo gana una llamada.
   * Nunca lanza.
   */
  private async registrarGasto(modelo: string, uso: UsoTokens): Promise<void> {
    try {
      const mes = mesUtc();
      const costo = costoMicrodolares(modelo, uso);
      const fila = await this.sumarGasto(mes, costo);
      if (fila.costoMicrodolares < this.tope()) return;

      const { count } = await this.prisma.usoAsistente.updateMany({
        where: { mes, avisoTopeAt: null },
        data: { avisoTopeAt: new Date() },
      });
      if (count !== 1) return;

      // Sin esperar: un correo o una auditoría lentos no deben llevar a pedir() más allá de su tiempo.
      void this.avisarTope(mes);
    } catch (err) {
      this.logger.error(`No se pudo registrar el gasto del asistente: ${nombreDeError(err)}`);
    }
  }

  private async sumarGasto(mes: string, costo: bigint) {
    const args = {
      where: { mes },
      create: { mes, costoMicrodolares: costo },
      update: { costoMicrodolares: { increment: costo } },
    };
    try {
      return await this.prisma.usoAsistente.upsert(args);
    } catch (err) {
      // Dos creaciones simultáneas del mismo mes: la segunda reintenta y ya incrementa.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.usoAsistente.upsert(args);
      }
      throw err;
    }
  }

  /** Auditoría y correo del tope alcanzado. Nunca lanza (se llama sin esperar). */
  private async avisarTope(mes: string): Promise<void> {
    try {
      await this.audit.log({ action: 'asistente.tope_alcanzado', resource: `uso_asistente:${mes}`, metadata: { mes } });
      await this.avisarPorCorreo();
    } catch (err) {
      this.logger.error(`No se pudo avisar del tope del asistente: ${nombreDeError(err)}`);
    }
  }

  private async avisarPorCorreo(): Promise<void> {
    const destino = this.config.get<string>('ASISTENTE_AVISO_EMAIL');
    if (!destino) {
      this.logger.warn('Se alcanzó el tope del asistente, pero falta ASISTENTE_AVISO_EMAIL: no se envía correo.');
      return;
    }
    try {
      await this.email.sendAvisoTopeAsistente(destino);
    } catch (err) {
      this.logger.error(`No se pudo enviar el aviso del tope del asistente: ${nombreDeError(err)}`);
    }
  }
}
