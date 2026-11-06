import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GENERAL_GROUP_NAME, RULE_DEFINITIONS, conUnidad } from '@decide/shared';
import type { RuleDefinition } from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DeliberationService } from '../deliberation/deliberation.service';
import { GroupAccessService } from '../groups/group-access.service';
import { RulesService } from './rules.service';
import {
  PUESTOS_INCOHERENTES,
  esAmbitoDeReglas,
  esNivelGeneral,
  guardarValor,
  normalizarValor,
  parDePuestos,
  puestosIncoherentes,
  valorVigenteTx,
} from './ambito-reglas';
import type { ProponerCambioDto } from './dto/proponer-cambio.dto';

const DIA_MS = 86_400_000;
const TITULO_MAX = 200;
const SOLUCION_TITULO_MAX = 140;
const SOLUCION_DESCRIPCION_MAX = 2000;
/** Cambios resueltos como mucho por pasada; el resto espera a la siguiente. */
const LOTE = 100;
/** Días que un cambio de la colmena espera a la mesa; después queda rechazado_mesa y libera la regla. */
export const PLAZO_MESA_DIAS = 30;

const NO_AMBITO = 'Las reglas se cambian en una comunidad de origen, de acogida o en el nivel general, no en un grupo de trabajo.';
const EN_CURSO = 'Ya hay un cambio en curso para esta regla.';
const SIN_EFECTO = 'Esta regla aún no tiene efecto: se conecta con las elecciones (plan 3C).';

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
    // Una votación nunca debe quedar sin efecto: las reglas que aún no lee ningún código no se proponen.
    if (!def.conectada) throw new BadRequestException(SIN_EFECTO);

    const propuesto = valorValido(def, dto.valor);
    const scope = def.level === 'local' ? grupo.id : null;
    const actual =
      def.type === 'int' ? String(await this.rules.getInt(def.key, scope)) : await this.rules.getChoice(def.key, scope);
    if (propuesto === actual) throw new BadRequestException('Ese ya es el valor vigente.');
    const par = parDePuestos(def.key);
    if (par && puestosIncoherentes(def.key, propuesto, String(await this.rules.getInt(par, scope)))) {
      throw new BadRequestException(PUESTOS_INCOHERENTES);
    }

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

  // ─── Aplicar el resultado ─────────────────────────────────────────────────

  /**
   * Pasada del programador: cada cambio en votación cuyo tema ya tiene la decisión contada o
   * cancelada se resuelve una sola vez, en su propia transacción (un error no detiene a los demás).
   * Devuelve cuántos cambios resolvió esta pasada.
   */
  async procesarResultados(): Promise<number> {
    const pendientes = await this.prisma.cambioRegla.findMany({
      where: { estado: 'en_votacion', proposal: { decision: { fase: { in: ['contada', 'cancelada'] } } } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: LOTE,
    });
    let n = 0;
    for (const { id } of pendientes) {
      try {
        const hecho = await this.procesarUno(id);
        if (!hecho) continue;
        n++;
        void this.audit
          .log({ action: hecho.accion, resource: `cambio_regla:${id}`, metadata: { cambioId: id, key: hecho.key } })
          .catch((err: unknown) => this.logger.error('Audit log failed', err));
      } catch (err) {
        this.logger.error(`No se pudo resolver el cambio ${id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return n;
  }

  /**
   * Resuelve un cambio con la fila bloqueada. El `updateMany` condicionado a `en_votacion` va
   * antes de cualquier escritura: si otra pasada ya lo tomó, no se escribe nada.
   * Un valor que ya no cabe en la definición actual de la regla (límites que cambiaron entre la
   * propuesta y la aplicación, o una regla que ya no existe o cambió de nivel) deja el cambio
   * `rechazado` y no se guarda.
   */
  private async procesarUno(id: string): Promise<{ accion: string; key: string } | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM cambios_regla WHERE id = ${id}::uuid FOR UPDATE`);
      const c = await tx.cambioRegla.findUnique({
        where: { id },
        select: {
          id: true, key: true, nivel: true, ambitoGroupId: true, valorPropuesto: true, estado: true,
          proposal: { select: { decision: { select: { fase: true, resultado: true } } } },
        },
      });
      const d = c?.proposal.decision;
      if (!c || (c.estado as string) !== 'en_votacion' || !d) return null;
      const fase = d.fase as string;
      if (fase !== 'contada' && fase !== 'cancelada') return null;

      const ahora = new Date();
      const tomar = async (estado: CambioEstadoFinal, resuelto: boolean): Promise<boolean> =>
        (
          await tx.cambioRegla.updateMany({
            where: { id, estado: 'en_votacion' },
            data: { estado, ...(resuelto ? { resueltoAt: ahora } : {}) },
          })
        ).count === 1;
      const rechazar = async (estado: CambioEstadoFinal) =>
        (await tomar(estado, true)) ? { accion: 'regla.cambio_rechazado', key: c.key } : null;

      if (fase === 'cancelada') return rechazar('anulado');
      const resultado = d.resultado as string | null;
      if (resultado === 'sin_quorum') return rechazar('sin_participacion');
      if (resultado !== 'aprobada') return rechazar('rechazado');

      const def = RULE_DEFINITIONS.find((x) => x.key === c.key);
      const valor = def && def.level === c.nivel ? normalizarValor(def, c.valorPropuesto) : null;
      if (!def || valor === null) return rechazar('rechazado');

      if (def.level === 'local') {
        // El par mínimo/máximo de puestos pudo cambiar mientras se votaba: se comprueba otra vez.
        const par = parDePuestos(def.key);
        const defPar = par ? RULE_DEFINITIONS.find((x) => x.key === par) : undefined;
        if (defPar && puestosIncoherentes(def.key, valor, await valorVigenteTx(tx, defPar, c.ambitoGroupId))) {
          return rechazar('rechazado');
        }
        if (!(await tomar('aplicado', true))) return null;
        await guardarValor(tx, def.key, c.ambitoGroupId, valor);
        return { accion: 'regla.cambio_aplicado', key: c.key };
      }

      // Colmena: la mesa lo ejecuta con 2 aprobaciones (la acción no tiene proponente).
      if (!(await tomar('pendiente_mesa', false))) return null;
      const accion = await tx.boardAction.create({
        data: {
          type: 'change_rule',
          params: { key: def.key, valor, cambioId: c.id },
          reason: 'Cambio de regla aprobado por la comunidad',
        },
        select: { id: true },
      });
      await tx.cambioRegla.update({ where: { id }, data: { boardActionId: accion.id } });
      return { accion: 'regla.cambio_enviado_a_mesa', key: c.key };
    });
  }

  // ─── Vencimiento en la mesa ───────────────────────────────────────────────

  /**
   * Pasada del programador: la acción de la mesa de un cambio de la colmena que lleva más de
   * {@link PLAZO_MESA_DIAS} días sin resolverse queda rechazada y su cambio, `rechazado_mesa`
   * (la regla queda libre para otra propuesta). Cada una en su propia transacción, con la acción
   * bloqueada como en el voto de la mesa. Devuelve cuántos cambios venció.
   */
  async vencerPendientesMesa(ahora: Date = new Date()): Promise<number> {
    const limite = new Date(ahora.getTime() - PLAZO_MESA_DIAS * DIA_MS);
    const acciones = await this.prisma.boardAction.findMany({
      where: { type: 'change_rule', status: 'pending', createdAt: { lt: limite } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: LOTE,
    });
    let n = 0;
    for (const { id } of acciones) {
      try {
        const cambio = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT id FROM board_actions WHERE id = ${id}::uuid FOR UPDATE`);
          const tomada = await tx.boardAction.updateMany({
            where: { id, status: 'pending', createdAt: { lt: limite } },
            data: { status: 'rejected', resolvedAt: ahora },
          });
          if (tomada.count === 0) return null;
          const c = await tx.cambioRegla.findFirst({
            where: { boardActionId: id, estado: 'pendiente_mesa' },
            select: { id: true, key: true },
          });
          if (!c) return null;
          const cerrado = await tx.cambioRegla.updateMany({
            where: { id: c.id, estado: 'pendiente_mesa' },
            data: { estado: 'rechazado_mesa', resueltoAt: ahora },
          });
          return cerrado.count === 1 ? c : null;
        });
        if (!cambio) continue;
        n++;
        void this.audit
          .log({
            action: 'regla.cambio_rechazado',
            resource: `cambio_regla:${cambio.id}`,
            metadata: { cambioId: cambio.id, key: cambio.key },
          })
          .catch((err: unknown) => this.logger.error('Audit log failed', err));
      } catch (err) {
        this.logger.error(`No se pudo vencer la acción ${id}: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return n;
  }
}

type CambioEstadoFinal = 'aplicado' | 'pendiente_mesa' | 'rechazado' | 'sin_participacion' | 'anulado';

/**
 * Valor propuesto ya normalizado, o 400. Un entero se acepta solo como `-?\d+` dentro de
 * `min`/`max` (se guarda sin ceros a la izquierda); una opción, solo si está en `options`.
 */
export function valorValido(def: RuleDefinition, crudo: string): string {
  const v = normalizarValor(def, crudo);
  if (v !== null) return v;
  if (def.type === 'int') {
    throw new BadRequestException(
      `El valor debe estar entre ${def.min ?? Number.MIN_SAFE_INTEGER} y ${def.max ?? Number.MAX_SAFE_INTEGER}.`,
    );
  }
  throw new BadRequestException('Elige una de las opciones.');
}
