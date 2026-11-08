import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MODERACION_CAUSAS, textoParaRevisar } from '@decide/shared';
import type {
  CandidaturaVista,
  CargoTipoValue,
  EleccionDetalle,
  EleccionFaseValue,
  EleccionMotivoValue,
  EleccionResumen,
  RepresentantesVista,
  ResultadoEleccionVista,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GuardiaService, type OpcionesPublicar } from '../asistente/guardia.service';
import { Publicadores } from '../asistente/publicadores';
import { round5 } from '../frases/agregado';
import { ConvocatoriaService, filtroElectorado } from './convocatoria.service';
import { MESA, conOtroCargo } from './incompatibilidad';

const DIA_MS = 86_400_000;
/** Las elecciones contadas se siguen listando este tiempo. */
const CONTADAS_DIAS = 30;
/** Los duelos del resultado: pares consecutivos entre las primeras del orden final. */
const DUELOS_ENTRE = 4;
const ABIERTA = ['candidaturas', 'votacion'] as const;
const TERRITORIALES = ['territorial_origin', 'territorial_residence'] as const;

const NO_ELECTORADO = 'Esta elección es para otra comunidad o para cuentas verificadas.';
const NO_ENCONTRADA = 'Elección no encontrada.';
const PLAZO_CERRADO = 'El plazo para presentarse no está abierto.';
const VOTACION_CERRADA = 'La votación no está abierta.';

type Ficha = { presentacion: string; compromisos: string[] };
type Papeleta = { abstencion: boolean; orden: string[] };

type EleccionFila = {
  id: string;
  groupId: string;
  group: { id: string; name: string };
  cargo: CargoTipoValue;
  puestos: number;
  motivo: EleccionMotivoValue;
  jornadaId: string | null;
  fase: EleccionFaseValue;
  candidaturasEndsAt: Date;
  votacionEndsAt: Date;
  miembros: number | null;
  papeletasTotal: number | null;
  abstenciones: number | null;
  aprobaciones: number[];
  candidatasOrden: string[];
  pairwiseMatrix: Prisma.JsonValue | null;
  schulzeMatrix: Prisma.JsonValue | null;
  ordenFinal: string[];
  electas: string[];
  semilla: string | null;
  sinQuorum: boolean;
};

const SELECT_ELECCION = {
  id: true, groupId: true, group: { select: { id: true, name: true } }, cargo: true, puestos: true, motivo: true,
  jornadaId: true, fase: true, candidaturasEndsAt: true, votacionEndsAt: true, miembros: true, papeletasTotal: true,
  abstenciones: true, aprobaciones: true, candidatasOrden: true, pairwiseMatrix: true, schulzeMatrix: true,
  ordenFinal: true, electas: true, semilla: true, sinQuorum: true,
} as const;

const matriz = (v: Prisma.JsonValue | null | undefined): number[][] => (Array.isArray(v) ? (v as number[][]) : []);

/** Iniciales para el hexágono de la ficha: primera letra de las dos primeras palabras. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p) => p.length > 0);
  return partes
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase('es'))
    .join('');
}

const SELECT_FICHA = {
  id: true,
  profileId: true,
  presentacion: true,
  compromisos: true,
  profile: {
    select: {
      displayName: true,
      memberships: {
        where: { group: { type: { in: [...TERRITORIALES] } } },
        select: { group: { select: { name: true, type: true } } },
      },
    },
  },
} satisfies Prisma.CandidaturaSelect;

type FichaFila = {
  id: string;
  profileId: string;
  presentacion: string;
  compromisos: string[];
  profile: { displayName: string; memberships: { group: { name: string; type: string } }[] };
};

function vistaDeFicha(c: FichaFila, profileId: string): CandidaturaVista {
  return {
    id: c.id,
    nombre: c.profile.displayName,
    iniciales: iniciales(c.profile.displayName),
    comunidades: c.profile.memberships
      .filter((m) => (TERRITORIALES as readonly string[]).includes(m.group.type))
      .map((m) => m.group.name)
      .join(', '),
    presentacion: c.presentacion,
    compromisos: [...c.compromisos],
    esMia: c.profileId === profileId,
  };
}

/** «Tu ficha la ocultó la mesa: …», con la causa en lenguaje sencillo. */
function avisoOculta(causa: string | null): string {
  const etiqueta = MODERACION_CAUSAS.find((c) => c.value === causa)?.label;
  if (!etiqueta) return 'Tu ficha la ocultó la mesa.';
  return `Tu ficha la ocultó la mesa: ${etiqueta.charAt(0).toLocaleLowerCase('es')}${etiqueta.slice(1)}.`;
}

