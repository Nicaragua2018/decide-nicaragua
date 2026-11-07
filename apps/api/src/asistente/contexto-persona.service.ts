import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import type { AccountStatus, GroupType } from '@prisma/client';
import { MIN_ACTIVE_MEMBERS } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { esNivelGeneral } from '../rules/ambito-reglas';
import { VerificationService } from '../verification/verification.service';

/** Guía de la plataforma, leída una vez al cargar el módulo (se copia a dist con nest-cli `assets`). */
export const GUIA_DE_LA_PLATAFORMA = readFileSync(join(__dirname, 'guia-de-la-plataforma.md'), 'utf8').trim();

/** Páginas sin id a las que la guía puede enviar. La respuesta cita `[gN]`; la plataforma pone la ruta. */
export const RUTAS_DE_LA_GUIA: Record<string, { texto: string; ruta: string }> = {
  g1: { texto: 'Portada', ruta: '/dashboard' },
  g2: { texto: 'Inquietudes', ruta: '/inquietudes' },
  g3: { texto: 'Decisiones', ruta: '/decisiones' },
  g4: { texto: 'Grupos', ruta: '/grupos' },
  g5: { texto: 'Reglas', ruta: '/reglas' },
  g6: { texto: 'Mi página', ruta: '/me' },
  g7: { texto: 'Invitar a alguien', ruta: '/admin/invite' },
  g8: { texto: 'Mis textos en revisión', ruta: '/me/revisiones' },
  g9: { texto: 'Foros', ruta: '/foros' },
  g10: { texto: 'Verificaciones', ruta: '/verificaciones' },
};

export interface GrupoLegible {
  id: string;
  nombre: string;
  tipo: GroupType;
  padreId: string | null;
}

export interface EstadoPersona {
  cuenta: AccountStatus;
  verificacion: { tiene: number; faltan: ('invitador' | 'segunda')[] } | null;
  comunidades: { nombre: string; tipo: 'origen' | 'acogida' | 'general'; miembros: number; activa: boolean; faltan: number }[];
  invitaciones: { pendientes: number; maximo: number };
  plazos: { que: string; comunidad: string; vence: string; ruta: string }[];
}

export interface ResultadoBusqueda {
  clase: 'debate' | 'inquietud' | 'decision' | 'grupo';
  titulo: string;
  extracto: string;
  comunidad: string;
  estado: string;
  ruta: string;
}

const MAX_PLAZOS = 10;
const MAX_EXTRACTO = 300;
const MAX_PALABRAS = 5;
const INSENSITIVE = 'insensitive' as const;
const REGEX_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const ORDEN_TIPO = { origen: 0, acogida: 1, general: 2 } as const;

const ESTADO_DEBATE: Record<string, string> = {
  draft: 'borrador',
  open: 'abierto',
  closed: 'cerrado',
  archived: 'archivado',
};
const ESTADO_INQUIETUD: Record<string, string> = {
  abierta: 'abierta',
  en_plazo: 'con plazo de respuesta',
  en_debate: 'en debate',
  respondida: 'respondida',
  abierta_por_la_comunidad: 'abierta por la comunidad',
};
const ESTADO_DECISION: Record<string, string> = {
  modo: 'eligiendo el modo de decisión',
  objecion: 'en plazo de objeción',
  votacion: 'en votación',
  contada: 'votación contada',
  cancelada: 'cancelada',
};

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Palabras de al menos 3 letras, en minúsculas; con y sin acentos para encontrar ambas escrituras. */
function palabrasDeBusqueda(consulta: string): string[] {
  const base = consulta
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 3);
  const unicas = [...new Set(base)].slice(0, MAX_PALABRAS);
  return [...new Set(unicas.flatMap((p) => [p, sinAcentos(p)]))];
}

function extracto(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= MAX_EXTRACTO ? limpio : `${limpio.slice(0, MAX_EXTRACTO - 1).trimEnd()}…`;
}

/** Intercala varias listas para que ninguna clase de resultado se quede sin lugar. */
function intercalar<T>(listas: T[][], max: number): T[] {
  const salida: T[] = [];
  for (let i = 0; salida.length < max && listas.some((l) => i < l.length); i++) {
    for (const l of listas) if (i < l.length && salida.length < max) salida.push(l[i]!);
  }
  return salida;
}

/**
 * Lo que una persona puede leer y su situación, para que el asistente la acompañe. Nada de lo que
 * sale de aquí lleva nombres, correos ni ids de personas, y las rutas se separan del texto (`aMaterial`).
 */
