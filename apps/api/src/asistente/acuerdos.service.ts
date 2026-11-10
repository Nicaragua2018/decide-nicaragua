import { Injectable, Logger } from '@nestjs/common';
import type { FraseVotoValue, SugerenciaTipo } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { agregadoPublico, currentMembers } from '../frases/agregado';
import { analyzeOpinions, seedFromId, type VoteRow } from '../frases/opinion-groups';
import { AsistenteService, type PedidoAsistente } from './asistente.service';
import { SugerenciasService } from './sugerencias.service';
import { nombreDeError } from './errores';
import { conLimite } from './con-limite';
import {
  ESQUEMA_AGRUPAR,
  esSalidaAgrupar,
  gruposConIds,
  materialAgrupar,
  MAX_MATERIAL_AGRUPAR,
  MIN_INQUIETUDES_AGRUPAR,
  TAREA_AGRUPAR,
} from './acuerdos/agrupar';
import { ESQUEMA_UMBRAL, esSalidaUmbral, materialUmbral, TAREA_UMBRAL } from './acuerdos/umbral';
import {
  ESQUEMA_PRESENTACION,
  esSalidaPresentacion,
  materialPresentacion,
  MAX_MATERIAL_PRESENTACION,
  TAREA_PRESENTACION,
} from './acuerdos/presentacion';

import {
  contenidoBorradores,
  ESQUEMA_BORRADORES,
  esSalidaBorradores,
  materialBorradores,
  TAREA_BORRADORES,
} from './acuerdos/borradores';
import { ESQUEMA_COMISION, esSalidaComision, materialComision, TAREA_COMISION } from './acuerdos/comision';
import { contenidoMapa, ESQUEMA_MAPA, esSalidaMapa, materialMapa, MIN_VOTOS_MAPA, TAREA_MAPA } from './acuerdos/mapa';
import { explicarTomaDePartido } from './acuerdos/neutralidad';

export const MAX_PEDIDOS_POR_RONDA = 20;
/** Las tareas nocturnas son largas (mapa y borradores): más tiempo que los 30 s de una consulta interactiva. */
export const TIEMPO_MAXIMO_NOCTURNO_MS = 120_000;
/** Un objeto cuya respuesta falló no se vuelve a pedir hasta pasado este plazo. */
const ESPERA_TRAS_FALLO_S = 24 * 3_600;
const REDIS_MAXIMO_MS = 300;
const REFRESCO_AGRUPAR_MS = 20 * 3_600_000;
const REFRESCO_MAPA_MS = 24 * 3_600_000;
const VALOR: Record<FraseVotoValue, -1 | 0 | 1> = { de_acuerdo: 1, en_desacuerdo: -1, paso: 0 };
const ABIERTAS = ['abierta', 'en_plazo'] as const;

const claveFallo = (tipo: SugerenciaTipo, objetoId: string) => `asistente:acuerdos:fallo:${tipo}:${objetoId}`;

/**
 * Cuenta de una ronda, compartida por todos los pasos: tope de pedidos y parada cuando el
 * asistente deja de estar disponible (apagado o sin margen). Un objeto que falla (sin respuesta
 * o salida descartada) queda en espera 24 horas y no frena a los demás.
 */
export class Ronda {
  pedidos = 0;
  guardadas = 0;
  private sinMargen = false;

  constructor(
    private readonly asistente: AsistenteService,
    private readonly redis: RedisService,
    readonly now: Date,
  ) {}

  get agotada(): boolean {
    return this.pedidos >= MAX_PEDIDOS_POR_RONDA || this.sinMargen;
  }

  /** Hace un pedido para un objeto si la ronda no está agotada y el objeto no está en espera. */
  async pedir<T>(tipo: SugerenciaTipo, objetoId: string, op: PedidoAsistente<T>): Promise<T | null> {
    if (this.agotada) return null;
    if (await this.enEspera(tipo, objetoId)) return null;
    this.pedidos++;
    const salida = await this.asistente.pedir({ ...op, timeoutMs: TIEMPO_MAXIMO_NOCTURNO_MS });
    if (salida !== null) return salida;
    // Sin respuesta: si es porque el asistente ya no está disponible, la ronda para; si no, falló este objeto.
    if (!this.asistente.activo() || !(await this.asistente.tieneMargen('nocturna'))) {
      this.sinMargen = true;
      return null;
    }
    await this.fallo(tipo, objetoId);
    return null;
  }

