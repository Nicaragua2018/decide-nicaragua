import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { GENERAL_GROUP_SLUG } from '@decide/shared';
import type { CargoTipoValue, EleccionMotivoValue } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';

const DIA_MS = 86_400_000;
/** La renovación se convoca con esta antelación sobre el fin del período. */
export const RENOVACION_ANTES_DIAS = 21;
/** Tras una elección con puestos sin elegir, se vuelve a convocar pasado este tiempo. */
export const REINTENTO_DESPUES_DIAS = 30;
/** Prórroga única del plazo de candidaturas cuando hay pocas. */
export const PRORROGA_DIAS = 7;
export const PUESTOS_COORDINADORES = 2;

const MESA: CargoTipoValue[] = ['administrador', 'coordinador_general', 'secretario'];
const ABIERTA = ['candidaturas', 'votacion'] as const;

type Ambito = { groupId: string; cargo: CargoTipoValue };

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
    n += await this.reintentos(now);
    n += await this.renovaciones(general?.id ?? null, now);
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
          await this.dejarEnFunciones({ groupId: e.groupId, cargo: e.cargo, puestos: e.puestos }, now);
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
    const verificado = { status: 'verified_citizen' as const };
    const perfiles = await this.prisma.profile.findMany({
      where:
        eleccion.cargo === 'coordinador'
          ? { user: verificado, memberships: { some: { groupId: eleccion.groupId } } }
          : { user: verificado },
      select: { id: true },
    });
    return perfiles.map((p) => p.id);
  }

  /**
   * Los cargos vigentes de ese tipo y ámbito que vencen quedan «en funciones» hasta que haya
   * quien los reemplace. `puestos` es cuántos puestos quedaron sin cubrir.
   */
  async dejarEnFunciones(
    eleccion: Ambito & { puestos: number },
    now: Date,
    db: Pick<Prisma.TransactionClient, 'cargo'> = this.prisma,
  ): Promise<void> {
    const vencen = await db.cargo.findMany({
      where: {
        groupId: eleccion.groupId,
        tipo: eleccion.cargo,
        terminadoAt: null,
        hasta: { lte: new Date(now.getTime() + RENOVACION_ANTES_DIAS * DIA_MS) },
      },
      orderBy: { hasta: 'asc' },
      take: Math.max(eleccion.puestos, 0),
      select: { id: true },
    });
    if (vencen.length === 0) return;
    await db.cargo.updateMany({
      where: { id: { in: vencen.map((c) => c.id) } },
      data: { enFunciones: true },
    });
  }

  // ---------------------------------------------------------------- disparadores

  private async primeraJornada(generalId: string, now: Date): Promise<number> {
    // Solo si nunca hubo una elección de mesa (en cualquier fase): los puestos sin cubrir
    // de esa primera jornada los retoma el reintento a los 30 días.
    const hubo = await this.prisma.eleccion.count({ where: { cargo: { in: MESA } } });
    if (hubo > 0) return 0;
    const minimo = await this.rules.getInt('eleccion.minimo_primera', null);
    const verificadas = await this.prisma.profile.count({ where: { user: { status: 'verified_citizen' } } });
    if (verificadas < minimo) return 0;
    const observadores = await this.rules.getInt('observadores.numero', null);
    return this.crearJornada(
      [
        ...MESA.map((cargo) => ({ cargo, puestos: 1 })),
        { cargo: 'observador' as const, puestos: observadores },
      ],
      generalId,
      'primera',
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
    const fechas = await this.fechas(now);
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

  private async reintentos(now: Date): Promise<number> {
    const limite = new Date(now.getTime() - REINTENTO_DESPUES_DIAS * DIA_MS);
    const contadas = await this.prisma.eleccion.findMany({
      where: { fase: 'contada', contadaAt: { lte: limite } },
    });
    let n = 0;
    for (const e of contadas) {
      const faltan = e.puestos - e.electas.length;
      if (faltan <= 0) continue;
      const hayOtra = await this.prisma.eleccion.findFirst({
        where: {
          groupId: e.groupId,
          cargo: e.cargo,
          id: { not: e.id },
          OR: [{ fase: { in: [...ABIERTA] } }, { createdAt: { gt: e.createdAt } }],
        },
        select: { id: true },
      });
      if (hayOtra) continue;
      n += await this.crearJornada([{ cargo: e.cargo, puestos: faltan }], e.groupId, 'reintento', now, false);
    }
    return n;
  }

  private async renovaciones(generalId: string | null, now: Date): Promise<number> {
    const hasta = new Date(now.getTime() + RENOVACION_ANTES_DIAS * DIA_MS);
    const vigentes = await this.prisma.cargo.findMany({
      where: { terminadoAt: null },
      select: { tipo: true, groupId: true, hasta: true },
    });
    // Por cargo y ámbito: cuántos vencen dentro de la ventana y cuántos siguen sin vencer.
    const claves = new Map<string, Ambito & { vencen: number; siguen: number }>();
    for (const c of vigentes) {
      const k = `${c.groupId}:${c.tipo}`;
      const a = claves.get(k) ?? { groupId: c.groupId, cargo: c.tipo, vencen: 0, siguen: 0 };
      if (c.hasta.getTime() <= hasta.getTime()) a.vencen += 1;
      else a.siguen += 1;
      claves.set(k, a);
    }

    const recien = new Date(now.getTime() - REINTENTO_DESPUES_DIAS * DIA_MS);
    const pendientes: (Ambito & { puestos: number })[] = [];
    for (const a of claves.values()) {
      if (a.vencen === 0) continue;
      // Abierta, o contada hace poco (si quedaron puestos, el reintento se ocupa).
      const hay = await this.prisma.eleccion.findFirst({
        where: {
          groupId: a.groupId,
          cargo: a.cargo,
          OR: [{ fase: { in: [...ABIERTA] } }, { fase: 'contada', contadaAt: { gt: recien } }],
        },
        select: { id: true },
      });
      if (hay) continue;
      // Tantos puestos como cargos vencen (al menos 1), sin pasar de los puestos libres del cargo.
      const plenos =
        a.cargo === 'observador'
          ? await this.rules.getInt('observadores.numero', null)
          : a.cargo === 'coordinador'
            ? PUESTOS_COORDINADORES
            : 1;
      const libres = Math.max(plenos - a.siguen, 1);
      pendientes.push({ groupId: a.groupId, cargo: a.cargo, puestos: Math.min(Math.max(a.vencen, 1), libres) });
    }

    let n = 0;
    const enMesa = pendientes.filter((a) => a.groupId === generalId && a.cargo !== 'coordinador');
    if (generalId && enMesa.length > 0) {
      n += await this.crearJornada(
        enMesa.map((a) => ({ cargo: a.cargo, puestos: a.puestos })),
        generalId,
        'renovacion',
        now,
      );
    }
    for (const a of pendientes) {
      if (a.groupId === generalId && a.cargo !== 'coordinador') continue;
      n += await this.crearJornada([{ cargo: a.cargo, puestos: a.puestos }], a.groupId, 'renovacion', now, false);
    }
    return n;
  }

  // ---------------------------------------------------------------- creación

  /**
   * Crea una elección por cargo con las fechas de las reglas. Un P2002 del índice parcial
   * (ya hay una abierta de ese cargo y ámbito) se salta sin romper la ronda.
   */
  private async crearJornada(
    cargos: { cargo: CargoTipoValue; puestos: number }[],
    groupId: string,
    motivo: EleccionMotivoValue,
    now: Date,
    conJornada = true,
  ): Promise<number> {
    const fechas = await this.fechas(now);
    const jornadaId = conJornada && cargos.length > 1 ? randomUUID() : null;
    let n = 0;
    for (const { cargo, puestos } of cargos) {
      try {
        const e = await this.crearUna(this.prisma, groupId, cargo, puestos, motivo, jornadaId, fechas);
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

  private crearUna(
    db: Pick<Prisma.TransactionClient, 'eleccion'>,
    groupId: string,
    cargo: CargoTipoValue,
    puestos: number,
    motivo: EleccionMotivoValue,
    jornadaId: string | null,
    fechas: { candidaturasEndsAt: Date; votacionEndsAt: Date },
  ) {
    return db.eleccion.create({ data: { groupId, cargo, puestos, motivo, jornadaId, ...fechas } });
  }

  private auditarConvocada(id: string, cargo: CargoTipoValue, motivo: EleccionMotivoValue, groupId: string): void {
    void this.audit.log({ action: 'eleccion.convocada', resource: `eleccion:${id}`, metadata: { cargo, motivo, groupId } });
  }
}
