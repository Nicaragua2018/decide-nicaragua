import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FraseAnalisis,
  FraseItem,
  FraseParaVotar,
  FraseResultado,
  FrasesResponse,
  FraseVotoValue,
  OpinionAnalysisResponse,
} from '@decide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesService } from '../rules/rules.service';
import { GroupAccessService } from '../groups/group-access.service';
import { motivoVisible } from '../forums/moderacion-motivo';
import { analyzeOpinions, isDivisiva, isPuente, seedFromId, type VoteRow } from './opinion-groups';

const VALOR: Record<FraseVotoValue, -1 | 0 | 1> = { de_acuerdo: 1, en_desacuerdo: -1, paso: 0 };
const MIN_GRUPO = 3;
/** Por debajo de 5 votos una frase no muestra porcentajes. */
const MIN_RESULTADO = 5;

/** Múltiplo de 5 más cercano. */
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/** Solo cuentan los votos de quienes siguen siendo miembros del grupo (la suspensión quita la membresía). */
function currentMembers(groupId: string) {
  return { profile: { memberships: { some: { groupId } } } };
}

function pct(parte: number, total: number): number {
  return total > 0 ? round5((100 * parte) / total) : 0;
}

interface TemaRow {
  id: string;
  groupId: string;
  status: string;
  hidden: boolean;
  /** Es miembro del grupo; si es false, solo lee desde el ámbito de un grupo de trabajo. */
  participa: boolean;
}

