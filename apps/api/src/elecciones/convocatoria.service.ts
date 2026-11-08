import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import type { CargoTipoValue, EleccionMotivoValue } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';

const DIA_MS = 86_400_000;
/** Un cargo «sale» (se renueva) cuando su período termina dentro de esta ventana. */
export const RENOVACION_ANTES_DIAS = 21;
/** Con puestos vacantes (o en funciones) y nadie más que salga, se vuelve a convocar pasado este tiempo desde la última elección contada. */
export const REINTENTO_DESPUES_DIAS = 30;
/** Prórroga única del plazo de candidaturas cuando hay pocas. */
export const PRORROGA_DIAS = 7;
export const PUESTOS_COORDINADORES = 2;

const MESA: CargoTipoValue[] = ['administrador', 'coordinador_general', 'secretario'];
const ABIERTA = ['candidaturas', 'votacion'] as const;

type Ambito = { groupId: string; cargo: CargoTipoValue };

/**
 * Quién forma el electorado: cuentas verificadas de toda la plataforma; en coordinadores, solo
 * las de esa comunidad. Sirve como filtro de perfiles (también para contar papeletas).
 */
export function filtroElectorado(eleccion: Ambito): Prisma.ProfileWhereInput {
  const user = { status: 'verified_citizen' as const };
  return eleccion.cargo === 'coordinador' ? { user, memberships: { some: { groupId: eleccion.groupId } } } : { user };
}

/** Puestos plenos de un cargo en su ámbito: 1 en cada rol de la mesa, la regla en observadores, 2 coordinadores. */
export async function plenosDe(rules: Pick<RulesService, 'getInt'>, cargo: CargoTipoValue): Promise<number> {
  if (cargo === 'observador') return rules.getInt('observadores.numero', null);
  return cargo === 'coordinador' ? PUESTOS_COORDINADORES : 1;
}