  /** Deja el objeto en espera 24 horas. Si Redis falla, no pasa nada: se volverá a intentar. */
  async fallo(tipo: SugerenciaTipo, objetoId: string): Promise<void> {
    await conLimite(Promise.resolve().then(() => this.redis.set(claveFallo(tipo, objetoId), '1', ESPERA_TRAS_FALLO_S)), REDIS_MAXIMO_MS);
  }

  /** Si Redis falla o tarda, el objeto no se considera en espera (falla abierto). */
  private async enEspera(tipo: SugerenciaTipo, objetoId: string): Promise<boolean> {
    return (await conLimite(Promise.resolve().then(() => this.redis.get(claveFallo(tipo, objetoId))), REDIS_MAXIMO_MS)) !== null;
  }
}

type Paso = (ronda: Ronda) => Promise<void>;

/** Sugerencias del asistente para los acuerdos: agrupar, aviso de umbral y presentación neutral. */
@Injectable()
export class AcuerdosService {
  private readonly logger = new Logger(AcuerdosService.name);
  /** Los generadores de la ronda, en orden.  */
  private readonly pasos: Paso[] = [(r) => this.agrupar(r), (r) => this.umbral(r), (r) => this.presentacion(r), (r) => this.mapa(r), (r) => this.borradores(r), (r) => this.comision(r)];

  constructor(
    private readonly prisma: PrismaService,
    private readonly asistente: AsistenteService,
    private readonly sugerencias: SugerenciasService,
    private readonly redis: RedisService,
  ) {}

  /** Devuelve cuántas sugerencias guardó en la ronda. */
  async procesar(now: Date): Promise<number> {
    // Apagado o sin margen: ni siquiera se recorren los temas.
    if (!this.asistente.activo() || !(await this.asistente.tieneMargen('nocturna'))) return 0;
    const ronda = new Ronda(this.asistente, this.redis, now);
    for (const paso of this.pasos) {
      if (ronda.agotada) break;
      try {
        await paso(ronda);
      } catch (err) {
        this.logger.error(`Falló un generador de sugerencias: ${nombreDeError(err)}`);
      }
    }
    return ronda.guardadas;
  }

  /** Un fallo en un elemento nunca frena a los demás: solo se registra el nombre del error. */
  private async cadaUno<T>(lista: Iterable<T>, ronda: Ronda, hacer: (x: T) => Promise<void>): Promise<void> {
    for (const x of lista) {
      if (ronda.agotada) return;
      try {
        await hacer(x);
      } catch (err) {
        this.logger.error(`Falló una sugerencia: ${nombreDeError(err)}`);
      }
    }
  }

  private async agrupar(ronda: Ronda): Promise<void> {
    const filas = await this.prisma.inquietud.findMany({
      where: { hidden: false, status: { in: [...ABIERTAS] } },
      select: { id: true, groupId: true, title: true, body: true },
      orderBy: { createdAt: 'desc' },
    });
    const porComunidad = new Map<string, typeof filas>();
    for (const f of filas) porComunidad.set(f.groupId, [...(porComunidad.get(f.groupId) ?? []), f]);

    await this.cadaUno(porComunidad, ronda, async ([groupId, lista]) => {
      if (lista.length < MIN_INQUIETUDES_AGRUPAR) return;
      const previa = await this.sugerencias.existe('agrupar', groupId);
      if (previa && (previa.final || ronda.now.getTime() - previa.updatedAt.getTime() <= REFRESCO_AGRUPAR_MS)) return;

      const enviadas = lista.slice(0, MAX_MATERIAL_AGRUPAR);
      const { material, refs } = materialAgrupar(enviadas);
      const salida = await ronda.pedir('agrupar', groupId, {
        modelo: 'capaz',
        prioridad: 'nocturna',
        tarea: TAREA_AGRUPAR,
        material,
        herramienta: { nombre: 'agrupar_inquietudes', esquema: ESQUEMA_AGRUPAR },
        validar: esSalidaAgrupar,
        explicarRechazo: explicarTomaDePartido,
      });
      if (!salida) return;
      const grupos = gruposConIds(salida, refs);
      if (!grupos.length) return void (await ronda.fallo('agrupar', groupId));
      await this.sugerencias.guardar('agrupar', groupId, groupId, { grupos }, { at: ronda.now.toISOString(), inquietudes: enviadas.length });
      ronda.guardadas++;
    });
  }

