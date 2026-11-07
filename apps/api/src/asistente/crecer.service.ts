import { Injectable } from '@nestjs/common';
import { MIN_ACTIVE_MEMBERS, type CrecerView } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AsistenteService } from './asistente.service';
import { conLimite } from './con-limite';

export const META_ACTIVA = 20;

const DIA_MS = 24 * 3_600_000;
const AVISO_DIAS = 7;
const MAX_TEXTO = 600;
const CACHE_SEGUNDOS = 26 * 3600;
const TIEMPO_MAXIMO_MS = 8000;
/** Tiempo máximo de cada operación de Redis: un Redis caído no puede demorar la tarjeta. */
const REDIS_MAXIMO_MS = 300;

export const GARANTIAS: readonly string[] = [
  'identidad protegida',
  'voto secreto',
  'reglas votadas por todos',
  'sin caudillos',
  'cada miembro avalado por dos personas',
];

export const FACILIDADES: readonly string[] = [
  'debates y votaciones propios',
  'grupos de trabajo',
  'comisiones',
  'apoyo mutuo en papeles, trabajo y seguridad',
];

type Texto = { texto: string; mensajeInvitacion: string };
type Datos = { comunidad: string; miembros: number; activa: boolean; faltan: number };

export const ESQUEMA_CRECER: Record<string, unknown> = {
  type: 'object',
  properties: {
    texto: { type: 'string', description: 'Dos o tres frases cálidas en español sencillo, sin nombres de personas.' },
    mensajeInvitacion: {
      type: 'string',
      description: 'Mensaje corto en primera persona para invitar a alguien de confianza, sin enlaces.',
    },
  },
  required: ['texto', 'mensajeInvitacion'],
};

export function esTextoCrecer(x: unknown): x is Texto {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  const ok = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXTO;
  return ok(r['texto']) && ok(r['mensajeInvitacion']);
}

export const TAREA_CRECER = `Tarea: animar a una persona de una comunidad de Nicaragua Decide a invitar a alguien de confianza para que la comunidad crezca.
- Anima sin presionar.
- No prometas nada que no esté en la lista de garantías y facilidades del material.
- No nombres a personas.
- «texto» (máximo ${MAX_TEXTO} caracteres) le habla a la persona: dice cómo va la comunidad y por qué vale la pena invitar.
- «mensajeInvitacion» (máximo ${MAX_TEXTO} caracteres) lo enviará la persona a alguien de confianza: escríbelo en primera persona y sin enlaces.`;

/** Texto fijo de reserva, cuando el asistente no responde. */
export function textoSinAsistente(d: Datos): Texto {
  const personas = d.faltan === 1 ? 'Falta 1 persona' : `Faltan ${d.faltan} personas`;
  const miembros = d.miembros === 1 ? '1 miembro' : `${d.miembros} miembros`;
  const meta = d.activa ? `para llegar a ${META_ACTIVA}` : 'para activar la comunidad';
  return {
    texto: `${d.comunidad} tiene ${miembros}. ${personas} ${meta}. Invitar a alguien de confianza ayuda a que la comunidad crezca.`,
    mensajeInvitacion:
      `Te invito a sumarte a ${d.comunidad} en Nicaragua Decide. Ahí cada persona tiene su voz, ` +
      `el voto es secreto, tu identidad está protegida y las reglas las votamos entre todos. Si quieres, te cuento más.`,
  };
}

function leerGuardado(bruto: string): Texto | null {
  try {
    const x: unknown = JSON.parse(bruto);
    return esTextoCrecer(x) ? { texto: x.texto, mensajeInvitacion: x.mensajeInvitacion } : null;
  } catch {
    return null;
  }
}

