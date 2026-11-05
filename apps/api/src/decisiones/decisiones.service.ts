import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { DecisionTemaResponse, DecisionView, SolucionItem } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ForumsService } from '../forums/forums.service';

const OCULTA_TITULO = 'Solución oculta por moderación';
const FIJAS = 'Las soluciones ya quedaron fijas.';

interface TemaRow {
  id: string;
  groupId: string;
  status: string;
  hidden: boolean;
  deliberationEndsAt: Date | null;
}

@Injectable()
export class DecisionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forums: ForumsService,
  ) {}

  private async requireMembership(groupId: string, profileId: string): Promise<void> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_profileId: { groupId, profileId } },
    });
    if (!m) throw new ForbiddenException('Solo los miembros de esta comunidad pueden participar.');
  }

  private async actorId(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
    return p?.userId ? { actorId: p.userId } : {};
  }

  /** El tema debe existir y la persona ser miembro de su grupo. */
  private async tema(profileId: string, proposalId: string): Promise<TemaRow> {
    const tema = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, groupId: true, status: true, hidden: true, deliberationEndsAt: true },
    });
    if (!tema) throw new NotFoundException('Tema no encontrado.');
    await this.requireMembership(tema.groupId, profileId);
    return tema as TemaRow;
  }

  /** Fase de debate: tema abierto, no oculto y sin fila en `decisiones`. */
  private async assertDebate(tema: TemaRow): Promise<void> {
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    if (tema.status !== 'open') throw new BadRequestException('Este tema ya no acepta soluciones.');
    const decision = await this.prisma.decision.findUnique({ where: { proposalId: tema.id }, select: { id: true } });
    if (decision) throw new BadRequestException(FIJAS);
  }

  async createSolucion(
    profileId: string,
    proposalId: string,
    dto: { title: string; description: string },
    ip: string,
  ): Promise<{ id: string }> {
    const tema = await this.tema(profileId, proposalId);
    await this.assertDebate(tema);
    const created = await this.prisma.solucion.create({
      data: {
        proposalId,
        authorProfileId: profileId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        origen: 'persona',
      },
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'solucion.created',
      resource: `solucion:${created.id}`,
      ip,
      metadata: { proposalId },
    });
    return { id: created.id };
  }

  async mergeSolucion(profileId: string, solucionId: string, intoId: string, ip: string): Promise<void> {
    if (solucionId === intoId) throw new BadRequestException('Una solución no se junta consigo misma.');
    const origen = await this.prisma.solucion.findUnique({
      where: { id: solucionId },
      include: { proposal: { select: { id: true, groupId: true, status: true, hidden: true, deliberationEndsAt: true } } },
    });
    if (!origen) throw new NotFoundException('Solución no encontrada.');
    const tema = origen.proposal as TemaRow;
    if (!(await this.forums.canOrganize(profileId, tema.groupId))) {
      throw new ForbiddenException('Solo quien organiza la comunidad puede juntar soluciones.');
    }
    const destino = await this.prisma.solucion.findUnique({ where: { id: intoId } });
    if (!destino) throw new NotFoundException('Solución no encontrada.');
    if (destino.proposalId !== origen.proposalId) {
      throw new BadRequestException('Las dos soluciones deben ser del mismo tema.');
    }
    await this.assertDebate(tema);
    if (origen.hidden || destino.hidden) throw new BadRequestException('No se pueden juntar soluciones ocultas.');
    if (origen.mergedIntoId !== null || destino.mergedIntoId !== null) {
      throw new BadRequestException('Alguna de las soluciones ya fue juntada.');
    }
    const r = await this.prisma.solucion.updateMany({
      where: { id: solucionId, mergedIntoId: null, hidden: false },
      data: { mergedIntoId: intoId },
    });
    if (r.count === 0) throw new BadRequestException('Alguna de las soluciones ya fue juntada.');
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'solucion.merged',
      resource: `solucion:${solucionId}`,
      ip,
      metadata: { proposalId: origen.proposalId },
    });
  }

  async getTema(profileId: string, proposalId: string): Promise<DecisionTemaResponse> {
    const tema = await this.tema(profileId, proposalId);
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    const organiza = await this.forums.canOrganize(profileId, tema.groupId);
    const [filas, decision] = await Promise.all([
      this.prisma.solucion.findMany({ where: { proposalId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.decision.findUnique({ where: { proposalId } }),
    ]);

    // Quien no organiza ve el texto de una oculta enmascarado, también cuando es destino de una juntada.
    const textoDe = (s: (typeof filas)[number]): { title: string; description: string } =>
      s.hidden && !organiza ? { title: OCULTA_TITULO, description: '' } : { title: s.title, description: s.description };
    const porId = new Map(filas.map((s) => [s.id, s]));

    const soluciones: SolucionItem[] = filas.map((s) => {
      const destino = s.mergedIntoId ? porId.get(s.mergedIntoId) : undefined;
      return {
        id: s.id,
        ...textoDe(s),
        origen: s.origen as SolucionItem['origen'],
        hidden: s.hidden,
        mergedIntoTitle: destino ? textoDe(destino).title : null,
        isAuthor: s.authorProfileId === profileId,
        createdAt: s.createdAt.toISOString(),
      };
    });

    let vista: DecisionView | null = null;
    if (decision) {
      const candidatas: DecisionView['candidatas'] = [];
      for (const id of decision.candidatas) {
        const s = porId.get(id);
        if (s) candidatas.push({ id: s.id, ...textoDe(s), hidden: s.hidden });
      }
      vista = {
        fase: decision.fase as DecisionView['fase'],
        modo: (decision.modo as DecisionView['modo']) ?? null,
        modoPropuesto: (decision.modoPropuesto as DecisionView['modoPropuesto']) ?? null,
        objecionEndsAt: decision.objecionEndsAt ? decision.objecionEndsAt.toISOString() : null,
        votacionEndsAt: decision.votacionEndsAt ? decision.votacionEndsAt.toISOString() : null,
        candidatas,
        // Los completa la Task 5 (papeleta, objeción y resultado).
        miPapeleta: null,
        yoObjete: false,
        puedoObjetar: false,
        resultado: null,
      };
    }

    return {
      debateEndsAt: tema.deliberationEndsAt ? tema.deliberationEndsAt.toISOString() : null,
      puedeProponer: tema.status === 'open' && decision === null,
      canOrganize: organiza,
      soluciones,
      decision: vista,
    };
  }
}
