import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { ComisionView } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ForumsService } from '../forums/forums.service';
import {
  ALGORITHM_VERSION,
  generateSeed,
  selectMembers,
  sortPool,
  verifySelection,
} from '../sortition/sortition-algorithm';
import { participantesDelDebate } from '../decisiones/participantes-del-debate';
import { elegirPuestos } from './elegir-puestos';
import type { GrupoFila } from './grupo-item';

const DIA_MS = 86_400_000;
/** R2: si faltan voluntarios, la convocatoria se amplía estos días, una sola vez. */
const DIAS_AMPLIACION = 7;
const NOMBRE_MAX = 80;
const TAREA_INICIAL_MAX = 1000;
const EXPERIENCIA_MAX = 500;
const INFORME_MIN = 20;
const INFORME_MAX = 2000;
const INFORME_FINAL_MAX = 5000;

const NO_ES_TRABAJO = 'Esto no es un grupo de trabajo.';
const NO_ES_COMISION = 'Esto no es una comisión.';
const NO_MIEMBRO_AMBITO = 'Solo los miembros actuales de la comunidad pueden participar en su comisión.';
const NO_ORGANIZA = 'Solo quien organiza la comunidad puede ajustar la comisión.';
const NO_CONVOCA = 'La convocatoria de esta comisión está cerrada.';
const NO_ELIGE = 'La elección de esta comisión no está abierta.';
const NO_VOLUNTARIO = 'Solo se puede ordenar a quienes se ofrecieron como voluntarios.';
const REPETIDO = 'Cada voluntario puede aparecer una sola vez en el orden.';
const NO_ACTIVA = 'Los informes solo se publican mientras la comisión está activa.';
const NO_ATRASADA = 'Solo se puede apoyar la renovación de una comisión atrasada.';

type Tx = Prisma.TransactionClient;
type Forma = 'sorteo' | 'preferencias';

/** Campos de una comisión que usa este servicio. */
export interface ComisionFila extends GrupoFila {
  origenSolucionId: string | null;
  origenGrupoId: string | null;
  tarea: string | null;
  puestos: number | null;
  forma: string | null;
  ampliada: boolean;
  eleccionEndsAt: Date | null;
  seleccionSemilla: string | null;
  seleccionPool: Prisma.JsonValue | null;
  seleccionAlgoritmo: string | null;
  eleccionResultado: Prisma.JsonValue | null;
  proximoInformeAt: Date | null;
}

const esDuplicado = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const nombreError = (err: unknown): string => (err instanceof Error ? err.name : 'error');

const formaDe = (v: string | null): Forma => (v === 'preferencias' ? 'preferencias' : 'sorteo');

const listaDeTexto = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;

/**
 * Atraso: la comisión faltó a dos informes, es decir, `now > proximoInformeAt + informe_cada_dias`.
 * Sin fecha del próximo informe (no activada) nunca está atrasada.
 */
export function estaAtrasada(proximoInformeAt: Date | null, dias: number, now: Date): boolean {
  return proximoInformeAt !== null && now.getTime() > proximoInformeAt.getTime() + dias * DIA_MS;
}

/** Voluntarios (o papeletas) de quienes siguen siendo miembros del ámbito. */
const delAmbito = (grupoId: string, ambitoId: string) => ({
  grupoId,
  profile: { memberships: { some: { groupId: ambitoId } } },
});

/**
 * Comisiones (3A-4b): nacen solas de cada solución aprobada (R1), reúnen voluntarios del ámbito
 * y se forman por sorteo verificable o por elección con preferencias (Schulze repetido).
 */
@Injectable()
export class ComisionesService {
  private readonly logger = new Logger(ComisionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GroupAccessService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
    private readonly forums: ForumsService,
  ) {}

  private async auditar(
    action: string,
    grupoId: string,
    profileId: string | null,
    ip?: string,
    extra: Record<string, string> = {},
  ): Promise<void> {
    // La comisión de una bifurcación es reservada: ni actor ni ip (delatarían quiénes la forman).
    const reservado = await this.access.esReservado(grupoId);
    let actor: { actorId: string } | Record<never, never> = {};
    if (profileId && !reservado) {
      const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
      if (p?.userId) actor = { actorId: p.userId };
    }
    void this.audit.log({
      ...actor,
      action,
      resource: `group:${grupoId}`,
      ...(ip && !reservado ? { ip } : {}),
      metadata: { grupoId, ...extra },
    });
  }

