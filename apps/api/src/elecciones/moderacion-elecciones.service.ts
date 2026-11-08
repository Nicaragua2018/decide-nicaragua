import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CARGO_ETIQUETA, textoParaRevisar, type CargoTipoValue, type ModeracionCausaValue } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ForumsService, huellaDe } from '../forums/forums.service';

/** Una ficha solo se oculta mientras su elección está abierta (después ya está contada). */
const ELECCION_ABIERTA = ['candidaturas', 'votacion'] as const;
const ORIGEN = 'revision_posterior';

const abierta = (fase: string): boolean => (ELECCION_ABIERTA as readonly string[]).includes(fase);

/**
 * Moderación posterior de fichas, pedidos de revocación y observaciones (ADR-029). El asistente
 * solo abre la solicitud; la mesa la confirma con 2 firmas en el foro (`ForumsService.confirmar`),
 * que llama aquí para aplicar el efecto. Nada se borra: la ficha y la observación se ocultan y el
 * pedido queda «retirado» (no cuenta para la espera entre pedidos).
 */
@Injectable()
export class ModeracionEleccionesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forums: ForumsService,
  ) {}

  onModuleInit(): void {
    this.forums.registrarModeracion('candidatura', {
      texto: async (id) => {
        const c = await this.ficha(id);
        return c ? textoParaRevisar(c.presentacion, ...c.compromisos) : null;
      },
      estaOculto: async (id) => {
        const c = await this.ficha(id);
        if (!c) return null;
        return c.oculta || c.retiradaAt !== null || !abierta(c.eleccion.fase as string);
      },
      contexto: async (id) => {
        const c = await this.ficha(id);
        if (!c) return null;
        return `Ficha de candidatura · ${CARGO_ETIQUETA[c.eleccion.cargo as CargoTipoValue]} · ${c.eleccion.group.name}`;
      },
      ocultar: (tx, id, causa, huella) => this.ocultarFicha(tx, id, causa, huella),
      // Como `BoardService.sinConflicto`: quien compite en una elección abierta no oculta fichas.
      puedeFirmar: async (profileId) => {
        const propias = await this.prisma.candidatura.count({
          where: { profileId, retiradaAt: null, eleccion: { fase: { in: [...ELECCION_ABIERTA] } } },
        });
        return propias > 0 ? 'Te presentaste a una elección abierta: no puedes firmar que se oculte una ficha.' : null;
      },
    });

    this.forums.registrarModeracion('revocacion', {
      texto: async (id) => (await this.pedido(id))?.motivo ?? null,
      estaOculto: async (id) => {
        const r = await this.pedido(id);
        if (!r) return null;
        // Un pedido vencido que el programador aún no cerró tampoco se modera: vence solo.
        return (r.estado as string) !== 'abierta' || r.venceAt.getTime() <= Date.now();
      },
      contexto: async (id) => {
        const r = await this.pedido(id);
        if (!r) return null;
        return `Pedido de revocación de ${r.cargo.profile.displayName} (${CARGO_ETIQUETA[r.cargo.tipo as CargoTipoValue]})`;
      },
      ocultar: async (tx, id, causa) => {
        // Si se logró o venció antes (el apoyo bloquea el pedido), no se toca.
        const r = await tx.revocacion.updateMany({
          where: { id, estado: 'abierta', venceAt: { gt: new Date() } },
          data: { estado: 'retirada' },
        });
        if (r.count === 0) return null;
        return () => {
          void this.audit.log({ action: 'revocacion.retirada_por_moderacion', resource: `revocacion:${id}`, metadata: { causa, origen: ORIGEN } });
        };
      },
      puedeFirmar: async (profileId, id) => {
        const r = await this.prisma.revocacion.findUnique({ where: { id }, select: { cargo: { select: { profileId: true } } } });
        return r?.cargo.profileId === profileId ? 'Se pide revocar tu cargo: no puedes firmar esta moderación.' : null;
      },
    });

    this.forums.registrarModeracion('observacion', {
      texto: async (id) => (await this.observacion(id))?.texto ?? null,
      estaOculto: async (id) => {
        const o = await this.observacion(id);
        return o ? o.oculta : null;
      },
      contexto: async (id) => ((await this.observacion(id)) ? 'Observación pública de una persona observadora' : null),
      ocultar: async (tx, id, causa) => {
        const o = await tx.observacionPublica.findUnique({ where: { id }, select: { auditEventId: true } });
        if (!o) return null;
        const r = await tx.observacionPublica.updateMany({ where: { id, oculta: false }, data: { oculta: true, ocultaCausa: causa } });
        if (r.count === 0) return null;
        return () => {
          void this.audit.log({
            action: 'observacion.ocultada',
            resource: `observacion:${id}`,
            metadata: { auditEventId: o.auditEventId, causa, origen: ORIGEN },
          });
        };
      },
      puedeFirmar: async (profileId, id) => {
        const o = await this.prisma.observacionPublica.findUnique({ where: { id }, select: { autorProfileId: true } });
        return o?.autorProfileId === profileId ? 'Escribiste esta observación: no puedes firmar su moderación.' : null;
      },
    });
  }

  /**
   * Oculta la ficha si su texto es el que revisó el asistente (huella) y la elección sigue
   * abierta. La elección va en FOR SHARE, como la ocultación de la mesa: no se cruza con el conteo.
   * El texto también va en el where: una edición a la vez no se oculta.
   */
  private async ocultarFicha(
    tx: Prisma.TransactionClient,
    id: string,
    causa: ModeracionCausaValue,
    huella: string | null,
  ): Promise<(() => void) | null> {
    const c = await tx.candidatura.findUnique({
      where: { id },
      select: { eleccionId: true, presentacion: true, compromisos: true },
    });
    if (!c) return null;
    if (huella !== null && huellaDe(textoParaRevisar(c.presentacion, ...c.compromisos)) !== huella) return null;
    await tx.$queryRaw(Prisma.sql`SELECT id FROM elecciones WHERE id = ${c.eleccionId}::uuid FOR SHARE`);
    const r = await tx.candidatura.updateMany({
      where: {
        id,
        oculta: false,
        retiradaAt: null,
        presentacion: c.presentacion,
        compromisos: { equals: c.compromisos },
        eleccion: { fase: { in: [...ELECCION_ABIERTA] } },
      },
      data: { oculta: true, ocultaCausa: causa },
    });
    if (r.count === 0) return null;
    return () => {
      void this.audit.log({
        action: 'candidatura.ocultada',
        resource: `candidatura:${id}`,
        metadata: { eleccionId: c.eleccionId, causa, origen: ORIGEN },
      });
    };
  }

  private ficha(id: string) {
    return this.prisma.candidatura.findUnique({
      where: { id },
      select: {
        presentacion: true, compromisos: true, oculta: true, retiradaAt: true,
        eleccion: { select: { fase: true, cargo: true, group: { select: { name: true } } } },
      },
    });
  }

  private pedido(id: string) {
    return this.prisma.revocacion.findUnique({
      where: { id },
      select: { motivo: true, estado: true, venceAt: true, cargo: { select: { tipo: true, profile: { select: { displayName: true } } } } },
    });
  }

  private observacion(id: string) {
    return this.prisma.observacionPublica.findUnique({ where: { id }, select: { texto: true, oculta: true, auditEventId: true } });
  }
}
