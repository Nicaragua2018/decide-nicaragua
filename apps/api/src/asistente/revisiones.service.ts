import { ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { EstadoTextoEnRevision, TextoEnRevisionView, TipoTexto } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BoardService } from '../board/board.service';
import { Publicadores } from './publicadores';
import { nombreDeError } from './errores';

/** Firmas de personas distintas de la mesa para aprobar (o para rechazar). */
const FIRMAS_PARA_RESOLVER = 2;
const MOTIVO_GENERICO = 'No se pudo publicar';
/** Vencidos y no publicables guardan el texto 30 días para que la persona lo reformule; después se borra. */
const DIAS_RETENCION = 30;
const DIA_MS = 86_400_000;
/** Lo que se borra de una revisión resuelta: el texto y los argumentos (que también lo contienen). */
const SIN_TEXTO = { texto: '', args: {} } as const;

type RevisionConFirmas = Prisma.TextoEnRevisionGetPayload<{ include: { firmas: true } }>;

type Transicion =
  | { accion: 'ninguna' }
  | { accion: 'rechazada' }
  | { accion: 'publicar'; tipo: TipoTexto; autorProfileId: string; args: unknown };

@Injectable()
export class RevisionesService {
  private readonly logger = new Logger(RevisionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly board: BoardService,
    private readonly publicadores: Publicadores,
    private readonly audit: AuditService,
  ) {}

  /** Los textos de nivel 2 que la persona pidió revisar, de cualquier estado. */
  async misRevisiones(profileId: string): Promise<TextoEnRevisionView[]> {
    const filas = await this.prisma.textoEnRevision.findMany({
      where: { autorProfileId: profileId },
      include: { firmas: true },
      orderBy: { creadoAt: 'desc' },
    });
    return filas.map((f) => this.vista(f, null));
  }

  /**
   * Solo la mesa (o un suplente provisional). Las pendientes, y si hay firmantes suficientes (2 o
   * más entre la mesa verificada y los suplentes) para resolverlas.
   */
  async listarPendientes(profileId: string): Promise<{ mesaSuficiente: boolean; revisiones: TextoEnRevisionView[] }> {
    await this.exigirMesa(profileId);
    const [filas, firmantes] = await Promise.all([
      this.prisma.textoEnRevision.findMany({
        where: { estado: 'pendiente' },
        include: { firmas: true },
        orderBy: { venceAt: 'asc' },
      }),
      this.board.firmantesDisponibles(),
    ]);
    return { mesaSuficiente: firmantes >= FIRMAS_PARA_RESOLVER, revisiones: filas.map((f) => this.vista(f, profileId)) };
  }

