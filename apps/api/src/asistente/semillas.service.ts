import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AsistenteService } from './asistente.service';
import { nombreDeError } from './errores';
import { CUERPO_SEMILLA, MARCA_SEMILLAS, PREGUNTAS_INICIALES } from './semillas';

/** Siembra una sola vez las doce preguntas iniciales como inquietudes del nivel general. */
@Injectable()
export class SemillasService {
  private readonly logger = new Logger(SemillasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asistente: AsistenteService,
    private readonly audit: AuditService,
  ) {}

  /** Devuelve cuántas inquietudes creó: 12 o 0. */
  async sembrar(_now: Date): Promise<number> {
    if (!(await this.asistente.estado()).activo) return 0;
    if (await this.prisma.marcaAsistente.findUnique({ where: { clave: MARCA_SEMILLAS } })) return 0;
    const general = await this.prisma.group.findFirst({
      where: { type: 'custom', slug: GENERAL_GROUP_SLUG },
      select: { id: true, isActive: true },
    });
    if (!general || !general.isActive) return 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        // La marca va primero: si otro proceso ya sembró, falla aquí (P2002) y no se crea nada.
        await tx.marcaAsistente.create({ data: { clave: MARCA_SEMILLAS } });
        await tx.inquietud.createMany({
          data: PREGUNTAS_INICIALES.map((title) => ({
            groupId: general.id,
            authorProfileId: null,
            origen: 'asistente' as const,
            title,
            body: CUERPO_SEMILLA,
          })),
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 0;
      this.logger.error(`No se pudieron sembrar las preguntas iniciales: ${nombreDeError(err)}`);
      return 0;
    }
    void this.audit.log({
      action: 'asistente.semillas_sembradas',
      resource: `marca_asistente:${MARCA_SEMILLAS}`,
      metadata: { cantidad: PREGUNTAS_INICIALES.length },
    });
    return PREGUNTAS_INICIALES.length;
  }
}
