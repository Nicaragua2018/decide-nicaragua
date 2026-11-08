import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { GENERAL_GROUP_SLUG, textoParaRevisar } from '@decide/shared';
import type {
  ComunidadDecisiones,
  ComunidadTipo,
  DecisionesResumenResponse,
  DecisionModoValue,
  DecisionResumenItem,
  CandidataView,
  DecisionResultadoView,
  DecisionTemaResponse,
  DecisionView,
  GrupoTrabajoItem,
  PapeletaValue,
  SolucionItem,
} from '@decide/shared';
import { type GrupoFila, claveMinimo, grupoTrabajoItem, ultimosInformes } from '../grupos/grupo-item';
import {
  type DecisionBifurcable,
  GRUPO_EN_MARCHA,
  enmascararOrigenOculto,
  esBifurcable,
  finDelPlazo,
  grupoEnMarcha,
} from '../grupos/bifurcacion-reglas';
import { PrismaService } from '../prisma/prisma.service';
import { GuardiaService, type OpcionesPublicar } from '../asistente/guardia.service';
import { Publicadores } from '../asistente/publicadores';
import { SugerenciasService } from '../asistente/sugerencias.service';
import { AuditService } from '../audit/audit.service';
import { ForumsService } from '../forums/forums.service';
import { RulesService } from '../rules/rules.service';
import { GroupAccessService } from '../groups/group-access.service';
import { tallyDecision } from './decision-tally';
import { participantesDelDebate } from './participantes-del-debate';

const OCULTA_TITULO = 'Solución oculta por moderación';
const FIJAS = 'Las soluciones ya quedaron fijas.';
const DIA_MS = 86_400_000;
const OBJECION_CERRADA = 'El plazo para objetar el modo no está abierto.';
const VOTACION_CERRADA = 'La votación no está abierta.';

/** Valores de bifurcación antes de calcularlos (o fuera de una decisión contada). */
const SIN_BIFURCACION = { bifurcable: false, puedoIniciarBifurcacion: false, bifurcacionId: null } as const;

const matriz = (v: Prisma.JsonValue | null | undefined): number[][] => (Array.isArray(v) ? (v as number[][]) : []);

/** Página «Decisiones»: elementos por lista y comunidad. */
const RESUMEN_MAX = 50;

const DETALLE_RECHAZO: Record<string, string> = {
  ninguna: 'Ninguna solución obtuvo más de la mitad',
  empate: 'Empate: sin decisión',
  sin_quorum: 'Sin decisión: no se alcanzó la participación mínima',
  sin_soluciones: 'No se propusieron soluciones',
};

