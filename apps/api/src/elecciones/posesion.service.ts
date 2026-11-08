import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CargoTipoValue } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { generateSeed } from '../sortition/sortition-algorithm';
import { ConvocatoriaService, RENOVACION_ANTES_DIAS, plenosDe } from './convocatoria.service';
import { contarEleccion } from './conteo';
import { MESA, conOtroCargo } from './incompatibilidad';

/** Suma meses sin desbordar el fin de mes (31 ago + 6 meses = 28 feb). Todo en UTC. */
export function sumarMeses(fecha: Date, meses: number): Date {
  const total = fecha.getUTCFullYear() * 12 + fecha.getUTCMonth() + meses;
  const anio = Math.floor(total / 12);
  const mes = total % 12;
  const diasDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const r = new Date(fecha.getTime());
  r.setUTCFullYear(anio, mes, Math.min(fecha.getUTCDate(), diasDelMes));
  return r;
}

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
const DIA_MS = 86_400_000;

/** Cuenta las elecciones cuya votación terminó y da el cargo a quien salió elegido. */
@Injectable()
export class PosesionService {
  private readonly logger = new Logger(PosesionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
    private readonly convocatoria: ConvocatoriaService,
  ) {}

  /** Cuenta todas las elecciones vencidas. Una que falle no frena a las demás. */
  async contarVencidas(now: Date): Promise<number> {
    const vencidas = await this.prisma.eleccion.findMany({
      where: { fase: 'votacion', votacionEndsAt: { lte: now } },
      select: { id: true },
    });
    let n = 0;
    for (const e of vencidas) {
      try {
        if (await this.contar(e.id, now)) n += 1;
      } catch (err) {
        this.logger.error(`No se pudo contar una elección: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return n;
  }

  /**
   * Cuenta una elección y da posesión. Idempotente: solo una llamada la cuenta. Todo ocurre con la
   * elección bloqueada (FOR UPDATE): una ficha que la mesa oculta a la vez (con la elección en
   * FOR SHARE) queda oculta antes de leerse aquí, o ya no se oculta porque la elección está contada.
   */
  async contar(eleccionId: string, now: Date): Promise<boolean> {
    const e = await this.prisma.eleccion.findUnique({ where: { id: eleccionId } });
    if (!e || e.fase !== 'votacion') return false;

    const electorado = await this.convocatoria.electorado({ groupId: e.groupId, cargo: e.cargo });
    // La regla queda fijada al convocar; solo si falta (elecciones antiguas) se lee ahora.
    const quorumPct = e.quorumPct ?? (await this.rules.getInt('votacion.quorum_porcentaje', e.groupId));
    const semilla = generateSeed();

    const hecho = await this.prisma.$transaction(async (tx) => {
      const viva = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM elecciones WHERE id = ${e.id}::uuid AND fase = 'votacion' FOR UPDATE`,
      );
      if (viva.length === 0) return null;

      const candidaturas = await tx.candidatura.findMany({
        where: { eleccionId: e.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          profileId: true,
          oculta: true,
          retiradaAt: true,
          profile: { select: { user: { select: { status: true } } } },
        },
      });
      const vivas = candidaturas.filter((c) => c.retiradaAt === null);
      const candidatas = vivas.map((c) => c.id);
      const enLista = new Set(candidatas);
      const incompatibles = await conOtroCargo(
        tx as unknown as Pick<PrismaService, 'cargo' | 'boardSeat'>,
        e,
        vivas.map((c) => c.profileId),
        now,
      );
      const excluidas = vivas
        .filter((c) => c.oculta || c.profile.user.status !== 'verified_citizen' || incompatibles.has(c.profileId))
        .map((c) => c.id);

      const papeletas = await tx.papeletaEleccion.findMany({
        where: { eleccionId: e.id, profileId: { in: electorado } },
        select: { abstencion: true, orden: true },
      });

      const r = contarEleccion({
        candidatas,
        puestos: e.puestos,
        papeletas: papeletas.map((p) => ({ abstencion: p.abstencion, orden: p.orden.filter((id) => enLista.has(id)) })),
        miembros: electorado.length,
        quorumPct,
        excluidas,
        semilla,
      });

      const perfilDe = new Map(vivas.map((c) => [c.id, c.profileId]));
      const elegidas = r.electas.map((id) => perfilDe.get(id)!);

      const guarda = await tx.eleccion.updateMany({
        where: { id: e.id, fase: 'votacion' },
        data: {
          fase: 'contada',
          contadaAt: now,
          miembros: electorado.length,
          semilla,
          sinQuorum: r.sinQuorum,
          candidatasOrden: candidatas,
          pairwiseMatrix: json(r.pairwiseMatrix),
          schulzeMatrix: json(r.schulzeMatrix),
          ordenFinal: r.ordenFinal,
          electas: r.electas,
          aprobaciones: r.aprobaciones,
          papeletasTotal: r.papeletasTotal,
          abstenciones: r.abstenciones,
        },
      });
      if (guarda.count === 0) return null;
      await this.darPosesion(tx, e, elegidas, now);
      // Quien salía y no fue reemplazado sigue «en funciones» hasta la siguiente convocatoria.
      await this.convocatoria.dejarEnFunciones({ groupId: e.groupId, cargo: e.cargo, convocadaAt: e.createdAt }, tx);
      return { r, elegidas };
    });
    if (!hecho) return false;
    const { r, elegidas } = hecho;
    const vacantes = Math.max(e.puestos - r.electas.length, 0);

    void this.audit.log({
      action: 'eleccion.contada',
      resource: `eleccion:${e.id}`,
      metadata: { electas: r.electas.length, vacantes, papeletasTotal: r.papeletasTotal },
    });
    for (let i = 0; i < elegidas.length; i++) {
      void this.audit.log({
        action: 'cargo.posesion',
        resource: `eleccion:${e.id}`,
        metadata: { tipo: e.cargo, groupId: e.groupId },
      });
    }
    return true;
  }