  /**
   * Una firma de la mesa. Con 2 aprobaciones se publica (una sola vez) y con 2 rechazos se rechaza.
   * La revisión se bloquea con SELECT … FOR UPDATE; la publicación ocurre después de confirmar la transacción,
   * y solo por quien hizo la transición pendiente → publicando.
   */
  async firmar(profileId: string, id: string, aprobar: boolean): Promise<TextoEnRevisionView> {
    await this.exigirMesa(profileId);
    const ahora = new Date();
    let transicion: Transicion;
    try {
      transicion = await this.prisma.$transaction(async (tx): Promise<Transicion> => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM textos_en_revision WHERE id = ${id}::uuid FOR UPDATE`);
        const rev = await tx.textoEnRevision.findUnique({ where: { id } });
        if (!rev) throw new NotFoundException('Esa revisión no existe.');
        if (rev.estado !== 'pendiente' || rev.venceAt <= ahora) throw new ConflictException('Esta revisión ya se resolvió.');
        if (rev.autorProfileId === profileId) throw new ForbiddenException('No puedes firmar la revisión de tu propio texto.');

        await tx.firmaRevision.create({ data: { revisionId: id, profileId, aprobar } });
        const firmas = await tx.firmaRevision.findMany({ where: { revisionId: id }, select: { aprobar: true } });
        const aFavor = firmas.filter((f) => f.aprobar).length;
        const enContra = firmas.length - aFavor;

        if (aFavor >= FIRMAS_PARA_RESOLVER) {
          const r = await tx.textoEnRevision.updateMany({
            where: { id, estado: 'pendiente' },
            data: { estado: 'publicando' },
          });
          if (r.count === 0) return { accion: 'ninguna' };
          return { accion: 'publicar', tipo: rev.tipo as TipoTexto, autorProfileId: rev.autorProfileId, args: rev.args };
        }
        if (enContra >= FIRMAS_PARA_RESOLVER) {
          const r = await tx.textoEnRevision.updateMany({
            where: { id, estado: 'pendiente' },
            data: { estado: 'rechazado', resueltoAt: ahora, ...SIN_TEXTO },
          });
          return r.count === 0 ? { accion: 'ninguna' } : { accion: 'rechazada' };
        }
        return { accion: 'ninguna' };
      });
    } catch (err) {
      // Clave (revisión, persona): la misma persona firmó dos veces.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya firmaste esta revisión.');
      }
      throw err;
    }

    // Quién firmó (como moderation.confirmed), nunca el texto ni el autor.
    const actor = await this.actorId(profileId);
    void this.audit.log({ ...actor, action: 'asistente.revision_firmada', resource: `texto_en_revision:${id}`, metadata: { aprobar } });

    if (transicion.accion === 'rechazada') {
      void this.audit.log({ action: 'asistente.revision_resuelta', resource: `texto_en_revision:${id}`, metadata: { estado: 'rechazado' } });
    } else if (transicion.accion === 'publicar') {
      await this.publicar(id, transicion);
    }

    const rev = await this.prisma.textoEnRevision.findUnique({ where: { id }, include: { firmas: true } });
    if (!rev) throw new NotFoundException('Esa revisión no existe.');
    return this.vista(rev, profileId);
  }

  /** Las pendientes que pasaron su plazo quedan vencidas. Nunca se publican solas. */
  async vencer(now: Date): Promise<number> {
    const r = await this.prisma.textoEnRevision.updateMany({
      where: { estado: 'pendiente', venceAt: { lte: now } },
      data: { estado: 'vencido', resueltoAt: now },
    });
    return r.count;
  }

  /** Borra el texto y los argumentos de los vencidos y no publicables resueltos hace más de 30 días. */
  async purgar(now: Date): Promise<number> {
    const r = await this.prisma.textoEnRevision.updateMany({
      where: {
        estado: { in: ['vencido', 'no_publicable'] },
        resueltoAt: { lte: new Date(now.getTime() - DIAS_RETENCION * DIA_MS) },
        texto: { not: '' },
      },
      data: { ...SIN_TEXTO },
    });
    return r.count;
  }

  /** Publica ya fuera de la transacción. Si falla (tema cerrado, persona fuera…), queda no_publicable con el motivo. */
  private async publicar(id: string, t: Extract<Transicion, { accion: 'publicar' }>): Promise<void> {
    let estado: EstadoTextoEnRevision = 'publicado';
    let motivo: string | null = null;
    try {
      await this.publicadores.publicar(t.tipo, t.autorProfileId, t.args);
    } catch (err) {
      estado = 'no_publicable';
      motivo = err instanceof HttpException ? mensajeDe(err) : MOTIVO_GENERICO;
      if (!(err instanceof HttpException)) {
        this.logger.error(`No se pudo publicar un texto aprobado: ${nombreDeError(err)}`);
      }
    }
    await this.prisma.textoEnRevision.updateMany({
      where: { id, estado: 'publicando' },
      // Publicado: el texto ya vive en su lugar y aquí se borra. No publicable: se conserva (ver purgar).
      data: { estado, motivo, resueltoAt: new Date(), ...(estado === 'publicado' ? SIN_TEXTO : {}) },
    });
    void this.audit.log({ action: 'asistente.revision_resuelta', resource: `texto_en_revision:${id}`, metadata: { estado } });
  }

  private async actorId(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    try {
      const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
      return p?.userId ? { actorId: p.userId } : {};
    } catch {
      return {};
    }
  }

  /** La mesa, o un suplente provisional cuando la mesa está incompleta. */
  private async exigirMesa(profileId: string): Promise<void> {
    if (!(await this.board.puedeFirmarRevision(profileId))) throw new ForbiddenException('Esta sección es solo para la mesa directiva.');
  }

  /** `publicando` es interno: para quien mira sigue pendiente. `viewer` null: no se marca `yaFirme`. */
  private vista(r: RevisionConFirmas, viewer: string | null): TextoEnRevisionView {
    const aprobaciones = r.firmas.filter((f) => f.aprobar).length;
    return {
      id: r.id,
      tipo: r.tipo as TipoTexto,
      texto: r.texto,
      causa: r.causa,
      estado: (r.estado === 'publicando' ? 'pendiente' : r.estado) as EstadoTextoEnRevision,
      creadoAt: r.creadoAt.toISOString(),
      venceAt: r.venceAt.toISOString(),
      aprobaciones,
      rechazos: r.firmas.length - aprobaciones,
      yaFirme: viewer !== null && r.firmas.some((f) => f.profileId === viewer),
      motivo: r.motivo,
    };
  }
}

function mensajeDe(err: HttpException): string {
  const r = err.getResponse();
  if (typeof r === 'string') return r || MOTIVO_GENERICO;
  const m = (r as { message?: unknown }).message;
  if (typeof m === 'string' && m) return m;
  if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  return err.message || MOTIVO_GENERICO;
}