/** Orden de las comunidades: origen, acogida, la general y después las demás (como general). */
function tipoDeComunidad(type: string, slug: string): { tipo: ComunidadTipo; rango: number } {
  if (type === 'territorial_origin') return { tipo: 'origen', rango: 0 };
  if (type === 'territorial_residence') return { tipo: 'acogida', rango: 1 };
  return { tipo: 'general', rango: slug === GENERAL_GROUP_SLUG ? 2 : 3 };
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

type ListaResumen = { item: DecisionResumenItem; orden: number }[];

/** El plazo del debate venció: las soluciones quedan fijas aunque el programador aún no haya pasado. */
const debateVencido = (endsAt: Date | null, now: Date): boolean => endsAt !== null && endsAt.getTime() <= now.getTime();

const esDuplicado = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Ids de las soluciones (entre `ids`) ocultas de forma provisional: su ocultación aún espera la segunda firma. */
async function provisionales(tx: Prisma.TransactionClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const filas = await tx.moderationAction.findMany({
    where: { target: 'solucion', targetId: { in: ids }, status: 'provisional' },
    select: { targetId: true },
  });
  return new Set(filas.map((f) => f.targetId));
}

/**
 * Soluciones que entran a la decisión, en orden de llegada: sin juntar y visibles, o ocultas
 * solo de forma provisional (eso pausa, no excluye). Una ocultación confirmada sí las deja fuera.
 */
async function candidatasDe(tx: Prisma.TransactionClient, proposalId: string): Promise<string[]> {
  const filas = await tx.solucion.findMany({
    where: { proposalId, mergedIntoId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, hidden: true },
  });
  const enPausa = await provisionales(tx, filas.filter((s) => s.hidden).map((s) => s.id));
  return filas.filter((s) => !s.hidden || enPausa.has(s.id)).map((s) => s.id);
}

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

/**
 * Para crear o juntar soluciones: bloquea el tema en modo compartido mientras siga abierto,
 * visible y con el debate en plazo, y sin fila en `decisiones`. El FOR UPDATE de
 * `bloquearTema` (fin del debate) choca con este FOR SHARE, así que una solución tardía
 * o entra antes de fijar las candidatas o recibe «ya quedaron fijas».
 */
async function bloquearDebate(tx: Prisma.TransactionClient, proposalId: string): Promise<void> {
  const vivo = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM proposals WHERE id = ${proposalId}::uuid AND hidden = false AND status = 'open' AND ("deliberationEndsAt" IS NULL OR "deliberationEndsAt" > now()) FOR SHARE`,
  );
  if (vivo.length === 0) throw new BadRequestException(FIJAS);
  const decision = await tx.decision.findUnique({ where: { proposalId }, select: { id: true } });
  if (decision) throw new BadRequestException(FIJAS);
}

/** Cómo salió una decisión de la fase `modo`. */
type SalidaDelModo = { fase: 'contada' } | { fase: 'votacion' } | { fase: 'objecion'; modo: DecisionModoValue };

interface TemaRow {
  id: string;
  groupId: string;
  status: string;
  hidden: boolean;
  deliberationEndsAt: Date | null;
  /** Presente si el tema es un cambio de regla: ni otras soluciones, ni comisión, ni bifurcación. */
  cambioRegla?: { id: string } | null;
  /** Es miembro del grupo; si es false, solo lee desde el ámbito de un grupo de trabajo. */
  participa: boolean;
}

@Injectable()
export class DecisionesService implements OnModuleInit {
  private readonly logger = new Logger(DecisionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forums: ForumsService,
    private readonly rules: RulesService,
    private readonly access: GroupAccessService,
    private readonly guardia: GuardiaService,
    private readonly publicadores: Publicadores,
    private readonly sugerencias: SugerenciasService,
  ) {}

  /** La revisión de la mesa publica una solución aprobada con la misma llamada (sin ip). */
  onModuleInit(): void {
    this.publicadores.registrar('solucion', (autor, args, opts) => {
      const a = args as { proposalId: string; title: string; description: string; borrador?: { indice: number } };
      // Si venía de un borrador del asistente, la aprobación también lo marca adoptado.
      return this.createSolucion(autor, a.proposalId, { title: a.title, description: a.description, ...(a.borrador ? { borrador: a.borrador } : {}) }, '', opts);
    });
  }

  /**
   * El tema debe existir. Para `participar`, la persona debe ser miembro de su grupo; para
   * `leer` basta con poder leerlo (miembro, o miembro del ámbito si es un grupo de trabajo).
   */
  private async tema(profileId: string, proposalId: string, modo: 'leer' | 'participar'): Promise<TemaRow> {
    const tema = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true, groupId: true, status: true, hidden: true, deliberationEndsAt: true, cambioRegla: { select: { id: true } },
      },
    });
    if (!tema) throw new NotFoundException('Tema no encontrado.');
    if (modo === 'participar') {
      await this.access.requireParticipant(tema.groupId, profileId);
      return { ...(tema as Omit<TemaRow, 'participa'>), participa: true };
    }
    const { participa } = await this.access.requireReader(tema.groupId, profileId);
    return { ...(tema as Omit<TemaRow, 'participa'>), participa };
  }

  /** Fase de debate: tema abierto, no oculto y sin fila en `decisiones`. */
  private async assertDebate(tema: Omit<TemaRow, 'participa'>): Promise<void> {
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    if (tema.status !== 'open') throw new BadRequestException('Este tema ya no acepta soluciones.');
    if (debateVencido(tema.deliberationEndsAt, new Date())) throw new BadRequestException(FIJAS);
    const decision = await this.prisma.decision.findUnique({ where: { proposalId: tema.id }, select: { id: true } });
    if (decision) throw new BadRequestException(FIJAS);
  }

  async createSolucion(
    profileId: string,
    proposalId: string,
    dto: { title: string; description: string; borrador?: { indice: number } },
    ip: string,
    opts: OpcionesPublicar = {},
  ): Promise<{ id: string }> {
    const tema = await this.tema(profileId, proposalId, 'participar');
    await this.assertDebate(tema);
    // Lo que se vota es el valor propuesto: otra solución cambiaría la pregunta.
    if (tema.cambioRegla) throw new BadRequestException('Un cambio de regla se vota con su única solución.');
    const { revisado } = await this.guardia.antesDePublicar({
      tipo: 'solucion',
      texto: textoParaRevisar(dto.title, dto.description),
      autorProfileId: profileId,
      args: { proposalId, title: dto.title, description: dto.description, ...(dto.borrador ? { borrador: { indice: dto.borrador.indice } } : {}) },
      ...opts,
    });
    const created = await this.prisma.$transaction(async (tx) => {
      await bloquearDebate(tx, proposalId);
      if (dto.borrador && !(await this.sugerencias.marcarBorradorAdoptado(tx, proposalId, dto.borrador.indice))) {
        throw new BadRequestException('Ese borrador ya no está disponible.');
      }
      return tx.solucion.create({
        data: {
          proposalId,
          authorProfileId: profileId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          origen: dto.borrador ? 'asistente' : 'persona',
        },
      });
    });
    await this.guardia.despuesDePublicar('solucion', created.id, revisado);
    // Dentro de una bifurcación (reservada), sin actor ni ip.
    void this.audit.log({
      ...(await this.access.rastro(tema.groupId, profileId, ip)).quien,
      action: 'solucion.created',
      resource: `solucion:${created.id}`,
      metadata: { proposalId, ...(dto.borrador ? { desdeBorrador: true } : {}) },
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
    const tema = origen.proposal as Omit<TemaRow, 'participa'>;
    if (!(await this.forums.canOrganize(profileId, tema.groupId))) {
      throw new ForbiddenException('Solo quien organiza la comunidad puede juntar soluciones.');
    }
    await this.access.requireParticipant(tema.groupId, profileId);
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
      // Primero el tema (como al crear), luego las soluciones: el fin del debate espera o ya se ve.
      await bloquearDebate(tx, origen.proposalId);
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
      ...(await this.access.rastro(tema.groupId, profileId, ip)).quien,
      action: 'solucion.merged',
      resource: `solucion:${solucionId}`,
      metadata: { proposalId: origen.proposalId },
    });
  }

  async getTema(profileId: string, proposalId: string): Promise<DecisionTemaResponse> {
    const tema = await this.tema(profileId, proposalId, 'leer');
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    // `organiza` decide qué texto de las ocultas se ve (moderación); quien solo lee no organiza aquí.
    const organiza = await this.forums.canOrganize(profileId, tema.groupId);
    const { participa } = tema;
    const [filas, decision] = await Promise.all([
      this.prisma.solucion.findMany({ where: { proposalId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.decision.findUnique({ where: { proposalId } }),
    ]);

    // Quien no organiza ve el texto de una oculta enmascarado, también cuando es destino de una juntada.
    const textoDe = (s: (typeof filas)[number]): { title: string; description: string } =>
      s.hidden && !organiza ? { title: OCULTA_TITULO, description: '' } : { title: s.title, description: s.description };
    const porId = new Map(filas.map((s) => [s.id, s]));
    // Soluciones de este tema que ya se llevaron a la comunidad (cada una a lo sumo una vez).
    const llevadas = filas.length
      ? (
          await this.prisma.inquietud.findMany({
            where: { origenSolucionId: { in: filas.map((s) => s.id) } },
            select: { origenSolucionId: true },
          })
        )
          .map((i) => i.origenSolucionId)
          .filter((x): x is string => x !== null)
      : [];

    const soluciones: SolucionItem[] = filas.map((s) => {
      const destino = s.mergedIntoId ? porId.get(s.mergedIntoId) : undefined;
      return {
        id: s.id,
        ...textoDe(s),
        origen: s.origen as SolucionItem['origen'],
        hidden: s.hidden,
        mergedIntoTitle: destino ? textoDe(destino).title : null,
        isAuthor: participa && s.authorProfileId === profileId,
        createdAt: s.createdAt.toISOString(),
      };
    });

    let vista: DecisionView | null = null;
    if (decision) {
      const fase = decision.fase as DecisionView['fase'];
      const candidatas: DecisionView['candidatas'] = [];
      if (fase === 'modo' || fase === 'objecion') {
        // Aún no están congeladas: se muestran las que entrarían (filas ya viene en orden de llegada),
        // también las ocultas de forma provisional, enmascaradas para quien no organiza.
        const enPausa = await provisionales(this.prisma, filas.filter((s) => s.hidden).map((s) => s.id));
        for (const s of filas) {
          if (s.mergedIntoId === null && (!s.hidden || enPausa.has(s.id))) {
            candidatas.push({ id: s.id, ...textoDe(s), hidden: s.hidden, ...SIN_BIFURCACION });
          }
        }
      } else {
        for (const id of decision.candidatas) {
          const s = porId.get(id);
          if (s) candidatas.push({ id: s.id, ...textoDe(s), hidden: s.hidden, ...SIN_BIFURCACION });
        }
      }

      // Solo la papeleta y la objeción propias, leídas por su clave única: nunca las de otra persona.
      const clave = { decisionId_profileId: { decisionId: decision.id, profileId } };
      // Quien solo lee no tiene papeleta ni objeción: ni se consultan.
      const [papeleta, objecion, fraccionObjecionPct] = await Promise.all([
        participa && (fase === 'votacion' || fase === 'contada')
          ? this.prisma.decisionPapeleta.findUnique({ where: clave, select: { abstencion: true, orden: true } })
          : null,
        participa ? this.prisma.objecionModo.findUnique({ where: clave, select: { id: true } }) : null,
        this.rules.getInt('debate.fraccion_objecion_modo', tema.groupId),
      ]);
      const puedoObjetar =
        participa &&
        fase === 'objecion' &&
        decision.objecionEndsAt !== null &&
        Date.now() < decision.objecionEndsAt.getTime() &&
        (await this.participantes(proposalId, tema.groupId)).has(profileId);

      if (fase === 'contada' && candidatas.length > 0) {
        // Un cambio de regla no se bifurca: sus candidatas se quedan con SIN_BIFURCACION.
        if (!tema.cambioRegla) {
          await this.marcarBifurcaciones(candidatas, decision, tema.groupId, participa ? profileId : null, papeleta);
        }
      }

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
        fraccionObjecionPct,
      };
    }

    return {
      debateEndsAt: tema.deliberationEndsAt ? tema.deliberationEndsAt.toISOString() : null,
      puedeProponer:
        participa &&
        tema.status === 'open' &&
        decision === null &&
        !tema.cambioRegla &&
        !debateVencido(tema.deliberationEndsAt, new Date()),
      canOrganize: participa && organiza,
      soluciones,
      decision: vista,
      soloLectura: !participa,
      llevadas,
    };
  }

  /**
   * Bifurcación de cada candidata de una decisión contada. `puedoIniciarBifurcacion` sale solo de la
   * papeleta propia (miembro actual del grupo del tema): para cualquier otra persona es false, sin más.
   */
  private async marcarBifurcaciones(
    candidatas: CandidataView[],
    decision: DecisionBifurcable & { contadaAt: Date | null; updatedAt: Date },
    groupId: string,
    yo: string | null,
    papeleta: { abstencion: boolean; orden: string[] } | null,
  ): Promise<void> {
    const now = new Date();
    const [grupo, bifs, dias] = await Promise.all([
      this.prisma.group.findUnique({ where: { id: groupId }, select: { type: true } }),
      this.prisma.group.findMany({
        where: { trabajoTipo: 'bifurcacion', origenSolucionId: { in: candidatas.map((c) => c.id) } },
        select: { id: true, origenSolucionId: true, trabajoEstado: true, convocatoriaEndsAt: true },
      }),
      this.rules.getInt('bifurcacion.plazo_dias', groupId),
    ]);
    const tipo = (grupo?.type as string | undefined) ?? '';
    const enPlazo = now.getTime() < finDelPlazo(decision.contadaAt ?? decision.updatedAt, dias).getTime();
    const mias =
      yo && bifs.length > 0
        ? new Set(
            (
              await this.prisma.groupMembership.findMany({
                where: { profileId: yo, groupId: { in: bifs.map((b) => b.id) } },
                select: { groupId: true },
              })
            ).map((m) => m.groupId),
          )
        : new Set<string>();
    for (const c of candidatas) {
      c.bifurcable = !c.hidden && esBifurcable(decision, c.id, tipo);
      const b = bifs.find((x) => x.origenSolucionId === c.id);
      c.bifurcacionId = b?.id ?? null;
      const apoyo = yo !== null && papeleta !== null && !papeleta.abstencion && papeleta.orden.includes(c.id);
      const abierta = b
        ? !mias.has(b.id) &&
          (b.trabajoEstado === 'activo' ||
            (b.trabajoEstado === 'convocando' && b.convocatoriaEndsAt !== null && now.getTime() < b.convocatoriaEndsAt.getTime()))
        : enPlazo;
      c.puedoIniciarBifurcacion = c.bifurcable && apoyo && abierta;
    }
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
    await this.access.requireParticipant(tema.groupId, profileId);
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    const decision = await this.prisma.decision.findUnique({ where: { proposalId }, select: { id: true, fase: true } });
    const fueraDeFase = 'Esta decisión no está esperando que se proponga el modo.';
    if (!decision || (decision.fase as string) !== 'modo') throw new BadRequestException(fueraDeFase);
    const plazos = await this.plazosDelModo(tema.groupId);
    const salida = await this.prisma.$transaction(async (tx) => {
      if (!(await bloquearTema(tx, proposalId))) return null;
      return this.salirDelModo(tx, decision.id, proposalId, new Date(), modo, plazos);
    });
    if (!salida) throw new BadRequestException(fueraDeFase);
    this.auditarSalidaDelModo(salida, decision.id, proposalId, (await this.access.rastro(tema.groupId, profileId, ip)).quien);
  }

  private async plazosDelModo(groupId: string): Promise<{ objecionDias: number; votacionDias: number }> {
    const [objecionDias, votacionDias] = await Promise.all([
      this.rules.getInt('debate.plazo_objecion_modo_dias', groupId),
      this.rules.getInt('votacion.plazo_dias', groupId),
    ]);
    return { objecionDias, votacionDias };
  }

  /**
   * Saca la decisión de la fase `modo` (con el tema ya bloqueado). Con dos o más soluciones
   * vivas se abre la objeción al modo; con una no hay nada que excluir ni objetar (§5) y se
   * vota en compatibles; sin ninguna queda contada sin soluciones. Null si ya no estaba en `modo`.
   */
  private async salirDelModo(
    tx: Prisma.TransactionClient,
    decisionId: string,
    proposalId: string,
    now: Date,
    modo: DecisionModoValue,
    plazos: { objecionDias: number; votacionDias: number },
  ): Promise<SalidaDelModo | null> {
    const candidatas = await candidatasDe(tx, proposalId);
    let salida: SalidaDelModo;
    let data: Prisma.DecisionUpdateManyMutationInput;
    if (candidatas.length === 0) {
      salida = { fase: 'contada' };
      data = { fase: 'contada', resultado: 'sin_soluciones', contadaAt: now, candidatas: [] };
    } else if (candidatas.length === 1) {
      salida = { fase: 'votacion' };
      data = {
        fase: 'votacion',
        modo: 'compatibles',
        candidatas,
        votacionStartsAt: now,
        votacionEndsAt: new Date(now.getTime() + plazos.votacionDias * DIA_MS),
      };
    } else {
      salida = { fase: 'objecion', modo };
      data = { fase: 'objecion', modoPropuesto: modo, objecionEndsAt: new Date(now.getTime() + plazos.objecionDias * DIA_MS) };
    }
    const r = await tx.decision.updateMany({ where: { id: decisionId, fase: 'modo' }, data });
    return r.count === 0 ? null : salida;
  }

  private auditarSalidaDelModo(
    salida: SalidaDelModo,
    decisionId: string,
    proposalId: string,
    extra: { actorId?: string; ip?: string } = {},
  ): void {
    const resource = `decision:${decisionId}`;
    if (salida.fase === 'contada') {
      void this.audit.log({ ...extra, action: 'decision.counted', resource, metadata: { proposalId, resultado: 'sin_soluciones' } });
    } else if (salida.fase === 'votacion') {
      void this.audit.log({ ...extra, action: 'decision.vote_opened', resource, metadata: { proposalId } });
    } else {
      void this.audit.log({ ...extra, action: 'decision.mode_proposed', resource, metadata: { proposalId, modo: salida.modo } });
    }
  }

  /** Objetar o retirar la objeción al modo propuesto. No se audita (como los votos). */
  async setObjecion(profileId: string, proposalId: string, objeto: boolean): Promise<{ yoObjete: boolean }> {
    const tema = await this.tema(profileId, proposalId, 'participar');
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
    const tema = await this.tema(profileId, proposalId, 'participar');
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
      // Primero el tema (mismo orden que contar: proposals antes que decisiones). FOR SHARE choca
      // con la ocultación (provisional o en firme): si se ocultó entre la lectura y aquí, no se escribe.
      const visible = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM proposals WHERE id = ${proposalId}::uuid AND hidden = false FOR SHARE`,
      );
      if (visible.length === 0) throw new BadRequestException('Este tema está oculto por moderación.');
      // Relee la decisión con bloqueo: si el plazo venció, el programador ya contó o se canceló, no se escribe.
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

  /** Miembros actuales del grupo que participaron en el debate del tema (ver participantes-del-debate). */
  private participantes(proposalId: string, groupId: string): Promise<Set<string>> {
    return participantesDelDebate(this.prisma, proposalId, groupId);
  }

  // ─── Plazos ───────────────────────────────────────────────────────────────

  /** Revisa los plazos (debate, modo, objeción, votación). Devuelve cuántas transiciones hizo. */
  async processDeadlines(now: Date): Promise<number> {
    let n = 0;
    n += await this.finDelDebate(now);
    n += await this.finDelModo(now);
    n += await this.finDeLaObjecion(now);
    n += await this.finDeLaVotacion(now);
    return n;
  }

  private async finDelDebate(now: Date): Promise<number> {
    const temas = await this.prisma.proposal.findMany({
      // Una propuesta del plan 2 con votación propia (electionId) no pasa por este ciclo.
      // Un grupo de trabajo detenido (pausado, cerrado) o que cuelga de una bifurcación pausada no avanza.
      // Un cambio de regla anulado (tema ocultado y luego restaurado) no se vota: no aplicaría nada.
      where: {
        kind: 'propuesta', status: 'open', hidden: false, deliberationEndsAt: { lte: now }, decision: null, electionId: null,
        group: GRUPO_EN_MARCHA,
        OR: [{ cambioRegla: { is: null } }, { cambioRegla: { is: { estado: 'en_votacion' } } }],
      },
      select: { id: true, groupId: true },
    });
    let n = 0;
    for (const t of temas) {
      try {
        const dias = await this.rules.getInt('votacion.plazo_dias', t.groupId);
        const hecho = await this.prisma.$transaction(async (tx) => {
          if (!(await bloquearTema(tx, t.id))) return null;
          const ids = await candidatasDe(tx, t.id);
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

  /**
   * Si quien organiza no propone el modo en `debate.plazo_objecion_modo_dias` días desde que
   * empezó la fase, se propone «excluyentes» y se abre la objeción (o el atajo con 0 o 1 vivas).
   */
  private async finDelModo(now: Date): Promise<number> {
    const decisiones = await this.prisma.decision.findMany({
      where: { fase: 'modo', proposal: { group: GRUPO_EN_MARCHA } },
      select: { id: true, proposalId: true, createdAt: true, proposal: { select: { groupId: true } } },
    });
    let n = 0;
    for (const d of decisiones) {
      try {
        const plazos = await this.plazosDelModo(d.proposal.groupId);
        if (d.createdAt.getTime() + plazos.objecionDias * DIA_MS > now.getTime()) continue;
        const salida = await this.prisma.$transaction(async (tx) => {
          if (!(await bloquearTema(tx, d.proposalId))) return null;
          return this.salirDelModo(tx, d.id, d.proposalId, now, 'excluyentes', plazos);
        });
        if (!salida) continue;
        n += 1;
        this.auditarSalidaDelModo(salida, d.id, d.proposalId);
      } catch (err) {
        this.logger.error(`No se pudo cerrar el plazo del modo ${d.id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return n;
  }

  private async finDeLaObjecion(now: Date): Promise<number> {
    const decisiones = await this.prisma.decision.findMany({
      where: { fase: 'objecion', objecionEndsAt: { lte: now }, proposal: { group: GRUPO_EN_MARCHA } },
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
          const candidatas = await candidatasDe(tx, d.proposalId);
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
      where: { fase: 'votacion', votacionEndsAt: { lte: now }, proposal: { group: GRUPO_EN_MARCHA } },
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
      select: {
        proposalId: true,
        proposal: {
          select: {
            groupId: true,
            group: { select: { type: true, trabajoEstado: true, parent: { select: { trabajoEstado: true } } } },
            cambioRegla: { select: { id: true } },
          },
        },
      },
    });
    if (!previa) return false;
    // Un grupo de trabajo pausado (o su comisión) no cuenta: se cuenta al reanudarse, con el plazo corrido.
    const grupo = previa.proposal.group;
    if (
      grupo &&
      !grupoEnMarcha({
        type: grupo.type as string,
        trabajoEstado: (grupo.trabajoEstado as string | null) ?? null,
        parent: grupo.parent ? { trabajoEstado: (grupo.parent.trabajoEstado as string | null) ?? null } : null,
      })
    ) {
      return false;
    }
    const { proposalId } = previa;
    const groupId = previa.proposal.groupId;
    let quorumPct = await this.rules.getInt('votacion.quorum_porcentaje', groupId);
    // Un cambio de regla exige además la participación mínima de la colmena (30 % por defecto).
    if (previa.proposal.cambioRegla) {
      quorumPct = Math.max(quorumPct, await this.rules.getInt('reglas.participacion_minima', null));
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      // Un tema oculto no se cuenta: si la ocultación es provisional, se cuenta al volver a
      // mostrarse; si se confirmó, la decisión ya quedó cancelada (hideTopicTx).
      if (!(await bloquearTema(tx, proposalId))) return null;
      // Bloquea la decisión antes de leer las papeletas: una papeleta que ya pasó su
      // comprobación (FOR UPDATE en castPapeleta) termina de guardarse antes de contar.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM decisiones WHERE id = ${decisionId}::uuid FOR UPDATE`);
      const d = await tx.decision.findUnique({
        where: { id: decisionId },
        select: { fase: true, modo: true, candidatas: true },
      });
      if (!d || (d.fase as string) !== 'votacion') return null;
      // Una candidata oculta de forma provisional espera la segunda firma (48 h como mucho):
      // no se cuenta en esta pasada, sin escribir ni auditar; la siguiente lo reintenta.
      if ((await provisionales(tx, d.candidatas)).size > 0) return null;
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
      // Una candidata ocultada en firme durante la votación sigue en las cifras, pero no gana
      // (ya no queda ninguna provisional: las ocultas aquí son confirmadas).
      const ocultas = (
        await tx.solucion.findMany({ where: { id: { in: d.candidatas }, hidden: true }, select: { id: true } })
      ).map((s) => s.id);
      const t = tallyDecision({ candidatas: d.candidatas, modo, papeletas, miembros, quorumPct, excluidas: ocultas });
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

  // ─── Página «Decisiones» ──────────────────────────────────────────────────

  /**
   * Aprobadas, rechazadas y en curso de cada comunidad de quien consulta. Consultas fijas
   * (membresías, temas con su decisión y títulos de las ganadoras), sin importar cuántos temas haya.
   */
  async getResumen(profileId: string): Promise<DecisionesResumenResponse> {
    const membresias = await this.prisma.groupMembership.findMany({
      where: { profileId },
      select: { group: { select: { id: true, name: true, type: true, slug: true } } },
    });
    // Los grupos de trabajo no son comunidades: van dentro de la lista `grupos` de su ámbito.
    const soyDeTrabajo = new Set(
      membresias.filter(({ group }) => (group.type as string) === 'trabajo').map(({ group }) => group.id),
    );
    const grupos = membresias
      .filter(({ group }) => (group.type as string) !== 'trabajo')
      .map(({ group }) => ({ ...group, ...tipoDeComunidad(group.type as string, group.slug) }))
      .sort((a, b) => a.rango - b.rango || a.name.localeCompare(b.name, 'es'));
    if (grupos.length === 0) return { comunidades: [] };

    const trabajoPorAmbito = await this.gruposDeTrabajo(grupos.map((g) => g.id), soyDeTrabajo);

    const temas = await this.prisma.proposal.findMany({
      where: {
        groupId: { in: grupos.map((g) => g.id) },
        hidden: false,
        OR: [
          { decision: { isNot: null } },
          { status: 'closed', conclusion: { not: null } },
          { status: 'open', kind: 'propuesta', electionId: null },
        ],
      },
      select: {
        id: true, groupId: true, title: true, status: true, kind: true, hidden: true, electionId: true,
        conclusion: true, closedAt: true, deliberationEndsAt: true, createdAt: true, updatedAt: true,
        decision: {
          select: {
            fase: true, resultado: true, candidatas: true, ganadoras: true, aprobaciones: true,
            papeletasTotal: true, abstenciones: true, contadaAt: true, objecionEndsAt: true,
            votacionEndsAt: true, updatedAt: true,
          },
        },
      },
    });

    const idsGanadoras = new Set<string>();
    for (const t of temas) {
      if (t.decision?.fase === 'contada' && t.decision.resultado === 'aprobada') {
        for (const id of t.decision.ganadoras) idsGanadoras.add(id);
      }
    }
    // Las ocultas por moderación salen enmascaradas para todas las personas.
    const titulos = new Map<string, string>();
    if (idsGanadoras.size > 0) {
      const filas = await this.prisma.solucion.findMany({
        where: { id: { in: [...idsGanadoras] } },
        select: { id: true, title: true, hidden: true },
      });
      for (const s of filas) titulos.set(s.id, s.hidden ? OCULTA_TITULO : s.title);
    }

    const porGrupo = new Map<string, { aprobadas: ListaResumen; rechazadas: ListaResumen; enCurso: ListaResumen }>(
      grupos.map((g) => [g.id, { aprobadas: [], rechazadas: [], enCurso: [] }]),
    );

    for (const t of temas) {
      const listas = porGrupo.get(t.groupId);
      if (!listas || t.hidden) continue;
      const d = t.decision;
      const base = { proposalId: t.id, title: t.title };
      if (d) {
        const fase = d.fase as string;
        if (fase === 'contada') {
          const fecha = d.contadaAt ?? d.updatedAt;
          if (d.resultado === 'aprobada') {
            const validas = (d.papeletasTotal ?? 0) - (d.abstenciones ?? 0);
            const ganadoras = d.ganadoras.map((id) => {
              const i = d.candidatas.indexOf(id);
              const incluyen = i >= 0 ? d.aprobaciones[i] : undefined;
              return {
                title: titulos.get(id) ?? OCULTA_TITULO,
                incluyenPct: validas > 0 && incluyen !== undefined ? Math.round((100 * incluyen) / validas) : null,
              };
            });
            listas.aprobadas.push({
              item: { ...base, estado: 'aprobada', detalle: 'Aprobada por votación', ganadoras, fecha: fecha.toISOString() },
              orden: fecha.getTime(),
            });
          } else {
            const detalle = DETALLE_RECHAZO[d.resultado ?? ''];
            if (detalle) {
              listas.rechazadas.push({
                item: { ...base, estado: 'rechazada', detalle, ganadoras: [], fecha: fecha.toISOString() },
                orden: fecha.getTime(),
              });
            }
          }
          continue;
        }
        // La cancelada (tema ocultado durante la decisión) no figura en ninguna lista.
        let detalle: string;
        let fecha: string | null;
        if (fase === 'modo') {
          detalle = 'Eligiendo cómo decidir';
          fecha = null;
        } else if (fase === 'objecion') {
          fecha = iso(d.objecionEndsAt);
          detalle = fecha ? 'Objeciones hasta el {fecha}' : 'Objeciones abiertas';
        } else if (fase === 'votacion') {
          fecha = iso(d.votacionEndsAt);
          detalle = fecha ? 'Votación abierta hasta el {fecha}' : 'Votación abierta';
        } else {
          continue;
        }
        listas.enCurso.push({
          item: { ...base, estado: 'en_curso', detalle, ganadoras: [], fecha },
          orden: t.createdAt.getTime(),
        });
        continue;
      }
      if (t.status === 'closed' && t.conclusion !== null) {
        const fecha = t.closedAt ?? t.updatedAt;
        listas.aprobadas.push({
          item: { ...base, estado: 'aprobada', detalle: 'Consenso del debate', ganadoras: [], fecha: fecha.toISOString() },
          orden: fecha.getTime(),
        });
      } else if (t.status === 'open' && t.kind === 'propuesta' && t.electionId === null) {
        const fecha = iso(t.deliberationEndsAt);
        listas.enCurso.push({
          item: { ...base, estado: 'en_curso', detalle: fecha ? 'En debate hasta el {fecha}' : 'En debate', ganadoras: [], fecha },
          orden: t.createdAt.getTime(),
        });
      }
    }

    const recortar = (l: ListaResumen): DecisionResumenItem[] =>
      l.sort((a, b) => b.orden - a.orden).slice(0, RESUMEN_MAX).map((x) => x.item);

    const comunidades: ComunidadDecisiones[] = grupos.map((g) => {
      const l = porGrupo.get(g.id) ?? { aprobadas: [], rechazadas: [], enCurso: [] };
      return {
        groupId: g.id,
        name: g.name,
        tipo: g.tipo,
        aprobadas: recortar(l.aprobadas),
        rechazadas: recortar(l.rechazadas),
        enCurso: recortar(l.enCurso),
        grupos: trabajoPorAmbito.get(g.id) ?? [],
      };
    });
    return { comunidades };
  }

  /**
   * Grupos de trabajo no archivados de cada ámbito: una consulta para los grupos y otra (groupBy)
   * para contar sus miembros. `soy` son los grupos de trabajo de quien pregunta.
   */
  private async gruposDeTrabajo(ambitoIds: string[], soy: Set<string>): Promise<Map<string, GrupoTrabajoItem[]>> {
    const porAmbito = new Map<string, GrupoTrabajoItem[]>();
    // El propósito de una bifurcación es el título de su solución de origen: enmascarado si se ocultó.
    const filas = await enmascararOrigenOculto(
      this.prisma,
      (await this.prisma.group.findMany({
        where: { type: 'trabajo', parentGroupId: { in: ambitoIds }, trabajoEstado: { not: 'archivado' } },
        select: {
          id: true, name: true, type: true, parentGroupId: true, trabajoTipo: true, trabajoEstado: true,
          proposito: true, convocatoriaEndsAt: true, pocosMiembrosDesde: true, origenSolucionId: true,
        },
        orderBy: { createdAt: 'asc' },
      })) as GrupoFila[],
    );
    if (filas.length === 0) return porAmbito;

    const conteos = await this.prisma.groupMembership.groupBy({
      by: ['groupId'],
      where: { groupId: { in: filas.map((f) => f.id) } },
      _count: { _all: true },
    });
    const miembros = new Map(conteos.map((c) => [c.groupId, c._count._all]));
    // Último informe de cada comisión: una consulta para todas.
    const informes = await ultimosInformes(
      this.prisma,
      filas.filter((f) => f.trabajoTipo === 'comision').map((f) => f.id),
    );
    const minimos = new Map<string, number>();
    // Mínimo por ámbito y tipo: las bifurcaciones tienen su propia regla.
    const claveDe = (f: GrupoFila) => `${f.parentGroupId ?? ''}|${claveMinimo(f.trabajoTipo)}`;
    for (const f of filas) {
      const k = claveDe(f);
      if (!minimos.has(k)) minimos.set(k, await this.rules.getInt(claveMinimo(f.trabajoTipo), f.parentGroupId ?? ''));
    }
    for (const f of filas) {
      const ambitoId = f.parentGroupId ?? '';
      const lista = porAmbito.get(ambitoId) ?? [];
      // Una bifurcación sale como «Iniciativa de un grupo» con cuántos son, nunca quiénes.
      lista.push(
        grupoTrabajoItem(f, miembros.get(f.id) ?? 0, minimos.get(claveDe(f)) ?? 0, soy.has(f.id), {
          ultimoInforme: informes.get(f.id) ?? null,
        }),
      );
      porAmbito.set(ambitoId, lista);
    }
    return porAmbito;
  }
}
