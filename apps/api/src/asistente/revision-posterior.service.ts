import { Injectable, Logger } from '@nestjs/common';
import type { ModerationTarget } from '@prisma/client';
import { textoParaRevisar, type TipoTexto } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ForumsService } from '../forums/forums.service';
import { AsistenteService } from './asistente.service';
import { ESQUEMA_REVISION, esRevision, normalizarRevision, tareaRevision } from './moderacion-previa.service';

/** A los 5 intentos sin respuesta del asistente, el contenido sale de la cola. */
const MAX_INTENTOS = 5;

/** Cada tipo de contenido de la cola se revisa como el tipo de texto con que se publicó. */
const TIPO_DE: Record<ModerationTarget, TipoTexto> = {
  tema: 'tema',
  respuesta: 'comentario',
  inquietud: 'inquietud',
  frase: 'frase',
  solucion: 'solucion',
  informe: 'informe',
};

type Contenido = { texto: string; hidden: boolean };

/**
 * Nivel 3: revisa después lo que se publicó sin revisión previa (el asistente no respondió a
 * tiempo). Si es nivel 2, abre una solicitud de moderación que resuelve la mesa; nunca oculta
 * por su cuenta, salvo la ocultación provisional de una causa urgente (como hoy en 3A-3b).
 */
@Injectable()
export class RevisionPosteriorService {
  private readonly logger = new Logger(RevisionPosteriorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asistente: AsistenteService,
    private readonly forums: ForumsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Toma de la cola los más antiguos (hasta `max`). Devuelve cuántos salieron de la cola.
   * Con el asistente apagado o sin margen nocturno no toca nada: así no se gastan intentos.
   */
  async procesar(now: Date, max = 50): Promise<number> {
    if (!this.asistente.activo()) return 0;
    if (!(await this.asistente.tieneMargen('nocturna'))) return 0;
    const filas = await this.prisma.colaRevisionPosterior.findMany({
      where: { creadaAt: { lte: now } },
      orderBy: { creadaAt: 'asc' },
      take: max,
    });
    let salieron = 0;
    for (const fila of filas) {
      // El margen se puede acabar a mitad de la tanda: lo que queda espera a la próxima.
      if (!(await this.asistente.tieneMargen('nocturna'))) break;
      try {
        if (await this.revisar(fila)) salieron += 1;
      } catch (err) {
        this.logger.error('Falló la revisión posterior de un contenido', err instanceof Error ? err.stack : undefined);
        try {
          if (await this.fallo(fila)) salieron += 1;
        } catch {
          // Si tampoco se pudo contar el intento, queda en la cola para la próxima corrida.
        }
      }
    }
    return salieron;
  }

  /** Revisa una fila. Devuelve true si salió de la cola. */
  private async revisar(fila: { id: string; target: ModerationTarget; targetId: string; intentos: number }): Promise<boolean> {
    const contenido = await this.contenido(fila.target, fila.targetId);
    if (!contenido || contenido.hidden) {
      await this.sacar(fila.id);
      return true;
    }
    const salida = await this.asistente.pedir({
      modelo: 'rapido',
      prioridad: 'nocturna',
      tarea: tareaRevision(TIPO_DE[fila.target]),
      material: contenido.texto,
      herramienta: { nombre: 'clasificar_texto', esquema: ESQUEMA_REVISION },
      validar: esRevision,
    });
    if (!salida) return this.fallo(fila);

    const revision = normalizarRevision(salida);
    if (revision.nivel === 2 && revision.causa) {
      // Si ya hay una solicitud abierta, devuelve null: la mesa ya lo está viendo.
      await this.forums.solicitarPorAsistente(fila.target, fila.targetId, revision.causa);
    }
    await this.sacar(fila.id);
    return true;
  }

  /** Un intento sin respuesta. Al quinto, sale de la cola y queda en la auditoría (sin texto). */
  private async fallo(fila: { id: string; target: ModerationTarget; targetId: string; intentos: number }): Promise<boolean> {
    const intentos = fila.intentos + 1;
    if (intentos < MAX_INTENTOS) {
      await this.prisma.colaRevisionPosterior.updateMany({ where: { id: fila.id }, data: { intentos: { increment: 1 } } });
      return false;
    }
    await this.sacar(fila.id);
    void this.audit.log({
      action: 'asistente.revision_abandonada',
      resource: `${fila.target}:${fila.targetId}`,
      metadata: { intentos },
    });
    return true;
  }

  private async sacar(id: string): Promise<void> {
    await this.prisma.colaRevisionPosterior.deleteMany({ where: { id } });
  }

  /** El texto como lo revisa la moderación previa (`textoParaRevisar`) y si ya está oculto. */
  private async contenido(target: ModerationTarget, id: string): Promise<Contenido | null> {
    if (target === 'tema') {
      const t = await this.prisma.proposal.findUnique({ where: { id }, select: { title: true, body: true, hidden: true } });
      return t ? { texto: textoParaRevisar(t.title, t.body), hidden: t.hidden } : null;
    }
    if (target === 'inquietud') {
      // La respuesta de quien organiza se modera junto con su inquietud.
      const q = await this.prisma.inquietud.findUnique({
        where: { id },
        select: { title: true, body: true, response: true, hidden: true },
      });
      return q ? { texto: textoParaRevisar(q.title, q.body, q.response ?? ''), hidden: q.hidden } : null;
    }
    if (target === 'frase') {
      const f = await this.prisma.frase.findUnique({ where: { id }, select: { text: true, hidden: true } });
      return f ? { texto: f.text, hidden: f.hidden } : null;
    }
    if (target === 'solucion') {
      const s = await this.prisma.solucion.findUnique({ where: { id }, select: { title: true, description: true, hidden: true } });
      return s ? { texto: textoParaRevisar(s.title, s.description), hidden: s.hidden } : null;
    }
    if (target === 'informe') {
      const i = await this.prisma.comisionInforme.findUnique({ where: { id }, select: { texto: true, hidden: true } });
      return i ? { texto: i.texto, hidden: i.hidden } : null;
    }
    const c = await this.prisma.proposalComment.findUnique({ where: { id }, select: { body: true, hidden: true } });
    return c ? { texto: c.body, hidden: c.hidden } : null;
  }
}
