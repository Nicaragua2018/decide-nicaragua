import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AlDiaView, ItemAlDia } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AsistenteService } from './asistente.service';
import { conLimite } from './con-limite';
import { ContextoPersonaService } from './contexto-persona.service';

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
/** Pasado este tiempo desde la última visita empieza una visita nueva. */
const VISITA_NUEVA_MS = 12 * HORA_MS;
const SIN_VISITA_MS = 7 * DIA_MS;
const CIERRA_PRONTO_MS = 48 * HORA_MS;
const MAX_ITEMS = 20;
const MAX_RESUMEN = 400;
const CACHE_SEGUNDOS = 12 * 3600;
const TIEMPO_MAXIMO_MS = 8000;
/** Tiempo máximo de cada operación de Redis: un Redis caído no puede demorar la tarjeta. */
const REDIS_MAXIMO_MS = 300;

export const VISTA_VACIA: AlDiaView = { mostrar: false, desde: null, items: [], resumen: null };

/**
 * Ventana de «Desde tu última visita». Pura.
 * - Sin visita previa: una semana atrás.
 * - Más de 12 h desde la última visita: empieza una visita nueva, desde esa visita.
 * - Si no, se conserva la ventana que había (puede ser null si la persona la cerró).
 */
export function ventana(
  perfil: { ultimaVisitaAt: Date | null; alDiaDesde: Date | null },
  ahora: Date,
): { ultimaVisitaAt: Date; alDiaDesde: Date | null } {
  let alDiaDesde = perfil.alDiaDesde;
  if (perfil.ultimaVisitaAt === null) {
    alDiaDesde = new Date(ahora.getTime() - SIN_VISITA_MS);
  } else if (ahora.getTime() - perfil.ultimaVisitaAt.getTime() > VISITA_NUEVA_MS) {
    alDiaDesde = perfil.ultimaVisitaAt;
  }
  return { ultimaVisitaAt: ahora, alDiaDesde };
}

export const ESQUEMA_AL_DIA: Record<string, unknown> = {
  type: 'object',
  properties: {
    resumen: { type: 'string', description: 'De una a tres frases en español sencillo, sin nombres de personas.' },
  },
  required: ['resumen'],
};

export function esResumenAlDia(x: unknown): x is { resumen: string } {
  if (typeof x !== 'object' || x === null) return false;
  const r = (x as Record<string, unknown>)['resumen'];
  return typeof r === 'string' && r.trim().length > 0 && r.length <= MAX_RESUMEN;
}

export const TAREA_AL_DIA = `Tarea: contarle a una persona, en una a tres frases en español sencillo, lo más importante que pasó en sus comunidades de Nicaragua Decide desde su última visita, y qué puede hacer ella ahora (por ejemplo, votar una decisión que cierra pronto o sumarse a un debate).
- Usa solo lo que dice el material. No inventes nada.
- No nombres a personas.
- No tomes partido en ningún debate ni digas qué conviene decidir: solo cuenta qué hay y qué se puede hacer.
- Máximo ${MAX_RESUMEN} caracteres.`;

const ETIQUETA: Record<ItemAlDia['clase'], string> = {
  debate: 'Debate nuevo',
  votacion_abierta: 'Se abrió una votación',
  votacion_cierra: 'Una votación cierra pronto',
  decision: 'Resultado de una decisión',
  informe: 'Informe de una comisión',
  umbral: 'Una inquietud llegó al apoyo necesario',
};

const PALABRA_RESULTADO: Record<string, string> = {
  aprobada: 'aprobada',
  ninguna: 'ninguna aprobada',
  empate: 'empate',
  sin_quorum: 'sin quórum',
  sin_soluciones: 'sin soluciones',
};

type ItemInterno = ItemAlDia & { _cierra?: number };

