import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GENERAL_GROUP_NAME, RULE_DEFINITIONS } from '@decide/shared';
import type { RuleDefinition } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DeliberationService } from '../deliberation/deliberation.service';
import { GroupAccessService } from '../groups/group-access.service';
import { RulesService } from './rules.service';
import { conUnidad, esAmbitoDeReglas, esNivelGeneral } from './ambito-reglas';
import type { ProponerCambioDto } from './dto/proponer-cambio.dto';

const DIA_MS = 86_400_000;
const TITULO_MAX = 200;
const SOLUCION_TITULO_MAX = 140;
const SOLUCION_DESCRIPCION_MAX = 2000;

const NO_AMBITO = 'Las reglas se cambian en una comunidad de origen, de acogida o en el nivel general, no en un grupo de trabajo.';
const EN_CURSO = 'Ya hay un cambio en curso para esta regla.';

/**
 * Proponer el cambio de una regla: abre en el foro por defecto del ámbito un tema que nace como
 * propuesta formal, con una única solución sembrada («Cambiar a …»), y lo une a la regla en
 * `cambios_regla`. El resto es el ciclo normal de debate y votación.
 */
@Injectable()
export class CambiosReglaService {
  private readonly logger = new Logger(CambiosReglaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly deliberation: DeliberationService,
    private readonly access: GroupAccessService,
    private readonly audit: AuditService,
  ) {}

  async proponer(profileId: string, dto: ProponerCambioDto, ip: string): Promise<{ id: string; proposalId: string }> {
    const grupo = await this.prisma.group.findUnique({
      where: { id: dto.groupId },
      select: { id: true, type: true, slug: true },
    });
    if (!grupo) throw new NotFoundException('Comunidad no encontrada');
    const g = { type: grupo.type as string, slug: grupo.slug };
    if (!esAmbitoDeReglas(g)) throw new BadRequestException(NO_AMBITO);
    // Una persona suspendida pierde sus membresías: aquí también recibe 403.
    await this.access.requireParticipant(grupo.id, profileId);

    const def = RULE_DEFINITIONS.find((d) => d.key === dto.key);
    if (!def) throw new BadRequestException('Esa regla no existe.');
    if (def.level === 'colmena' && !esNivelGeneral(g)) {
      throw new BadRequestException(`Las reglas de la colmena se cambian en «${GENERAL_GROUP_NAME}».`);
    }

    const propuesto = valorValido(def, dto.valor);
    const scope = def.level === 'local' ? grupo.id : null;
    const actual =
      def.type === 'int' ? String(await this.rules.getInt(def.key, scope)) : await this.rules.getChoice(def.key, scope);
    if (propuesto === actual) throw new BadRequestException('Ese ya es el valor vigente.');

    const motivo = dto.motivo?.trim() ?? '';
    const frase = `Se propone cambiar «${def.label}» de ${conUnidad(def, actual)} a ${conUnidad(def, propuesto)}.`;
    const body = motivo.length > 0 ? `${frase}\n\n${motivo}` : frase;
    const dias = await this.rules.getInt('debate.plazo_dias', grupo.id);

    // Fuera de la transacción: una violación de unicidad dentro la abortaría.
    await this.deliberation.ensureDefaultForum(grupo.id);
    let creado: { id: string; proposalId: string };
    try {
      creado = await this.prisma.$transaction(async (tx) => {
        const topic = await this.deliberation.createTopicInDefaultForum(tx, {
          groupId: grupo.id,
          authorProfileId: profileId,
          title: `Cambiar la regla: ${def.label}`.slice(0, TITULO_MAX),
          body,
          abiertoPorComunidad: false,
        });
        await tx.proposal.update({
          where: { id: topic.id },
          data: { kind: 'propuesta', deliberationEndsAt: new Date(Date.now() + dias * DIA_MS) },
        });
        await tx.solucion.create({
          data: {
            proposalId: topic.id,
            authorProfileId: profileId,
            title: `Cambiar a ${conUnidad(def, propuesto)}`.slice(0, SOLUCION_TITULO_MAX),
            description: body.slice(0, SOLUCION_DESCRIPCION_MAX),
            origen: 'persona',
          },
        });
        const cambio = await tx.cambioRegla.create({
          data: {
            key: def.key,
            nivel: def.level,
            ambitoGroupId: grupo.id,
            valorAnterior: actual,
            valorPropuesto: propuesto,
            proposalId: topic.id,
            autorProfileId: profileId,
          },
        });
        return { id: cambio.id, proposalId: topic.id };
      });
    } catch (err) {
      // Índice parcial único: un solo cambio abierto por regla y ámbito.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(EN_CURSO);
      }
      throw err;
    }

    // Cambiar una regla es una acción cívica pública: se audita con quien la propone.
    const p = await this.prisma.profile
      .findUnique({ where: { id: profileId }, select: { userId: true } })
      .catch(() => null);
    void this.audit
      .log({
        ...(p?.userId ? { actorId: p.userId } : {}),
        action: 'regla.cambio_propuesto',
        resource: `cambio_regla:${creado.id}`,
        ip,
        metadata: { cambioId: creado.id, key: def.key },
      })
      .catch((err: unknown) => this.logger.error('Audit log failed', err));
    return creado;
  }
}

/**
 * Valor propuesto ya normalizado, o 400. Un entero se acepta solo como `-?\d+` dentro de
 * `min`/`max` (se guarda sin ceros a la izquierda); una opción, solo si está en `options`.
 */
export function valorValido(def: RuleDefinition, crudo: string): string {
  const v = crudo.trim();
  if (def.type === 'int') {
    const n = /^-?\d+$/.test(v) ? Number(v) : NaN;
    const min = def.min ?? Number.MIN_SAFE_INTEGER;
    const max = def.max ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      throw new BadRequestException(`El valor debe estar entre ${def.min ?? min} y ${def.max ?? max}.`);
    }
    return String(n);
  }
  if (!def.options?.includes(v)) throw new BadRequestException('Elige una de las opciones.');
  return v;
}
