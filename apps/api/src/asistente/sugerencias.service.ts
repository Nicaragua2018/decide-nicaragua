import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BaseSugerencia, SugerenciaTipo, SugerenciaVista } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ForumsService } from '../forums/forums.service';

export const SUGERENCIA_TIPOS: readonly SugerenciaTipo[] = ['agrupar', 'umbral', 'presentacion', 'mapa', 'borradores', 'comision'];

/** Con el debate abierto, el mapa solo lo ve quien votó al menos estas frases visibles. */
const MIN_VOTOS_MAPA = 3;
/** Un grupo de inquietudes necesita al menos dos para tener sentido. */
const MIN_GRUPO = 2;

const SIN_ACCESO = 'No tienes acceso a esta sugerencia.';

type Json = Record<string, any>;

@Injectable()
export class SugerenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: GroupAccessService,
    private readonly forums: ForumsService,
  ) {}

  /** Crea o actualiza la sugerencia de un objeto. Una fila final nunca se reescribe. */
  async guardar(
    tipo: SugerenciaTipo,
    objetoId: string,
    groupId: string,
    contenido: object,
    base: BaseSugerencia,
    final = false,
  ): Promise<void> {
    const actual = await this.prisma.sugerenciaAsistente.findUnique({
      where: { tipo_objetoId: { tipo, objetoId } },
      select: { final: true },
    });
    if (actual?.final) return;
    const datos = { groupId, contenido: contenido as Prisma.InputJsonValue, base: base as unknown as Prisma.InputJsonValue, final };
    await this.prisma.sugerenciaAsistente.upsert({
      where: { tipo_objetoId: { tipo, objetoId } },
      create: { tipo, objetoId, ...datos },
      update: datos,
    });
    void this.audit.log({
      action: 'asistente.sugerencia_guardada',
      resource: `sugerencia_asistente:${objetoId}`,
      metadata: { tipo, objetoId },
    });
  }

  async existe(tipo: SugerenciaTipo, objetoId: string): Promise<{ updatedAt: Date; final: boolean; base: BaseSugerencia } | null> {
    const fila = await this.prisma.sugerenciaAsistente.findUnique({
      where: { tipo_objetoId: { tipo, objetoId } },
      select: { updatedAt: true, final: true, base: true },
    });
    return fila ? { updatedAt: fila.updatedAt, final: fila.final, base: fila.base as unknown as BaseSugerencia } : null;
  }

  /**
   * Marca un borrador como adoptado dentro de la transacción dada. Bloquea la fila para que dos
   * personas no adopten el mismo borrador a la vez. Devuelve false si no se pudo (no hay fila,
   * el índice no existe o ya estaba adoptado).
   */
  async marcarBorradorAdoptado(tx: Prisma.TransactionClient, proposalId: string, indice: number): Promise<boolean> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM sugerencias_asistente WHERE tipo = 'borradores' AND "objetoId" = ${proposalId}::uuid FOR UPDATE`,
    );
    const fila = await tx.sugerenciaAsistente.findUnique({
      where: { tipo_objetoId: { tipo: 'borradores', objetoId: proposalId } },
      select: { id: true, contenido: true },
    });
    if (!fila) return false;
    const contenido = fila.contenido as Json;
    const lista = Array.isArray(contenido?.borradores) ? (contenido.borradores as Json[]) : [];
    if (!Number.isInteger(indice) || indice < 0 || indice >= lista.length) return false;
    if (lista[indice]!.adoptado === true) return false;
    const borradores = lista.map((b, i) => (i === indice ? { ...b, adoptado: true } : b));
    await tx.sugerenciaAsistente.update({
      where: { id: fila.id },
      data: { contenido: { ...contenido, borradores } as Prisma.InputJsonValue },
    });
    return true;
  }

  /** La sugerencia tal como la ve esta persona, o null si no hay nada que mostrar. 403 si no tiene acceso. */
  async ver(profileId: string, tipo: SugerenciaTipo, objetoId: string): Promise<SugerenciaVista | null> {
    const fila = await this.prisma.sugerenciaAsistente.findUnique({ where: { tipo_objetoId: { tipo, objetoId } } });
    if (!fila) return null;
    const base = fila.base as unknown as BaseSugerencia;
    const contenido = fila.contenido as Json;
    const comun = { base, final: fila.final, actualizadaAt: fila.updatedAt.toISOString() };

    switch (tipo) {
      case 'agrupar': {
        await this.requireOrganiza(profileId, fila.groupId);
        const grupos = await this.resolverAgrupar(fila.groupId, contenido);
        return grupos.length ? { tipo, ...comun, contenido: { grupos } } : null;
      }
      case 'umbral': {
        await this.requireOrganiza(profileId, fila.groupId);
        const inq = await this.prisma.inquietud.findUnique({ where: { id: objetoId }, select: { hidden: true, status: true } });
        if (!inq || inq.hidden || inq.status !== 'en_plazo') return null;
        return { tipo, ...comun, contenido: { resumen: String(contenido.resumen ?? ''), borradorRespuesta: String(contenido.borradorRespuesta ?? '') } };
      }
      case 'comision': {
        await this.access.requireReader(fila.groupId, profileId);
        return {
          tipo,
          ...comun,
          contenido: {
            capacidades: Array.isArray(contenido.capacidades) ? contenido.capacidades.map(String) : [],
            comentario: String(contenido.comentario ?? ''),
          },
        };
      }
      default:
        return this.verDeTema(profileId, tipo, objetoId, fila.final, contenido, comun);
    }
  }

  private async requireOrganiza(profileId: string, groupId: string): Promise<void> {
    if (!(await this.forums.canOrganize(profileId, groupId))) throw new ForbiddenException(SIN_ACCESO);
  }

  private async verDeTema(
    profileId: string,
    tipo: 'presentacion' | 'mapa' | 'borradores',
    proposalId: string,
    final: boolean,
    contenido: Json,
    comun: { base: BaseSugerencia; final: boolean; actualizadaAt: string },
  ): Promise<SugerenciaVista | null> {
    const tema = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, groupId: true, status: true, hidden: true, deliberationEndsAt: true, decision: { select: { id: true } } },
    });
    if (!tema) throw new NotFoundException('Tema no encontrado.');
    const { participa } = await this.access.requireReader(tema.groupId, profileId);
    if (tema.hidden) return null;
    const extra = { ...comun, proposalId };

    if (tipo === 'presentacion') {
      return { tipo, ...extra, contenido: { presentacion: String(contenido.presentacion ?? '') } };
    }
    if (tipo === 'borradores') {
      const lista: Json[] = Array.isArray(contenido.borradores) ? contenido.borradores : [];
      return {
        tipo,
        ...extra,
        contenido: {
          borradores: lista.map((b, indice) => ({
            indice,
            titulo: String(b.titulo ?? ''),
            descripcion: String(b.descripcion ?? ''),
            adoptado: b.adoptado === true,
          })),
        },
      };
    }

    // mapa
    const terminado =
      final ||
      (tema.deliberationEndsAt !== null && tema.deliberationEndsAt.getTime() <= Date.now()) ||
      tema.decision !== null ||
      tema.status !== 'open';
    if (!terminado) {
      if (!participa) return null;
      const votos = await this.prisma.fraseVoto.count({ where: { profileId, frase: { proposalId, hidden: false } } });
      if (votos < MIN_VOTOS_MAPA) return null;
    }
    const grupos: Json[] = Array.isArray(contenido.grupos) ? contenido.grupos : [];
    const puentes: Json = contenido.puentes ?? {};
    const ids = new Set<string>();
    for (const g of grupos) for (const id of g.citaIds ?? []) ids.add(id);
    for (const id of puentes.citaIds ?? []) ids.add(id);
    const frases = ids.size
      ? await this.prisma.frase.findMany({ where: { id: { in: [...ids] }, proposalId, hidden: false }, select: { id: true, text: true } })
      : [];
    const texto = new Map(frases.map((f) => [f.id, f.text]));
    const citas = (lista: unknown): string[] =>
      (Array.isArray(lista) ? lista : []).flatMap((id) => (texto.has(id) ? [texto.get(id)!] : []));
    return {
      tipo,
      ...extra,
      contenido: {
        resumen: String(contenido.resumen ?? ''),
        grupos: grupos.map((g) => ({
          nombre: String(g.nombre ?? ''),
          tamano: Number(g.tamano ?? 0),
          piensa: String(g.piensa ?? ''),
          citas: citas(g.citaIds),
        })),
        puentes: { texto: String(puentes.texto ?? ''), citas: citas(puentes.citaIds) },
      },
    };
  }

  private async resolverAgrupar(groupId: string, contenido: Json) {
    const grupos: Json[] = Array.isArray(contenido.grupos) ? contenido.grupos : [];
    const ids = [...new Set(grupos.flatMap((g) => (Array.isArray(g.inquietudIds) ? (g.inquietudIds as string[]) : [])))];
    if (!ids.length) return [];
    const vivas = await this.prisma.inquietud.findMany({
      where: { id: { in: ids }, groupId, hidden: false, status: { in: ['abierta', 'en_plazo'] } },
      select: { id: true, title: true },
    });
    const porId = new Map(vivas.map((i) => [i.id, i]));
    return grupos
      .map((g) => ({
        titulo: String(g.titulo ?? ''),
        descripcion: String(g.descripcion ?? ''),
        inquietudes: ((g.inquietudIds ?? []) as string[]).flatMap((id) => (porId.has(id) ? [{ id, title: porId.get(id)!.title }] : [])),
      }))
      .filter((g) => g.inquietudes.length >= MIN_GRUPO);
  }
}