@Injectable()
export class FrasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
    private readonly access: GroupAccessService,
  ) {}


  /**
   * El tema debe existir. Para `participar`, la persona debe ser miembro de su grupo; para
   * `leer` basta con poder leerlo (miembro, o miembro del ámbito si es un grupo de trabajo).
   */
  private async tema(profileId: string, proposalId: string, modo: 'leer' | 'participar'): Promise<TemaRow> {
    const tema = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (!tema) throw new NotFoundException('Tema no encontrado.');
    if (modo === 'participar') {
      await this.access.requireParticipant(tema.groupId, profileId);
      return { ...(tema as Omit<TemaRow, 'participa'>), participa: true };
    }
    const { participa } = await this.access.requireReader(tema.groupId, profileId);
    return { ...(tema as Omit<TemaRow, 'participa'>), participa };
  }

  private assertWritable(tema: { status: string; hidden: boolean }): void {
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    if (tema.status !== 'open') throw new BadRequestException('Este tema ya no acepta frases.');
  }

  /**
   * Nunca devuelve recuentos exactos: con ellos (y el filtro de miembros actuales)
   * se deduciría el voto de quien deja el grupo comparando antes y después.
   */
  private resultado(counts: { deAcuerdo: number; enDesacuerdo: number; paso: number }): FraseResultado {
    const total = counts.deAcuerdo + counts.enDesacuerdo + counts.paso;
    const totalAprox = total === 0 ? 0 : Math.max(MIN_RESULTADO, round5(total));
    if (total < MIN_RESULTADO) {
      return { deAcuerdoPct: null, enDesacuerdoPct: null, pasoPct: null, totalAprox, suficiente: false };
    }
    return {
      deAcuerdoPct: pct(counts.deAcuerdo, total),
      enDesacuerdoPct: pct(counts.enDesacuerdo, total),
      pasoPct: pct(counts.paso, total),
      totalAprox,
      suficiente: true,
    };
  }

  async create(profileId: string, proposalId: string, text: string, ip: string): Promise<{ id: string }> {
    const tema = await this.tema(profileId, proposalId, 'participar');
    this.assertWritable(tema);
    const created = await this.prisma.frase.create({
      data: { proposalId, authorProfileId: profileId, text: text.trim() },
    });
    // Dentro de una bifurcación, sin actor ni ip: delataría quiénes la forman.
    const { quien } = await this.access.rastro(tema.groupId, profileId, ip);
    void this.audit.log({
      ...quien,
      action: 'frase.created',
      resource: `frase:${created.id}`,
      metadata: { proposalId },
    });
    return { id: created.id };
  }

  async list(profileId: string, proposalId: string): Promise<FrasesResponse> {
    const tema = await this.tema(profileId, proposalId, 'leer');
    if (tema.hidden) return { items: [], pendientes: 0 };
    // Una frase oculta solo la ve su autor (sin el texto), si participa; para los demás no existe.
    const frases = await this.prisma.frase.findMany({
      where: tema.participa
        ? { proposalId, OR: [{ hidden: false }, { hidden: true, authorProfileId: profileId }] }
        : { proposalId, hidden: false },
      orderBy: { createdAt: 'asc' },
    });
    const ocultas = frases.filter((f) => f.hidden).map((f) => f.id);
    const acciones = ocultas.length
      ? await this.prisma.moderationAction.findMany({
          where: { target: 'frase', targetId: { in: ocultas } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, targetId: true, causa: true, reason: true, status: true, createdAt: true },
        })
      : [];
    const ultima = new Map<string, (typeof acciones)[number]>();
    for (const a of acciones) if (!ultima.has(a.targetId)) ultima.set(a.targetId, a);
    // Quien solo lee no tiene votos propios (los de cuando era miembro no cuentan): no ve resultados.
    const mios = tema.participa
      ? await this.prisma.fraseVoto.findMany({
          where: { profileId, frase: { proposalId } },
          select: { fraseId: true, value: true },
        })
      : [];
    const miVoto = new Map(mios.map((v) => [v.fraseId, v.value as FraseVotoValue]));
    // Recuentos solo de las frases que la persona ya votó (independencia).
    const votadas = frases.filter((f) => miVoto.has(f.id)).map((f) => f.id);
    const grupos = votadas.length
      ? await this.prisma.fraseVoto.groupBy({ by: ['fraseId', 'value'], where: { fraseId: { in: votadas }, ...currentMembers(tema.groupId) }, _count: { _all: true } })
      : [];
    const conteo = new Map<string, { deAcuerdo: number; enDesacuerdo: number; paso: number }>();
    for (const g of grupos) {
      const c = conteo.get(g.fraseId) ?? { deAcuerdo: 0, enDesacuerdo: 0, paso: 0 };
      if (g.value === 'de_acuerdo') c.deAcuerdo = g._count._all;
      else if (g.value === 'en_desacuerdo') c.enDesacuerdo = g._count._all;
      else c.paso = g._count._all;
      conteo.set(g.fraseId, c);
    }
    const items: FraseItem[] = frases.map((f) => {
      if (f.hidden) {
        const a = ultima.get(f.id);
        return {
          id: f.id,
          text: '',
          hidden: true,
          isAuthor: true,
          myVote: null,
          resultado: null,
          hiddenReason: motivoVisible(a),
          moderationId: a && (a.status as string) === 'oculto' ? a.id : null,
        };
      }
      const mine = miVoto.get(f.id) ?? null;
      return {
        id: f.id,
        text: f.text,
        hidden: false,
        isAuthor: tema.participa && f.authorProfileId === profileId,
        myVote: mine,
        resultado: mine ? this.resultado(conteo.get(f.id) ?? { deAcuerdo: 0, enDesacuerdo: 0, paso: 0 }) : null,
        hiddenReason: null,
        moderationId: null,
      };
    });
    // Quien solo lee no vota: no tiene frases pendientes (ni ve resultados, porque no votó ninguna).
    const pendientes = tema.participa ? items.filter((i) => !i.hidden && i.myVote === null).length : 0;
    return { items, pendientes };
  }

  async next(profileId: string, proposalId: string): Promise<FraseParaVotar | null> {
    const tema = await this.tema(profileId, proposalId, 'leer');
    if (tema.hidden || !tema.participa) return null;
    const frases = await this.prisma.frase.findMany({ where: { proposalId, hidden: false }, orderBy: { createdAt: 'asc' } });
    const mios = await this.prisma.fraseVoto.findMany({ where: { profileId, frase: { proposalId } }, select: { fraseId: true } });
    const votadas = new Set(mios.map((v) => v.fraseId));
    const candidatas = frases.filter((f) => !votadas.has(f.id));
    if (candidatas.length === 0) return null;
    const cuentas = await this.prisma.fraseVoto.groupBy({
      by: ['fraseId'],
      where: { fraseId: { in: candidatas.map((f) => f.id) }, ...currentMembers(tema.groupId) },
      _count: { _all: true },
    });
    const n = new Map(cuentas.map((c) => [c.fraseId, c._count._all]));
    const menor = Math.min(...candidatas.map((f) => n.get(f.id) ?? 0));
    const empate = candidatas.filter((f) => (n.get(f.id) ?? 0) === menor);
    const elegida = empate[Math.floor(Math.random() * empate.length)]!;
    return { id: elegida.id, text: elegida.text };
  }

  async vote(profileId: string, fraseId: string, value: FraseVotoValue): Promise<FraseResultado> {
    const frase = await this.prisma.frase.findUnique({
      where: { id: fraseId },
      include: { proposal: { select: { groupId: true, status: true, hidden: true } } },
    });
    if (!frase) throw new NotFoundException('Frase no encontrada.');
    await this.access.requireParticipant(frase.proposal.groupId, profileId);
    this.assertWritable(frase.proposal);
    if (frase.hidden) throw new BadRequestException('Esta frase está oculta por moderación.');
    await this.prisma.fraseVoto.upsert({
      where: { fraseId_profileId: { fraseId, profileId } },
      update: { value },
      create: { fraseId, profileId, value },
    });
    const grupos = await this.prisma.fraseVoto.groupBy({ by: ['fraseId', 'value'], where: { fraseId, ...currentMembers(frase.proposal.groupId) }, _count: { _all: true } });
    const c = { deAcuerdo: 0, enDesacuerdo: 0, paso: 0 };
    for (const g of grupos) {
      if (g.value === 'de_acuerdo') c.deAcuerdo = g._count._all;
      else if (g.value === 'en_desacuerdo') c.enDesacuerdo = g._count._all;
      else c.paso = g._count._all;
    }
    return this.resultado(c);
  }

  async analysis(profileId: string, proposalId: string): Promise<OpinionAnalysisResponse> {
    const tema = await this.tema(profileId, proposalId, 'leer');
    const needed = await this.rules.getInt('debate.minimo_para_grupos', tema.groupId);
    if (tema.hidden) return { available: false, participants: 0, needed };

    const [frases, votos] = await Promise.all([
      this.prisma.frase.findMany({ where: { proposalId, hidden: false }, orderBy: { createdAt: 'asc' } }),
      this.prisma.fraseVoto.findMany({
        where: { frase: { proposalId, hidden: false }, ...currentMembers(tema.groupId) },
        select: { profileId: true, fraseId: true, value: true },
      }),
    ]);
    // Defensa extra: aunque la consulta ya filtra, solo cuentan votos de frases visibles.
    const visiblesIds = new Set(frases.map((f) => f.id));
    const rows: VoteRow[] = votos.filter((v) => visiblesIds.has(v.fraseId)).map((v) => ({
      profileId: v.profileId,
      fraseId: v.fraseId,
      value: VALOR[v.value as FraseVotoValue],
    }));
    const result = analyzeOpinions(rows, seedFromId(proposalId));
    if (result.participants < needed) return { available: false, participants: result.participants, needed };

    // Un grupo de menos de 3 personas ni se muestra ni cuenta para puentes o divisivas.
    const visibles = new Set(result.grupos.filter((g) => g.size >= MIN_GRUPO).map((g) => g.id));
    const analizadas = result.frases.map((f) => ({ ...f, porGrupo: f.porGrupo.filter((g) => visibles.has(g.grupo)) }));
    // Quien solo lee no votó: no ve puentes ni divisivas, ni cuántos puentes le faltan.
    const votadasPorMi = new Set(
      tema.participa ? votos.filter((v) => v.profileId === profileId).map((v) => v.fraseId) : [],
    );
    const texto = new Map(frases.map((f) => [f.id, f.text]));

    const aAnalisis = (f: (typeof analizadas)[number]): FraseAnalisis => ({
      fraseId: f.fraseId,
      text: texto.get(f.fraseId) ?? '',
      acuerdoPorGrupo: f.porGrupo.map((g) => ({ grupo: g.grupo, acuerdoPct: pct(g.deAcuerdo, g.total) })),
    });

    const puentesTodos = analizadas.filter((f) => isPuente(f));
    const puentes = puentesTodos.filter((f) => votadasPorMi.has(f.fraseId)).map(aAnalisis);
    // Si quien consulta tiene pocas frases sin votar, el número de puentes pendientes
    // delataría demasiado: solo se informa con 3 o más sin votar, y nunca cuando
    // coincide con las sin votar (diría que todas las pendientes son puentes).
    const sinVotar = frases.filter((f) => !votadasPorMi.has(f.id)).length;
    const pendientesPuente = puentesTodos.filter((f) => !votadasPorMi.has(f.fraseId)).length;
    const puentesSinVer =
      tema.participa && sinVotar >= MIN_GRUPO && pendientesPuente < sinVotar ? pendientesPuente : 0;
    const divisivas = analizadas.filter((f) => isDivisiva(f) && votadasPorMi.has(f.fraseId)).map(aAnalisis);

    return {
      available: true,
      participants: round5(result.participants),
      grupos: result.grupos
        .filter((g) => visibles.has(g.id))
        .map((g) => ({ id: g.id, size: Math.max(5, round5(g.size)) })),
      puentes,
      divisivas,
      puentesSinVer,
    };
  }
}