  /** Comunidad cuyas reglas valen para la comisión: el ámbito, o el ámbito de la bifurcación. */
  private async comunidadDe(ambitoId: string): Promise<string> {
    const a = await this.prisma.group.findUnique({ where: { id: ambitoId }, select: { type: true, parentGroupId: true } });
    return (a?.type as string | undefined) === 'trabajo' && a?.parentGroupId ? a.parentGroupId : ambitoId;
  }

  /** Comisión legible por quien llama: 403 si no lee (exista o no), 400 si es otro tipo de grupo. */
  private async comisionLegible(id: string, profileId: string): Promise<ComisionFila & { parentGroupId: string }> {
    await this.access.requireReader(id, profileId);
    const g = (await this.prisma.group.findUnique({ where: { id } })) as ComisionFila | null;
    if (!g || g.type !== 'trabajo' || !g.parentGroupId) throw new ForbiddenException(NO_ES_TRABAJO);
    if (g.trabajoTipo !== 'comision') throw new BadRequestException(NO_ES_COMISION);
    return g as ComisionFila & { parentGroupId: string };
  }

  private async exigirAmbito(g: { parentGroupId: string }, profileId: string): Promise<void> {
    if (!(await this.access.isParticipant(g.parentGroupId, profileId))) throw new ForbiddenException(NO_MIEMBRO_AMBITO);
  }

