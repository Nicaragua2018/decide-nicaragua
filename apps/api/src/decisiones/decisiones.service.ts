import { Prisma } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  DecisionModoValue,
  DecisionResultadoView,
  DecisionTemaResponse,
  DecisionView,
  PapeletaValue,
  SolucionItem,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ForumsService } from '../forums/forums.service';
import { RulesService } from '../rules/rules.service';
import { tallyDecision } from './decision-tally';

const OCULTA_TITULO = 'Solución oculta por moderación';
const FIJAS = 'Las soluciones ya quedaron fijas.';
const DIA_MS = 86_400_000;
const OBJECION_CERRADA = 'El plazo para objetar el modo no está abierto.';
const VOTACION_CERRADA = 'La votación no está abierta.';

const matriz = (v: Prisma.JsonValue | null | undefined): number[][] => (Array.isArray(v) ? (v as number[][]) : []);

/** El plazo del debate venció: las soluciones quedan fijas aunque el programador aún no haya pasado. */
const debateVencido = (endsAt: Date | null, now: Date): boolean => endsAt !== null && endsAt.getTime() <= now.getTime();

const esDuplicado = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Soluciones que entran a la decisión: visibles y sin juntar, en orden de llegada. */
const CANDIDATAS = (proposalId: string) => ({
  where: { proposalId, hidden: false, mergedIntoId: null },
  orderBy: { createdAt: 'asc' as const },
  select: { id: true },
});

/**
 * Bloquea la fila del tema mientras siga abierto, visible, como propuesta formal y sin
 * votación del plan 2 (`electionId`): una ocultación simultánea espera o ya se ve aquí.
 */
