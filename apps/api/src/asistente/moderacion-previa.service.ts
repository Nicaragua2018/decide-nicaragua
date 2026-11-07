import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CAUSAS_NIVEL_2, MODERACION_CAUSAS } from '@decide/shared';
import type { ModeracionCausaValue, NivelRevision, RevisionTexto, TipoTexto } from '@decide/shared';
import { RedisService } from '../redis/redis.service';
import { AsistenteService } from './asistente.service';

/** Salida de la herramienta, tal como la entrega el modelo (antes de normalizar). */
export interface SalidaRevision {
  nivel: NivelRevision;
  causa?: ModeracionCausaValue;
  explicacion?: string;
  sugerencia?: string;
}

const CAUSAS = MODERACION_CAUSAS.map((c) => c.value);
const MAX_EXPLICACION = 500;
const MAX_SUGERENCIA = 5000;
const CACHE_SEGUNDOS = 600;
const TIEMPO_MAXIMO_MS = 5000;

/** Esquema de la herramienta de revisión. Task 5 (revisión posterior) usa el mismo. */
export const ESQUEMA_REVISION: Record<string, unknown> = {
  type: 'object',
  properties: {
    nivel: { type: 'integer', enum: [0, 1, 2], description: '0 = se publica, 1 = aviso amable, 2 = no se publica sin la mesa.' },
    causa: { type: 'string', enum: CAUSAS, description: 'Obligatoria en el nivel 2. Opcional en el 1. Nunca en el 0.' },
    explicacion: { type: 'string', description: 'En los niveles 1 y 2: una o dos frases en español sencillo para quien escribe.' },
    sugerencia: { type: 'string', description: 'En los niveles 1 y 2: el texto dicho con respeto, con la misma idea.' },
  },
  required: ['nivel'],
};

/** Valida la forma de la salida. Task 5 la reutiliza. */
export function esRevision(x: unknown): x is SalidaRevision {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o['nivel'] !== 0 && o['nivel'] !== 1 && o['nivel'] !== 2) return false;
  if (o['causa'] !== undefined && !(CAUSAS as readonly unknown[]).includes(o['causa'])) return false;
  if (o['explicacion'] !== undefined && typeof o['explicacion'] !== 'string') return false;
  if (o['sugerencia'] !== undefined && typeof o['sugerencia'] !== 'string') return false;
  return true;
}

const QUE_ES: Record<TipoTexto, string> = {
  inquietud: 'una inquietud (un problema que alguien plantea a su comunidad: título y explicación)',
  respuesta_inquietud: 'la respuesta de quien organiza la comunidad a una inquietud',
  frase: 'una frase corta de opinión dentro de un debate',
  solucion: 'una solución propuesta en un debate (título y descripción)',
  tema: 'un tema de debate (título y texto)',
  comentario: 'un comentario en un debate',
  informe: 'el informe de una comisión de trabajo',
  motivo_regla: 'el motivo para cambiar una regla de la comunidad',
  subgrupo: 'el nombre y el propósito de un grupo de trabajo nuevo',
};

/**
 * Instrucción fija de la revisión previa. Vive en el código y nunca incluye texto de miembros:
 * el texto va aparte, como material.
 */