  private async umbral(ronda: Ronda): Promise<void> {
    const filas = await this.prisma.inquietud.findMany({
      where: { hidden: false, status: 'en_plazo' },
      select: { id: true, groupId: true, title: true, body: true, _count: { select: { apoyos: true } } },
      orderBy: { createdAt: 'asc' },
    });
    await this.cadaUno(filas, ronda, async (f) => {
      if (await this.sugerencias.existe('umbral', f.id)) return;
      const salida = await ronda.pedir('umbral', f.id, {
        modelo: 'rapido',
        prioridad: 'nocturna',
        tarea: TAREA_UMBRAL,
        material: materialUmbral({ title: f.title, body: f.body, apoyos: f._count.apoyos }).material,
        herramienta: { nombre: 'preparar_respuesta', esquema: ESQUEMA_UMBRAL },
        validar: esSalidaUmbral,
      });
      if (!salida) return;
      await this.sugerencias.guardar(
        'umbral',
        f.id,
        f.groupId,
        { resumen: salida.resumen.trim(), borradorRespuesta: salida.borradorRespuesta.trim() },
        { at: ronda.now.toISOString(), inquietudes: 1 },
      );
      ronda.guardadas++;
    });
  }

  private async presentacion(ronda: Ronda): Promise<void> {
    const temas = await this.prisma.proposal.findMany({
      where: { abiertoPorComunidad: true, hidden: false },
      select: { id: true, groupId: true },
      orderBy: { createdAt: 'asc' },
    });
    await this.cadaUno(temas, ronda, async (t) => {
      if (await this.sugerencias.existe('presentacion', t.id)) return;
      const inquietudes = await this.prisma.inquietud.findMany({
        where: { proposalId: t.id, hidden: false },
        select: { title: true, body: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_MATERIAL_PRESENTACION,
      });
      if (!inquietudes.length) return;
      const salida = await ronda.pedir('presentacion', t.id, {
        modelo: 'capaz',
        prioridad: 'nocturna',
        tarea: TAREA_PRESENTACION,
        material: materialPresentacion(inquietudes).material,
        herramienta: { nombre: 'presentar_asunto', esquema: ESQUEMA_PRESENTACION },
        validar: esSalidaPresentacion,
        explicarRechazo: explicarTomaDePartido,
      });
      if (!salida) return;
      await this.sugerencias.guardar(
        'presentacion',
        t.id,
        t.groupId,
        { presentacion: salida.presentacion.trim() },
        { at: ronda.now.toISOString(), inquietudes: inquietudes.length },
      );
      ronda.guardadas++;
    });
  }

  private async mapa(ronda: Ronda): Promise<void> {
    const temas = await this.prisma.proposal.findMany({
      where: { hidden: false },
      select: { id: true, groupId: true, status: true, deliberationEndsAt: true, decision: { select: { id: true } } },
      orderBy: { createdAt: 'asc' },
    });
    await this.cadaUno(temas, ronda, async (t) => {
      const terminado =
        (t.deliberationEndsAt !== null && t.deliberationEndsAt.getTime() < ronda.now.getTime()) ||
        t.decision !== null ||
        t.status !== 'open';
      const previa = await this.sugerencias.existe('mapa', t.id);
      if (previa?.final) return;
      if (!terminado && previa && ronda.now.getTime() - previa.updatedAt.getTime() <= REFRESCO_MAPA_MS) return;

      const datos = await this.votosDelTema(t);
      if (datos.rows.length < MIN_VOTOS_MAPA) return;
      if (!terminado && previa?.base?.opiniones === datos.rows.length) return;
      const { frases, rows, agregado } = datos;
      const material = materialMapa(agregado);
      if (!material) return;
      const salida = await ronda.pedir('mapa', t.id, {
        modelo: 'capaz',
        prioridad: 'nocturna',
        tarea: TAREA_MAPA,
        material: material.material,
        herramienta: { nombre: 'mapear_opiniones', esquema: ESQUEMA_MAPA },
        validar: esSalidaMapa,
        explicarRechazo: explicarTomaDePartido,
      });
      if (!salida) return;
      const contenido = contenidoMapa(salida, material.letras, material.refs);
      if (!contenido) return void (await ronda.fallo('mapa', t.id));
      await this.sugerencias.guardar(
        'mapa',
        t.id,
        t.groupId,
        contenido,
        { at: ronda.now.toISOString(), frases: frases.length, opiniones: rows.length },
        terminado,
      );
      ronda.guardadas++;
    });
  }

  /** Mismos votos que el análisis público: de miembros actuales y sobre frases visibles. */
  private async votosDelTema(t: { id: string; groupId: string }) {
    const [frases, votos] = await Promise.all([
      this.prisma.frase.findMany({ where: { proposalId: t.id, hidden: false }, select: { id: true, text: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.fraseVoto.findMany({
        where: { frase: { proposalId: t.id, hidden: false }, ...currentMembers(t.groupId) },
        select: { profileId: true, fraseId: true, value: true },
      }),
    ]);
    const visibles = new Set(frases.map((f) => f.id));
    const rows: VoteRow[] = votos
      .filter((v) => visibles.has(v.fraseId))
      .map((v) => ({ profileId: v.profileId, fraseId: v.fraseId, value: VALOR[v.value as FraseVotoValue] }));
    const agregado = agregadoPublico(analyzeOpinions(rows, seedFromId(t.id)), new Map(frases.map((f) => [f.id, f.text])));
    return { frases, rows, agregado };
  }

  private async borradores(ronda: Ronda): Promise<void> {
    const temas = await this.prisma.proposal.findMany({
      where: { kind: 'propuesta', status: 'open', hidden: false, decision: null, cambioRegla: null },
      select: { id: true, groupId: true, title: true, body: true },
      orderBy: { createdAt: 'asc' },
    });
    await this.cadaUno(temas, ronda, async (t) => {
      if (await this.sugerencias.existe('borradores', t.id)) return;
      const { rows, agregado } = await this.votosDelTema(t);
      const material = materialBorradores(t, agregado);
      if (!material) return;
      const salida = await ronda.pedir('borradores', t.id, {
        modelo: 'capaz',
        prioridad: 'nocturna',
        tarea: TAREA_BORRADORES,
        material: material.material,
        herramienta: { nombre: 'proponer_soluciones', esquema: ESQUEMA_BORRADORES },
        validar: esSalidaBorradores,
        explicarRechazo: explicarTomaDePartido,
      });
      if (!salida) return;
      const contenido = contenidoBorradores(salida, material.refs);
      if (!contenido) return void (await ronda.fallo('borradores', t.id));
      await this.sugerencias.guardar('borradores', t.id, t.groupId, contenido, {
        at: ronda.now.toISOString(),
        frases: material.frases,
        opiniones: rows.length,
      });
      ronda.guardadas++;
    });
  }

  private async comision(ronda: Ronda): Promise<void> {
    const grupos = await this.prisma.group.findMany({
      where: { trabajoTipo: 'comision', trabajoEstado: 'convocando' },
      select: { id: true, proposito: true, tarea: true },
      orderBy: { createdAt: 'asc' },
    });
    await this.cadaUno(grupos, ronda, async (g) => {
      // Sin propósito ni tarea no hay nada que comentar.
      if (!g.proposito?.trim() && !g.tarea?.trim()) return;
      if (await this.sugerencias.existe('comision', g.id)) return;
      const salida = await ronda.pedir('comision', g.id, {
        modelo: 'rapido',
        prioridad: 'nocturna',
        tarea: TAREA_COMISION,
        material: materialComision(g).material,
        herramienta: { nombre: 'comentar_comision', esquema: ESQUEMA_COMISION },
        validar: esSalidaComision,
      });
      if (!salida) return;
      await this.sugerencias.guardar(
        'comision',
        g.id,
        g.id,
        { capacidades: salida.capacidades.map((c) => c.trim()), comentario: salida.comentario.trim() },
        { at: ronda.now.toISOString() },
      );
      ronda.guardadas++;
    });
  }
}
