import { HttpException, HttpStatus, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { ModerationTarget, Prisma } from '@prisma/client';
import type { TipoTexto } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ModeracionPreviaService } from './moderacion-previa.service';

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
    const revision = await this.moderacion.revisar(op.texto, op.tipo);
    if (!revision.revisado) return { revisado: false };
    if (revision.nivel !== 2 || !revision.causa) return { revisado: true };

    if (!op.pedirRevision) throw new UnprocessableEntityException({ codigo: 'nivel_2', revision });

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
   * Si el asistente no revisó el texto, lo deja en la cola de la revisión posterior (nivel 3).
   * Se llama ya publicado y fuera de la transacción; nunca lanza (lo publicado queda publicado).
   */
  async despuesDePublicar(target: ModerationTarget, targetId: string, revisado: boolean): Promise<void> {
    if (revisado) return;
    try {
      await this.prisma.colaRevisionPosterior.upsert({
        where: { target_targetId: { target, targetId } },
        create: { target, targetId },
        update: {},
      });
    } catch (err) {
      this.logger.error('No se pudo encolar la revisión posterior', err instanceof Error ? err.stack : undefined);
    }
  }
}