export const TAREA_REVISION = `Tarea: revisar un texto que una persona quiere publicar en Nicaragua Decide y clasificarlo en uno de tres niveles. Tu trabajo es cuidar la conversación, no decidir qué opiniones valen.

Nivel 0: se publica sin aviso. Es el caso normal.
- La crítica política con argumentos, contra cualquier gobierno, partido, institución, persona pública o lado, SIEMPRE es nivel 0, aunque sea dura o incómoda. Nunca es nivel 1 ni nivel 2.
- También son nivel 0 el desacuerdo, la queja, la indignación, la ironía, las malas palabras sin destinatario y los modismos nicaragüenses dichos sin intención de ofender.

Nivel 1: se publica, pero se avisa en privado y con amabilidad a quien escribe.
- Un insulto suelto o una descalificación personal sin amenaza (por ejemplo, llamar «idiota» o «inútil» a alguien) es nivel 1, nunca nivel 2.
- También un tono despectivo que puede ofender y restarle apoyo a la idea.

Nivel 2: no se publica sin la revisión de la mesa. SOLO en estos cuatro casos, con su causa:
- odio: incita al odio o ataca a un grupo por lo que es (origen, etnia, color, religión, sexo, orientación, discapacidad).
- insultos_amenazas: SOLO amenazas o acoso contra una persona. Un insulto suelto no es nivel 2: es nivel 1.
- datos_personales: datos que identifican o ponen en riesgo a una persona (dirección, teléfono, documento, dónde vive o trabaja alguien que no es figura pública).
- ilegal_violencia: contenido ilegal o que incita a la violencia.
Si ninguna de las cuatro causas aplica, no es nivel 2. Si dudas entre dos niveles, elige el más bajo.

Qué entregar:
- nivel: 0, 1 o 2.
- causa: en el nivel 2, una de las cuatro anteriores. En el nivel 1 es opcional. En el nivel 0, nada.
- explicacion: en los niveles 1 y 2, una o dos frases cortas en español sencillo, dirigidas a quien escribe («tu texto…»), que digan qué parte es el problema y por qué, sin juzgar a la persona.
- sugerencia: en los niveles 1 y 2, el texto completo dicho con respeto, que conserve la idea, los argumentos y la postura de quien escribe, incluida su crítica. No cambies lo que piensa ni lo suavices hasta vaciarlo. Si hay datos personales, quítalos.
- En el nivel 0 no pongas causa, explicacion ni sugerencia.`;

/** Instrucción completa para un tipo de texto. La revisión posterior (Task 5) usa la misma. */
export function tareaRevision(tipo: TipoTexto): string {
  return `${TAREA_REVISION}\n\nEl texto es ${QUE_ES[tipo]}.`;
}

/** Normaliza la salida: un nivel 2 sin causa válida baja a 1; el 0 no lleva nada más. */
export function normalizarRevision(s: SalidaRevision): RevisionTexto {
  let nivel = s.nivel;
  if (nivel === 2 && (s.causa === undefined || !CAUSAS_NIVEL_2.includes(s.causa))) nivel = 1;
  if (nivel === 0) return { nivel: 0, revisado: true };
  const r: RevisionTexto = { nivel, revisado: true };
  if (s.causa !== undefined) r.causa = s.causa;
  if (s.explicacion) r.explicacion = s.explicacion.slice(0, MAX_EXPLICACION);
  if (s.sugerencia) r.sugerencia = s.sugerencia.slice(0, MAX_SUGERENCIA);
  return r;
}

/** Lo guardado en caché: una revisión ya normalizada (nunca el texto). */
function esRevisionGuardada(x: unknown): x is RevisionTexto {
  return esRevision(x) && (x as { revisado?: unknown }).revisado === true;
}

/**
 * Moderación previa: clasifica un texto antes de publicarlo. Nunca lanza; si el asistente
 * no responde (apagado, sin margen, lento o con salida inválida) devuelve nivel 0 sin revisar.
 */
@Injectable()
export class ModeracionPreviaService {
  private readonly logger = new Logger(ModeracionPreviaService.name);

  constructor(
    private readonly asistente: AsistenteService,
    private readonly redis: RedisService,
  ) {}

  async revisar(texto: string, tipo: TipoTexto): Promise<RevisionTexto> {
    // La clave es un hash: en Redis nunca queda el texto.
    const clave = `asistente:rev:${createHash('sha256').update(`${tipo}\n${texto}`).digest('hex')}`;
    const guardada = await this.leerCache(clave);
    if (guardada) return guardada;

    const salida = await this.asistente.pedir({
      modelo: 'rapido',
      prioridad: 'interactiva',
      timeoutMs: TIEMPO_MAXIMO_MS,
      tarea: tareaRevision(tipo),
      material: texto,
      herramienta: { nombre: 'clasificar_texto', esquema: ESQUEMA_REVISION },
      validar: esRevision,
    });
    if (!salida) return { nivel: 0, revisado: false };

    const revision = normalizarRevision(salida);
    try {
      await this.redis.set(clave, JSON.stringify(revision), CACHE_SEGUNDOS);
    } catch (err) {
      this.logger.warn(`No se pudo guardar la revisión en caché: ${err instanceof Error ? err.name : 'error'}`);
    }
    return revision;
  }

  private async leerCache(clave: string): Promise<RevisionTexto | null> {
    try {
      const crudo = await this.redis.get(clave);
      if (!crudo) return null;
      const valor: unknown = JSON.parse(crudo);
      return esRevisionGuardada(valor) ? valor : null;
    } catch {
      return null;
    }
  }
}
