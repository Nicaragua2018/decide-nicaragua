import { Injectable } from '@nestjs/common';
import { GENERAL_GROUP_SLUG, RULE_DEFINITIONS, ruleDefinition } from '@decide/shared';
import type { CambioReglaView, CambioReglaEstadoValue, RuleDefinition, RuleView } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CAMBIO_ABIERTO, esAmbitoDeReglas } from './ambito-reglas';

/** Cambios resueltos que se muestran por regla. */
const HISTORIAL_MAX = 10;

interface CambioFila {
  id: string;
  key: string;
  nivel: string;
  valorAnterior: string;
  valorPropuesto: string;
  estado: string;
  proposalId: string;
  createdAt: Date;
  resueltoAt: Date | null;
}

/** Vista pública de un cambio: sin autor ni ámbito. */
function vistaCambio(c: CambioFila): CambioReglaView {
  return {
    id: c.id,
    key: c.key,
    nivel: c.nivel === 'colmena' ? 'colmena' : 'local',
    valorAnterior: c.valorAnterior,
    valorPropuesto: c.valorPropuesto,
    estado: c.estado as CambioReglaEstadoValue,
    proposalId: c.proposalId,
    createdAt: c.createdAt.toISOString(),
    resueltoAt: c.resueltoAt ? c.resueltoAt.toISOString() : null,
  };
}

const abierto = (c: CambioFila): boolean => (CAMBIO_ABIERTO as readonly string[]).includes(c.estado);
/** Más reciente primero: por fecha de resolución y, a falta de ella, de creación. */
const masReciente = (a: CambioFila, b: CambioFila): number =>
  (b.resueltoAt ?? b.createdAt).getTime() - (a.resueltoAt ?? a.createdAt).getTime();

/** Lectura de reglas en dos niveles: colmena y comunidad (local). */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getInt(key: string, groupId: string | null): Promise<number> {
    const def = ruleDefinition(key);
    if (def.type !== 'int') throw new Error(`La regla ${key} no es numérica`);
    const raw = await this.stored(def, groupId);
    return this.effectiveInt(def, raw);
  }

  async getChoice(key: string, groupId: string | null): Promise<string> {
    const def = ruleDefinition(key);
    if (def.type !== 'choice') throw new Error(`La regla ${key} no es de opciones`);
    const raw = await this.stored(def, groupId);
    return this.effectiveChoice(def, raw);
  }

  /**
   * Reglas con su valor vigente, el cambio en curso y los últimos cambios resueltos. Sin `profileId`
   * (página pública) `puedoProponer` es siempre false. Las de la colmena se cambian en el nivel
   * general; las locales, en `groupId` si es una comunidad ámbito (no un grupo de trabajo).
   */
  async list(groupId: string | null, profileId?: string): Promise<RuleView[]> {
    const defs = RULE_DEFINITIONS.filter((d) => d.level === 'colmena' || groupId !== null);
    const [rows, cambiosRaw, general, grupo] = await Promise.all([
      this.prisma.ruleValue.findMany({
        where: { OR: groupId ? [{ groupId: null }, { groupId }] : [{ groupId: null }] },
      }),
      this.prisma.cambioRegla.findMany({
        where: { OR: [{ nivel: 'colmena' }, ...(groupId ? [{ nivel: 'local', ambitoGroupId: groupId }] : [])] },
        select: {
          id: true, key: true, nivel: true, valorAnterior: true, valorPropuesto: true, estado: true,
          proposalId: true, createdAt: true, resueltoAt: true,
        },
      }),
      profileId ? this.prisma.group.findUnique({ where: { slug: GENERAL_GROUP_SLUG }, select: { id: true } }) : null,
      profileId && groupId ? this.prisma.group.findUnique({ where: { id: groupId }, select: { type: true, slug: true } }) : null,
    ]);
    const cambios: CambioFila[] = cambiosRaw;

    // Dónde puede proponer quien consulta: miembro actual del nivel general (colmena) y del ámbito (locales).
    let puedeColmena = false;
    let puedeLocal = false;
    if (profileId) {
      const ambitoLocal = groupId && grupo && esAmbitoDeReglas({ type: grupo.type as string, slug: grupo.slug }) ? groupId : null;
      const buscar = [general?.id, ambitoLocal].filter((x): x is string => typeof x === 'string');
      const mias =
        buscar.length > 0
          ? new Set(
              (
                await this.prisma.groupMembership.findMany({
                  where: { profileId, groupId: { in: buscar } },
                  select: { groupId: true },
                })
              ).map((m) => m.groupId),
            )
          : new Set<string>();
      puedeColmena = general !== null && general !== undefined && mias.has(general.id);
      puedeLocal = ambitoLocal !== null && mias.has(ambitoLocal);
    }

    return defs.map((def) => {
      const deLaRegla = cambios.filter((c) => c.key === def.key && c.nivel === def.level);
      const enCurso = deLaRegla.find(abierto) ?? null;
      const historial = deLaRegla.filter((c) => !abierto(c)).sort(masReciente).slice(0, HISTORIAL_MAX).map(vistaCambio);
      const puede = def.level === 'colmena' ? puedeColmena : puedeLocal;
      const wanted = def.level === 'local' ? groupId : null;
      const row = rows.find((r) => r.key === def.key && r.groupId === wanted);
      const raw = row?.value ?? null;
      const value = def.type === 'int' ? String(this.effectiveInt(def, raw)) : this.effectiveChoice(def, raw);
      return {
        key: def.key,
        level: def.level,
        label: def.label,
        type: def.type,
        ...(def.unit !== undefined && { unit: def.unit }),
        value,
        default: def.default,
        ...(def.min !== undefined && { min: def.min }),
        ...(def.max !== undefined && { max: def.max }),
        ...(def.options !== undefined && { options: def.options }),
        conectada: def.conectada,
        isDefault: row === undefined,
        enCurso: enCurso ? vistaCambio(enCurso) : null,
        historial,
        puedoProponer: puede && def.conectada && enCurso === null,
      };
    });
  }

  /** Valor guardado (sin validar) para esta regla; null si no hay fila. */
  private async stored(def: RuleDefinition, groupId: string | null): Promise<string | null> {
    const scope = def.level === 'local' ? groupId : null;
    const row = await this.prisma.ruleValue.findFirst({ where: { key: def.key, groupId: scope } });
    return row?.value ?? null;
  }

  private effectiveInt(def: RuleDefinition, raw: string | null): number {
    const fallback = Number(def.default);
    if (raw === null || !/^-?\d+$/.test(raw)) return fallback;
    const n = Number(raw);
    if (def.min !== undefined && n < def.min) return fallback;
    if (def.max !== undefined && n > def.max) return fallback;
    return n;
  }

  private effectiveChoice(def: RuleDefinition, raw: string | null): string {
    return raw !== null && def.options?.includes(raw) ? raw : def.default;
  }
}
