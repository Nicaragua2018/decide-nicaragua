import { ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { AuditListResponse } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueryAuditEventsDto } from '../audit/dto/query-events.dto';
import { GuardiaService, type OpcionesPublicar } from '../asistente/guardia.service';
import { Publicadores } from '../asistente/publicadores';
import { esObservadorVigente, SOLO_OBSERVADORES } from './observador.guard';

const RECIENTES = 50;
const EVENTO_NO_EXISTE = 'Ese evento no existe.';

export type VerificacionStat = { nombre: string; invitador: number; segunda: number };
export type GastoMes = { mes: string; usd: number };
type Etiquetado = { id: string; nombre: string };
type Matrices = { pairwiseMatrix: unknown; schulzeMatrix: unknown };

export type MatricesVista = {
  elecciones: (Matrices & {
    id: string;
    titulo: string;
    fecha: string | null;
    candidaturas: Etiquetado[];
    ordenFinal: string[];
    electas: string[];
    papeletasTotal: number | null;
    sinQuorum: boolean;
    semilla: string | null;
  })[];
  decisiones: (Matrices & {
    id: string;
    titulo: string;
    fecha: string | null;
    resultado: string | null;
    opciones: Etiquetado[];
    ganadoras: string[];
    aprobaciones: number[];
    papeletasTotal: number | null;
  })[];
  votaciones: (Matrices & {
    id: string;
    titulo: string;
    fecha: string;
    opciones: Etiquetado[];
    ganadoras: string[];
    totalPapeletas: number;
  })[];
  sorteos: { id: string; titulo: string; fecha: string | null; tamano: number; algoritmo: string | null; semilla: string | null }[];
};

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
/** Las etiquetas salen en el mismo orden que `orden` (el de las matrices); un id sin ficha se omite. */
const etiquetar = (orden: string[], nombres: Map<string, string>): Etiquetado[] =>
  orden.filter((id) => nombres.has(id)).map((id) => ({ id, nombre: nombres.get(id)! }));

/**
 * La página «Observar» (3C-2): lectura del registro y de las cuentas para quienes observan, y las
 * observaciones públicas que dejan sobre un hecho del registro. Nunca expone papeletas ni quién votó.
 */