/** Tarjeta «Haz crecer tu comunidad»: cuántas personas faltan y un mensaje para invitar. */
@Injectable()
export class CrecerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asistente: AsistenteService,
    private readonly redis: RedisService,
  ) {}

  async ver(groupId: string, profileId: string, ahora: Date = new Date()): Promise<CrecerView> {
    if (!this.asistente.activo()) return { mostrar: false };

    const grupo = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true, type: true, isActive: true },
    });
    if (!grupo || !grupo.isActive || (grupo.type !== 'territorial_origin' && grupo.type !== 'territorial_residence')) {
      return { mostrar: false };
    }

    const miembro = await this.prisma.groupMembership.findUnique({
      where: { groupId_profileId: { groupId, profileId } },
      select: { id: true },
    });
    if (!miembro) return { mostrar: false };

    const cerrado = await this.prisma.avisoCerrado.findUnique({
      where: { profileId_clave: { profileId, clave: `crecer:${groupId}` } },
      select: { hasta: true },
    });
    if (cerrado && cerrado.hasta.getTime() > ahora.getTime()) return { mostrar: false };

    const miembros = await this.prisma.groupMembership.count({ where: { groupId } });
    if (miembros >= META_ACTIVA) return { mostrar: false };

    const activa = miembros >= MIN_ACTIVE_MEMBERS;
    const meta = activa ? META_ACTIVA : MIN_ACTIVE_MEMBERS;
    const datos: Datos = { comunidad: grupo.name, miembros, activa, faltan: meta - miembros };
    const base = { mostrar: true as const, ...datos, meta };

    const redactado = await this.redactar(groupId, datos, ahora);
    if (redactado === null) return { ...base, ...textoSinAsistente(datos), deAsistente: false };
    return { ...base, ...redactado, deAsistente: true };
  }

  async cerrar(groupId: string, profileId: string, ahora: Date = new Date()): Promise<void> {
    const clave = `crecer:${groupId}`;
    const hasta = new Date(ahora.getTime() + AVISO_DIAS * DIA_MS);
    await this.prisma.avisoCerrado.upsert({
      where: { profileId_clave: { profileId, clave } },
      create: { profileId, clave, hasta },
      update: { hasta },
    });
  }

  /**
   * Texto del día, en caché. Devuelve null si Redis no responde (y entonces no se pide a la IA)
   * o si la IA no responde: en ambos casos se usa el texto fijo.
   */
  private async redactar(groupId: string, datos: Datos, ahora: Date): Promise<Texto | null> {
    const clave = `asistente:crecer:${groupId}:${ahora.toISOString().slice(0, 10)}`;
    // conLimite da null si Redis falla o tarda; un fallo de caché llega envuelto en { valor }.
    const lectura = await conLimite(
      Promise.resolve()
        .then(() => this.redis.get(clave))
        .then((valor) => ({ valor })),
      REDIS_MAXIMO_MS,
    );
    if (lectura === null) return null;
    const guardado = lectura.valor ? leerGuardado(lectura.valor) : null;
    if (guardado) return guardado;

    // Material sin ids ni nombres de personas.
    const material = [
      `Comunidad: ${datos.comunidad}`,
      `Miembros: ${datos.miembros}`,
      `Activa: ${datos.activa ? 'sí' : 'no'}`,
      `Faltan: ${datos.faltan}`,
      'Garantías:',
      ...GARANTIAS.map((g) => `- ${g}`),
      'Facilidades:',
      ...FACILIDADES.map((f) => `- ${f}`),
    ].join('\n');
    const salida = await this.asistente.pedir({
      modelo: 'rapido',
      prioridad: 'interactiva',
      timeoutMs: TIEMPO_MAXIMO_MS,
      tarea: TAREA_CRECER,
      material,
      herramienta: { nombre: 'animar_comunidad', esquema: ESQUEMA_CRECER },
      validar: esTextoCrecer,
    });
    if (!salida) return null;

    const texto = { texto: salida.texto.trim(), mensajeInvitacion: salida.mensajeInvitacion.trim() };
    await conLimite(
      Promise.resolve().then(() => this.redis.set(clave, JSON.stringify(texto), CACHE_SEGUNDOS)),
      REDIS_MAXIMO_MS,
    );
    return texto;
  }
}
