import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { BifurcacionView, ModeracionCausaValue, PausaApeladaItem } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ForumsService } from '../forums/forums.service';
import { ComisionesService } from './comisiones.service';
import type { GrupoFila } from './grupo-item';
import { NO_ELEGIBLE, NOMBRE_INICIATIVA, SOLUCION_OCULTA, esBifurcable, esElegible, finDelPlazo } from './bifurcacion-reglas';

const PROPOSITO_MAX = 1000;
const FASES_ACTIVAS = ['modo', 'objecion', 'votacion'] as const;

type Tx = Prisma.TransactionClient;

const NO_BIFURCABLE = 'Esta solución no se puede bifurcar.';
const PLAZO_VENCIDO = 'El plazo para iniciar una iniciativa con esta solución ya venció.';
const YA_EXISTE = 'Ya hay una iniciativa para esta solución: puedes sumarte a ella.';
const NO_ES_BIFURCACION = 'Esto no es una iniciativa de un grupo.';
const NO_ORGANIZA = 'Solo quien organiza la comunidad puede pausar esta iniciativa.';
const NO_ACTIVA = 'Solo se puede pausar una iniciativa activa.';
const NO_PAUSADA = 'Esta iniciativa no está pausada.';
const YA_APELADA = 'Esta pausa ya fue apelada.';
const NO_MESA = 'Solo la mesa puede resolver la apelación de una pausa.';
const SIN_APELACION = 'No hay una apelación pendiente para esta pausa.';
const NO_ACTIVA_COMISION = 'Solo una iniciativa activa puede pedir su comisión.';

/** Campos de una bifurcación que usa este servicio. */
export interface BifurcacionFila extends GrupoFila {
  origenSolucionId: string | null;
  pausaCausa: string | null;
  pausaDetalle: string | null;
  pausaApelacion: string | null;
  pausaApeladaAt: Date | null;
}

const esDuplicado = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Al reanudar una bifurcación, todo lo que la pausa detuvo se corre lo que duró (`pausa` en ms):
 * el debate de sus temas abiertos, la fase de sus decisiones activas (la base del plazo del modo es
 * `createdAt`) y los plazos de lo que cuelga de ella (su comisión: convocatoria, elección e informes).
 */
async function correrPlazosTx(tx: Tx, bifId: string, pausa: number): Promise<void> {
  const mas = (d: Date) => new Date(d.getTime() + pausa);
  const hijos = await tx.group.findMany({
    where: { parentGroupId: bifId, type: 'trabajo' },
    select: { id: true, convocatoriaEndsAt: true, eleccionEndsAt: true, proximoInformeAt: true },
  });
  for (const h of hijos) {
    const data: Prisma.GroupUpdateManyMutationInput = {};
    if (h.convocatoriaEndsAt) data.convocatoriaEndsAt = mas(h.convocatoriaEndsAt);
    if (h.eleccionEndsAt) data.eleccionEndsAt = mas(h.eleccionEndsAt);
    if (h.proximoInformeAt) data.proximoInformeAt = mas(h.proximoInformeAt);
    if (Object.keys(data).length > 0) await tx.group.updateMany({ where: { id: h.id }, data });
  }
  const ids = [bifId, ...hijos.map((h) => h.id)];
  const decisiones = await tx.decision.findMany({
    where: { proposal: { groupId: { in: ids } }, fase: { in: [...FASES_ACTIVAS] } },
    select: { id: true, fase: true, createdAt: true, objecionEndsAt: true, votacionEndsAt: true },
  });
  for (const d of decisiones) {
    const fase = d.fase as string;
    let data: Prisma.DecisionUpdateManyMutationInput | null = null;
    if (fase === 'modo') data = { createdAt: mas(d.createdAt) };
    else if (fase === 'objecion' && d.objecionEndsAt) data = { objecionEndsAt: mas(d.objecionEndsAt) };
    else if (fase === 'votacion' && d.votacionEndsAt) data = { votacionEndsAt: mas(d.votacionEndsAt) };
    if (data) await tx.decision.updateMany({ where: { id: d.id, fase: d.fase }, data });
  }
  const debates = await tx.proposal.findMany({
    where: { groupId: { in: ids }, status: 'open', decision: null, deliberationEndsAt: { not: null } },
    select: { id: true, deliberationEndsAt: true },
  });
  for (const t of debates) {
    if (!t.deliberationEndsAt) continue;
    await tx.proposal.updateMany({ where: { id: t.id, status: 'open' }, data: { deliberationEndsAt: mas(t.deliberationEndsAt) } });
  }
}

