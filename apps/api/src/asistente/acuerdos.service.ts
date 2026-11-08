import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsistenteService, type PedidoAsistente } from './asistente.service';
import { SugerenciasService } from './sugerencias.service';
import { nombreDeError } from './errores';
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

export const MAX_PEDIDOS_POR_RONDA = 20;
const NULOS_SEGUIDOS_PARA_PARAR = 2;
const REFRESCO_AGRUPAR_MS = 20 * 3_600_000;
const ABIERTAS = ['abierta', 'en_plazo'] as const;

/** Cuenta de una ronda: tope de pedidos y parada tras dos nulos seguidos. La comparten todos los pasos. */
export class Ronda {
  pedidos = 0;
  guardadas = 0;
  private nulosSeguidos = 0;

  constructor(
    private readonly asistente: AsistenteService,
    readonly now: Date,
  ) {}

  get agotada(): boolean {
    return this.pedidos >= MAX_PEDIDOS_POR_RONDA || this.nulosSeguidos >= NULOS_SEGUIDOS_PARA_PARAR;
  }

  /** Hace un pedido si la ronda no está agotada. */
  async pedir<T>(op: PedidoAsistente<T>): Promise<T | null> {
    if (this.agotada) return null;
    this.pedidos++;
    const salida = await this.asistente.pedir(op);
    this.nulosSeguidos = salida === null ? this.nulosSeguidos + 1 : 0;
    return salida;
  }
}

type Paso = (ronda: Ronda) => Promise<void>;

/** Sugerencias del asistente para los acuerdos: agrupar, aviso de umbral y presentación neutral. */
@Injectable()
export class AcuerdosService {
  private readonly logger = new Logger(AcuerdosService.name);
  /** Los generadores de la ronda, en orden. Los demás pasos (mapa, borradores, comisión) se añaden aquí. */
  private readonly pasos: Paso[] = [(r) => this.agrupar(r), (r) => this.umbral(r), (r) => this.presentacion(r)];

  constructor(
    private readonly prisma: PrismaService,
    private readonly asistente: AsistenteService,
    private readonly sugerencias: SugerenciasService,
  ) {}

  /** Devuelve cuántas sugerencias guardó en la ronda. */
  async procesar(now: Date): Promise<number> {
    const ronda = new Ronda(this.asistente, now);
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
      const salida = await ronda.pedir({
        modelo: 'capaz',
        prioridad: 'nocturna',
        tarea: TAREA_AGRUPAR,
        material,
        herramienta: { nombre: 'agrupar_inquietudes', esquema: ESQUEMA_AGRUPAR },
        validar: esSalidaAgrupar,
      });
      if (!salida) return;
      const grupos = gruposConIds(salida, refs);
      if (!grupos.length) return;
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
      const salida = await ronda.pedir({
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
      const salida = await ronda.pedir({
        modelo: 'capaz',
        prioridad: 'nocturna',
        tarea: TAREA_PRESENTACION,
        material: materialPresentacion(inquietudes).material,
        herramienta: { nombre: 'presentar_asunto', esquema: ESQUEMA_PRESENTACION },
        validar: esSalidaPresentacion,
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
}