/** Orden al azar estable por persona: nadie gana por salir primero, y no cambia al recargar. */
function claveDeOrden(eleccionId: string, profileId: string, candidaturaId: string): string {
  return createHash('sha256').update(`${eleccionId}${profileId}${candidaturaId}`).digest('hex');
}

/**
 * Candidaturas, papeleta y vistas de las elecciones (3C-1). El voto es secreto: ninguna
 * respuesta dice quién votó qué; durante la votación solo se ve la participación redondeada.
 */
@Injectable()
export class EleccionesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly convocatoria: ConvocatoriaService,
    private readonly guardia: GuardiaService,
    private readonly publicadores: Publicadores,
  ) {}

  /** La revisión de la mesa publica una candidatura aprobada con la misma llamada. */
  onModuleInit(): void {
    this.publicadores.registrar('candidatura', (autor, args, opts) => {
      const a = args as { eleccionId: string; presentacion: string; compromisos: string[] };
      return this.presentarse(autor, a.eleccionId, { presentacion: a.presentacion, compromisos: a.compromisos }, opts);
    });
    this.publicadores.registrar(
      'candidatura',
      (autor, args, opts) => {
        const a = args as { eleccionId: string; presentacion: string; compromisos: string[] };
        return this.editar(autor, a.eleccionId, { presentacion: a.presentacion, compromisos: a.compromisos }, opts);
      },
      'editar',
    );
  }

  // ─── Vistas ───────────────────────────────────────────────────────────────

  /** Abiertas y contadas en los últimos 30 días donde la persona está en el electorado. */
  async listar(profileId: string, now = new Date()): Promise<EleccionResumen[]> {
    const filas = (await this.prisma.eleccion.findMany({
      where: {
        OR: [
          { fase: { in: [...ABIERTA] } },
          { fase: 'contada', contadaAt: { gte: new Date(now.getTime() - CONTADAS_DIAS * DIA_MS) } },
        ],
      },
      orderBy: [{ votacionEndsAt: 'asc' }, { createdAt: 'asc' }],
      select: SELECT_ELECCION,
    })) as EleccionFila[];
    const mias: EleccionFila[] = [];
    for (const e of filas) {
      if (await this.convocatoria.enElectorado(profileId, e)) mias.push(e);
    }
    if (mias.length === 0) return [];
    // Solo las papeletas propias: nunca las de otra persona.
    const votadas = await this.prisma.papeletaEleccion.findMany({
      where: { profileId, eleccionId: { in: mias.map((e) => e.id) } },
      select: { eleccionId: true },
    });
    const yaVote = new Set(votadas.map((p) => p.eleccionId));
    const out: EleccionResumen[] = [];
    for (const e of mias) out.push(await this.resumen(profileId, e, yaVote.has(e.id), now));
    return out;
  }

  async detalle(profileId: string, eleccionId: string, now = new Date()): Promise<EleccionDetalle> {
    const e = await this.eleccion(eleccionId);
    if (!(await this.convocatoria.enElectorado(profileId, e))) throw new ForbiddenException(NO_ELECTORADO);

    const [filas, papeleta, mia] = await Promise.all([
      this.prisma.candidatura.findMany({
        where: { eleccionId: e.id, oculta: false, retiradaAt: null },
        select: SELECT_FICHA,
      }),
      // La papeleta propia, leída por su clave única.
      this.prisma.papeletaEleccion.findUnique({
        where: { eleccionId_profileId: { eleccionId: e.id, profileId } },
        select: { abstencion: true, orden: true },
      }),
      // La ficha propia, aunque esté oculta: solo la ve quien se presentó.
      this.prisma.candidatura.findUnique({
        where: { eleccionId_profileId: { eleccionId: e.id, profileId } },
        select: { ...SELECT_FICHA, oculta: true, ocultaCausa: true, retiradaAt: true },
      }),
    ]);

    const candidaturas: CandidaturaVista[] = filas
      .map((c) => ({ c, k: claveDeOrden(e.id, profileId, c.id) }))
      .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
      .map(({ c }) => vistaDeFicha(c, profileId));

    const nombres = new Map(candidaturas.map((c) => [c.id, c]));
    return {
      ...(await this.resumen(profileId, e, papeleta !== null, now)),
      candidaturas,
      miPapeleta: papeleta ? { abstencion: papeleta.abstencion, orden: [...papeleta.orden] } : null,
      miCandidatura:
        mia && mia.retiradaAt === null
          ? { ficha: vistaDeFicha(mia, profileId), oculta: mia.oculta, aviso: mia.oculta ? avisoOculta(mia.ocultaCausa) : null }
          : null,
      resultado: e.fase === 'contada' ? this.resultado(e, nombres) : null,
    };
  }

  /** «Quiénes nos representan»: pública. Solo el nombre visible, nunca el correo. */
  async representantes(): Promise<RepresentantesVista> {
    const [asientos, cargos, comunidades, abiertas] = await Promise.all([
      this.prisma.boardSeat.findMany({
        select: { role: true, source: true, since: true, profileId: true, profile: { select: { displayName: true } } },
      }),
      this.prisma.cargo.findMany({
        where: { terminadoAt: null },
        orderBy: { desde: 'asc' },
        select: {
          tipo: true, groupId: true, profileId: true, desde: true, hasta: true, enFunciones: true,
          profile: { select: { displayName: true } },
        },
      }),
      this.prisma.group.findMany({
        where: { type: { in: [...TERRITORIALES] }, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, activadaAt: true },
      }),
      this.prisma.eleccion.findMany({
        where: { cargo: 'coordinador', fase: { in: [...ABIERTA] } },
        select: { groupId: true },
      }),
    ]);

    const persona = (nombre: string) => ({ nombre, iniciales: iniciales(nombre) });
    const mesa: RepresentantesVista['mesa'] = [];
    for (const tipo of MESA) {
      const a = asientos.find((s) => (s.role as string) === tipo);
      if (!a) continue;
      // Un asiento fundador no tiene fila Cargo: sigue «en funciones» hasta que se elija el puesto.
      if (a.source === 'fundador') {
        mesa.push({
          tipo, ...persona(a.profile.displayName), desde: a.since.toISOString(), hasta: null, enFunciones: true, fundador: true,
        });
        continue;
      }
      const c = cargos.find((x) => x.tipo === tipo && x.profileId === a.profileId);
      mesa.push({
        tipo,
        ...persona(a.profile.displayName),
        desde: (c?.desde ?? a.since).toISOString(),
        hasta: c ? c.hasta.toISOString() : null,
        enFunciones: c?.enFunciones ?? false,
        fundador: false,
      });
    }

    const observadores = cargos
      .filter((c) => c.tipo === 'observador')
      .map((c) => ({ ...persona(c.profile.displayName), desde: c.desde.toISOString(), hasta: c.hasta.toISOString() }));

    const conEleccion = new Set(abiertas.map((e) => e.groupId));
    return {
      mesa,
      observadores,
      comunidades: comunidades.map((g) => ({
        id: g.id,
        nombre: g.name,
        activa: g.activadaAt !== null,
        coordinadores: cargos
          .filter((c) => c.tipo === 'coordinador' && c.groupId === g.id)
          .map((c) => ({
            ...persona(c.profile.displayName),
            desde: c.desde.toISOString(),
            hasta: c.hasta.toISOString(),
            enFunciones: c.enFunciones,
          })),
        eleccionAbierta: conEleccion.has(g.id),
      })),
    };
  }

  // ─── Candidaturas ─────────────────────────────────────────────────────────

  async presentarse(
    profileId: string,
    eleccionId: string,
    ficha: Ficha,
    opts: OpcionesPublicar = {},
  ): Promise<{ id: string }> {
    const e = await this.eleccion(eleccionId);
    if (!(await this.convocatoria.enElectorado(profileId, e))) throw new ForbiddenException(NO_ELECTORADO);
    const existente = await this.prisma.candidatura.findUnique({
      where: { eleccionId_profileId: { eleccionId: e.id, profileId } },
      select: { id: true, oculta: true, retiradaAt: true },
    });
    const motivo = await this.motivoNoPuede(profileId, e, existente, new Date());
    if (motivo) throw new BadRequestException(motivo);

    const presentacion = ficha.presentacion.trim();
    const compromisos = ficha.compromisos.map((c) => c.trim()).filter((c) => c.length > 0);
    // Se revisa antes de publicar; después, la mesa puede ocultarla con dos firmas
    // (acción ocultar_candidatura en BoardService).
    await this.guardia.antesDePublicar({
      tipo: 'candidatura',
      texto: textoParaRevisar(presentacion, ...compromisos),
      autorProfileId: profileId,
      args: { eleccionId: e.id, presentacion, compromisos },
      ...opts,
    });

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.bloquearFase(tx, e.id, 'candidaturas', PLAZO_CERRADO);
        // Bloquea a la persona y repite la comprobación: dos presentaciones a la vez a elecciones
        // distintas se ordenan aquí, y la segunda ve la primera.
        await tx.$queryRaw(Prisma.sql`SELECT id FROM profiles WHERE id = ${profileId}::uuid FOR UPDATE`);
        const otra = await this.motivoPorOtroCargo(tx, profileId, e);
        if (otra) throw new BadRequestException(otra);
        const datos = { presentacion, compromisos };
        if (existente) {
          // Volver a presentarse tras retirarse: la misma fila (única por elección y persona).
          const r = await tx.candidatura.update({ where: { id: existente.id }, data: { ...datos, retiradaAt: null } });
          return r.id;
        }
        const r = await tx.candidatura.create({ data: { eleccionId: e.id, profileId, ...datos } });
        return r.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya te presentaste a esta elección.');
      }
      throw err;
    }
    void this.audit.log({ action: 'candidatura.presentada', resource: `candidatura:${id}`, metadata: { eleccionId: e.id } });
    return { id };
  }

  /**
   * Cambia la ficha propia mientras dure el plazo de candidaturas. Pasa otra vez por la revisión
   * previa y quita la ocultación de la mesa (si la vuelve a ver mal, puede ocultarla de nuevo).
   */
  async editar(profileId: string, eleccionId: string, ficha: Ficha, opts: OpcionesPublicar = {}): Promise<{ id: string }> {
    const e = await this.eleccion(eleccionId);
    if (!(await this.convocatoria.enElectorado(profileId, e))) throw new ForbiddenException(NO_ELECTORADO);
    if (e.fase !== 'candidaturas' || Date.now() >= e.candidaturasEndsAt.getTime()) {
      throw new BadRequestException('La ficha solo se cambia durante el plazo de candidaturas.');
    }
    const c = await this.prisma.candidatura.findUnique({
      where: { eleccionId_profileId: { eleccionId: e.id, profileId } },
      select: { id: true, retiradaAt: true },
    });
    if (!c || c.retiradaAt) throw new BadRequestException('No tienes una candidatura en esta elección.');

    const presentacion = ficha.presentacion.trim();
    const compromisos = ficha.compromisos.map((x) => x.trim()).filter((x) => x.length > 0);
    await this.guardia.antesDePublicar({
      tipo: 'candidatura',
      texto: textoParaRevisar(presentacion, ...compromisos),
      autorProfileId: profileId,
      args: { via: 'editar', eleccionId: e.id, presentacion, compromisos },
      ...opts,
    });
    const canceladas = await this.prisma.$transaction(async (tx) => {
      await this.bloquearFase(tx, e.id, 'candidaturas', 'La ficha solo se cambia durante el plazo de candidaturas.');
      // Si se retiró entre la lectura y aquí, no se edita.
      const r = await tx.candidatura.updateMany({
        where: { id: c.id, retiradaAt: null },
        data: { presentacion, compromisos, oculta: false, ocultaCausa: null },
      });
      if (r.count === 0) throw new BadRequestException('No tienes una candidatura en esta elección.');
      // Una propuesta pendiente de ocultarla juzgaba el texto anterior: se cancela. Si la mesa
      // ve mal el nuevo, propone otra.
      const a = await tx.boardAction.updateMany({
        where: { type: 'ocultar_candidatura', status: 'pending', params: { path: ['candidaturaId'], equals: c.id } },
        data: { status: 'rejected', resolvedAt: new Date() },
      });
      return a.count;
    });
    void this.audit.log({ action: 'candidatura.editada', resource: `candidatura:${c.id}`, metadata: { eleccionId: e.id } });
    if (canceladas > 0) {
      void this.audit.log({
        action: 'candidatura.ocultacion_cancelada',
        resource: `candidatura:${c.id}`,
        metadata: { eleccionId: e.id, acciones: canceladas },
      });
    }
    return { id: c.id };
  }

  /** Retira la candidatura propia. Solo antes de la votación. */
  async retirarse(profileId: string, eleccionId: string): Promise<void> {
    const e = await this.eleccion(eleccionId);
    if (e.fase !== 'candidaturas' || Date.now() >= e.candidaturasEndsAt.getTime()) {
      throw new BadRequestException('Ya no puedes retirarte: la votación empezó.');
    }
    const c = await this.prisma.candidatura.findUnique({
      where: { eleccionId_profileId: { eleccionId: e.id, profileId } },
      select: { id: true, retiradaAt: true },
    });
    if (!c || c.retiradaAt) throw new BadRequestException('No tienes una candidatura en esta elección.');
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearFase(tx, e.id, 'candidaturas', 'Ya no puedes retirarte: la votación empezó.');
      await tx.candidatura.update({ where: { id: c.id }, data: { retiradaAt: new Date() } });
    });
    void this.audit.log({ action: 'candidatura.retirada', resource: `candidatura:${c.id}`, metadata: { eleccionId: e.id } });
  }

  // ─── Papeleta ─────────────────────────────────────────────────────────────

  /**
   * Guarda o cambia la papeleta propia mientras la votación esté abierta. `orden` vacío sin
   * abstención es «Rechazo a todas». No se audita (como los votos de las decisiones): la auditoría
   * daría la participación exacta durante la votación; el total queda en `eleccion.contada`.
   */
  async votar(profileId: string, eleccionId: string, p: Papeleta): Promise<void> {
    const e = await this.eleccion(eleccionId);
    if (e.fase !== 'votacion' || Date.now() >= e.votacionEndsAt.getTime()) throw new BadRequestException(VOTACION_CERRADA);
    if (!(await this.convocatoria.enElectorado(profileId, e))) throw new ForbiddenException(NO_ELECTORADO);
    if (p.abstencion && p.orden.length > 0) throw new BadRequestException('Si te abstienes, no ordenes ninguna candidatura.');
    if (new Set(p.orden).size !== p.orden.length) {
      throw new BadRequestException('Cada candidatura puede aparecer una sola vez en tu orden.');
    }
    const vivas = await this.prisma.candidatura.findMany({
      where: { eleccionId: e.id, oculta: false, retiradaAt: null },
      select: { id: true },
    });
    const validas = new Set(vivas.map((c) => c.id));
    if (p.orden.some((id) => !validas.has(id))) {
      throw new BadRequestException('Tu orden incluye una candidatura que no está en esta elección.');
    }
    const valor = { abstencion: p.abstencion, orden: [...p.orden] };
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearFase(tx, e.id, 'votacion', VOTACION_CERRADA);
      await tx.papeletaEleccion.upsert({
        where: { eleccionId_profileId: { eleccionId: e.id, profileId } },
        create: { eleccionId: e.id, profileId, ...valor },
        update: valor,
      });
    });
  }

  // ─── Ayudas ───────────────────────────────────────────────────────────────

  private async eleccion(id: string): Promise<EleccionFila> {
    const e = (await this.prisma.eleccion.findUnique({ where: { id }, select: SELECT_ELECCION })) as EleccionFila | null;
    if (!e) throw new NotFoundException(NO_ENCONTRADA);
    return e;
  }

  /**
   * Relee la elección con bloqueo compartido dentro de la transacción: si el programador ya la
   * movió de fase o el plazo venció, no se escribe (el cambio de fase espera a que termine).
   */
  private async bloquearFase(
    tx: Prisma.TransactionClient,
    id: string,
    fase: 'candidaturas' | 'votacion',
    mensaje: string,
  ): Promise<void> {
    const ahora = new Date();
    const abierta = await tx.$queryRaw<{ id: string }[]>(
      fase === 'candidaturas'
        ? Prisma.sql`SELECT id FROM elecciones WHERE id = ${id}::uuid AND fase = 'candidaturas' AND "candidaturasEndsAt" > ${ahora} FOR SHARE`
        : Prisma.sql`SELECT id FROM elecciones WHERE id = ${id}::uuid AND fase = 'votacion' AND "votacionEndsAt" > ${ahora} FOR SHARE`,
    );
    if (abierta.length === 0) throw new BadRequestException(mensaje);
  }

  /**
   * Por qué la persona (ya en el electorado) no puede presentarse; null si puede. Un cargo a la
   * vez: ni dos candidaturas vivas en elecciones abiertas, ni un cargo incompatible (la misma
   * regla con que se excluye al contar).
   */
  private async motivoNoPuede(
    profileId: string,
    e: EleccionFila,
    existente: { oculta: boolean; retiradaAt: Date | null } | null,
    now: Date,
  ): Promise<string | null> {
    if (e.fase !== 'candidaturas' || now.getTime() >= e.candidaturasEndsAt.getTime()) return PLAZO_CERRADO;
    if (existente && existente.retiradaAt === null) return 'Ya te presentaste a esta elección.';
    if (existente?.oculta) return 'Tu candidatura a esta elección fue ocultada por moderación.';
    return this.motivoPorOtroCargo(this.prisma, profileId, e);
  }

  /**
   * Un cargo a la vez: una candidatura viva en otra elección abierta (de cualquier jornada) o un
   * cargo incompatible. Se repite dentro de la transacción, con la persona bloqueada.
   */
  private async motivoPorOtroCargo(
    db: Pick<PrismaService, 'candidatura' | 'cargo' | 'boardSeat'> | Prisma.TransactionClient,
    profileId: string,
    e: EleccionFila,
  ): Promise<string | null> {
    const otra = await db.candidatura.findFirst({
      where: { profileId, retiradaAt: null, eleccionId: { not: e.id }, eleccion: { fase: { in: [...ABIERTA] } } },
      select: { id: true },
    });
    if (otra) return 'Ya te presentaste a otro cargo. Solo puedes presentarte a uno a la vez.';
    const incompatibles = await conOtroCargo(db as Pick<PrismaService, 'cargo' | 'boardSeat'>, e, [profileId]);
    if (incompatibles.has(profileId)) {
      return 'Ya ocupas otro cargo. Solo puedes presentarte a la renovación del tuyo.';
    }
    return null;
  }

  private async resumen(profileId: string, e: EleccionFila, yaVote: boolean, now: Date): Promise<EleccionResumen> {
    let puedoPresentarme = false;
    if (e.fase === 'candidaturas') {
      const existente = await this.prisma.candidatura.findUnique({
        where: { eleccionId_profileId: { eleccionId: e.id, profileId } },
        select: { oculta: true, retiradaAt: true },
      });
      puedoPresentarme = (await this.motivoNoPuede(profileId, e, existente, now)) === null;
    }
    let participacionAprox: number | null = null;
    if (e.fase === 'votacion') {
      // Solo un número redondeado, sin decir quién votó.
      const n = await this.prisma.papeletaEleccion.count({ where: { eleccionId: e.id, profile: filtroElectorado(e) } });
      participacionAprox = n > 0 ? Math.max(5, round5(n)) : 0;
    }
    return {
      id: e.id,
      cargo: e.cargo,
      ambito: { id: e.group.id, nombre: e.group.name },
      puestos: e.puestos,
      fase: e.fase,
      motivo: e.motivo,
      candidaturasEndsAt: e.candidaturasEndsAt.toISOString(),
      votacionEndsAt: e.votacionEndsAt.toISOString(),
      jornadaId: e.jornadaId,
      puedoPresentarme,
      yaVote,
      participacionAprox,
    };
  }

  /** El resultado completo de una elección contada (las matrices solo existen después del conteo). */
  private resultado(e: EleccionFila, fichas: Map<string, CandidaturaVista>): ResultadoEleccionVista {
    const nombre = (id: string): string => fichas.get(id)?.nombre ?? 'Candidatura retirada u oculta';
    const total = e.papeletasTotal ?? 0;
    const validas = total - (e.abstenciones ?? 0);
    const electas = new Set(e.electas);
    const pairwise = matriz(e.pairwiseMatrix);
    const pos = new Map(e.candidatasOrden.map((id, i) => [id, i]));

    const duelos: ResultadoEleccionVista['duelos'] = [];
    const primeras = e.ordenFinal.slice(0, DUELOS_ENTRE);
    for (let k = 0; k + 1 < primeras.length; k++) {
      const a = pos.get(primeras[k]!);
      const b = pos.get(primeras[k + 1]!);
      if (a === undefined || b === undefined) continue;
      duelos.push({
        gana: primeras[k]!,
        pierde: primeras[k + 1]!,
        aFavor: pairwise[a]?.[b] ?? 0,
        enContra: pairwise[b]?.[a] ?? 0,
      });
    }

    return {
      electas: e.electas.map((id, i) => ({
        candidaturaId: id,
        nombre: nombre(id),
        iniciales: iniciales(fichas.get(id)?.nombre ?? ''),
        lugar: i + 1,
      })),
      vacantes: Math.max(e.puestos - e.electas.length, 0),
      sinQuorum: e.sinQuorum,
      papeletasTotal: total,
      abstenciones: e.abstenciones ?? 0,
      miembros: e.miembros ?? 0,
      // Las ocultas por moderación siguen en las matrices (para verificar), no en las filas.
      filas: e.candidatasOrden
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => fichas.has(id) || electas.has(id))
        .map(({ id, i }) => ({
          candidaturaId: id,
          nombre: nombre(id),
          aparece: e.aprobaciones[i] ?? 0,
          validas,
          electa: electas.has(id),
        })),
      duelos,
      candidatasOrden: [...e.candidatasOrden],
      pairwiseMatrix: pairwise,
      schulzeMatrix: matriz(e.schulzeMatrix),
      semilla: e.semilla,
    };
  }
}
