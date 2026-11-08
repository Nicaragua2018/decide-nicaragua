import { HttpException, HttpStatus, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { ModerationTarget, Prisma } from '@prisma/client';
import type { TipoTexto } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ModeracionPreviaService } from './moderacion-previa.service';
import { nombreDeError } from './errores';

const DIA_MS = 86_400_000;
/** Un texto en revisión vence a los 7 días y nunca se publica solo. */
const PLAZO_REVISION_DIAS = 7;

/** Último parámetro de cada método que publica texto de miembros. */
export interface OpcionesPublicar {
  /** La persona pidió que la mesa revise su texto de nivel 2. */
  pedirRevision?: boolean | undefined;
  /** Publicación aprobada por la mesa (Task 4): no se vuelve a revisar. */
  sinModeracion?: boolean | undefined;
}

export interface AntesDePublicar extends OpcionesPublicar {
  tipo: TipoTexto;
  /** El texto que se revisa (el mismo que vería la web; ver `textoParaRevisar`). */
  texto: string;
  autorProfileId: string;
  /** Los argumentos del método, sin la ip: para reproducir la llamada si la mesa lo aprueba. */
  args: unknown;
}

/**
 * La guardia del servidor: cada publicación de texto pasa por aquí, aunque la web no haya
 * revisado antes. El nivel 2 no se publica (422) salvo que se pida la revisión de la mesa (202).
 * El nivel 1 no bloquea. Si el asistente no respondió, se publica y entra en la cola posterior.
 */
@Injectable()
export class GuardiaService {
  private readonly logger = new Logger(GuardiaService.name);

  constructor(
    private readonly moderacion: ModeracionPreviaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async antesDePublicar(op: AntesDePublicar): Promise<{ revisado: boolean }> {
    if (op.sinModeracion) return { revisado: true };
    const revision = await this.moderacion.revisar(op.texto, op.tipo, { profileId: op.autorProfileId });
    // Apagado: se publica como en 3A, sin cola del nivel 3.
    if (revision.apagado) return { revisado: true };
    if (!revision.revisado) return { revisado: false };
    if (revision.nivel !== 2 || !revision.causa) return { revisado: true };

    if (!op.pedirRevision) throw new UnprocessableEntityException({ codigo: 'nivel_2', revision });

    // Idempotente: si la misma persona ya tiene una revisión pendiente y vigente con el mismo texto
    // y los mismos argumentos (el mismo destino), se reutiliza. El mismo texto a otro destino es otra.
    const candidatas = await this.prisma.textoEnRevision.findMany({
      where: { autorProfileId: op.autorProfileId, tipo: op.tipo, texto: op.texto, estado: 'pendiente' },
      select: { id: true, args: true, venceAt: true },
    });
    const ahora = Date.now();
    const existente = candidatas.find((c) => c.venceAt.getTime() > ahora && mismoJson(c.args, op.args));
    if (existente) throw new HttpException({ codigo: 'en_revision', revisionId: existente.id }, HttpStatus.ACCEPTED);

    const creada = await this.prisma.textoEnRevision.create({
      data: {
        autorProfileId: op.autorProfileId,
        tipo: op.tipo,
        args: op.args as Prisma.InputJsonValue,
        texto: op.texto,
        causa: revision.causa,
        venceAt: new Date(Date.now() + PLAZO_REVISION_DIAS * DIA_MS),
      },
    });
    // Sin texto ni autor.
    void this.audit.log({
      action: 'asistente.revision_pedida',
      resource: `texto_en_revision:${creada.id}`,
      metadata: { tipo: op.tipo, causa: revision.causa },
    });
    // 202: no es un error, pero el contenido no se crea. El cuerpo llega tal cual a la web.
    throw new HttpException({ codigo: 'en_revision', revisionId: creada.id }, HttpStatus.ACCEPTED);
  }

  /**
   * Si el asistente no revisó el texto, lo deja en la cola de la revisión posterior (nivel 3); si lo
   * revisó, quita la fila que hubiera del mismo contenido (un texto anterior ya cambiado).
   * Se llama ya publicado y fuera de la transacción; nunca lanza (lo publicado queda publicado).
   */
  async despuesDePublicar(target: ModerationTarget, targetId: string, revisado: boolean): Promise<void> {
    if (revisado) {
      // Una edición ya revisada deja sin objeto la fila que esperaba revisar el texto anterior.
      try {
        await this.prisma.colaRevisionPosterior.deleteMany({ where: { target, targetId } });
      } catch (err) {
        this.logger.error(`No se pudo quitar de la cola de la revisión posterior: ${nombreDeError(err)}`);
      }
      return;
    }
    try {
      await this.prisma.colaRevisionPosterior.upsert({
        where: { target_targetId: { target, targetId } },
        create: { target, targetId },
        update: {},
      });
    } catch (err) {
      this.logger.error(`No se pudo encolar la revisión posterior: ${nombreDeError(err)}`);
    }
  }
}

/** Forma canónica de un valor JSON: claves ordenadas, sin `undefined` (como lo guarda la base). */
function canonico(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(canonico);
  if (x !== null && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, canonico(o[k])]),
    );
  }
  return x;
}

/** Igualdad profunda de dos valores JSON (el guardado en la base y el de la llamada). */
function mismoJson(a: unknown, b: unknown): boolean {
  try {
    const forma = (x: unknown): string => JSON.stringify(canonico(JSON.parse(JSON.stringify(x ?? null))));
    return forma(a) === forma(b);
  } catch {
    return false;
  }
}