@Injectable()
export class ContextoPersonaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificacion: VerificationService,
    private readonly rules: RulesService,
  ) {}

  /**
   * Grupos que la persona lee: aquellos de los que es miembro, más los grupos de trabajo (que no son
   * bifurcación) de sus grupos. Es la misma regla que `GroupAccessService.nivel`.
   */
  async gruposLegibles(profileId: string): Promise<GrupoLegible[]> {
    return (await this.cargar(profileId)).legibles;
  }

  async estado(userId: string, profileId: string, status: AccountStatus): Promise<EstadoPersona> {
    const { miembroDe, legibles } = await this.cargar(profileId);

    let verificacion: EstadoPersona['verificacion'] = null;
    if ((status as string) === 'pending_verification') {
      const v = await this.verificacion.statusFor(userId);
      verificacion = { tiene: v.references.length, faltan: v.missing };
    }

    const comunidades = miembroDe
      .flatMap((g) => {
        const tipo = this.tipoDeComunidad(g);
        return tipo ? [{ id: g.id, tipo, nombre: g.name, miembros: g._count.memberships }] : [];
      })
      .sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]);

    // Una invitación vencida ya no está pendiente (misma cuenta que AuthService.inviteUser).
    const pendientes = await this.prisma.user.count({
      where: {
        invitedById: userId,
        OR: [{ status: 'pending_verification' }, { status: 'invited', inviteExpiresAt: { gt: new Date() } }],
      },
    });
    const maximo = await this.rules.getInt('invitaciones.pendientes_max', null);

    const plazos = await this.plazos(
      legibles,
      comunidades.map((c) => c.id),
    );

    return {
      cuenta: status,
      verificacion,
      comunidades: comunidades.map((c) => ({
        nombre: c.nombre,
        tipo: c.tipo,
        miembros: c.miembros,
        activa: c.miembros >= MIN_ACTIVE_MEMBERS,
        faltan: Math.max(0, MIN_ACTIVE_MEMBERS - c.miembros),
      })),
      invitaciones: { pendientes, maximo },
      plazos,
    };
  }

  async buscar(profileId: string, consulta: string, max = 8): Promise<ResultadoBusqueda[]> {
    const palabras = palabrasDeBusqueda(consulta);
    if (palabras.length === 0) return [];
    const legibles = await this.gruposLegibles(profileId);
    if (legibles.length === 0) return [];

    const ids = legibles.map((g) => g.id);
    const nombre = new Map(legibles.map((g) => [g.id, g.nombre]));
    const enTitulo = palabras.map((p) => ({ title: { contains: p, mode: INSENSITIVE } }));
    const enCuerpo = palabras.map((p) => ({ body: { contains: p, mode: INSENSITIVE } }));
    const comunidadDe = (groupId: string) => nombre.get(groupId) ?? '';

    const [debates, inquietudes, decisiones, grupos] = await Promise.all([
      this.prisma.proposal.findMany({
        where: { groupId: { in: ids }, hidden: false, status: { not: 'draft' }, OR: [...enTitulo, ...enCuerpo] },
        select: { id: true, title: true, body: true, status: true, kind: true, groupId: true },
        orderBy: { createdAt: 'desc' },
        take: max,
      }),
      this.prisma.inquietud.findMany({
        where: { groupId: { in: ids }, hidden: false, OR: [...enTitulo, ...enCuerpo] },
        select: { id: true, title: true, body: true, status: true, groupId: true },
        orderBy: { createdAt: 'desc' },
        take: max,
      }),
      this.prisma.decision.findMany({
        where: {
          fase: { in: ['votacion', 'contada'] },
          proposal: { groupId: { in: ids }, hidden: false, OR: enTitulo },
        },
        select: { fase: true, proposalId: true, proposal: { select: { title: true, body: true, groupId: true } } },
        orderBy: { createdAt: 'desc' },
        take: max,
      }),
      this.prisma.group.findMany({
        where: {
          id: { in: ids },
          type: 'trabajo',
          OR: [
            ...palabras.map((p) => ({ name: { contains: p, mode: INSENSITIVE } })),
            ...palabras.map((p) => ({ proposito: { contains: p, mode: INSENSITIVE } })),
          ],
        },
        select: { id: true, name: true, proposito: true, trabajoEstado: true, parentGroupId: true },
        take: max,
      }),
    ]);

    const delDebate: ResultadoBusqueda[] = debates.map((p) => ({
      clase: 'debate',
      titulo: p.title,
      extracto: extracto(p.body),
      comunidad: comunidadDe(p.groupId),
      estado: ESTADO_DEBATE[p.status as string] ?? (p.status as string),
      ruta: `/proposals/${p.id}`,
    }));
    const delaInquietud: ResultadoBusqueda[] = inquietudes.map((i) => ({
      clase: 'inquietud',
      titulo: i.title,
      extracto: extracto(i.body),
      comunidad: comunidadDe(i.groupId),
      estado: ESTADO_INQUIETUD[i.status as string] ?? (i.status as string),
      ruta: `/inquietudes/${i.id}`,
    }));
    const delaDecision: ResultadoBusqueda[] = decisiones.map((d) => ({
      clase: 'decision',
      titulo: d.proposal.title,
      extracto: extracto(d.proposal.body),
      comunidad: comunidadDe(d.proposal.groupId),
      estado: ESTADO_DECISION[d.fase as string] ?? (d.fase as string),
      ruta: `/proposals/${d.proposalId}`,
    }));
    const delGrupo: ResultadoBusqueda[] = grupos.map((g) => ({
      clase: 'grupo',
      titulo: g.name,
      extracto: extracto(g.proposito ?? ''),
      comunidad: comunidadDe(g.parentGroupId ?? g.id),
      estado: (g.trabajoEstado as string | null) ?? 'activo',
      ruta: `/grupos/${g.id}`,
    }));

    return intercalar([delDebate, delaInquietud, delaDecision, delGrupo], max);
  }

  // ─── Internos ──────────────────────────────────────────────────────────

  private async cargar(profileId: string) {
    const membresias = await this.prisma.groupMembership.findMany({
      where: { profileId, group: { isActive: true } },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            parentGroupId: true,
            trabajoTipo: true,
            _count: { select: { memberships: true } },
          },
        },
      },
    });
    const miembroDe = membresias.map((m) => m.group);

    const hijos =
      miembroDe.length === 0
        ? []
        : await this.prisma.group.findMany({
            where: {
              type: 'trabajo',
              isActive: true,
              parentGroupId: { in: miembroDe.map((g) => g.id) },
              // Una bifurcación solo la leen sus miembros: nombres y foro delatarían el voto.
              OR: [{ trabajoTipo: null }, { trabajoTipo: { not: 'bifurcacion' } }],
            },
            select: { id: true, name: true, type: true, parentGroupId: true, trabajoTipo: true },
          });

    const vistos = new Set<string>();
    const legibles: GrupoLegible[] = [];
    const agregar = (g: { id: string; name: string; type: GroupType; parentGroupId: string | null }) => {
      if (vistos.has(g.id)) return;
      vistos.add(g.id);
      legibles.push({ id: g.id, nombre: g.name, tipo: g.type, padreId: g.parentGroupId });
    };
    miembroDe.forEach(agregar);
    hijos.filter((g) => (g.trabajoTipo as string | null) !== 'bifurcacion').forEach(agregar);

    return { miembroDe, legibles };
  }

  private tipoDeComunidad(g: { type: GroupType; slug: string }): 'origen' | 'acogida' | 'general' | null {
    if ((g.type as string) === 'territorial_origin') return 'origen';
    if ((g.type as string) === 'territorial_residence') return 'acogida';
    return esNivelGeneral(g) ? 'general' : null;
  }

  /** Votaciones abiertas en sus grupos e inquietudes con plazo en sus comunidades, la más próxima primero. */
  private async plazos(legibles: GrupoLegible[], comunidadIds: string[]): Promise<EstadoPersona['plazos']> {
    if (legibles.length === 0) return [];
    const nombre = new Map(legibles.map((g) => [g.id, g.nombre]));
    const [votaciones, inquietudes] = await Promise.all([
      this.prisma.decision.findMany({
        where: {
          fase: 'votacion',
          votacionEndsAt: { not: null, gt: new Date() },
          proposal: { groupId: { in: legibles.map((g) => g.id) }, hidden: false },
        },
        select: { proposalId: true, votacionEndsAt: true, proposal: { select: { title: true, groupId: true } } },
        orderBy: { votacionEndsAt: 'asc' },
        take: MAX_PLAZOS,
      }),
      this.prisma.inquietud.findMany({
        where: { groupId: { in: comunidadIds }, hidden: false, status: 'en_plazo', deadlineAt: { not: null } },
        select: { id: true, title: true, deadlineAt: true, groupId: true },
        orderBy: { deadlineAt: 'asc' },
        take: MAX_PLAZOS,
      }),
    ]);

    const todos = [
      ...votaciones.flatMap((d) =>
        d.votacionEndsAt
          ? [{ que: `Votación abierta: ${d.proposal.title}`, comunidad: nombre.get(d.proposal.groupId) ?? '', fecha: d.votacionEndsAt, ruta: `/proposals/${d.proposalId}` }]
          : [],
      ),
      ...inquietudes.flatMap((i) =>
        i.deadlineAt
          ? [{ que: `Plazo de respuesta a la inquietud: ${i.title}`, comunidad: nombre.get(i.groupId) ?? '', fecha: i.deadlineAt, ruta: `/inquietudes/${i.id}` }]
          : [],
      ),
    ];
    return todos
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
      .slice(0, MAX_PLAZOS)
      .map(({ que, comunidad, fecha, ruta }) => ({ que, comunidad, vence: fecha.toISOString(), ruta }));
  }
}

