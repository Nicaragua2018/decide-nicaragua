import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import type { GrupoTrabajoDetail, GrupoTrabajoItem, GruposAmbitoResponse } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { GroupAccessService } from '../groups/group-access.service';
import { type GrupoFila, claveMinimo, grupoTrabajoItem } from './grupo-item';
import { type ComisionFila, ComisionesService } from './comisiones.service';
import { type BifurcacionFila, BifurcacionesService } from './bifurcaciones.service';
import { NO_ELEGIBLE } from './bifurcacion-reglas';

const DIA_MS = 86_400_000;
/** Un subgrupo activo con menos de estas personas empieza a contar los días para archivarse. */
const MINIMO_ACTIVO = 3;
const DIAS_CON_POCOS = 30;
const FASES_ACTIVAS = ['modo', 'objecion', 'votacion'] as const;

const NO_AMBITO = 'Los grupos de trabajo cuelgan de una comunidad o del nivel general.';
const NO_MIEMBRO_AMBITO = 'Solo los miembros de esta comunidad pueden proponer o entrar a sus grupos de trabajo.';
const NO_EXISTE = 'Grupo de trabajo no encontrado.';
const NO_ADMITE = 'Este grupo de trabajo ya no admite nuevos miembros.';
const NO_ES_TRABAJO = 'Esto no es un grupo de trabajo.';
const YA_LLEVADA = 'Esta propuesta ya se llevó a la comunidad.';
const NO_GANADORA = 'Solo se puede llevar a la comunidad una propuesta ganadora de una decisión aprobada de este grupo.';
const OCULTA = 'Esta propuesta fue ocultada por moderación y no se puede llevar a la comunidad.';
const NO_ACTIVO = 'Solo un grupo de trabajo activo puede llevar propuestas a la comunidad.';
const TEMA_OCULTO = 'Este tema está oculto por moderación.';
const NO_MIEMBRO_PARA_LLEVAR = 'Solo los miembros de la comunidad pueden llevar propuestas a ella.';
const CONVOCATORIA_VENCIDA = 'La convocatoria de este grupo ya venció.';
const COMISION_SIN_ENTRAR = 'A una comisión no se entra directamente: ofrécete como voluntario.';
const CUERPO_MAX = 2000;
const NO_ORIGEN = 'La solución de origen de esta iniciativa ya no se puede llevar a la comunidad.';

type AmbitoTipo = 'origen' | 'acogida' | 'general';
type Tx = Prisma.TransactionClient;

const esDuplicado = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Tipo de ámbito y su orden (origen → acogida → general); null si el grupo no puede ser ámbito. */
function tipoDeAmbito(g: { type: string; slug: string }): { tipo: AmbitoTipo; rango: number } | null {
  if (g.type === 'territorial_origin') return { tipo: 'origen', rango: 0 };
  if (g.type === 'territorial_residence') return { tipo: 'acogida', rango: 1 };
  if (g.type === 'custom' && g.slug === GENERAL_GROUP_SLUG) return { tipo: 'general', rango: 2 };
  return null;
}

@Injectable()
export class GruposService {
  private readonly logger = new Logger(GruposService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GroupAccessService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
    private readonly comisiones: ComisionesService,
    private readonly bifurcaciones: BifurcacionesService,
  ) {}

  private async actorId(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
    return p?.userId ? { actorId: p.userId } : {};
  }

  private async auditar(
    action: string,
    grupoId: string,
    profileId: string | null,
    ip?: string,
    extra: Record<string, string> = {},
  ): Promise<void> {
    void this.audit.log({
      ...(profileId ? await this.actorId(profileId) : {}),
      action,
      resource: `group:${grupoId}`,
      ...(ip ? { ip } : {}),
      metadata: { grupoId, ...extra },
    });
  }

  /**
   * Grupo de trabajo que quien llama puede leer. Primero `requireReader` (403 para quien no lee,
   * exista o no el grupo); un id legible que no es de trabajo también es 403, como en el detalle.
   */
  private async grupoDeTrabajoLegible(id: string, profileId: string): Promise<GrupoFila & { parentGroupId: string }> {
    await this.access.requireReader(id, profileId);
    const g = (await this.prisma.group.findUnique({ where: { id } })) as GrupoFila | null;
    if (!g || g.type !== 'trabajo' || !g.parentGroupId) throw new ForbiddenException(NO_ES_TRABAJO);
    return g as GrupoFila & { parentGroupId: string };
  }