  private async bloquear(tx: Tx, id: string): Promise<ComisionFila> {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM groups WHERE id = ${id}::uuid FOR UPDATE`);
    const g = (await tx.group.findUnique({ where: { id } })) as ComisionFila | null;
    if (!g) throw new ConflictException(NO_CONVOCA);
    return g;
  }

  private exigirConvocando(g: ComisionFila, now: Date): void {
    if (g.trabajoEstado !== 'convocando' || !g.convocatoriaEndsAt || g.convocatoriaEndsAt.getTime() <= now.getTime()) {
      throw new ConflictException(NO_CONVOCA);
    }
  }

  // ─── Voluntarios ──────────────────────────────────────────────────────────

  async ofrecerse(profileId: string, id: string, experiencia: string | undefined, ip: string, now: Date = new Date()): Promise<void> {
    const g = await this.comisionLegible(id, profileId);
    // En la comisión de una bifurcación, el ámbito es la bifurcación: solo se ofrecen sus miembros.
    await this.exigirAmbito(g, profileId);
    const texto = (experiencia ?? '').trim().slice(0, EXPERIENCIA_MAX);
    await this.prisma.$transaction(async (tx) => {
      this.exigirConvocando(await this.bloquear(tx, id), now);
      await tx.comisionVoluntario.upsert({
        where: { grupoId_profileId: { grupoId: id, profileId } },
        create: { grupoId: id, profileId, experiencia: texto },
        update: { experiencia: texto },
      });
    });
    // Ofrecerse es público dentro del ámbito: se audita, sin el texto.
    await this.auditar('comision.volunteered', id, profileId, ip);
  }

  async retirarse(profileId: string, id: string, ip: string, now: Date = new Date()): Promise<void> {
    await this.comisionLegible(id, profileId);
    const quitado = await this.prisma.$transaction(async (tx) => {
      this.exigirConvocando(await this.bloquear(tx, id), now);
      const res = await tx.comisionVoluntario.deleteMany({ where: { grupoId: id, profileId } });
      return res.count > 0;
    });
    if (quitado) await this.auditar('comision.withdrew', id, profileId, ip);
  }

  // ─── Ajuste por quien organiza ────────────────────────────────────────────

  async ajustar(profileId: string, id: string, dto: { tarea?: string; puestos?: number }, now: Date = new Date()): Promise<void> {
    void now;
    const g = await this.comisionLegible(id, profileId);
    const organiza = await this.forums.canOrganize(profileId, g.parentGroupId);
    if (!organiza || !(await this.access.isParticipant(g.parentGroupId, profileId))) throw new ForbiddenException(NO_ORGANIZA);
    if (g.trabajoEstado !== 'convocando') throw new ConflictException(NO_CONVOCA);

    const data: { tarea?: string; puestos?: number } = {};
    if (dto.tarea !== undefined) data.tarea = dto.tarea.trim();
    if (dto.puestos !== undefined) {
      const comunidad = await this.comunidadDe(g.parentGroupId);
      const [min, max] = await Promise.all([
        this.rules.getInt('comision.puestos_min', comunidad),
        this.rules.getInt('comision.puestos_max', comunidad),
      ]);
      if (!Number.isInteger(dto.puestos) || dto.puestos < min || dto.puestos > max) {
        throw new BadRequestException(`Los puestos deben estar entre ${min} y ${max}.`);
      }
      data.puestos = dto.puestos;
    }
    if (Object.keys(data).length === 0) return;
    const res = await this.prisma.group.updateMany({
      where: { id, trabajoTipo: 'comision', trabajoEstado: 'convocando' },
      data,
    });
    if (res.count !== 1) throw new ConflictException(NO_CONVOCA);
  }

  // ─── Elección por preferencias ────────────────────────────────────────────

  async votar(profileId: string, id: string, orden: string[], now: Date = new Date()): Promise<void> {
    const g = await this.comisionLegible(id, profileId);
    await this.exigirAmbito(g, profileId);
    if (new Set(orden).size !== orden.length) throw new BadRequestException(REPETIDO);
    await this.prisma.$transaction(async (tx) => {
      // Con la fila bloqueada: el cierre de la elección no cuenta a medias una papeleta en curso.
      const actual = await this.bloquear(tx, id);
      if (actual.trabajoEstado !== 'eligiendo' || !actual.eleccionEndsAt || actual.eleccionEndsAt.getTime() <= now.getTime()) {
        throw new ConflictException(NO_ELIGE);
      }
      const voluntarios = new Set(
        (await tx.comisionVoluntario.findMany({ where: { grupoId: id }, select: { profileId: true } })).map((v) => v.profileId),
      );
      if (!orden.every((p) => voluntarios.has(p))) throw new BadRequestException(NO_VOLUNTARIO);
      await tx.comisionPapeleta.upsert({
        where: { grupoId_profileId: { grupoId: id, profileId } },
        create: { grupoId: id, profileId, orden },
        update: { orden },
      });
    });
  }

  // ─── Informes ─────────────────────────────────────────────────────────────

  /**
   * Un miembro de una comisión `activa` publica un informe (20 a 2000) o el final (20 a 5000).
   * Con la fila bloqueada: un informe normal recalcula `proximoInformeAt`; el final cierra la
   * comisión con un `updateMany` condicionado a `activo` (si otra escritura la cerró, 409).
   */
  async publicarInforme(
    profileId: string,
    id: string,
    texto: string,
    final: boolean,
    ip: string,
    now: Date = new Date(),
  ): Promise<void> {
    const g = await this.comisionLegible(id, profileId);
    // Miembro de la comisión y comisión activa (403 / 409).
    await this.access.requireParticipant(id, profileId);
    const limpio = texto.trim();
    const max = final ? INFORME_FINAL_MAX : INFORME_MAX;
    if (limpio.length < INFORME_MIN || limpio.length > max) {
      throw new BadRequestException(
        final
          ? `El informe final necesita entre ${INFORME_MIN} y ${INFORME_FINAL_MAX} caracteres.`
          : `El informe necesita entre ${INFORME_MIN} y ${INFORME_MAX} caracteres.`,
      );
    }
    const dias = await this.rules.getInt('comision.informe_cada_dias', await this.comunidadDe(g.parentGroupId));
    await this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquear(tx, id);
      if (actual.trabajoEstado !== 'activo') throw new ConflictException(NO_ACTIVA);
      await tx.comisionInforme.create({ data: { grupoId: id, autorProfileId: profileId, texto: limpio, final } });
      const res = await tx.group.updateMany({
        where: { id, trabajoEstado: 'activo' },
        data: final ? { trabajoEstado: 'cerrado' } : { proximoInformeAt: new Date(now.getTime() + dias * DIA_MS) },
      });
      if (res.count !== 1) throw new ConflictException(NO_ACTIVA);
    });
    await this.auditar('comision.report_published', id, profileId, ip);
    if (final) await this.auditar('comision.closed', id, profileId, ip);
  }

  // ─── Renovación ───────────────────────────────────────────────────────────

  /**
   * Umbral de renovación: `ceil(debate.fraccion_objecion_modo × P / 100)`, mínimo 1, con P =
   * participantes del debate original que siguen siendo miembros del ámbito.
   */
  private async umbralRenovacion(g: ComisionFila & { parentGroupId: string }, comunidad: string): Promise<number> {
    const [solucion, f] = await Promise.all([
      g.origenSolucionId
        ? this.prisma.solucion.findUnique({ where: { id: g.origenSolucionId }, select: { proposalId: true } })
        : Promise.resolve(null),
      this.rules.getInt('debate.fraccion_objecion_modo', comunidad),
    ]);
    const P = solucion ? (await participantesDelDebate(this.prisma, solucion.proposalId, g.parentGroupId)).size : 0;
    return Math.max(1, Math.ceil((f * P) / 100));
  }

  /**
   * Un miembro actual del ámbito apoya renovar una comisión atrasada (un apoyo por persona).
   * Con la fila bloqueada se cuentan los apoyos de miembros actuales; si llegan al umbral, la
   * comisión pasa a `cerrado` (updateMany condicionado) y nace otra para la misma solución.
   */
  async apoyarRenovacion(profileId: string, id: string, ip: string, now: Date = new Date()): Promise<void> {
    const g = await this.comisionLegible(id, profileId);
    await this.exigirAmbito(g, profileId);
    const comunidad = await this.comunidadDe(g.parentGroupId);
    const dias = await this.rules.getInt('comision.informe_cada_dias', comunidad);
    if (g.trabajoEstado !== 'activo' || !estaAtrasada(g.proximoInformeAt, dias, now)) throw new ConflictException(NO_ATRASADA);
    const [umbral, datos] = await Promise.all([this.umbralRenovacion(g, comunidad), this.datosNuevaComision(comunidad, now)]);

    const r = await this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquear(tx, id);
      if (actual.trabajoEstado !== 'activo' || !estaAtrasada(actual.proximoInformeAt, dias, now)) {
        throw new ConflictException(NO_ATRASADA);
      }
      const nuevo = await tx.comisionRenovacionApoyo.createMany({ data: [{ grupoId: id, profileId }], skipDuplicates: true });
      const apoyoNuevo = nuevo.count > 0;
      // Quien se mudó o fue suspendido no cuenta.
      const apoyos = await tx.comisionRenovacionApoyo.count({ where: delAmbito(id, g.parentGroupId) });
      const origenSolucionId = actual.origenSolucionId;
      if (apoyos < umbral || !origenSolucionId) return { apoyoNuevo, nuevaId: null };
      const res = await tx.group.updateMany({ where: { id, trabajoEstado: 'activo' }, data: { trabajoEstado: 'cerrado' } });
      if (res.count !== 1) return { apoyoNuevo, nuevaId: null };
      const nuevaId = await this.crearComisionTx(tx, {
        ...datos,
        nombre: actual.name,
        tarea: actual.tarea ?? actual.proposito ?? '',
        ambitoId: g.parentGroupId,
        origenSolucionId,
        origenGrupoId: actual.origenGrupoId ?? null,
      });
      return { apoyoNuevo, nuevaId };
    });
    if (r.apoyoNuevo) await this.auditar('comision.renewal_supported', id, profileId, ip);
    if (r.nuevaId) {
      await this.auditar('comision.renewed', id, null);
      await this.auditar('comision.created', r.nuevaId, null);
    }
  }

  /** Retira el apoyo propio a la renovación. */
  async retirarApoyoRenovacion(profileId: string, id: string): Promise<void> {
    await this.comisionLegible(id, profileId);
    await this.prisma.comisionRenovacionApoyo.deleteMany({ where: { grupoId: id, profileId } });
  }

  // ─── Vista y verificación ─────────────────────────────────────────────────

  /** `completo = false` para quien ya no lee la comisión: sin nombres de voluntarios ni informes. */
  async vista(g: ComisionFila, profileId: string, completo: boolean, now: Date = new Date()): Promise<ComisionView> {
    const ambitoId = g.parentGroupId ?? '';
    const activa = g.trabajoEstado === 'activo';
    const [enAmbito, organiza, filas, mia, solucion, informes, miembro, apoyo, dias] = await Promise.all([
      this.access.isParticipant(ambitoId, profileId),
      g.trabajoEstado === 'convocando' ? this.forums.canOrganize(profileId, ambitoId) : Promise.resolve(false),
      completo
        ? this.prisma.comisionVoluntario.findMany({
            where: delAmbito(g.id, ambitoId),
            select: { profileId: true, experiencia: true, profile: { select: { displayName: true } } },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      // Solo la papeleta propia; la de nadie más se lee para mostrarla.
      this.prisma.comisionPapeleta.findUnique({
        where: { grupoId_profileId: { grupoId: g.id, profileId } },
        select: { orden: true },
      }),
      g.origenSolucionId
        ? this.prisma.solucion.findUnique({ where: { id: g.origenSolucionId }, select: { title: true, proposalId: true } })
        : Promise.resolve(null),
      completo
        ? this.prisma.comisionInforme.findMany({
            where: { grupoId: g.id },
            select: { id: true, texto: true, final: true, hidden: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      activa ? this.access.isParticipant(g.id, profileId) : Promise.resolve(false),
      activa
        ? this.prisma.comisionRenovacionApoyo.findUnique({
            where: { grupoId_profileId: { grupoId: g.id, profileId } },
            select: { id: true },
          })
        : Promise.resolve(null),
      activa ? this.comunidadDe(ambitoId).then((c) => this.rules.getInt('comision.informe_cada_dias', c)) : Promise.resolve(0),
    ]);
    const atrasada = activa && estaAtrasada(g.proximoInformeAt, dias, now);
    const yoApoyoRenovar = apoyo !== null;
    const voluntarios = filas.map((f) => ({
      nombre: f.profile.displayName,
      experiencia: f.experiencia,
      soyYo: f.profileId === profileId,
    }));
    const pool = listaDeTexto(g.seleccionPool);
    return {
      tarea: g.tarea ?? '',
      puestos: g.puestos ?? 0,
      forma: formaDe(g.forma),
      voluntarios,
      yoVoluntario: voluntarios.some((v) => v.soyYo),
      ampliada: g.ampliada,
      seleccion:
        g.seleccionSemilla && pool
          ? { semilla: g.seleccionSemilla, pool, algoritmo: g.seleccionAlgoritmo ?? ALGORITHM_VERSION }
          : null,
      eleccionEndsAt: g.eleccionEndsAt ? g.eleccionEndsAt.toISOString() : null,
      miPapeleta: mia?.orden ?? null,
      // Un informe oculto por moderación sale sin texto.
      informes: informes.map((i) => ({
        id: i.id,
        texto: i.hidden ? '' : i.texto,
        final: i.final,
        createdAt: i.createdAt.toISOString(),
        oculto: i.hidden,
      })),
      proximoInformeAt: g.proximoInformeAt ? g.proximoInformeAt.toISOString() : null,
      atrasada,
      yoApoyoRenovar,
      puedoApoyarRenovar: atrasada && enAmbito && !yoApoyoRenovar,
      puedoAjustar: g.trabajoEstado === 'convocando' && enAmbito && organiza,
      puedoInformar: activa && miembro,
      origen: solucion ? { proposalId: solucion.proposalId, solucionTitulo: solucion.title } : null,
    };
  }

  /** Recalcula el sorteo con la semilla y el pool guardados y lo compara con los elegidos guardados. */
  async verificar(profileId: string, id: string): Promise<{ ok: boolean; elegidos: string[] }> {
    const g = await this.comisionLegible(id, profileId);
    const pool = listaDeTexto(g.seleccionPool);
    if (!g.seleccionSemilla || !pool || !g.puestos) return { ok: false, elegidos: [] };
    const r = g.eleccionResultado;
    const elegidos =
      r && typeof r === 'object' && !Array.isArray(r) ? (listaDeTexto((r as Record<string, unknown>)['elegidos']) ?? []) : [];
    return { ok: verifySelection(pool, g.puestos, g.seleccionSemilla, elegidos), elegidos };
  }

  // ─── Programador ──────────────────────────────────────────────────────────

  async processDeadlines(now: Date): Promise<number> {
    const creadas = await this.crearComisiones(now);
    const cerradas = await this.cerrarConvocatorias(now);
    const elegidas = await this.cerrarElecciones(now);
    return creadas + cerradas + elegidas;
  }

  /**
   * R1: una comisión por cada solución ganadora (no oculta, de un tema no oculto) de una decisión
   * contada y aprobada, si esa solución nunca tuvo comisión. Las de subgrupos nacen en su ámbito;
   * las decisiones dentro de comisiones o bifurcaciones no crean comisiones solas.
   */
  async crearComisiones(now: Date): Promise<number> {
    const decisiones = await this.prisma.decision.findMany({
      where: { fase: 'contada', resultado: 'aprobada', proposal: { hidden: false } },
      select: {
        ganadoras: true,
        proposal: {
          select: { groupId: true, hidden: true, group: { select: { type: true, parentGroupId: true, trabajoTipo: true } } },
        },
      },
    });
    const pendientes: { solucionId: string; ambitoId: string }[] = [];
    for (const d of decisiones) {
      if (d.proposal.hidden) continue;
      const grupo = d.proposal.group;
      let ambitoId: string | null = d.proposal.groupId;
      if ((grupo.type as string) === 'trabajo') {
        ambitoId = (grupo.trabajoTipo as string | null) === 'subgrupo' ? grupo.parentGroupId : null;
      }
      if (!ambitoId) continue;
      for (const solucionId of d.ganadoras) pendientes.push({ solucionId, ambitoId });
    }
    if (pendientes.length === 0) return 0;

    const ids = [...new Set(pendientes.map((p) => p.solucionId))];
    const [soluciones, existentes] = await Promise.all([
      this.prisma.solucion.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, description: true, hidden: true },
      }),
      // Cualquier comisión, viva o no: una archivada no renace sola (la renovación es otro camino).
      this.prisma.group.findMany({
        where: { trabajoTipo: 'comision', origenSolucionId: { in: ids } },
        select: { origenSolucionId: true },
      }),
    ]);
    const visibles = new Map(soluciones.filter((s) => !s.hidden).map((s) => [s.id, s]));
    const hechas = new Set(existentes.map((e) => e.origenSolucionId));

    let creadas = 0;
    for (const p of pendientes) {
      const s = visibles.get(p.solucionId);
      if (!s || hechas.has(s.id)) continue;
      hechas.add(s.id);
      try {
        const datos = await this.datosNuevaComision(p.ambitoId, now);
        let id: string;
        try {
          id = await this.prisma.$transaction((tx) =>
            this.crearComisionTx(tx, {
              ...datos,
              nombre: `Comisión: ${s.title}`,
              tarea: s.description.slice(0, TAREA_INICIAL_MAX),
              ambitoId: p.ambitoId,
              origenSolucionId: s.id,
              origenGrupoId: null,
            }),
          );
        } catch (err) {
          // Fuera de la transacción: otra pasada simultánea ya la creó (índice parcial único).
          if (esDuplicado(err)) continue;
          throw err;
        }
        creadas += 1;
        await this.auditar('comision.created', id, null);
      } catch (err) {
        this.logger.error(`No se pudo crear la comisión de una solución: ${nombreError(err)}`);
      }
    }
    return creadas;
  }

  /**
   * Comisión propia de una bifurcación: nace como en R1, con la solución de origen como tarea,
   * `origenGrupoId` = la bifurcación y la bifurcación como ámbito (solo sus miembros se ofrecen).
   * Las reglas son las de la comunidad. El índice parcial único deja una sola viva por solución (409).
   */
  async crearDeBifurcacion(
    bif: { id: string; parentGroupId: string; origenSolucionId: string },
    now: Date = new Date(),
  ): Promise<string> {
    const s = await this.prisma.solucion.findUnique({
      where: { id: bif.origenSolucionId },
      select: { title: true, description: true },
    });
    if (!s) throw new BadRequestException('La solución de origen ya no existe.');
    const datos = await this.datosNuevaComision(bif.parentGroupId, now);
    let id: string;
    try {
      id = await this.prisma.$transaction((tx) =>
        this.crearComisionTx(tx, {
          ...datos,
          nombre: `Comisión: ${s.title}`,
          tarea: s.description.slice(0, TAREA_INICIAL_MAX),
          ambitoId: bif.id,
          origenSolucionId: bif.origenSolucionId,
          origenGrupoId: bif.id,
        }),
      );
    } catch (err) {
      if (esDuplicado(err)) throw new ConflictException('Ya hay una comisión para esta solución.');
      throw err;
    }
    // Sin actor: pedirla delataría la membresía.
    await this.auditar('comision.created', id, null);
    return id;
  }

  /** Puestos, forma y fin de la convocatoria de una comisión que nace ahora (reglas de la comunidad). */
  private async datosNuevaComision(
    reglasDe: string,
    now: Date,
  ): Promise<{ puestos: number; forma: Forma; convocatoriaEndsAt: Date }> {
    const [puestos, plazo, forma] = await Promise.all([
      this.rules.getInt('comision.puestos_min', reglasDe),
      this.rules.getInt('comision.plazo_convocatoria_dias', reglasDe),
      this.rules.getChoice('comision.forma', reglasDe),
    ]);
    return { puestos, forma: formaDe(forma), convocatoriaEndsAt: new Date(now.getTime() + plazo * DIA_MS) };
  }

  /**
   * Crea una comisión en `convocando`. La usan el nacimiento (R1) y la renovación; el índice
   * parcial único impide dos comisiones vivas para la misma solución (P2002).
   */
  private async crearComisionTx(
    tx: Tx,
    c: {
      nombre: string;
      tarea: string;
      ambitoId: string;
      origenSolucionId: string;
      origenGrupoId: string | null;
      puestos: number;
      forma: Forma;
      convocatoriaEndsAt: Date;
    },
  ): Promise<string> {
    const id = randomUUID();
    await tx.group.create({
      data: {
        id,
        name: c.nombre.slice(0, NOMBRE_MAX),
        slug: `trabajo-${id}`,
        type: 'trabajo',
        parentGroupId: c.ambitoId,
        trabajoTipo: 'comision',
        trabajoEstado: 'convocando',
        proposito: c.tarea,
        tarea: c.tarea,
        puestos: c.puestos,
        forma: c.forma,
        convocatoriaEndsAt: c.convocatoriaEndsAt,
        origenSolucionId: c.origenSolucionId,
        ...(c.origenGrupoId ? { origenGrupoId: c.origenGrupoId } : {}),
      },
    });
    return id;
  }

  /**
   * Activa con los elegidos: `updateMany` condicionado al estado previo; solo quien cambió la fila
   * crea las membresías y el foro por defecto (si no existe ya).
   */
  private async activarTx(
    tx: Tx,
    g: ComisionFila,
    estadoPrevio: 'convocando' | 'eligiendo',
    elegidos: string[],
    extra: Prisma.GroupUpdateManyMutationInput,
    now: Date,
  ): Promise<boolean> {
    const comunidad = await this.comunidadDe(g.parentGroupId ?? '');
    const dias = await this.rules.getInt('comision.informe_cada_dias', comunidad);
    const res = await tx.group.updateMany({
      where: { id: g.id, trabajoEstado: estadoPrevio },
      data: {
        trabajoEstado: 'activo',
        convocatoriaEndsAt: null,
        activadaAt: now,
        proximoInformeAt: new Date(now.getTime() + dias * DIA_MS),
        ...extra,
      },
    });
    if (res.count !== 1) return false;
    await tx.groupMembership.createMany({
      data: elegidos.map((profileId) => ({ groupId: g.id, profileId })),
      skipDuplicates: true,
    });
    const foro = await tx.forum.findFirst({ where: { groupId: g.id, isDefault: true }, select: { id: true } });
    if (!foro) await tx.forum.create({ data: { groupId: g.id, title: g.name, isDefault: true } });
    return true;
  }

  private async archivarTx(tx: Tx, id: string, estadoPrevio: 'convocando' | 'eligiendo'): Promise<boolean> {
    const res = await tx.group.updateMany({ where: { id, trabajoEstado: estadoPrevio }, data: { trabajoEstado: 'archivado' } });
    return res.count === 1;
  }

  /** Al vencer la convocatoria: ampliar (una vez), archivar, formar por sorteo o abrir la elección. */
  async cerrarConvocatorias(now: Date): Promise<number> {
    const vencidas = await this.prisma.group.findMany({
      where: { type: 'trabajo', trabajoTipo: 'comision', trabajoEstado: 'convocando', convocatoriaEndsAt: { lte: now } },
      select: { id: true },
    });
    let n = 0;
    for (const { id } of vencidas) {
      try {
        const r = await this.prisma.$transaction((tx) => this.cerrarConvocatoriaTx(tx, id, now));
        if (!r) continue;
        n += 1;
        if (r.accion === 'ampliada') await this.auditar('comision.extended', id, null);
        else if (r.accion === 'archivada') await this.auditar('grupo.archived', id, null);
        else if (r.accion === 'formada') await this.auditar('comision.selected', id, null, undefined, { forma: r.forma });
      } catch (err) {
        this.logger.error(`No se pudo cerrar la convocatoria de la comisión ${id}: ${nombreError(err)}`);
      }
    }
    return n;
  }

  private async cerrarConvocatoriaTx(
    tx: Tx,
    id: string,
    now: Date,
  ): Promise<{ accion: 'ampliada' | 'archivada' | 'eligiendo' | 'formada'; forma: Forma } | null> {
    const g = await this.bloquear(tx, id);
    if (
      g.trabajoTipo !== 'comision' ||
      g.trabajoEstado !== 'convocando' ||
      !g.parentGroupId ||
      !g.convocatoriaEndsAt ||
      g.convocatoriaEndsAt.getTime() > now.getTime()
    ) {
      return null;
    }
    const forma = formaDe(g.forma);
    const comunidad = await this.comunidadDe(g.parentGroupId);
    const puestos = g.puestos ?? (await this.rules.getInt('comision.puestos_min', comunidad));
    // Quien se mudó o fue suspendido ya no es miembro del ámbito: no cuenta como voluntario.
    const voluntarios = (
      await tx.comisionVoluntario.findMany({ where: delAmbito(id, g.parentGroupId), select: { profileId: true } })
    ).map((v) => v.profileId);

    if (voluntarios.length < puestos && !g.ampliada) {
      const res = await tx.group.updateMany({
        where: { id, trabajoEstado: 'convocando', ampliada: false },
        data: { ampliada: true, convocatoriaEndsAt: new Date(now.getTime() + DIAS_AMPLIACION * DIA_MS) },
      });
      return res.count === 1 ? { accion: 'ampliada', forma } : null;
    }
    if (voluntarios.length === 0) {
      return (await this.archivarTx(tx, id, 'convocando')) ? { accion: 'archivada', forma } : null;
    }
    if (voluntarios.length > puestos && forma === 'preferencias') {
      const dias = await this.rules.getInt('votacion.plazo_dias', comunidad);
      const res = await tx.group.updateMany({
        where: { id, trabajoEstado: 'convocando' },
        data: { trabajoEstado: 'eligiendo', convocatoriaEndsAt: null, eleccionEndsAt: new Date(now.getTime() + dias * DIA_MS) },
      });
      return res.count === 1 ? { accion: 'eligiendo', forma } : null;
    }

    const pool = sortPool(voluntarios);
    let elegidos = pool;
    let extra: Prisma.GroupUpdateManyMutationInput = {};
    if (pool.length > puestos) {
      // Sorteo verificable: con la semilla y el pool guardados, verifySelection reproduce a los elegidos.
      const semilla = generateSeed();
      elegidos = selectMembers(pool, puestos, semilla);
      extra = {
        seleccionSemilla: semilla,
        seleccionPool: pool,
        seleccionAlgoritmo: ALGORITHM_VERSION,
        eleccionResultado: { elegidos },
      };
    }
    return (await this.activarTx(tx, g, 'convocando', elegidos, extra, now)) ? { accion: 'formada', forma } : null;
  }

  /** Al vencer la elección: Schulze repetido sobre las papeletas de los miembros actuales del ámbito. */
  async cerrarElecciones(now: Date): Promise<number> {
    const vencidas = await this.prisma.group.findMany({
      where: { type: 'trabajo', trabajoTipo: 'comision', trabajoEstado: 'eligiendo', eleccionEndsAt: { lte: now } },
      select: { id: true },
    });
    let n = 0;
    for (const { id } of vencidas) {
      try {
        const r = await this.prisma.$transaction((tx) => this.cerrarEleccionTx(tx, id, now));
        if (!r) continue;
        n += 1;
        if (r === 'archivada') await this.auditar('grupo.archived', id, null);
        else await this.auditar('comision.selected', id, null, undefined, { forma: 'preferencias' });
      } catch (err) {
        this.logger.error(`No se pudo cerrar la elección de la comisión ${id}: ${nombreError(err)}`);
      }
    }
    return n;
  }

  private async cerrarEleccionTx(tx: Tx, id: string, now: Date): Promise<'archivada' | 'formada' | null> {
    const g = await this.bloquear(tx, id);
    if (
      g.trabajoTipo !== 'comision' ||
      g.trabajoEstado !== 'eligiendo' ||
      !g.parentGroupId ||
      !g.eleccionEndsAt ||
      g.eleccionEndsAt.getTime() > now.getTime()
    ) {
      return null;
    }
    const candidatos = sortPool(
      (await tx.comisionVoluntario.findMany({ where: delAmbito(id, g.parentGroupId), select: { profileId: true } })).map(
        (v) => v.profileId,
      ),
    );
    if (candidatos.length === 0) return (await this.archivarTx(tx, id, 'eligiendo')) ? 'archivada' : null;

    const papeletas = await tx.comisionPapeleta.findMany({ where: delAmbito(id, g.parentGroupId), select: { orden: true } });
    const puestos = g.puestos ?? candidatos.length;
    const resultado = elegirPuestos(
      papeletas.map((p) => p.orden),
      candidatos,
      puestos,
    );
    const ok = await this.activarTx(
      tx,
      g,
      'eligiendo',
      resultado.elegidos,
      { eleccionResultado: resultado as unknown as Prisma.InputJsonValue },
      now,
    );
    return ok ? 'formada' : null;
  }
}
