import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CAUSAS_NIVEL_2, MODERACION_CAUSAS } from '@decide/shared';
import type { ModeracionCausaValue, NivelRevision, RevisionTexto, TipoTexto } from '@decide/shared';
import { RedisService } from '../redis/redis.service';
import { AsistenteService } from './asistente.service';
import { conLimite } from './con-limite';

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
  candidatura: 'la ficha de una persona que se presenta a un cargo (presentación y compromisos)',
  revocacion: 'el motivo de un pedido de revocación de un cargo de la comunidad',
  observacion: 'una observación pública sobre un hecho del registro de la plataforma',
};

/**
 * Instrucción fija de la revisión previa. Vive en el código y nunca incluye texto de miembros:
 * el texto va aparte, como material.
 */
export const TAREA_REVISION = `Tarea: revisar un texto que una persona quiere publicar en Nicaragua Decide y clasificarlo en uno de tres niveles. Tu trabajo es cuidar la conversación, no decidir qué opiniones valen.

Nivel 0: se publica sin aviso. Es el caso normal.
- La crítica política con argumentos, contra cualquier gobierno, partido, institución, persona pública o lado, SIEMPRE es nivel 0, aunque sea dura o incómoda. Nunca es nivel 1 ni nivel 2.
- También son nivel 0 el desacuerdo, la queja, la indignación, la ironía, las malas palabras sin destinatario y los modismos nicaragüenses dichos sin intención de ofender.
- Los calificativos políticos duros contra un lado, partido, gobierno o movimiento en su conjunto (por ejemplo «vendepatria», «traidores», «golpistas», «dictadura», «corruptos») son parte de la crítica política: si van con argumentos, son nivel 0, sea cual sea el lado criticado. El nivel 1 es para el insulto dirigido a una persona concreta.

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
- sugerencia: en los niveles 1 y 2, el texto completo dicho con respeto, que conserve la idea, los argumentos y la postura de quien escribe, incluida su crítica. No cambies lo que piensa ni lo suavices hasta vaciarlo. Si hay datos personales, quítalos. Si el texto tiene un título y un cuerpo separados por una línea en blanco, la sugerencia conserva esa misma estructura: el título, una línea en blanco y el cuerpo.
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

/**
 * Lo guardado en caché: solo nivel, causa y revisado. Nunca el texto, ni la explicación
 * ni la sugerencia (que repiten partes del texto). Una entrada vieja con más campos se recorta.
 */
type RevisionGuardada = Pick<RevisionTexto, 'nivel' | 'causa' | 'revisado'>;

function soloLoGuardable(r: RevisionTexto): RevisionGuardada {
  const g: RevisionGuardada = { nivel: r.nivel, revisado: r.revisado };
  if (r.causa !== undefined) g.causa = r.causa;
  return g;
}

/** Resultado interno: `apagado` dice que el asistente está apagado (se publica como en 3A, sin cola). */
export type RevisionPrevia = RevisionTexto & { apagado?: true };

export interface OpcionesRevisar {
  /** Perfil que pide la revisión: cuenta para el límite diario. Sin perfil (examen) no se cuenta. */
  profileId?: string | undefined;
  /** La pide la web: necesita explicación y sugerencia, así que un acierto de caché de nivel > 0 no sirve. */
  paraWeb?: boolean | undefined;
}

/** Revisiones del asistente por perfil y día UTC (web y guardia juntas). */
export const LIMITE_DIARIO_POR_PERFIL = 100;
const CONTADOR_SEGUNDOS = 26 * 3600;
/** Tiempo máximo de cada operación de Redis: un Redis caído no puede demorar una publicación. */
const REDIS_MAXIMO_MS = 300;

/**
 * Moderación previa: clasifica un texto antes de publicarlo. Nunca lanza.
 * - Asistente apagado: `apagado`, sin tocar Redis ni encolar (igual que 3A).
 * - Encendido pero sin respuesta (sin margen, lento, salida inválida o límite diario): nivel 0 sin revisar.
 */
@Injectable()
export class ModeracionPreviaService {
  private readonly logger = new Logger(ModeracionPreviaService.name);

  constructor(
    private readonly asistente: AsistenteService,
    private readonly redis: RedisService,
  ) {}

  async revisar(texto: string, tipo: TipoTexto, opciones: OpcionesRevisar = {}): Promise<RevisionPrevia> {
    if (!this.asistente.activo()) return { nivel: 0, revisado: true, apagado: true };

    // La clave es un hash: en Redis nunca queda el texto.
    const clave = `asistente:rev:${createHash('sha256').update(`${tipo}\n${texto}`).digest('hex')}`;
    const guardada = await this.leerCache(clave);
    // La guardia usa cualquier acierto; la web solo el de nivel 0 (para los demás necesita la explicación).
    if (guardada && (!opciones.paraWeb || guardada.nivel === 0)) return guardada;

    if (opciones.profileId && !(await this.dentroDelLimite(opciones.profileId))) {
      return { nivel: 0, revisado: false };
    }

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
    const guardado = await conLimite(
      Promise.resolve().then(() => this.redis.set(clave, JSON.stringify(soloLoGuardable(revision)), CACHE_SEGUNDOS)),
      REDIS_MAXIMO_MS,
    );
    if (guardado === null) this.logger.warn('No se pudo guardar la revisión en caché');
    return revision;
  }

  /** Suma una revisión al contador del perfil en el día UTC. Si Redis falla o tarda, se permite. */
  private async dentroDelLimite(profileId: string): Promise<boolean> {
    const dia = new Date().toISOString().slice(0, 10);
    // El identificador del perfil va como hash: en Redis no queda quién usó el asistente.
    const perfil = createHash('sha256').update(profileId).digest('hex');
    const n = await conLimite(
      Promise.resolve().then(() => this.redis.contar(`asistente:dia:${perfil}:${dia}`, CONTADOR_SEGUNDOS)),
      REDIS_MAXIMO_MS,
    );
    return n === null || n <= LIMITE_DIARIO_POR_PERFIL;
  }

  private async leerCache(clave: string): Promise<RevisionGuardada | null> {
    const crudo = await conLimite(Promise.resolve().then(() => this.redis.get(clave)), REDIS_MAXIMO_MS);
    if (!crudo) return null;
    try {
      const valor: unknown = JSON.parse(crudo);
      if (!esRevision(valor) || (valor as { revisado?: unknown }).revisado !== true) return null;
      return soloLoGuardable(valor as RevisionTexto);
    } catch {
      return null;
    }
  }
}