  private item(g: GrupoFila, miembros: number, minimo: number, soyMiembro: boolean): GrupoTrabajoItem {
    return grupoTrabajoItem(g, miembros, minimo, soyMiembro);
  }

  /** Personas para activarse: las de una bifurcación o las de un subgrupo (reglas del ámbito). */
  private minimoDe(trabajoTipo: string | null, ambitoId: string): Promise<number> {
    return this.rules.getInt(claveMinimo(trabajoTipo), ambitoId);
  }

  // ─── Lecturas ─────────────────────────────────────────────────────────────

  async list(profileId: string): Promise<GruposAmbitoResponse> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { profileId, group: { type: { not: 'trabajo' } } },
      include: { group: true },
    });
    const ambitos = memberships
      .map((m) => {
        const t = tipoDeAmbito({ type: m.group.type as string, slug: m.group.slug });
        return t ? { id: m.group.id, name: m.group.name, ...t } : null;
      })
      .filter((a): a is { id: string; name: string; tipo: AmbitoTipo; rango: number } => a !== null)
      .sort((a, b) => a.rango - b.rango || a.name.localeCompare(b.name, 'es'));
    if (ambitos.length === 0) return { ambitos: [] };

    const grupos = (await this.prisma.group.findMany({
      where: { type: 'trabajo', parentGroupId: { in: ambitos.map((a) => a.id) }, trabajoEstado: { not: 'archivado' } },
      include: { _count: { select: { memberships: true } } },
      orderBy: { createdAt: 'asc' },
    })) as (GrupoFila & { _count: { memberships: number } })[];
    const mias = grupos.length
      ? await this.prisma.groupMembership.findMany({
          where: { profileId, groupId: { in: grupos.map((g) => g.id) } },
          select: { groupId: true },
        })
      : [];
    const soy = new Set(mias.map((m) => m.groupId));

    const result: GruposAmbitoResponse['ambitos'] = [];
    for (const a of ambitos) {
      const propios = grupos.filter((g) => g.parentGroupId === a.id);
      const minimos = new Map<string, number>();
      for (const clave of new Set(propios.map((g) => claveMinimo(g.trabajoTipo)))) {
        minimos.set(clave, await this.rules.getInt(clave, a.id));
      }
      result.push({
        id: a.id,
        name: a.name,
        tipo: a.tipo,
        // Una bifurcación se ve como «Iniciativa de un grupo» con cuántos son, nunca quiénes.
        grupos: propios.map((g) =>
          this.item(g, g._count.memberships, minimos.get(claveMinimo(g.trabajoTipo)) ?? 0, soy.has(g.id)),
        ),
      });
    }
    return { ambitos: result };
  }

  async detail(profileId: string, id: string): Promise<GrupoTrabajoDetail> {
    await this.access.requireReader(id, profileId);
    return this.construirDetalle(profileId, id, true);
  }

  /** `completo = false` para quien acaba de salir y ya no lee el grupo: sin nombres ni foro. */
  private async construirDetalle(profileId: string, id: string, completo: boolean): Promise<GrupoTrabajoDetail> {
    const g = (await this.prisma.group.findUnique({ where: { id }, include: { parent: true } })) as
      | (GrupoFila & { parent: { id: string; name: string; type: string; slug: string } | null })
      | null;
    if (!g || g.type !== 'trabajo' || !g.parent) throw new NotFoundException(NO_EXISTE);
    const ambito = tipoDeAmbito({ type: g.parent.type as string, slug: g.parent.slug });
    const [miembros, minimo, soyMiembro, enAmbito] = await Promise.all([
      this.prisma.groupMembership.count({ where: { groupId: id } }),
      this.minimoDe(g.trabajoTipo, g.parent.id),
      this.access.isParticipant(id, profileId),
      this.access.isParticipant(g.parent.id, profileId),
    ]);
    let miembrosNombres: string[] = [];
    let forumId: string | null = null;
    if (completo) {
      if (g.trabajoTipo !== 'bifurcacion') {
        const filas = await this.prisma.groupMembership.findMany({
          where: { groupId: id },
          select: { profile: { select: { displayName: true } } },
        });
        miembrosNombres = filas.map((f) => f.profile.displayName).sort((a, b) => a.localeCompare(b, 'es'));
      }
      const foro = await this.prisma.forum.findFirst({ where: { groupId: id, isDefault: true }, select: { id: true } });
      forumId = foro?.id ?? null;
    }
    const estado = g.trabajoEstado;
    const esComision = g.trabajoTipo === 'comision';
    const comision = esComision ? await this.comisiones.vista(g as unknown as ComisionFila, profileId, completo) : null;
    const esBifurcacion = g.trabajoTipo === 'bifurcacion';
    const bifurcacion = esBifurcacion
      ? await this.bifurcaciones.vista(g as unknown as BifurcacionFila, profileId, soyMiembro, enAmbito)
      : null;
    // A una comisión no se entra: sus miembros son los voluntarios que resultaron seleccionados.
    // A una bifurcación solo entra quien apoyó su solución.
    let puedoEntrar = !esComision && enAmbito && !soyMiembro && (estado === 'convocando' || estado === 'activo');
    if (puedoEntrar && esBifurcacion) puedoEntrar = await this.bifurcaciones.elegible(g, profileId);
    return {
      ...this.item(g, miembros, minimo, soyMiembro),
      ambito: { id: g.parent.id, name: g.parent.name, tipo: ambito?.tipo ?? 'general' },
      // Nunca los nombres de quienes forman una bifurcación.
      miembrosNombres: esBifurcacion ? [] : miembrosNombres,
      forumId,
      puedoEntrar,
      puedoSalir: soyMiembro,
      comision,
      bifurcacion,
    };
  }

  // ─── Proponer, entrar y salir ─────────────────────────────────────────────

  async proponer(
    profileId: string,
    dto: { ambitoId: string; name: string; proposito: string },
    ip: string,
    now: Date = new Date(),
  ): Promise<{ id: string }> {
    const ambito = await this.prisma.group.findUnique({ where: { id: dto.ambitoId } });
    if (!ambito) throw new NotFoundException('Comunidad no encontrada.');
    if (!tipoDeAmbito({ type: ambito.type as string, slug: ambito.slug })) throw new BadRequestException(NO_AMBITO);
    if (!(await this.access.isParticipant(ambito.id, profileId))) throw new ForbiddenException(NO_MIEMBRO_AMBITO);

    const plazo = await this.rules.getInt('subgrupo.plazo_dias', ambito.id);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.group.create({
        data: {
          id,
          name: dto.name,
          slug: `trabajo-${id}`,
          type: 'trabajo',
          parentGroupId: ambito.id,
          trabajoTipo: 'subgrupo',
          trabajoEstado: 'convocando',
          proposito: dto.proposito,
          convocatoriaEndsAt: new Date(now.getTime() + plazo * DIA_MS),
          creadoPorProfileId: profileId,
        },
      });
      await tx.groupMembership.create({ data: { groupId: id, profileId } });
    });
    await this.auditar('grupo.proposed', id, profileId, ip);
    return { id };
  }

  private async bloquear(tx: Tx, id: string): Promise<GrupoFila> {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM groups WHERE id = ${id}::uuid FOR UPDATE`);
    const g = (await tx.group.findUnique({ where: { id } })) as GrupoFila | null;
    if (!g) throw new NotFoundException(NO_EXISTE);
    return g;
  }

  /**
   * Grupo al que se quiere entrar. Una bifurcación no la lee el ámbito (R4): para ella, en lugar de
   * poder leerla, se exige ser elegible, con el mismo 403 para quien votó otra cosa o no votó.
   */
  private async grupoParaEntrar(id: string, profileId: string): Promise<GrupoFila & { parentGroupId: string }> {
    let g: GrupoFila & { parentGroupId: string };
    try {
      g = await this.grupoDeTrabajoLegible(id, profileId);
    } catch (err) {
      if (!(err instanceof ForbiddenException)) throw err;
      const b = (await this.prisma.group.findUnique({ where: { id } })) as GrupoFila | null;
      if (!b || b.type !== 'trabajo' || b.trabajoTipo !== 'bifurcacion' || !b.parentGroupId) throw err;
      g = b as GrupoFila & { parentGroupId: string };
    }
    if (g.trabajoTipo === 'bifurcacion' && !(await this.bifurcaciones.elegible(g, profileId))) {
      throw new ForbiddenException(NO_ELEGIBLE);
    }
    return g;
  }

  async entrar(profileId: string, id: string, ip: string, now: Date = new Date()): Promise<GrupoTrabajoDetail> {
    const g = await this.grupoParaEntrar(id, profileId);
    if (g.trabajoTipo === 'comision') throw new BadRequestException(COMISION_SIN_ENTRAR);
    if (!(await this.access.isParticipant(g.parentGroupId, profileId))) throw new ForbiddenException(NO_MIEMBRO_AMBITO);
    const esBifurcacion = g.trabajoTipo === 'bifurcacion';
    const minimo = await this.minimoDe(g.trabajoTipo, g.parentGroupId);

    const { entro, activado } = await this.prisma.$transaction(async (tx) => {
      // Con la fila bloqueada, dos que entran a la vez se cuentan uno tras otro.
      const actual = await this.bloquear(tx, id);
      if (actual.trabajoEstado !== 'convocando' && actual.trabajoEstado !== 'activo') throw new ConflictException(NO_ADMITE);
      // Vencida pero aún sin archivar (el proceso de plazos corre cada cierto tiempo): ya no se entra.
      if (actual.trabajoEstado === 'convocando' && actual.convocatoriaEndsAt && actual.convocatoriaEndsAt.getTime() <= now.getTime()) {
        throw new ConflictException(CONVOCATORIA_VENCIDA);
      }
      const ya = await tx.groupMembership.findUnique({ where: { groupId_profileId: { groupId: id, profileId } } });
      await tx.groupMembership.upsert({
        where: { groupId_profileId: { groupId: id, profileId } },
        create: { groupId: id, profileId },
        update: {},
      });
      const miembros = await tx.groupMembership.count({ where: { groupId: id } });
      let activado = false;
      if (actual.trabajoEstado === 'convocando' && miembros >= minimo) {
        const res = await tx.group.updateMany({
          where: { id, trabajoEstado: 'convocando' },
          data: { trabajoEstado: 'activo', convocatoriaEndsAt: null },
        });
        if (res.count === 1) {
          // Solo la transacción que hizo el cambio crea el foro, y solo si no existe ya uno por defecto.
          const foro = await tx.forum.findFirst({ where: { groupId: id, isDefault: true }, select: { id: true } });
          if (!foro) await tx.forum.create({ data: { groupId: id, title: actual.name, isDefault: true } });
          activado = true;
        }
      } else if (actual.trabajoEstado === 'activo' && actual.pocosMiembrosDesde && miembros >= MINIMO_ACTIVO) {
        await tx.group.updateMany({ where: { id, trabajoEstado: 'activo' }, data: { pocosMiembrosDesde: null } });
      }
      return { entro: !ya, activado };
    });

    // Sumarse a una bifurcación no se audita: delataría el voto.
    if (entro && !esBifurcacion) await this.auditar('grupo.joined', id, profileId, ip);
    if (activado) await this.auditar(esBifurcacion ? 'bifurcacion.activated' : 'grupo.activated', id, null);
    return this.detail(profileId, id);
  }

  async salir(profileId: string, id: string, ip: string, now: Date = new Date()): Promise<GrupoTrabajoDetail> {
    // Quien no es del subgrupo ni de su ámbito no sabe ni si existe: 403 antes de tocar nada.
    const g = await this.grupoDeTrabajoLegible(id, profileId);
    const { salio, archivado } = await this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquear(tx, id);
      const res = await tx.groupMembership.deleteMany({ where: { groupId: id, profileId } });
      // Una comisión sigue su propio ciclo (ComisionesService): salir no la archiva ni la marca con pocos miembros.
      if (actual.trabajoTipo === 'comision') return { salio: res.count > 0, archivado: false };
      const miembros = await tx.groupMembership.count({ where: { groupId: id } });
      let archivado = false;
      if (actual.trabajoEstado === 'activo' && miembros < MINIMO_ACTIVO && !actual.pocosMiembrosDesde) {
        await tx.group.updateMany({
          where: { id, trabajoEstado: 'activo', pocosMiembrosDesde: null },
          data: { pocosMiembrosDesde: now },
        });
      } else if (actual.trabajoEstado === 'convocando' && miembros === 0) {
        archivado = await this.archivarTx(tx, id, { id, trabajoEstado: 'convocando' }, now);
      }
      return { salio: res.count > 0, archivado };
    });

    // Salir de una bifurcación tampoco se audita.
    if (salio && g.trabajoTipo !== 'bifurcacion') await this.auditar('grupo.left', id, profileId, ip);
    if (archivado) await this.auditar('grupo.archived', id, null);
    // Quien ya no lee el grupo (se mudó de comunidad) recibe el detalle sin nombres ni foro.
    const lee = await this.access.canRead(id, profileId);
    return this.construirDetalle(profileId, id, lee);
  }

  // ─── Llevar a la comunidad ────────────────────────────────────────────────

  /**
   * Lleva al ámbito una solución ganadora de una decisión contada y aprobada de un tema del subgrupo.
   * Nace como una inquietud `en_plazo`: aparece en la agenda y, si nadie responde, la comunidad la abre
   * como debate al vencer el plazo. `origenSolucionId` es único: una solución se lleva una sola vez.
   */
  async llevar(
    profileId: string,
    id: string,
    solucionId: string,
    ip: string,
    now: Date = new Date(),
  ): Promise<{ inquietudId: string }> {
    // Quien no lee el subgrupo recibe 403 sin saber si existe; quien solo lee, 403 al participar.
    const g = await this.grupoDeTrabajoLegible(id, profileId);
    // Solo la membresía: el estado se comprueba aquí abajo con su propio mensaje.
    await this.access.requireMember(id, profileId);
    if (!(await this.access.isParticipant(g.parentGroupId, profileId))) {
      throw new ForbiddenException(NO_MIEMBRO_PARA_LLEVAR);
    }
    if (g.trabajoEstado !== 'activo') throw new ConflictException(NO_ACTIVO);

    const s = await this.prisma.solucion.findUnique({
      where: { id: solucionId },
      select: {
        id: true,
        title: true,
        description: true,
        hidden: true,
        proposal: { select: { groupId: true, hidden: true, decision: { select: { fase: true, resultado: true, ganadoras: true } } } },
      },
    });
    const esBifurcacion = g.trabajoTipo === 'bifurcacion';
    // Una bifurcación vuelve a la colmena con su solución de origen (una vez, por el índice único).
    const deOrigen = esBifurcacion && Boolean(g.origenSolucionId) && solucionId === g.origenSolucionId;
    if (deOrigen) {
      if (!s || s.proposal.groupId !== g.parentGroupId) throw new BadRequestException(NO_ORIGEN);
      if (s.hidden) throw new BadRequestException(OCULTA);
      if (s.proposal.hidden) throw new BadRequestException(TEMA_OCULTO);
    } else {
      if (!s || s.proposal.groupId !== id) throw new BadRequestException(NO_GANADORA);
      if (s.hidden) throw new BadRequestException(OCULTA);
      if (s.proposal.hidden) throw new BadRequestException(TEMA_OCULTO);
      const d = s.proposal.decision;
      if (!d || d.fase !== 'contada' || d.resultado !== 'aprobada' || !d.ganadoras.includes(s.id)) {
        throw new BadRequestException(NO_GANADORA);
      }
    }

    const dias = await this.rules.getInt('inquietud.plazo_respuesta_dias', g.parentGroupId);
    // El nombre de una bifurcación ya es «Iniciativa de un grupo»: nada identifica a sus miembros.
    const encabezado = esBifurcacion ? 'Propuesta de una iniciativa de un grupo.' : `Propuesta del grupo de trabajo ${g.name}.`;
    const body = `${encabezado}\n\n${s.description}`.slice(0, CUERPO_MAX);
    let inquietudId: string;
    try {
      const creada = await this.prisma.$transaction((tx) =>
        tx.inquietud.create({
          data: {
            groupId: g.parentGroupId,
            authorProfileId: profileId,
            title: s.title,
            body,
            status: 'en_plazo',
            thresholdReachedAt: now,
            deadlineAt: new Date(now.getTime() + dias * DIA_MS),
            origenSolucionId: s.id,
          },
          select: { id: true },
        }),
      );
      inquietudId = creada.id;
    } catch (err) {
      // Fuera de la transacción: dos que la llevan a la vez chocan en el índice único.
      if (esDuplicado(err)) throw new ConflictException(YA_LLEVADA);
      throw err;
    }
    if (esBifurcacion) {
      // Sin actor, ip ni inquietud: quien la lleva es miembro y su nombre delataría su voto.
      await this.auditar('bifurcacion.carried_back', id, null);
    } else {
      await this.auditar('grupo.propuesta_llevada', id, profileId, ip, { inquietudId });
    }
    return { inquietudId };
  }

  // ─── Archivar ─────────────────────────────────────────────────────────────

  /**
   * Archiva con un `updateMany` condicionado; solo si cambió una fila cierra sus temas abiertos
   * (sin conclusión) y cancela sus decisiones activas, en la misma transacción.
   */
  private async archivarTx(tx: Tx, id: string, where: Prisma.GroupWhereInput, now: Date): Promise<boolean> {
    const res = await tx.group.updateMany({ where, data: { trabajoEstado: 'archivado' } });
    if (res.count !== 1) return false;
    await tx.decision.updateMany({
      where: { proposal: { groupId: id }, fase: { in: [...FASES_ACTIVAS] } },
      data: { fase: 'cancelada' },
    });
    await tx.proposal.updateMany({ where: { groupId: id, status: 'open' }, data: { status: 'closed', closedAt: now } });
    return true;
  }

  /**
   * Archiva las convocatorias vencidas y los activos con pocos miembros durante 30 días.
   * Las comisiones quedan fuera: sus plazos los revisa `ComisionesService.processDeadlines`.
   */
  async processDeadlines(now: Date): Promise<number> {
    const limite = new Date(now.getTime() - DIAS_CON_POCOS * DIA_MS);
    const vencidos = await this.prisma.group.findMany({
      where: { type: 'trabajo', trabajoTipo: { not: 'comision' }, trabajoEstado: 'convocando', convocatoriaEndsAt: { lte: now } },
      select: { id: true },
    });
    const conPocos = await this.prisma.group.findMany({
      where: { type: 'trabajo', trabajoTipo: { not: 'comision' }, trabajoEstado: 'activo', pocosMiembrosDesde: { lte: limite } },
      select: { id: true },
    });
    const casos: { id: string; where: Prisma.GroupWhereInput }[] = [
      ...vencidos.map((g) => ({ id: g.id, where: { id: g.id, trabajoEstado: 'convocando' as const, convocatoriaEndsAt: { lte: now } } })),
      ...conPocos.map((g) => ({ id: g.id, where: { id: g.id, trabajoEstado: 'activo' as const, pocosMiembrosDesde: { lte: limite } } })),
    ];
    // Los activos que quedaron con menos de 3 sin pasar por `salir` (p. ej., por una suspensión)
    // empiezan aquí a contar sus 30 días.
    const sinMarca = await this.prisma.group.findMany({
      where: { type: 'trabajo', trabajoTipo: { not: 'comision' }, trabajoEstado: 'activo', pocosMiembrosDesde: null },
      select: { id: true, _count: { select: { memberships: true } } },
    });
    for (const g of sinMarca) {
      if (g._count.memberships >= MINIMO_ACTIVO) continue;
      await this.prisma.group.updateMany({
        where: { id: g.id, trabajoEstado: 'activo', pocosMiembrosDesde: null },
        data: { pocosMiembrosDesde: now },
      });
    }
    let archivados = 0;
    for (const c of casos) {
      try {
        const ok = await this.prisma.$transaction((tx) => this.archivarTx(tx, c.id, c.where, now));
        if (!ok) continue;
        archivados += 1;
        await this.auditar('grupo.archived', c.id, null);
      } catch (err) {
        this.logger.error(`No se pudo archivar el grupo ${c.id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return archivados;
  }
}