const esDuplicado = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Convoca las elecciones en sus disparadores fijos y las mueve de fase. Nunca lo hace una persona. */
@Injectable()
export class ConvocatoriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
  ) {}

  /** Crea las elecciones que tocan. Devuelve cuántas se crearon. */
  async convocar(now: Date): Promise<number> {
    let n = 0;
    const general = await this.prisma.group.findFirst({
      where: { type: 'custom', slug: GENERAL_GROUP_SLUG },
      select: { id: true },
    });
    if (general) n += await this.primeraJornada(general.id, now);
    n += await this.activarComunidades(now);
    n += await this.convocatorias(general?.id ?? null, now);
    return n;
  }

  /** Mueve de fase las elecciones cuyo plazo de candidaturas terminó. Devuelve cuántas se movieron. */
  async avanzar(now: Date): Promise<number> {
    const vencidas = await this.prisma.eleccion.findMany({
      where: { fase: 'candidaturas', candidaturasEndsAt: { lte: now } },
    });
    let n = 0;
    for (const e of vencidas) {
      const vivas = await this.prisma.candidatura.count({
        where: { eleccionId: e.id, oculta: false, retiradaAt: null },
      });
      if (vivas < e.puestos && !e.prorrogada) {
        const r = await this.prisma.eleccion.updateMany({
          where: { id: e.id, fase: 'candidaturas', prorrogada: false },
          data: {
            candidaturasEndsAt: new Date(e.candidaturasEndsAt.getTime() + PRORROGA_DIAS * DIA_MS),
            votacionEndsAt: new Date(e.votacionEndsAt.getTime() + PRORROGA_DIAS * DIA_MS),
            prorrogada: true,
          },
        });
        if (r.count > 0) {
          n += 1;
          void this.audit.log({
            action: 'eleccion.prorrogada',
            resource: `eleccion:${e.id}`,
            metadata: { cargo: e.cargo, groupId: e.groupId, dias: PRORROGA_DIAS },
          });
        }
      } else if (vivas === 0) {
        const r = await this.prisma.eleccion.updateMany({
          where: { id: e.id, fase: 'candidaturas' },
          data: { fase: 'contada', electas: [], contadaAt: now },
        });
        if (r.count > 0) {
          n += 1;
          await this.dejarEnFunciones({ groupId: e.groupId, cargo: e.cargo, convocadaAt: e.createdAt });
          void this.audit.log({
            action: 'eleccion.cerrada_sin_candidaturas',
            resource: `eleccion:${e.id}`,
            metadata: { cargo: e.cargo, groupId: e.groupId },
          });
        }
      } else {
        const r = await this.prisma.eleccion.updateMany({
          where: { id: e.id, fase: 'candidaturas' },
          data: { fase: 'votacion' },
        });
        if (r.count > 0) n += 1;
      }
    }
    return n;
  }

  /** Perfiles que pueden votar (y presentarse) en esa elección. */
  async electorado(eleccion: Ambito): Promise<string[]> {
    const perfiles = await this.prisma.profile.findMany({ where: filtroElectorado(eleccion), select: { id: true } });
    return perfiles.map((p) => p.id);
  }

  /** Si una persona está en el electorado de esa elección (misma regla que `electorado`). */
  async enElectorado(profileId: string, eleccion: Ambito): Promise<boolean> {
    return (await this.prisma.profile.count({ where: { id: profileId, ...filtroElectorado(eleccion) } })) > 0;
  }

  /**
   * Tras contar (o cerrar sin candidaturas) una elección, los cargos de ese tipo y ámbito que ya
   * salían al convocarla (fin dentro de la ventana de renovación) y no fueron reemplazados quedan
   * «en funciones» hasta que haya quien los reemplace. Nunca marca un cargo con mandato por delante.
   */
  async dejarEnFunciones(
    eleccion: Ambito & { convocadaAt: Date },
    db: Pick<Prisma.TransactionClient, 'cargo'> = this.prisma,
  ): Promise<void> {
    await db.cargo.updateMany({
      where: {
        groupId: eleccion.groupId,
        tipo: eleccion.cargo,
        terminadoAt: null,
        enFunciones: false,
        hasta: { lte: new Date(eleccion.convocadaAt.getTime() + RENOVACION_ANTES_DIAS * DIA_MS) },
      },
      data: { enFunciones: true },
    });
  }

  // ---------------------------------------------------------------- disparadores

  private async primeraJornada(generalId: string, now: Date): Promise<number> {
    // Solo si nunca hubo una elección de mesa (en cualquier fase): los puestos sin cubrir
    // de esa primera jornada los retoma la convocatoria a los 30 días.
    const hubo = await this.prisma.eleccion.count({ where: { cargo: { in: MESA } } });
    if (hubo > 0) return 0;
    const minimo = await this.rules.getInt('eleccion.minimo_primera', null);
    const verificadas = await this.prisma.profile.count({ where: { user: { status: 'verified_citizen' } } });
    if (verificadas < minimo) return 0;
    const observadores = await this.rules.getInt('observadores.numero', null);
    return this.crearJornada(
      [
        ...MESA.map((cargo) => ({ cargo, puestos: 1, motivo: 'primera' as const })),
        { cargo: 'observador' as const, puestos: observadores, motivo: 'primera' as const },
      ],
      generalId,
      now,
    );
  }

  private async activarComunidades(now: Date): Promise<number> {
    const pendientes = await this.prisma.group.findMany({
      where: { type: { in: ['territorial_origin', 'territorial_residence'] }, activadaAt: null, isActive: true },
      select: { id: true },
    });
    if (pendientes.length === 0) return 0;
    const minimo = await this.rules.getInt('comunidad.minimo_activacion', null);
    let n = 0;
    for (const g of pendientes) {
      const verificadas = await this.prisma.profile.count({
        where: { user: { status: 'verified_citizen' }, memberships: { some: { groupId: g.id } } },
      });
      if (verificadas < minimo) continue;
      n += await this.activar(g.id, now);
    }
    return n;
  }

  /**
   * Activa la comunidad y abre su elección de coordinadores en una sola transacción: si algo
   * falla no se escribe nada y la próxima ronda lo reintenta.
   */
  private async activar(groupId: string, now: Date): Promise<number> {
    const fechas = { ...(await this.fechas(now)), ...(await this.reglasFijas(groupId, 'coordinador')) };
    try {
      const e = await this.prisma.$transaction(async (tx) => {
        const r = await tx.group.updateMany({ where: { id: groupId, activadaAt: null }, data: { activadaAt: now } });
        if (r.count === 0) return null;
        return this.crearUna(tx, groupId, 'coordinador', PUESTOS_COORDINADORES, 'primera', null, fechas);
      });
      if (!e) return 0;
      this.auditarConvocada(e.id, 'coordinador', 'primera', groupId);
      return 1;
    } catch (err) {
      if (!esDuplicado(err)) throw err;
      // Ya hay una elección abierta de coordinadores: solo falta dejar la comunidad activada.
      await this.prisma.group.updateMany({ where: { id: groupId, activadaAt: null }, data: { activadaAt: now } });
      return 0;
    }
  }

  /**
   * Una sola convocatoria por cargo y ámbito, que cubre a la vez a quien sale y las vacantes.
   * - Sale un cargo en funciones o cuyo período termina dentro de {@link RENOVACION_ANTES_DIAS} días;
   *   siguen los demás. Puestos = plenos − los que siguen; sin puestos nunca se convoca.
   * - Se convoca si alguien entra en la ventana (aún no en funciones: su renovación no se ofreció),
   *   o si pasaron {@link REINTENTO_DESPUES_DIAS} días desde la última elección contada de ese cargo y
   *   ámbito (o nunca se contó ninguna). Así un reintento fallido nunca retrasa una renovación.
   * - Motivo «renovacion» si alguien sale; si solo hay vacantes, «reintento».
   * La mesa y los observadores que tocan en la misma ronda van en una jornada.
   */
  private async convocatorias(generalId: string | null, now: Date): Promise<number> {
    const ventana = now.getTime() + RENOVACION_ANTES_DIAS * DIA_MS;
    const espera = now.getTime() - REINTENTO_DESPUES_DIAS * DIA_MS;
    const [vigentes, contadas, abiertas] = await Promise.all([
      this.prisma.cargo.findMany({
        where: { terminadoAt: null },
        select: { tipo: true, groupId: true, hasta: true, enFunciones: true },
      }),
      this.prisma.eleccion.groupBy({
        by: ['groupId', 'cargo'],
        where: { fase: 'contada' },
        _max: { contadaAt: true },
      }),
      this.prisma.eleccion.findMany({ where: { fase: { in: [...ABIERTA] } }, select: { groupId: true, cargo: true } }),
    ]);

    type Clave = Ambito & { siguen: number; salen: number; nuevos: number; ultima: Date | null };
    const claves = new Map<string, Clave>();
    const clave = (groupId: string, cargo: CargoTipoValue): Clave => {
      const k = `${groupId}:${cargo}`;
      let a = claves.get(k);
      if (!a) {
        a = { groupId, cargo, siguen: 0, salen: 0, nuevos: 0, ultima: null };
        claves.set(k, a);
      }
      return a;
    };
    for (const c of vigentes) {
      const a = clave(c.groupId, c.tipo);
      if (c.enFunciones || c.hasta.getTime() <= ventana) {
        a.salen += 1;
        if (!c.enFunciones) a.nuevos += 1;
      } else {
        a.siguen += 1;
      }
    }
    for (const c of contadas) clave(c.groupId, c.cargo).ultima = c._max.contadaAt ?? null;
    const abierta = new Set(abiertas.map((e) => `${e.groupId}:${e.cargo}`));

    const pendientes: { groupId: string; cargo: CargoTipoValue; puestos: number; motivo: EleccionMotivoValue }[] = [];
    for (const [k, a] of claves) {
      if (abierta.has(k)) continue;
      const puestos = (await plenosDe(this.rules, a.cargo)) - a.siguen;
      if (puestos <= 0) continue;
      const toca = a.nuevos > 0 || a.ultima === null || a.ultima.getTime() <= espera;
      if (!toca) continue;
      pendientes.push({ groupId: a.groupId, cargo: a.cargo, puestos, motivo: a.salen > 0 ? 'renovacion' : 'reintento' });
    }

    let n = 0;
    const enMesa = (a: { groupId: string; cargo: CargoTipoValue }) => a.groupId === generalId && a.cargo !== 'coordinador';
    const jornada = pendientes.filter(enMesa);
    if (generalId && jornada.length > 0) {
      n += await this.crearJornada(
        jornada.map(({ cargo, puestos, motivo }) => ({ cargo, puestos, motivo })),
        generalId,
        now,
      );
    }
    for (const a of pendientes) {
      if (enMesa(a)) continue;
      n += await this.crearJornada([{ cargo: a.cargo, puestos: a.puestos, motivo: a.motivo }], a.groupId, now, false);
    }
    return n;
  }

  // ---------------------------------------------------------------- creación

  /**
   * Crea una elección por cargo con las fechas de las reglas. Un P2002 del índice parcial
   * (ya hay una abierta de ese cargo y ámbito) se salta sin romper la ronda.
   */
  private async crearJornada(
    cargos: { cargo: CargoTipoValue; puestos: number; motivo: EleccionMotivoValue }[],
    groupId: string,
    now: Date,
    conJornada = true,
  ): Promise<number> {
    const fechas = await this.fechas(now);
    const jornadaId = conJornada && cargos.length > 1 ? randomUUID() : null;
    let n = 0;
    for (const { cargo, puestos, motivo } of cargos) {
      try {
        const fijas = await this.reglasFijas(groupId, cargo);
        const e = await this.crearUna(this.prisma, groupId, cargo, puestos, motivo, jornadaId, { ...fechas, ...fijas });
        n += 1;
        this.auditarConvocada(e.id, cargo, motivo, groupId);
      } catch (err) {
        if (!esDuplicado(err)) throw err;
      }
    }
    return n;
  }

  private async fechas(now: Date): Promise<{ candidaturasEndsAt: Date; votacionEndsAt: Date }> {
    const [candidaturasDias, votacionDias] = await Promise.all([
      this.rules.getInt('eleccion.plazo_candidaturas_dias', null),
      this.rules.getInt('eleccion.plazo_votacion_dias', null),
    ]);
    const candidaturasEndsAt = new Date(now.getTime() + candidaturasDias * DIA_MS);
    return { candidaturasEndsAt, votacionEndsAt: new Date(candidaturasEndsAt.getTime() + votacionDias * DIA_MS) };
  }

  /** Reglas que quedan fijadas en la elección al convocarla. */
  private async reglasFijas(groupId: string, cargo: CargoTipoValue): Promise<{ quorumPct: number; periodoMeses: number }> {
    const [quorumPct, periodoMeses] = await Promise.all([
      this.rules.getInt('votacion.quorum_porcentaje', groupId),
      this.rules.getInt(
        cargo === 'coordinador' ? 'cargos.periodo_coordinadores_meses' : 'cargos.periodo_mesa_meses',
        null,
      ),
    ]);
    return { quorumPct, periodoMeses };
  }

  private crearUna(
    db: Pick<Prisma.TransactionClient, 'eleccion'>,
    groupId: string,
    cargo: CargoTipoValue,
    puestos: number,
    motivo: EleccionMotivoValue,
    jornadaId: string | null,
    fechas: { candidaturasEndsAt: Date; votacionEndsAt: Date; quorumPct: number; periodoMeses: number },
  ) {
    return db.eleccion.create({ data: { groupId, cargo, puestos, motivo, jornadaId, ...fechas } });
  }

  private auditarConvocada(id: string, cargo: CargoTipoValue, motivo: EleccionMotivoValue, groupId: string): void {
    void this.audit.log({ action: 'eleccion.convocada', resource: `eleccion:${id}`, metadata: { cargo, motivo, groupId } });
  }
}