@Injectable()
export class ObservarService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly guardia: GuardiaService,
    private readonly publicadores: Publicadores,
  ) {}

  /**
   * La revisión de la mesa publica una observación aprobada con la misma llamada. Si el autor ya no
   * observa o el evento ya no existe, el error sube y la revisión marca el texto como no publicable.
   */
  onModuleInit(): void {
    this.publicadores.registrar('observacion', (autor, args, opts) => {
      const a = args as { auditEventId: string; texto: string };
      return this.observar(autor, { auditEventId: a.auditEventId, texto: a.texto }, opts);
    });
  }

  eventos(dto: QueryAuditEventsDto): Promise<AuditListResponse> {
    return this.audit.getEvents(dto);
  }

  /** Cuántas personas confirmó cada quien, por tipo de confirmación; de más a menos. */
  async verificaciones(): Promise<VerificacionStat[]> {
    const grupos = await this.prisma.verificationReference.groupBy({
      by: ['refereeProfileId', 'kind'],
      _count: { _all: true },
    });
    const perfiles = await this.prisma.profile.findMany({
      where: { id: { in: [...new Set(grupos.map((g) => g.refereeProfileId))] } },
      select: { id: true, displayName: true },
    });
    const nombres = new Map(perfiles.map((p) => [p.id, p.displayName]));
    const porPersona = new Map<string, VerificacionStat>();
    for (const g of grupos) {
      const fila = porPersona.get(g.refereeProfileId) ?? { nombre: nombres.get(g.refereeProfileId) ?? '', invitador: 0, segunda: 0 };
      fila[g.kind === 'invitador' ? 'invitador' : 'segunda'] += g._count._all;
      porPersona.set(g.refereeProfileId, fila);
    }
    return [...porPersona.values()].sort(
      (a, b) => b.invitador + b.segunda - (a.invitador + a.segunda) || a.nombre.localeCompare(b.nombre, 'es'),
    );
  }

  /** Las 50 más recientes de cada clase, con lo justo para releer las matrices y repetir el conteo. */
  async matrices(): Promise<MatricesVista> {
    const [elecciones, decisiones, resultados, sorteos] = await Promise.all([
      this.prisma.eleccion.findMany({
        where: { fase: 'contada' },
        orderBy: { contadaAt: 'desc' },
        take: RECIENTES,
        select: {
          id: true, cargo: true, contadaAt: true, candidatasOrden: true, ordenFinal: true, electas: true,
          pairwiseMatrix: true, schulzeMatrix: true, semilla: true, papeletasTotal: true, sinQuorum: true,
          group: { select: { name: true } },
        },
      }),
      this.prisma.decision.findMany({
        where: { fase: 'contada' },
        orderBy: { contadaAt: 'desc' },
        take: RECIENTES,
        select: {
          id: true, contadaAt: true, resultado: true, candidatas: true, ganadoras: true, aprobaciones: true,
          pairwiseMatrix: true, schulzeMatrix: true, papeletasTotal: true,
          proposal: { select: { title: true } },
        },
      }),
      this.prisma.electionResult.findMany({
        orderBy: { computedAt: 'desc' },
        take: RECIENTES,
        select: {
          id: true, winners: true, candidateOrder: true, pairwiseMatrix: true, schulzeMatrix: true,
          totalBallots: true, computedAt: true, election: { select: { title: true } },
        },
      }),
      this.prisma.sortitionDraw.findMany({
        where: { status: 'completed' },
        orderBy: { executedAt: 'desc' },
        take: RECIENTES,
        select: { id: true, title: true, executedAt: true, seed: true, algorithm: true, selectionSize: true },
      }),
    ]);

    const [candidaturas, soluciones, opciones] = await Promise.all([
      this.prisma.candidatura.findMany({
        where: { id: { in: elecciones.flatMap((e) => e.candidatasOrden) } },
        select: { id: true, profile: { select: { displayName: true } } },
      }),
      this.prisma.solucion.findMany({
        where: { id: { in: decisiones.flatMap((d) => d.candidatas) } },
        select: { id: true, title: true },
      }),
      this.prisma.electionCandidate.findMany({
        where: { id: { in: resultados.flatMap((r) => ids(r.candidateOrder)) } },
        select: { id: true, title: true },
      }),
    ]);
    const nombreCandidatura = new Map(candidaturas.map((c) => [c.id, c.profile.displayName]));
    const tituloSolucion = new Map(soluciones.map((s) => [s.id, s.title]));
    const tituloOpcion = new Map(opciones.map((o) => [o.id, o.title]));

    return {
      elecciones: elecciones.map((e) => ({
        id: e.id,
        titulo: `${e.cargo} · ${e.group.name}`,
        fecha: iso(e.contadaAt),
        candidaturas: etiquetar(e.candidatasOrden, nombreCandidatura),
        ordenFinal: e.ordenFinal,
        electas: e.electas,
        papeletasTotal: e.papeletasTotal,
        sinQuorum: e.sinQuorum,
        pairwiseMatrix: e.pairwiseMatrix,
        schulzeMatrix: e.schulzeMatrix,
        semilla: e.semilla,
      })),
      decisiones: decisiones.map((d) => ({
        id: d.id,
        titulo: d.proposal.title,
        fecha: iso(d.contadaAt),
        resultado: d.resultado,
        opciones: etiquetar(d.candidatas, tituloSolucion),
        ganadoras: d.ganadoras,
        aprobaciones: d.aprobaciones,
        papeletasTotal: d.papeletasTotal,
        pairwiseMatrix: d.pairwiseMatrix,
        schulzeMatrix: d.schulzeMatrix,
      })),
      votaciones: resultados.map((r) => ({
        id: r.id,
        titulo: r.election.title,
        fecha: r.computedAt.toISOString(),
        opciones: etiquetar(ids(r.candidateOrder), tituloOpcion),
        ganadoras: ids(r.winners),
        totalPapeletas: r.totalBallots,
        pairwiseMatrix: r.pairwiseMatrix,
        schulzeMatrix: r.schulzeMatrix,
      })),
      sorteos: sorteos.map((s) => ({
        id: s.id,
        titulo: s.title,
        fecha: iso(s.executedAt),
        tamano: s.selectionSize,
        algoritmo: s.algorithm,
        semilla: s.seed,
      })),
    };
  }

  /** Lo que ha costado el asistente cada mes, en dólares; el mes más nuevo primero. */
  async gastos(): Promise<GastoMes[]> {
    const filas = await this.prisma.usoAsistente.findMany({
      orderBy: { mes: 'desc' },
      select: { mes: true, costoMicrodolares: true },
    });
    return filas.map((f) => ({ mes: f.mes, usd: Math.round(Number(f.costoMicrodolares) / 10_000) / 100 }));
  }

  /**
   * Publica una observación sobre un evento del registro. El evento se comprueba antes de la
   * guardia para no mandar a revisión una observación imposible.
   */
  async observar(
    profileId: string,
    dto: { auditEventId: string; texto: string; pedirRevision?: boolean | undefined },
    opts: OpcionesPublicar = {},
  ): Promise<{ id: string }> {
    const texto = dto.texto.trim();
    await this.comprobar(profileId, dto.auditEventId);
    const { revisado } = await this.guardia.antesDePublicar({
      tipo: 'observacion',
      texto,
      autorProfileId: profileId,
      args: { auditEventId: dto.auditEventId, texto },
      pedirRevision: dto.pedirRevision,
      ...opts,
    });
    const { id } = await this.prisma.observacionPublica.create({
      data: { autorProfileId: profileId, auditEventId: dto.auditEventId, texto },
      select: { id: true },
    });
    // El texto libre no va al registro: se lee en la observación misma.
    void this.audit.log({
      action: 'observacion.publicada',
      resource: `observacion:${id}`,
      metadata: { auditEventId: dto.auditEventId },
    });
    // Sin revisión del asistente, la revisa después (nivel 3); si es de nivel 2, se borra.
    await this.guardia.despuesDePublicar('observacion', id, revisado);
    return { id };
  }

  private async comprobar(profileId: string, auditEventId: string): Promise<void> {
    const evento = await this.prisma.auditEvent.findUnique({ where: { id: auditEventId }, select: { id: true } });
    if (!evento) throw new NotFoundException(EVENTO_NO_EXISTE);
    if (!(await esObservadorVigente(this.prisma, profileId))) throw new ForbiddenException(SOLO_OBSERVADORES);
  }
}