  /**
   * Crea los cargos de las electas. Solo terminan cargos «salientes» (en funciones, o cuyo fin cae
   * en la ventana de renovación del conteo), nunca uno con mandato por delante, y como mucho tantos
   * como electas: primero los en funciones, luego los de fin más próximo. Si hay vacantes, las
   * electas las ocupan antes de reemplazar a nadie (nunca se pasa de los puestos plenos fijados
   * al convocar). Una persona reelegida siempre deja su cargo anterior: nadie ocupa dos puestos
   * del mismo cargo.
   */
  private async darPosesion(
    tx: Prisma.TransactionClient,
    e: { id: string; groupId: string; cargo: CargoTipoValue; periodoMeses: number | null; plenos: number | null },
    perfiles: string[],
    now: Date,
  ): Promise<void> {
    if (perfiles.length === 0) return;
    const termina = { terminadoAt: now, enFunciones: false };

    const limite = now.getTime() + RENOVACION_ANTES_DIAS * DIA_MS;
    const vigentes = await tx.cargo.findMany({
      where: { groupId: e.groupId, tipo: e.cargo, terminadoAt: null },
      orderBy: [{ enFunciones: 'desc' }, { hasta: 'asc' }],
      select: { id: true, profileId: true, enFunciones: true, hasta: true },
    });
    // Quien sale reelegido se reemplaza a sí mismo: su cargo viejo termina siempre.
    const electas = new Set(perfiles);
    const propios = vigentes.filter((c) => electas.has(c.profileId));
    const resto = vigentes.filter((c) => !electas.has(c.profileId));
    const salientes = resto.filter((c) => c.enFunciones || c.hasta.getTime() <= limite);
    // Plenos fijados al convocar; solo si falta (elecciones antiguas) se lee la regla ahora.
    const plenos = e.plenos ?? (await plenosDe(this.rules, e.cargo));
    const cuantos = Math.min(
      salientes.length,
      Math.max(0, perfiles.length - propios.length),
      Math.max(0, resto.length + perfiles.length - plenos),
    );
    const salen = [...propios, ...salientes.slice(0, cuantos)];
    if (salen.length > 0) {
      await tx.cargo.updateMany({ where: { id: { in: salen.map((c) => c.id) } }, data: termina });
    }

    const meses =
      e.periodoMeses ??
      (await this.rules.getInt(
        e.cargo === 'coordinador' ? 'cargos.periodo_coordinadores_meses' : 'cargos.periodo_mesa_meses',
        null,
      ));
    const hasta = sumarMeses(now, meses);
    for (const profileId of perfiles) {
      await tx.cargo.create({
        data: { tipo: e.cargo, groupId: e.groupId, profileId, eleccionId: e.id, desde: now, hasta },
      });
      if (MESA.includes(e.cargo)) {
        const role = e.cargo as 'administrador' | 'coordinador_general' | 'secretario';
        // Un fundador elegido para otro rol de la mesa libera su asiento fundador: queda vacante
        // y la siguiente convocatoria lo cubre. (Fuera de la mesa un fundador no puede ser elegido.)
        await tx.boardSeat.deleteMany({ where: { profileId, source: 'fundador', NOT: { role } } });
        await tx.boardSeat.upsert({
          where: { role },
          update: { profileId, source: 'eleccion', since: now },
          create: { role, profileId, source: 'eleccion', since: now },
        });
      }
    }
  }
}
