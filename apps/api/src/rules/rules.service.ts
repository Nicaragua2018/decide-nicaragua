import { Injectable } from '@nestjs/common';
import { RULE_DEFINITIONS, ruleDefinition } from '@decide/shared';
import type { RuleDefinition, RuleView } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';

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

  async list(groupId: string | null): Promise<RuleView[]> {
    const defs = RULE_DEFINITIONS.filter((d) => d.level === 'colmena' || groupId !== null);
    const rows = await this.prisma.ruleValue.findMany({
      where: { OR: groupId ? [{ groupId: null }, { groupId }] : [{ groupId: null }] },
    });
    return defs.map((def) => {
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
        isDefault: row === undefined,
        enCurso: null,
        historial: [],
        puedoProponer: false,
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