/** «Desde tu última visita»: novedades de las comunidades de la persona, con un resumen breve del asistente. */
@Injectable()
export class AlDiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asistente: AsistenteService,
    private readonly contexto: ContextoPersonaService,
    private readonly redis: RedisService,
  ) {}

  async ver(profileId: string, ahora: Date = new Date()): Promise<AlDiaView> {
    const perfil = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { ultimaVisitaAt: true, alDiaDesde: true },
    });
    if (!perfil) return VISTA_VACIA;

    const v = ventana(perfil, ahora);
    await this.prisma.profile.update({
      where: { id: profileId },
      data: { ultimaVisitaAt: v.ultimaVisitaAt, alDiaDesde: v.alDiaDesde },
    });

    if (!this.asistente.activo() || v.alDiaDesde === null) return VISTA_VACIA;

    const items = await this.armarItems(profileId, v.alDiaDesde, ahora);
    if (items.length === 0) return VISTA_VACIA;

    const resumen = await this.resumir(profileId, v.alDiaDesde, items);
    return { mostrar: true, desde: v.alDiaDesde.toISOString(), items, resumen };
  }

  async cerrar(profileId: string): Promise<void> {
    await this.prisma.profile.update({ where: { id: profileId }, data: { alDiaDesde: null } });
  }

  private async armarItems(profileId: string, desde: Date, ahora: Date): Promise<ItemAlDia[]> {
    const legibles = await this.contexto.gruposLegibles(profileId);
    if (legibles.length === 0) return [];
    const ids = legibles.map((g) => g.id);
    const nombre = new Map(legibles.map((g) => [g.id, g.nombre]));
    const comunidad = (id: string) => nombre.get(id) ?? '';

    const enVentana = { gte: desde, lte: ahora };
    const proposalVisible = { groupId: { in: ids }, hidden: false, status: { not: 'draft' as const } };
    const conPropuesta = { proposal: { select: { title: true, groupId: true } } };

    const [debates, aperturas, cierres, contadas, informes, umbrales] = await Promise.all([
      this.prisma.proposal.findMany({
        where: { ...proposalVisible, createdAt: enVentana },
        select: { id: true, title: true, groupId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
      }),
      this.prisma.decision.findMany({
        where: { proposal: proposalVisible, votacionStartsAt: enVentana },
        select: { proposalId: true, fase: true, resultado: true, votacionStartsAt: true, votacionEndsAt: true, contadaAt: true, ...conPropuesta },
        orderBy: { votacionStartsAt: 'desc' },
        take: MAX_ITEMS,
      }),
      this.prisma.decision.findMany({
        where: { proposal: proposalVisible, fase: 'votacion', votacionEndsAt: { gt: ahora, lt: new Date(ahora.getTime() + CIERRA_PRONTO_MS) } },
        select: { proposalId: true, fase: true, resultado: true, votacionStartsAt: true, votacionEndsAt: true, contadaAt: true, ...conPropuesta },
        orderBy: { votacionEndsAt: 'asc' },
        take: MAX_ITEMS,
      }),
      this.prisma.decision.findMany({
        where: { proposal: proposalVisible, contadaAt: enVentana },
        select: { proposalId: true, fase: true, resultado: true, votacionStartsAt: true, votacionEndsAt: true, contadaAt: true, ...conPropuesta },
        orderBy: { contadaAt: 'desc' },
        take: MAX_ITEMS,
      }),
      this.prisma.comisionInforme.findMany({
        where: { grupoId: { in: ids }, hidden: false, createdAt: enVentana },
        select: { grupoId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
      }),
      this.prisma.inquietud.findMany({
        where: { groupId: { in: ids }, hidden: false, thresholdReachedAt: enVentana },
        select: { id: true, title: true, groupId: true, thresholdReachedAt: true },
        orderBy: { thresholdReachedAt: 'desc' },
        take: MAX_ITEMS,
      }),
    ]);

    const items: ItemInterno[] = [];
    for (const d of debates) {
      items.push({ clase: 'debate', titulo: d.title, comunidad: comunidad(d.groupId), ruta: `/proposals/${d.id}`, fecha: d.createdAt.toISOString() });
    }
    // Una votación que abrió en la ventana y cierra pronto sale una sola vez, como «cierra».
    const cierran = new Set(cierres.map((d) => d.proposalId));
    for (const d of aperturas) {
      if (!d.votacionStartsAt || cierran.has(d.proposalId)) continue;
      items.push({
        clase: 'votacion_abierta',
        titulo: d.proposal.title,
        comunidad: comunidad(d.proposal.groupId),
        ruta: `/proposals/${d.proposalId}`,
        fecha: d.votacionStartsAt.toISOString(),
      });
    }
    for (const d of cierres) {
      if (d.fase !== 'votacion' || !d.votacionEndsAt) continue;
      items.push({
        clase: 'votacion_cierra',
        titulo: d.proposal.title,
        comunidad: comunidad(d.proposal.groupId),
        ruta: `/proposals/${d.proposalId}`,
        fecha: d.votacionEndsAt.toISOString(),
        _cierra: d.votacionEndsAt.getTime(),
      });
    }
    for (const d of contadas) {
      if (!d.contadaAt) continue;
      const palabra = d.resultado ? PALABRA_RESULTADO[d.resultado] : undefined;
      items.push({
        clase: 'decision',
        titulo: palabra ? `${d.proposal.title}: ${palabra}` : d.proposal.title,
        comunidad: comunidad(d.proposal.groupId),
        ruta: `/proposals/${d.proposalId}`,
        fecha: d.contadaAt.toISOString(),
      });
    }
    for (const i of informes) {
      items.push({
        clase: 'informe',
        titulo: `Informe de ${comunidad(i.grupoId)}`,
        comunidad: comunidad(i.grupoId),
        ruta: `/grupos/${i.grupoId}`,
        fecha: i.createdAt.toISOString(),
      });
    }
    for (const q of umbrales) {
      if (!q.thresholdReachedAt) continue;
      items.push({ clase: 'umbral', titulo: q.title, comunidad: comunidad(q.groupId), ruta: `/inquietudes/${q.id}`, fecha: q.thresholdReachedAt.toISOString() });
    }

    // Primero lo que cierra antes; después lo más reciente.
    items.sort((a, b) => {
      if (a._cierra !== undefined && b._cierra !== undefined) return a._cierra - b._cierra;
      if (a._cierra !== undefined) return -1;
      if (b._cierra !== undefined) return 1;
      return b.fecha.localeCompare(a.fecha);
    });
    return items.slice(0, MAX_ITEMS).map(({ _cierra: _omitido, ...item }) => item);
  }

  /** Resumen en caché por perfil y ventana; null si el asistente no responde. Redis lento o caído no lo impide. */
  private async resumir(profileId: string, desde: Date, items: ItemAlDia[]): Promise<string | null> {
    // La clave es un hash: en Redis no queda quién consultó.
    // Lleva también un hash de la lista (clase y ruta): el resumen se reutiliza solo mientras la lista no cambie.
    const lista = createHash('sha256').update(items.map((i) => `${i.clase}${i.ruta}`).join(';')).digest('hex').slice(0, 16);
    const clave = `asistente:aldia:${createHash('sha256').update(`${profileId}${desde.toISOString()}${lista}`).digest('hex')}`;
    const guardado = await conLimite(Promise.resolve().then(() => this.redis.get(clave)), REDIS_MAXIMO_MS);
    if (guardado) return guardado;

    // Material sin rutas ni ids: solo clase, título y comunidad.
    const material = items.map((i) => `- ${ETIQUETA[i.clase]}: ${i.titulo} (${i.comunidad})`).join('\n');
    const salida = await this.asistente.pedir({
      modelo: 'rapido',
      prioridad: 'interactiva',
      timeoutMs: TIEMPO_MAXIMO_MS,
      tarea: TAREA_AL_DIA,
      material,
      herramienta: { nombre: 'resumir_al_dia', esquema: ESQUEMA_AL_DIA },
      validar: esResumenAlDia,
    });
    if (!salida) return null;

    const resumen = salida.resumen.trim();
    await conLimite(Promise.resolve().then(() => this.redis.set(clave, resumen, CACHE_SEGUNDOS)), REDIS_MAXIMO_MS);
    return resumen;
  }
}
