import type { PrismaService } from '../prisma/prisma.service';

/** Mismo 403 para quien votó otra cosa, para quien no votó y para quien ya no es del ámbito. */
export const NO_ELEGIBLE = 'Solo quienes apoyaron esta solución pueden sumarse.';
/** Nombre con el que una bifurcación (y lo que lleva a la colmena) se ve desde fuera. */
export const NOMBRE_INICIATIVA = 'Iniciativa de un grupo';

const DIA_MS = 86_400_000;

export interface DecisionBifurcable {
  fase: string;
  resultado: string | null;
  modo: string | null;
  ganadoras: string[];
  candidatas: string[];
}

/**
 * Una candidata de una decisión contada puede bifurcarse si no hubo quórum, o si el modo era
 * excluyentes (con más de una candidata) y no ganó. Las decisiones de grupos de trabajo no se bifurcan.
 */
export function esBifurcable(d: DecisionBifurcable, solucionId: string, grupoType: string): boolean {
  if (grupoType === 'trabajo') return false;
  if (d.fase !== 'contada' || !d.candidatas.includes(solucionId)) return false;
  if (d.resultado === 'sin_quorum') return true;
  return d.candidatas.length > 1 && d.modo === 'excluyentes' && !d.ganadoras.includes(solucionId);
}

/** Fin del plazo para iniciar o reunir una bifurcación: `contadaAt + bifurcacion.plazo_dias`. */
export function finDelPlazo(contadaAt: Date, dias: number): Date {
  return new Date(contadaAt.getTime() + dias * DIA_MS);
}

/**
 * Elegible: su papeleta de esa decisión (no abstención) tiene `S` en `orden` y sigue siendo miembro
 * del ámbito. Nunca se dice por qué no lo es.
 */
export async function esElegible(
  prisma: Pick<PrismaService, 'decisionPapeleta' | 'groupMembership'>,
  decisionId: string,
  solucionId: string,
  ambitoId: string,
  profileId: string,
): Promise<boolean> {
  const [p, m] = await Promise.all([
    prisma.decisionPapeleta.findUnique({
      where: { decisionId_profileId: { decisionId, profileId } },
      select: { abstencion: true, orden: true },
    }),
    prisma.groupMembership.findUnique({ where: { groupId_profileId: { groupId: ambitoId, profileId } } }),
  ]);
  return Boolean(p && !p.abstencion && p.orden.includes(solucionId) && m);
}

/**
 * Soluciones que se llevan a la colmena desde una bifurcación: la de origen o una ganadora de sus
 * propias votaciones. Quien las lleva es miembro de la bifurcación; su nombre delataría su voto.
 */
export async function solucionesDeIniciativa(
  prisma: Pick<PrismaService, 'group' | 'solucion'>,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [origen, propias] = await Promise.all([
    prisma.group.findMany({
      where: { trabajoTipo: 'bifurcacion', origenSolucionId: { in: ids } },
      select: { origenSolucionId: true },
    }),
    prisma.solucion.findMany({
      where: { id: { in: ids }, proposal: { group: { trabajoTipo: 'bifurcacion' } } },
      select: { id: true },
    }),
  ]);
  const r = new Set<string>(propias.map((p) => p.id));
  for (const o of origen) if (o.origenSolucionId) r.add(o.origenSolucionId);
  return r;
}

/** Temas abiertos por la comunidad desde una inquietud llevada por una bifurcación: su autor no se muestra. */
export async function temasDeIniciativa(
  prisma: Pick<PrismaService, 'group' | 'solucion' | 'inquietud'>,
  temas: { id: string; abiertoPorComunidad: boolean }[],
): Promise<Set<string>> {
  const ids = temas.filter((t) => t.abiertoPorComunidad).map((t) => t.id);
  if (ids.length === 0) return new Set();
  const inqs = await prisma.inquietud.findMany({
    where: { proposalId: { in: ids }, origenSolucionId: { not: null } },
    select: { proposalId: true, origenSolucionId: true },
  });
  const anonimas = await solucionesDeIniciativa(
    prisma,
    inqs.map((i) => i.origenSolucionId).filter((x): x is string => x !== null),
  );
  return new Set(
    inqs
      .filter((i) => i.origenSolucionId !== null && anonimas.has(i.origenSolucionId))
      .map((i) => i.proposalId)
      .filter((x): x is string => x !== null),
  );
}