/**
 * Bifurcaciones (3A-4b): «iniciativas de un grupo» formadas solo por quienes apoyaron una solución
 * que perdió. Nunca se revela quiénes son: ni en respuestas ni en auditorías (R4).
 */
@Injectable()
export class BifurcacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GroupAccessService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
    private readonly forums: ForumsService,
    private readonly comisiones: ComisionesService,
  ) {}

  /** Auditoría con `{ grupoId }`; el actor solo cuando no delata a un miembro (organiza o mesa). */
  private async auditar(action: string, grupoId: string, actorProfileId: string | null, ip?: string): Promise<void> {
    let actor: { actorId: string } | Record<never, never> = {};
    if (actorProfileId) {
      try {
        const p = await this.prisma.profile.findUnique({ where: { id: actorProfileId }, select: { userId: true } });
        if (p?.userId) actor = { actorId: p.userId };
      } catch {
        // La escritura ya se hizo: ante la duda, sin actor ni ip (nunca un 500 después).
        ip = undefined;
      }
    }
    void this.audit.log({
      ...actor,
      action,
      resource: `group:${grupoId}`,
      ...(ip ? { ip } : {}),
      metadata: { grupoId },
    });
  }

  private async bifurcacion(id: string): Promise<BifurcacionFila & { parentGroupId: string }> {
    const g = (await this.prisma.group.findUnique({ where: { id } })) as BifurcacionFila | null;
    if (!g || g.type !== 'trabajo' || g.trabajoTipo !== 'bifurcacion' || !g.parentGroupId) {
      throw new BadRequestException(NO_ES_BIFURCACION);
    }
    return g as BifurcacionFila & { parentGroupId: string };
  }

  // ─── Iniciar y elegibilidad ───────────────────────────────────────────────

  async iniciar(profileId: string, solucionId: string, now: Date = new Date()): Promise<{ id: string }> {
    const s = await this.prisma.solucion.findUnique({
      where: { id: solucionId },
      select: {
        id: true,
        title: true,
        hidden: true,
        proposal: {
          select: {
            groupId: true,
            hidden: true,
            group: { select: { type: true } },
            decision: {
              select: {
                id: true, fase: true, resultado: true, modo: true, ganadoras: true, candidatas: true,
                contadaAt: true, updatedAt: true,
              },
            },
          },
        },
      },
    });
    const d = s?.proposal.decision;
    if (!s || !d || s.hidden || s.proposal.hidden || !esBifurcable(d, s.id, s.proposal.group.type as string)) {
      throw new BadRequestException(NO_BIFURCABLE);
    }
    const ambitoId = s.proposal.groupId;
    const dias = await this.rules.getInt('bifurcacion.plazo_dias', ambitoId);
    const fin = finDelPlazo(d.contadaAt ?? d.updatedAt, dias);
    if (fin.getTime() <= now.getTime()) throw new ConflictException(PLAZO_VENCIDO);
    if (!(await esElegible(this.prisma, d.id, s.id, ambitoId, profileId))) throw new ForbiddenException(NO_ELEGIBLE);

    const id = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        // Sin `creadoPorProfileId`: quien la inicia delataría su voto.
        await tx.group.create({
          data: {
            id,
            name: NOMBRE_INICIATIVA,
            slug: `trabajo-${id}`,
            type: 'trabajo',
            parentGroupId: ambitoId,
            trabajoTipo: 'bifurcacion',
            trabajoEstado: 'convocando',
            proposito: s.title.slice(0, PROPOSITO_MAX),
            convocatoriaEndsAt: fin,
            origenSolucionId: s.id,
          },
        });
        await tx.groupMembership.create({ data: { groupId: id, profileId } });
      });
    } catch (err) {
      // Fuera de la transacción: el índice parcial único deja una sola bifurcación por solución.
      if (esDuplicado(err)) throw new ConflictException(YA_EXISTE);
      throw err;
    }
    // Sin actor ni ip: iniciar delataría el voto.
    await this.auditar('bifurcacion.started', id, null);
    return { id };
  }

  /** Quien tenía la solución de origen en su orden y sigue en el ámbito. */
  async elegible(g: { origenSolucionId?: string | null; parentGroupId: string | null }, profileId: string): Promise<boolean> {
    if (!g.origenSolucionId || !g.parentGroupId) return false;
    const s = await this.prisma.solucion.findUnique({
      where: { id: g.origenSolucionId },
      select: { proposal: { select: { decision: { select: { id: true } } } } },
    });
    const decisionId = s?.proposal.decision?.id;
    if (!decisionId) return false;
    return esElegible(this.prisma, decisionId, g.origenSolucionId, g.parentGroupId, profileId);
  }

  // ─── Pausa ────────────────────────────────────────────────────────────────

  /**
   * Quien organiza la comunidad puede pausar sus bifurcaciones activas desde la lista de grupos
   * (quien llama ya sabe que es miembro del ámbito). No lee nada de dentro de la bifurcación.
   */
  puedePausarEn(profileId: string, ambitoId: string): Promise<boolean> {
    return this.forums.canOrganize(profileId, ambitoId);
  }

  /** Quien organiza la comunidad (y es miembro de ella) pausa una bifurcación activa. */
  async pausar(
    profileId: string,
    id: string,
    causa: ModeracionCausaValue,
    detalle: string | undefined,
    ip: string,
    now: Date = new Date(),
  ): Promise<void> {
    const g = await this.bifurcacion(id);
    const [organiza, enAmbito] = await Promise.all([
      this.forums.canOrganize(profileId, g.parentGroupId),
      this.access.isParticipant(g.parentGroupId, profileId),
    ]);
    if (!organiza || !enAmbito) throw new ForbiddenException(NO_ORGANIZA);
    const res = await this.prisma.group.updateMany({
      where: { id, trabajoTipo: 'bifurcacion', trabajoEstado: 'activo' },
      data: {
        trabajoEstado: 'pausado',
        pausaCausa: causa,
        pausaDetalle: detalle?.trim() ? detalle.trim() : null,
        pausaApelacion: null,
        pausaApeladaAt: null,
        // Al reanudar, los plazos se corren lo que duró la pausa.
        pausadaAt: now,
      },
    });
    if (res.count !== 1) throw new ConflictException(NO_ACTIVA);
    // Si quien pausa es miembro de la bifurcación, su nombre delataría su voto: sin actor ni ip.
    let miembro = true;
    try {
      miembro = await this.access.isParticipant(id, profileId);
    } catch {
      // Ante la duda, sin rastro.
    }
    await this.auditar('bifurcacion.paused', id, miembro ? null : profileId, miembro ? undefined : ip);
  }

  /** Un miembro apela la pausa, una sola vez por pausa. */
  async apelar(profileId: string, id: string, texto: string, now: Date = new Date()): Promise<void> {
    const g = await this.bifurcacion(id);
    await this.access.requireMember(id, profileId);
    if (g.trabajoEstado !== 'pausado') throw new ConflictException(NO_PAUSADA);
    const res = await this.prisma.group.updateMany({
      where: { id, trabajoTipo: 'bifurcacion', trabajoEstado: 'pausado', pausaApelacion: null },
      data: { pausaApelacion: texto.trim(), pausaApeladaAt: now },
    });
    if (res.count !== 1) {
      const actual = (await this.prisma.group.findUnique({ where: { id } })) as BifurcacionFila | null;
      throw new ConflictException(actual?.trabajoEstado === 'pausado' ? YA_APELADA : NO_PAUSADA);
    }
    // Sin actor: apelar delataría la membresía.
    await this.auditar('bifurcacion.appealed', id, null);
  }

  /**
   * La mesa resuelve una apelación pendiente. Reanudar vuelve a `activo` y limpia la pausa; mantener
   * solo la saca de la cola (`pausaApeladaAt = null`) y conserva el texto, así no se apela otra vez.
   */
  async resolver(profileId: string, id: string, reanudar: boolean, ip: string, now: Date = new Date()): Promise<void> {
    if (!(await this.forums.esMesa(profileId))) throw new ForbiddenException(NO_MESA);
    const pendiente = { id, trabajoTipo: 'bifurcacion' as const, trabajoEstado: 'pausado' as const, pausaApeladaAt: { not: null } };
    if (!reanudar) {
      const res = await this.prisma.group.updateMany({ where: pendiente, data: { pausaApeladaAt: null } });
      if (res.count !== 1) throw new ConflictException(SIN_APELACION);
      return;
    }
    const reanudada = await this.prisma.$transaction(async (tx) => {
      // Con la fila bloqueada: el inicio de la pausa que se lee es el que se limpia.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM groups WHERE id = ${id}::uuid FOR UPDATE`);
      const actual = await tx.group.findUnique({ where: { id }, select: { pausadaAt: true } });
      const res = await tx.group.updateMany({
        where: pendiente,
        data: {
          trabajoEstado: 'activo',
          pausaCausa: null,
          pausaDetalle: null,
          pausaApelacion: null,
          pausaApeladaAt: null,
          pausadaAt: null,
        },
      });
      if (res.count !== 1) return false;
      const pausa = actual?.pausadaAt ? now.getTime() - actual.pausadaAt.getTime() : 0;
      if (pausa > 0) await correrPlazosTx(tx, id, pausa);
      return true;
    });
    if (!reanudada) throw new ConflictException(SIN_APELACION);
    await this.auditar('bifurcacion.resumed', id, profileId, ip);
  }

  /** Cola de la mesa: pausas apeladas pendientes, sin nada que identifique a los miembros. */
  async apeladas(profileId: string): Promise<PausaApeladaItem[]> {
    if (!(await this.forums.esMesa(profileId))) throw new ForbiddenException(NO_MESA);
    const filas = (await this.prisma.group.findMany({
      where: { type: 'trabajo', trabajoTipo: 'bifurcacion', trabajoEstado: 'pausado', pausaApeladaAt: { not: null } },
      orderBy: { pausaApeladaAt: 'asc' },
    })) as BifurcacionFila[];
    const r: PausaApeladaItem[] = [];
    for (const g of filas) {
      const s = g.origenSolucionId
        ? await this.prisma.solucion.findUnique({
            where: { id: g.origenSolucionId },
            select: { title: true, proposalId: true, hidden: true },
          })
        : null;
      r.push({
        grupoId: g.id,
        // La mesa no lee lo de dentro; una solución ocultada por moderación sale enmascarada.
        solucionTitulo: s ? (s.hidden ? SOLUCION_OCULTA : s.title) : '',
        proposalId: s?.proposalId ?? '',
        causa: g.pausaCausa ?? '',
        detalle: g.pausaDetalle ?? '',
        apelacion: g.pausaApelacion ?? '',
        apeladaAt: (g.pausaApeladaAt ?? new Date(0)).toISOString(),
      });
    }
    return r;
  }

  // ─── Comisión propia ──────────────────────────────────────────────────────

  /** Un miembro pide la comisión de la bifurcación: tarea = la solución de origen; voluntarios, sus miembros. */
  async pedirComision(profileId: string, id: string, now: Date = new Date()): Promise<{ id: string }> {
    const g = await this.bifurcacion(id);
    await this.access.requireMember(id, profileId);
    if (g.trabajoEstado !== 'activo' || !g.origenSolucionId) throw new ConflictException(NO_ACTIVA_COMISION);
    const comisionId = await this.comisiones.crearDeBifurcacion(
      { id: g.id, parentGroupId: g.parentGroupId, origenSolucionId: g.origenSolucionId },
      now,
    );
    return { id: comisionId };
  }

  // ─── Vista ────────────────────────────────────────────────────────────────

  async vista(g: BifurcacionFila, profileId: string, soyMiembro: boolean, enAmbito: boolean): Promise<BifurcacionView> {
    const activa = g.trabajoEstado === 'activo';
    const pausada = g.trabajoEstado === 'pausado';
    const S = g.origenSolucionId;
    const [s, organiza, llevada, comisionViva] = await Promise.all([
      S ? this.prisma.solucion.findUnique({ where: { id: S }, select: { title: true, proposalId: true, hidden: true } }) : null,
      activa && enAmbito && g.parentGroupId ? this.forums.canOrganize(profileId, g.parentGroupId) : false,
      S ? this.prisma.inquietud.findUnique({ where: { origenSolucionId: S }, select: { id: true } }) : null,
      // La comisión propia solo se muestra a los miembros (su existencia no sale de la bifurcación).
      S && soyMiembro
        ? this.prisma.group.findFirst({
            where: { trabajoTipo: 'comision', origenSolucionId: S, trabajoEstado: { notIn: ['cerrado', 'archivado'] } },
            select: { id: true },
          })
        : null,
    ]);
    return {
      solucionTitulo: s ? (s.hidden ? 'Solución oculta por moderación' : s.title) : '',
      solucionId: S ?? '',
      proposalId: s?.proposalId ?? '',
      pausa:
        pausada && g.pausaCausa
          ? { causa: g.pausaCausa, detalle: g.pausaDetalle ?? '', apelada: g.pausaApelacion !== null }
          : null,
      puedoApelar: soyMiembro && pausada && g.pausaApelacion === null,
      puedoPausar: activa && enAmbito && organiza,
      puedoPedirComision: soyMiembro && activa && Boolean(S) && comisionViva === null,
      yaLlevada: llevada !== null,
      comisionId: comisionViva?.id ?? null,
    };
  }
}