async function bloquearTema(tx: Prisma.TransactionClient, proposalId: string): Promise<boolean> {
  const vivo = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM proposals WHERE id = ${proposalId}::uuid AND hidden = false AND status = 'open' AND kind = 'propuesta' AND "electionId" IS NULL FOR UPDATE`,
  );
  return vivo.length > 0;
}

interface TemaRow {
  id: string;
  groupId: string;
  status: string;
  hidden: boolean;
  deliberationEndsAt: Date | null;
}

@Injectable()
export class DecisionesService {
  private readonly logger = new Logger(DecisionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forums: ForumsService,
    private readonly rules: RulesService,
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
    if (debateVencido(tema.deliberationEndsAt, new Date())) throw new BadRequestException(FIJAS);
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
    await this.prisma.$transaction(async (tx) => {
      // Bloqueo en orden fijo: dos juntadas cruzadas (A→B y B→A) se serializan.
      const [a, b] = solucionId < intoId ? [solucionId, intoId] : [intoId, solucionId];
      await tx.$queryRaw(Prisma.sql`SELECT id FROM soluciones WHERE id IN (${a}::uuid, ${b}::uuid) ORDER BY id FOR UPDATE`);
      const [o, d] = await Promise.all([
        tx.solucion.findUnique({ where: { id: solucionId } }),
        tx.solucion.findUnique({ where: { id: intoId } }),
      ]);
      if (!o || !d || o.proposalId !== d.proposalId) {
        throw new BadRequestException('Las dos soluciones deben ser del mismo tema.');
      }
      if (o.hidden || d.hidden || o.mergedIntoId !== null || d.mergedIntoId !== null) {
        throw new BadRequestException('Alguna de las soluciones ya fue juntada u ocultada.');
      }
      const fijada = await tx.decision.findUnique({ where: { proposalId: o.proposalId }, select: { id: true } });
      if (fijada) throw new BadRequestException(FIJAS);
      const r = await tx.solucion.updateMany({
        where: { id: solucionId, mergedIntoId: null, hidden: false },
        data: { mergedIntoId: intoId },
      });
      if (r.count === 0) throw new BadRequestException('Alguna de las soluciones ya fue juntada u ocultada.');
    });
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
      const fase = decision.fase as DecisionView['fase'];
      const candidatas: DecisionView['candidatas'] = [];
      for (const id of decision.candidatas) {
        const s = porId.get(id);
        if (s) candidatas.push({ id: s.id, ...textoDe(s), hidden: s.hidden });
      }

      // Solo la papeleta y la objeción propias, leídas por su clave única: nunca las de otra persona.
      const clave = { decisionId_profileId: { decisionId: decision.id, profileId } };
      const [papeleta, objecion] = await Promise.all([
        fase === 'votacion' || fase === 'contada'
          ? this.prisma.decisionPapeleta.findUnique({ where: clave, select: { abstencion: true, orden: true } })
          : null,
        this.prisma.objecionModo.findUnique({ where: clave, select: { id: true } }),
      ]);
      const puedoObjetar =
        fase === 'objecion' &&
        decision.objecionEndsAt !== null &&
        Date.now() < decision.objecionEndsAt.getTime() &&
        (await this.participantes(proposalId, tema.groupId)).has(profileId);

      // Antes del conteo no sale ninguna cifra; después, el resultado congelado.
      let resultado: DecisionResultadoView | null = null;
      if (fase === 'contada' && decision.resultado) {
        const total = decision.papeletasTotal ?? 0;
        const abst = decision.abstenciones ?? 0;
        resultado = {
          resultado: decision.resultado as DecisionResultadoView['resultado'],
          ganadoras: [...decision.ganadoras],
          aprobaciones: decision.candidatas.map((solucionId, i) => ({ solucionId, incluyen: decision.aprobaciones[i] ?? 0 })),
          papeletasTotal: total,
          abstenciones: abst,
          validas: total - abst,
          miembros: decision.miembros ?? 0,
          pairwiseMatrix: matriz(decision.pairwiseMatrix),
          schulzeMatrix: matriz(decision.schulzeMatrix),
          contadaAt: (decision.contadaAt ?? decision.updatedAt).toISOString(),
        };
      }

      vista = {
        fase,
        modo: (decision.modo as DecisionView['modo']) ?? null,
        modoPropuesto: (decision.modoPropuesto as DecisionView['modoPropuesto']) ?? null,
        objecionEndsAt: decision.objecionEndsAt ? decision.objecionEndsAt.toISOString() : null,
        votacionEndsAt: decision.votacionEndsAt ? decision.votacionEndsAt.toISOString() : null,
        candidatas,
        miPapeleta: papeleta ? { abstencion: papeleta.abstencion, orden: [...papeleta.orden] } : null,
        yoObjete: Boolean(objecion),
        puedoObjetar,
        resultado,
      };
    }

    return {
      debateEndsAt: tema.deliberationEndsAt ? tema.deliberationEndsAt.toISOString() : null,
      puedeProponer: tema.status === 'open' && decision === null && !debateVencido(tema.deliberationEndsAt, new Date()),
      canOrganize: organiza,
      soluciones,
      decision: vista,
    };
  }

  // ─── Modo y objeción ──────────────────────────────────────────────────────

  async proposeModo(profileId: string, proposalId: string, modo: DecisionModoValue, ip: string): Promise<void> {
    const tema = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, groupId: true, hidden: true },
    });
    if (!tema) throw new NotFoundException('Tema no encontrado.');
    if (!(await this.forums.canOrganize(profileId, tema.groupId))) {
      throw new ForbiddenException('Solo quien organiza la comunidad puede proponer el modo de decisión.');
    }
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    const decision = await this.prisma.decision.findUnique({ where: { proposalId }, select: { id: true, fase: true } });
    const fueraDeFase = 'Esta decisión no está esperando que se proponga el modo.';
    if (!decision || (decision.fase as string) !== 'modo') throw new BadRequestException(fueraDeFase);
    const dias = await this.rules.getInt('debate.plazo_objecion_modo_dias', tema.groupId);
    const objecionEndsAt = new Date(Date.now() + dias * DIA_MS);
    const r = await this.prisma.$transaction((tx) =>
      tx.decision.updateMany({
        where: { id: decision.id, fase: 'modo' },
        data: { fase: 'objecion', modoPropuesto: modo, objecionEndsAt },
      }),
    );
    if (r.count === 0) throw new BadRequestException(fueraDeFase);
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'decision.mode_proposed',
      resource: `decision:${decision.id}`,
      ip,
      metadata: { proposalId, modo },
    });
  }

  /** Objetar o retirar la objeción al modo propuesto. No se audita (como los votos). */
  async setObjecion(profileId: string, proposalId: string, objeto: boolean): Promise<{ yoObjete: boolean }> {
    const tema = await this.tema(profileId, proposalId);
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    const decision = await this.prisma.decision.findUnique({
      where: { proposalId },
      select: { id: true, fase: true, objecionEndsAt: true },
    });
    if (
      !decision ||
      (decision.fase as string) !== 'objecion' ||
      !decision.objecionEndsAt ||
      Date.now() >= decision.objecionEndsAt.getTime()
    ) {
      throw new BadRequestException(OBJECION_CERRADA);
    }
    const participantes = await this.participantes(proposalId, tema.groupId);
    if (!participantes.has(profileId)) {
      throw new ForbiddenException('Solo quienes participaron en el debate pueden objetar el modo.');
    }
    await this.prisma.$transaction(async (tx) => {
      // Relee con bloqueo: si el plazo venció o el programador ya cerró la objeción, no se escribe.
      const abierta = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM decisiones WHERE id = ${decision.id}::uuid AND fase = 'objecion' AND "objecionEndsAt" > ${new Date()} FOR UPDATE`,
      );
      if (abierta.length === 0) throw new BadRequestException(OBJECION_CERRADA);
      if (objeto) {
        await tx.objecionModo.upsert({
          where: { decisionId_profileId: { decisionId: decision.id, profileId } },
          create: { decisionId: decision.id, profileId },
          update: {},
        });
      } else {
        await tx.objecionModo.deleteMany({ where: { decisionId: decision.id, profileId } });
      }
    });
    return { yoObjete: objeto };
  }

  // ─── Papeleta ─────────────────────────────────────────────────────────────

  /** Guarda o cambia la papeleta propia mientras la votación esté abierta. No se audita (como los votos). */
  async castPapeleta(profileId: string, proposalId: string, p: PapeletaValue): Promise<PapeletaValue> {
    const tema = await this.tema(profileId, proposalId);
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    const decision = await this.prisma.decision.findUnique({
      where: { proposalId },
      select: { id: true, fase: true, votacionEndsAt: true, candidatas: true },
    });
    if (
      !decision ||
      (decision.fase as string) !== 'votacion' ||
      !decision.votacionEndsAt ||
      Date.now() >= decision.votacionEndsAt.getTime()
    ) {
      throw new BadRequestException(VOTACION_CERRADA);
    }
    if (p.abstencion && p.orden.length > 0) {
      throw new BadRequestException('Si te abstienes, no ordenes ninguna solución.');
    }
    if (new Set(p.orden).size !== p.orden.length) {
      throw new BadRequestException('Cada solución puede aparecer una sola vez en tu orden.');
    }
    const candidatas = new Set(decision.candidatas);
    if (p.orden.some((id) => !candidatas.has(id))) {
      throw new BadRequestException('Tu orden incluye una solución que no está en esta votación.');
    }
    const valor: PapeletaValue = { abstencion: p.abstencion, orden: [...p.orden] };
    await this.prisma.$transaction(async (tx) => {
      // Relee con bloqueo: si el plazo venció, el programador ya contó o el tema se ocultó (cancelada), no se escribe.
      const abierta = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM decisiones WHERE id = ${decision.id}::uuid AND fase = 'votacion' AND "votacionEndsAt" > ${new Date()} FOR UPDATE`,
      );
      if (abierta.length === 0) throw new BadRequestException(VOTACION_CERRADA);
      await tx.decisionPapeleta.upsert({
        where: { decisionId_profileId: { decisionId: decision.id, profileId } },
        create: { decisionId: decision.id, profileId, abstencion: valor.abstencion, orden: valor.orden },
        update: { abstencion: valor.abstencion, orden: valor.orden },
      });
    });
    return valor;
  }

  /**
   * Miembros actuales del grupo que en este tema comentaron, señalaron, escribieron
   * o votaron una frase, o propusieron una solución.
   */
  private async participantes(proposalId: string, groupId: string): Promise<Set<string>> {
    const [comentarios, senales, frases, votos, soluciones] = await Promise.all([
      this.prisma.proposalComment.findMany({ where: { proposalId }, select: { authorProfileId: true }, distinct: ['authorProfileId'] }),
      this.prisma.consensusSignal.findMany({ where: { proposalId }, select: { profileId: true } }),
      this.prisma.frase.findMany({ where: { proposalId }, select: { authorProfileId: true }, distinct: ['authorProfileId'] }),
      this.prisma.fraseVoto.findMany({ where: { frase: { proposalId } }, select: { profileId: true }, distinct: ['profileId'] }),
      this.prisma.solucion.findMany({ where: { proposalId }, select: { authorProfileId: true }, distinct: ['authorProfileId'] }),
    ]);
    const ids = new Set<string>([
      ...comentarios.map((c) => c.authorProfileId),
      ...senales.map((s) => s.profileId),
      ...frases.map((f) => f.authorProfileId),
      ...votos.map((v) => v.profileId),
      ...soluciones.map((s) => s.authorProfileId),
    ]);
    if (ids.size === 0) return new Set();
    const miembros = await this.prisma.groupMembership.findMany({
      where: { groupId, profileId: { in: [...ids] } },
      select: { profileId: true },
    });
    return new Set(miembros.map((m) => m.profileId));
  }

  // ─── Plazos ───────────────────────────────────────────────────────────────

  /** Revisa los tres plazos (debate, objeción, votación). Devuelve cuántas transiciones hizo. */
  async processDeadlines(now: Date): Promise<number> {
    let n = 0;
    n += await this.finDelDebate(now);
    n += await this.finDeLaObjecion(now);
    n += await this.finDeLaVotacion(now);
    return n;
  }

  private async finDelDebate(now: Date): Promise<number> {
    const temas = await this.prisma.proposal.findMany({
      // Una propuesta del plan 2 con votación propia (electionId) no pasa por este ciclo.
      where: { kind: 'propuesta', status: 'open', hidden: false, deliberationEndsAt: { lte: now }, decision: null, electionId: null },
      select: { id: true, groupId: true },
    });
    let n = 0;
    for (const t of temas) {
      try {
        const dias = await this.rules.getInt('votacion.plazo_dias', t.groupId);
        const hecho = await this.prisma.$transaction(async (tx) => {
          if (!(await bloquearTema(tx, t.id))) return null;
          const ids = (await tx.solucion.findMany(CANDIDATAS(t.id))).map((s) => s.id);
          if (ids.length === 0) {
            const c = await tx.decision.create({
              data: { proposalId: t.id, fase: 'contada', resultado: 'sin_soluciones', contadaAt: now },
            });
            return { id: c.id, fase: 'contada' as const };
          }
          if (ids.length === 1) {
            const v = await tx.decision.create({
              data: {
                proposalId: t.id,
                fase: 'votacion',
                modo: 'compatibles',
                candidatas: ids,
                votacionStartsAt: now,
                votacionEndsAt: new Date(now.getTime() + dias * DIA_MS),
              },
            });
            return { id: v.id, fase: 'votacion' as const };
          }
          const m = await tx.decision.create({ data: { proposalId: t.id, fase: 'modo' } });
          return { id: m.id, fase: 'modo' as const };
        });
        if (!hecho) continue;
        n += 1;
        if (hecho.fase === 'contada') {
          void this.audit.log({
            action: 'decision.counted',
            resource: `decision:${hecho.id}`,
            metadata: { proposalId: t.id, resultado: 'sin_soluciones' },
          });
        } else if (hecho.fase === 'votacion') {
          void this.audit.log({ action: 'decision.vote_opened', resource: `decision:${hecho.id}`, metadata: { proposalId: t.id } });
        }
      } catch (err) {
        // Otra ejecución ya creó la decisión de este tema (proposalId @unique).
        if (esDuplicado(err)) continue;
        this.logger.error(`No se pudo cerrar el debate ${t.id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return n;
  }

  private async finDeLaObjecion(now: Date): Promise<number> {
    const decisiones = await this.prisma.decision.findMany({
      where: { fase: 'objecion', objecionEndsAt: { lte: now } },
      select: { id: true, proposalId: true, modoPropuesto: true, proposal: { select: { groupId: true } } },
    });
    let n = 0;
    for (const d of decisiones) {
      try {
        const propuesto = d.modoPropuesto as DecisionModoValue | null;
        if (!propuesto) throw new Error('Decisión en objeción sin modo propuesto');
        const groupId = d.proposal.groupId;
        const [participantes, objeciones, f, dias] = await Promise.all([
          this.participantes(d.proposalId, groupId),
          this.prisma.objecionModo.findMany({ where: { decisionId: d.id }, select: { profileId: true } }),
          this.rules.getInt('debate.fraccion_objecion_modo', groupId),
          this.rules.getInt('votacion.plazo_dias', groupId),
        ]);
        // Solo cuentan quienes siguen siendo miembros (participantes ya está filtrado por membresía).
        const P = participantes.size;
        const O = objeciones.filter((o) => participantes.has(o.profileId)).length;
        const cambia = O > 0 && O * 100 >= f * P;
        const contrario: DecisionModoValue = propuesto === 'excluyentes' ? 'compatibles' : 'excluyentes';
        const modoTrasObjecion = cambia ? contrario : propuesto;
        const hecho = await this.prisma.$transaction(async (tx) => {
          if (!(await bloquearTema(tx, d.proposalId))) return null;
          const candidatas = (await tx.solucion.findMany(CANDIDATAS(d.proposalId))).map((s) => s.id);
          if (candidatas.length === 0) {
            // Todas se ocultaron durante la objeción: igual que el fin del debate sin soluciones.
            const r = await tx.decision.updateMany({
              where: { id: d.id, fase: 'objecion' },
              data: { fase: 'contada', resultado: 'sin_soluciones', contadaAt: now, candidatas: [] },
            });
            return r.count === 0 ? null : ('contada' as const);
          }
          // Con una sola candidata no hay nada que excluir: se aprueba o no, como en el fin del debate.
          const modo: DecisionModoValue = candidatas.length === 1 ? 'compatibles' : modoTrasObjecion;
          const r = await tx.decision.updateMany({
            where: { id: d.id, fase: 'objecion' },
            data: {
              fase: 'votacion',
              modo,
              candidatas,
              votacionStartsAt: now,
              votacionEndsAt: new Date(now.getTime() + dias * DIA_MS),
            },
          });
          return r.count === 0 ? null : ('votacion' as const);
        });
        if (!hecho) continue;
        n += 1;
        void this.audit.log(
          hecho === 'contada'
            ? {
                action: 'decision.counted',
                resource: `decision:${d.id}`,
                metadata: { proposalId: d.proposalId, resultado: 'sin_soluciones' },
              }
            : { action: 'decision.vote_opened', resource: `decision:${d.id}`, metadata: { proposalId: d.proposalId } },
        );
      } catch (err) {
        this.logger.error(`No se pudo abrir la votación ${d.id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return n;
  }

  private async finDeLaVotacion(now: Date): Promise<number> {
    const decisiones = await this.prisma.decision.findMany({
      where: { fase: 'votacion', votacionEndsAt: { lte: now } },
      select: { id: true },
    });
    let n = 0;
    for (const d of decisiones) {
      try {
        if (await this.contar(d.id, now)) n += 1;
      } catch (err) {
        this.logger.error(`No se pudo contar la decisión ${d.id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return n;
  }

  /**
   * Cuenta las papeletas de los miembros actuales y congela el resultado en la fila de la
   * decisión, una sola vez: el `updateMany` condicionado a `votacion` no se repite.
   */
  async contar(decisionId: string, now: Date): Promise<boolean> {
    const previa = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      select: { proposalId: true, proposal: { select: { groupId: true } } },
    });
    if (!previa) return false;
    const { proposalId } = previa;
    const groupId = previa.proposal.groupId;
    const quorumPct = await this.rules.getInt('votacion.quorum_porcentaje', groupId);

    const resultado = await this.prisma.$transaction(async (tx) => {
      // Un tema ocultado a la vez ya canceló la decisión (hideTopicTx): aquí no se cuenta.
      if (!(await bloquearTema(tx, proposalId))) return null;
      // Bloquea la decisión antes de leer las papeletas: una papeleta que ya pasó su
      // comprobación (FOR UPDATE en castPapeleta) termina de guardarse antes de contar.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM decisiones WHERE id = ${decisionId}::uuid FOR UPDATE`);
      const d = await tx.decision.findUnique({
        where: { id: decisionId },
        select: { fase: true, modo: true, candidatas: true },
      });
      if (!d || (d.fase as string) !== 'votacion') return null;
      const [filas, miembros] = await Promise.all([
        // Solo cuentan quienes siguen siendo miembros (la suspensión quita la membresía).
        tx.decisionPapeleta.findMany({
          where: { decisionId, profile: { memberships: { some: { groupId } } } },
          select: { abstencion: true, orden: true },
        }),
        tx.groupMembership.count({ where: { groupId } }),
      ]);
      // Las candidatas están congeladas y castPapeleta ya valida; por si acaso se descartan
      // ids ajenos y repetidos de lo guardado.
      const validas = new Set(d.candidatas);
      const papeletas = filas.map((f) => ({
        abstencion: f.abstencion,
        orden: f.abstencion ? [] : [...new Set(f.orden)].filter((id) => validas.has(id)),
      }));
      let modo: DecisionModoValue;
      if (d.candidatas.length === 1) modo = 'compatibles';
      else if (d.modo) modo = d.modo as DecisionModoValue;
      else throw new Error('Decisión en votación sin modo');
      const t = tallyDecision({ candidatas: d.candidatas, modo, papeletas, miembros, quorumPct });
      const r = await tx.decision.updateMany({
        where: { id: decisionId, fase: 'votacion' },
        data: {
          fase: 'contada',
          resultado: t.resultado,
          ganadoras: t.ganadoras,
          aprobaciones: t.aprobaciones,
          pairwiseMatrix: t.pairwiseMatrix as Prisma.InputJsonValue,
          schulzeMatrix: t.schulzeMatrix as Prisma.InputJsonValue,
          papeletasTotal: t.papeletasTotal,
          abstenciones: t.abstenciones,
          miembros,
          contadaAt: now,
        },
      });
      return r.count === 0 ? null : t.resultado;
    });
    if (!resultado) return false;
    void this.audit.log({
      action: 'decision.counted',
      resource: `decision:${decisionId}`,
      metadata: { proposalId, resultado },
    });
    return true;
  }
}
