import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { REVOCACION_ESPERA_DIAS, REVOCACION_PLAZO_DIAS } from '@decide/shared';
import type { CargoTipoValue, RevocacionResumen, RevocacionVista } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { GuardiaService, type OpcionesPublicar } from '../asistente/guardia.service';
import { Publicadores } from '../asistente/publicadores';
import { ConvocatoriaService, filtroElectorado } from './convocatoria.service';

const DIA_MS = 86_400_000;
const ABIERTA = ['candidaturas', 'votacion'] as const;

const NO_ENCONTRADO = 'Cargo no encontrado.';
const NO_ENCONTRADA = 'Pedido de revocación no encontrado.';
const EN_ELECCION = 'Este cargo ya está en elección.';
const ELECCION_ABIERTA = 'Ya hay una elección abierta para este cargo.';
const PEDIDO_ABIERTO = 'Ya hay un pedido abierto para este cargo.';
const NO_ELECTORADO = 'Solo puede pedirlo o apoyarlo la gente que elige este cargo.';
const PROPIA = 'No puedes pedir tu propia revocación.';
const CERRADO = 'Este pedido ya no está abierto.';

type Ambito = { groupId: string; cargo: CargoTipoValue };

const SELECT_CARGO = {
  id: true, tipo: true, groupId: true, profileId: true, hasta: true, enFunciones: true, terminadoAt: true,
  profile: { select: { displayName: true } }, group: { select: { name: true } },
} as const;

type CargoFila = {
  id: string;
  tipo: CargoTipoValue;
  groupId: string;
  profileId: string;
  hasta: Date;
  enFunciones: boolean;
  terminadoAt: Date | null;
  profile: { displayName: string };
  group: { name: string };
};

const SELECT_REVOCACION = {
  id: true, cargoId: true, motivo: true, estado: true, umbral: true, venceAt: true, cargo: { select: SELECT_CARGO },
} as const;

type RevocacionFila = {
  id: string;
  cargoId: string;
  motivo: string;
  estado: 'abierta' | 'lograda' | 'vencida';
  umbral: number;
  venceAt: Date;
  cargo: CargoFila;
};

const ambitoDe = (c: CargoFila): Ambito => ({ groupId: c.groupId, cargo: c.tipo });

/** «1 de marzo de 2027», en la hora de Nicaragua. */
const fecha = (d: Date): string =>
  d.toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Managua' });

/**
 * Revocación de un cargo electo (3C-2). La gente que elige un cargo puede pedir quitarlo antes de
 * tiempo; si en {@link REVOCACION_PLAZO_DIAS} días lo apoya la fracción fijada al pedirlo, el cargo
 * queda en funciones y se abre la elección anticipada con el mandato que faltaba.
 * Los apoyos son anónimos: ninguna respuesta dice quién pidió ni quién apoyó, y no se auditan.
 */