const NOMBRE_TIPO = { origen: 'de origen', acogida: 'de acogida', general: 'general' } as const;

const NOMBRE_CUENTA: Record<string, string> = {
  invited: 'invitada, sin registrar',
  pending_verification: 'pendiente de verificación',
  verified_citizen: 'ciudadana verificada',
  observer: 'observadora',
  external_collaborator: 'colaboradora externa',
  rejected: 'rechazada',
  suspended: 'suspendida',
};

const NOMBRE_CONFIRMACION = { invitador: 'la de quien la invitó', segunda: 'la segunda confirmación' } as const;

/**
 * Escribe el estado y los resultados como texto para el asistente. Cada ruta se cambia por una
 * referencia `r1`, `r2`… y las rutas quedan aparte, en `refs`: ni una ruta ni un uuid llegan al texto.
 */
export function aMaterial(
  estado: EstadoPersona,
  resultados: ResultadoBusqueda[],
): { material: string; refs: Map<string, { texto: string; ruta: string }> } {
  const refs = new Map<string, { texto: string; ruta: string }>();
  const referencia = (texto: string, ruta: string): string => {
    const clave = `r${(refs.size + 1).toString()}`;
    refs.set(clave, { texto, ruta });
    return clave;
  };
  const limpio = (s: string): string => s.replace(REGEX_UUID, '').replace(/\s+/g, ' ').trim();

  const lineas: string[] = ['Situación de la persona:'];
  lineas.push(`- Cuenta: ${NOMBRE_CUENTA[estado.cuenta as string] ?? (estado.cuenta as string)}.`);
  if (estado.verificacion) {
    const faltan = estado.verificacion.faltan.map((k) => NOMBRE_CONFIRMACION[k]).join(' y ');
    lineas.push(
      `- Verificación: tiene ${estado.verificacion.tiene.toString()} de 2 confirmaciones${faltan ? `; falta ${faltan}` : ''}.`,
    );
  }
  if (estado.comunidades.length === 0) lineas.push('- Comunidades: todavía no pertenece a ninguna.');
  for (const c of estado.comunidades) {
    const activa = c.activa ? 'activa' : `todavía no activa, faltan ${c.faltan.toString()} personas`;
    lineas.push(`- Comunidad ${NOMBRE_TIPO[c.tipo]} «${limpio(c.nombre)}»: ${c.miembros.toString()} personas, ${activa}.`);
  }
  lineas.push(
    `- Invitaciones pendientes: ${estado.invitaciones.pendientes.toString()} de un máximo de ${estado.invitaciones.maximo.toString()}.`,
  );

  lineas.push('', 'Plazos cercanos:');
  if (estado.plazos.length === 0) lineas.push('- Ninguno.');
  for (const p of estado.plazos) {
    const r = referencia(limpio(p.que), p.ruta);
    lineas.push(`- [${r}] ${limpio(p.que)} (${limpio(p.comunidad)}), vence ${p.vence}.`);
  }

  lineas.push('', 'Resultados de la búsqueda:');
  if (resultados.length === 0) lineas.push('- Ninguno.');
  for (const x of resultados) {
    const r = referencia(limpio(x.titulo), x.ruta);
    lineas.push(`- [${r}] (${x.clase}, ${limpio(x.comunidad)}, ${limpio(x.estado)}) ${limpio(x.titulo)}: ${limpio(x.extracto)}`);
  }

  return { material: lineas.join('\n'), refs };
}