@Injectable()
export class RevocacionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
    private readonly convocatoria: ConvocatoriaService,
    private readonly guardia: GuardiaService,
    private readonly publicadores: Publicadores,
  ) {}

  /**
   * La revisión de la mesa publica un motivo aprobado con la misma llamada. Las comprobaciones se
   * repiten entonces; si ya no se cumplen (el cargo terminó, hay otro pedido…), el error sube y la
   * revisión marca el texto como no publicable, con el motivo.
   */
  onModuleInit(): void {
    this.publicadores.registrar('revocacion', (autor, args, opts) => {
      const a = args as { cargoId: string; motivo: string };
      return this.pedir(autor, a.cargoId, a.motivo, new Date(), opts);
    });
  }

  // ─── Pedir ────────────────────────────────────────────────────────────────

  async pedir(
    profileId: string,
    cargoId: string,
    motivo: string,
    now: Date,
    opts: OpcionesPublicar = {},
  ): Promise<{ id: string }> {
    const cargo = (await this.prisma.cargo.findUnique({ where: { id: cargoId }, select: SELECT_CARGO })) as CargoFila | null;
    if (!cargo) throw new NotFoundException(NO_ENCONTRADO);
    if (cargo.terminadoAt !== null || cargo.enFunciones) throw new ConflictException(EN_ELECCION);
    const abierta = await this.prisma.eleccion.findFirst({
      where: { groupId: cargo.groupId, cargo: cargo.tipo, fase: { in: [...ABIERTA] } },
      select: { id: true },
    });
    if (abierta) throw new ConflictException(ELECCION_ABIERTA);
    const ambito = ambitoDe(cargo);
    if (!(await this.enElectorado(profileId, ambito))) throw new ForbiddenException(NO_ELECTORADO);
    if (cargo.profileId === profileId) throw new ForbiddenException(PROPIA);
    const anterior = await this.prisma.revocacion.findFirst({
      where: { solicitanteProfileId: profileId, cargoId, createdAt: { gt: new Date(now.getTime() - REVOCACION_ESPERA_DIAS * DIA_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (anterior) {
      const desde = new Date(anterior.createdAt.getTime() + REVOCACION_ESPERA_DIAS * DIA_MS);
      throw new ConflictException({
        statusCode: 409,
        message: `Ya pediste la revocación de este cargo. Puedes volver a pedirla desde el ${fecha(desde)}.`,
        desde: desde.toISOString(),
      });
    }

    const texto = motivo.trim();
    // Lo que no depende del texto se comprobó antes: nadie recibe una revisión de un pedido imposible.
    await this.guardia.antesDePublicar({
      tipo: 'revocacion',
      texto,
      autorProfileId: profileId,
      args: { cargoId, motivo: texto },
      ...opts,
    });

    // Cifras fijadas al abrir el pedido: no cambian aunque cambie el electorado o la regla.
    const [electoradoN, fraccion] = await Promise.all([
      this.prisma.profile.count({ where: filtroElectorado(ambito) }),
      this.rules.getInt('revocacion.fraccion', null),
    ]);
    const umbral = Math.max(1, Math.ceil((electoradoN * fraccion) / 100));
    let id: string;
    try {
      const r = await this.prisma.revocacion.create({
        data: {
          cargoId,
          solicitanteProfileId: profileId,
          motivo: texto,
          electoradoN,
          fraccion,
          umbral,
          venceAt: new Date(now.getTime() + REVOCACION_PLAZO_DIAS * DIA_MS),
          // Quien pide, apoya: el primer apoyo va con el pedido.
          apoyos: { create: { profileId } },
        },
        select: { id: true },
      });
      id = r.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(PEDIDO_ABIERTO);
      }
      throw err;
    }
    // Sin actorId: el registro público no dice quién pidió.
    void this.audit.log({
      action: 'revocacion.abierta',
      resource: `revocacion:${id}`,
      metadata: { tipo: cargo.tipo, groupId: cargo.groupId, umbral },
    });
    // Con un electorado muy pequeño, el apoyo de quien pide ya alcanza.
    if (umbral <= 1) {
      const apoyos = await this.prisma.$transaction(async (tx) => {
        if (!(await this.bloquear(tx, id, now))) return null;
        return this.siLlega(tx, id, cargo, umbral, now);
      });
      if (apoyos !== null) await this.trasLograda(id, cargo, umbral, apoyos, now);
    }
    return { id };
  }

  // ─── Apoyos ───────────────────────────────────────────────────────────────

  async apoyar(profileId: string, revocacionId: string, now: Date): Promise<RevocacionVista> {
    const r = await this.abiertaPara(profileId, revocacionId, now);
    const apoyos = await this.prisma.$transaction(async (tx) => {
      if (!(await this.bloquear(tx, r.id, now))) throw new ConflictException(CERRADO);
      await tx.revocacionApoyo.createMany({ data: [{ revocacionId: r.id, profileId }], skipDuplicates: true });
      return this.siLlega(tx, r.id, r.cargo, r.umbral, now);
    });
    if (apoyos !== null) await this.trasLograda(r.id, r.cargo, r.umbral, apoyos, now);
    return this.vista(profileId, r.id, now);
  }

  async quitarApoyo(profileId: string, revocacionId: string, now: Date): Promise<RevocacionVista> {
    const r = await this.abiertaPara(profileId, revocacionId, now);
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.bloquear(tx, r.id, now))) throw new ConflictException(CERRADO);
      await tx.revocacionApoyo.deleteMany({ where: { revocacionId: r.id, profileId } });
    });
    return this.vista(profileId, r.id, now);
  }

  // ─── Vistas ───────────────────────────────────────────────────────────────

  /** Los pedidos abiertos de los cargos en cuyo electorado está la persona. */
  async listar(profileId: string, now: Date): Promise<RevocacionVista[]> {
    const filas = (await this.prisma.revocacion.findMany({
      where: { estado: 'abierta', venceAt: { gt: now }, cargo: { terminadoAt: null } },
      orderBy: { venceAt: 'asc' },
      select: SELECT_REVOCACION,
    })) as RevocacionFila[];
    const out: RevocacionVista[] = [];
    for (const r of filas) {
      if (!(await this.enElectorado(profileId, ambitoDe(r.cargo)))) continue;
      out.push(await this.armar(profileId, r, true, now));
    }
    return out;
  }

  /** Cuánto apoyo lleva el pedido abierto de cada cargo, para «Quiénes nos representan». */
  async resumenPorCargo(): Promise<Map<string, RevocacionResumen>> {
    const now = new Date();
    const filas = (await this.prisma.revocacion.findMany({
      where: { estado: 'abierta', venceAt: { gt: now }, cargo: { terminadoAt: null } },
      select: SELECT_REVOCACION,
    })) as RevocacionFila[];
    const m = new Map<string, RevocacionResumen>();
    for (const r of filas) {
      m.set(r.cargoId, {
        apoyos: await this.apoyosValidos(this.prisma, r.id, ambitoDe(r.cargo)),
        umbral: r.umbral,
        venceAt: r.venceAt.toISOString(),
      });
    }
    return m;
  }

  /** Cierra los pedidos cuyo plazo terminó sin llegar al umbral. Lo llama el programador. */
  async vencer(now: Date): Promise<number> {
    const r = await this.prisma.revocacion.updateMany({
      where: { estado: 'abierta', venceAt: { lte: now } },
      data: { estado: 'vencida' },
    });
    return r.count;
  }

  // ─── Ayudas ───────────────────────────────────────────────────────────────

  private async enElectorado(profileId: string, ambito: Ambito): Promise<boolean> {
    return (await this.prisma.profile.count({ where: { id: profileId, ...filtroElectorado(ambito) } })) > 0;
  }

  /** Apoyos que cuentan: solo los de quienes siguen en el electorado del cargo. */
  private async apoyosValidos(
    db: Pick<Prisma.TransactionClient, 'revocacionApoyo' | 'profile'>,
    revocacionId: string,
    ambito: Ambito,
  ): Promise<number> {
    const filas = await db.revocacionApoyo.findMany({ where: { revocacionId }, select: { profileId: true } });
    if (filas.length === 0) return 0;
    return db.profile.count({ where: { id: { in: filas.map((f) => f.profileId) }, ...filtroElectorado(ambito) } });
  }

  /** El pedido, comprobado para quien quiere apoyarlo o quitar su apoyo. */
  private async abiertaPara(profileId: string, revocacionId: string, now: Date): Promise<RevocacionFila> {
    const r = (await this.prisma.revocacion.findUnique({
      where: { id: revocacionId },
      select: SELECT_REVOCACION,
    })) as RevocacionFila | null;
    if (!r) throw new NotFoundException(NO_ENCONTRADA);
    if (!(await this.enElectorado(profileId, ambitoDe(r.cargo)))) throw new ForbiddenException(NO_ELECTORADO);
    if (r.cargo.profileId === profileId) throw new ForbiddenException(PROPIA);
    if (r.estado !== 'abierta' || r.venceAt.getTime() <= now.getTime() || r.cargo.terminadoAt !== null) {
      throw new ConflictException(CERRADO);
    }
    return r;
  }

  /** Bloquea el pedido dentro de la transacción; false si ya no está abierto. */
  private async bloquear(tx: Prisma.TransactionClient, id: string, now: Date): Promise<boolean> {
    const filas = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM revocaciones WHERE id = ${id}::uuid AND estado = 'abierta' AND "venceAt" > ${now} FOR UPDATE`,
    );
    return filas.length > 0;
  }

  /**
   * Con el pedido bloqueado: si los apoyos válidos llegan al umbral, lo marca logrado y deja el
   * cargo en funciones. Devuelve cuántos apoyos contó, o null si aún no llega (o si el cargo ya
   * terminó: entonces el pedido se cierra como vencido).
   */
  private async siLlega(
    tx: Prisma.TransactionClient,
    id: string,
    cargo: CargoFila,
    umbral: number,
    now: Date,
  ): Promise<number | null> {
    const apoyos = await this.apoyosValidos(tx, id, ambitoDe(cargo));
    if (apoyos < umbral) return null;
    const c = await tx.cargo.updateMany({ where: { id: cargo.id, terminadoAt: null }, data: { enFunciones: true } });
    // El cargo terminó (renuncia, suspensión) después de leerlo: el pedido ya no tiene objeto.
    if (c.count !== 1) {
      await tx.revocacion.update({ where: { id }, data: { estado: 'vencida' } });
      return null;
    }
    await tx.revocacion.update({ where: { id }, data: { estado: 'lograda', logradaAt: now } });
    return apoyos;
  }

  /**
   * Después del commit: abre la anticipada con lo que faltaba del mandato. Si no se abre (ya hay
   * una abierta, o al mandato le queda poco), el pedido queda logrado sin elección propia.
   */
  private async trasLograda(id: string, cargo: CargoFila, umbral: number, apoyos: number, now: Date): Promise<void> {
    const eleccionId = await this.convocatoria.anticipada(
      { groupId: cargo.groupId, cargo: cargo.tipo, mandatoHasta: cargo.hasta },
      now,
    );
    if (eleccionId) await this.prisma.revocacion.update({ where: { id }, data: { eleccionId } });
    void this.audit.log({
      action: 'revocacion.lograda',
      resource: `revocacion:${id}`,
      metadata: { tipo: cargo.tipo, groupId: cargo.groupId, umbral, apoyos },
    });
  }

  private async vista(profileId: string, revocacionId: string, now: Date): Promise<RevocacionVista> {
    const r = (await this.prisma.revocacion.findUnique({
      where: { id: revocacionId },
      select: SELECT_REVOCACION,
    })) as RevocacionFila | null;
    if (!r) throw new NotFoundException(NO_ENCONTRADA);
    return this.armar(profileId, r, await this.enElectorado(profileId, ambitoDe(r.cargo)), now);
  }

  /** Nunca incluye quién pidió ni quién apoyó: solo si apoyó quien mira. */
  private async armar(profileId: string, r: RevocacionFila, enElectorado: boolean, now: Date): Promise<RevocacionVista> {
    const [apoyos, mio] = await Promise.all([
      this.apoyosValidos(this.prisma, r.id, ambitoDe(r.cargo)),
      this.prisma.revocacionApoyo.findUnique({
        where: { revocacionId_profileId: { revocacionId: r.id, profileId } },
        select: { id: true },
      }),
    ]);
    return {
      id: r.id,
      cargoId: r.cargoId,
      tipo: r.cargo.tipo,
      persona: r.cargo.profile.displayName,
      comunidad: r.cargo.tipo === 'coordinador' ? r.cargo.group.name : null,
      motivo: r.motivo,
      apoyos,
      umbral: r.umbral,
      venceAt: r.venceAt.toISOString(),
      apoyaste: mio !== null,
      puedoApoyar:
        enElectorado && r.cargo.profileId !== profileId && r.estado === 'abierta' && r.venceAt.getTime() > now.getTime(),
    };
  }
}
