import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { analyzeOpinions, isDivisiva, isPuente, seedFromId, type VoteRow } from './opinion-groups';

const VALOR: Record<FraseVotoValue, -1 | 0 | 1> = { de_acuerdo: 1, en_desacuerdo: -1, paso: 0 };
const MIN_GRUPO = 3;

/** Múltiplo de 5 más cercano. */
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

function pct(parte: number, total: number): number {
  return total > 0 ? round5((100 * parte) / total) : 0;
}

interface TemaRow {
  id: string;
  groupId: string;
  status: string;
  hidden: boolean;
}

@Injectable()
export class FrasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rules: RulesService,
  ) {}

  private async requireMembership(groupId: string, profileId: string): Promise<void> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_profileId: { groupId, profileId } },
    });
    if (!m) throw new ForbiddenException('Solo los miembros de esta comunidad pueden participar.');
  }

  private async actorId(profileId: string): Promise<{ actorId: string } | Record<never, never>> {
    const p = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
    return p?.userId ? { actorId: p.userId } : {};
  }

  /** El tema debe existir y la persona ser miembro de su grupo. */
  private async tema(profileId: string, proposalId: string): Promise<TemaRow> {
    const tema = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, groupId: true, status: true, hidden: true },
    });
    if (!tema) throw new NotFoundException('Tema no encontrado.');
    await this.requireMembership(tema.groupId, profileId);
    return tema as TemaRow;
  }

  private assertWritable(tema: { status: string; hidden: boolean }): void {
    if (tema.hidden) throw new BadRequestException('Este tema está oculto por moderación.');
    if (tema.status !== 'open') throw new BadRequestException('Este tema ya no acepta frases.');
  }

  private resultado(counts: { deAcuerdo: number; enDesacuerdo: number; paso: number }): FraseResultado {
    const total = counts.deAcuerdo + counts.enDesacuerdo + counts.paso;
    return { ...counts, total, acuerdoPct: pct(counts.deAcuerdo, total) };
  }

  async create(profileId: string, proposalId: string, text: string, ip: string): Promise<{ id: string }> {
    const tema = await this.tema(profileId, proposalId);
    this.assertWritable(tema);
    const created = await this.prisma.frase.create({
      data: { proposalId, authorProfileId: profileId, text: text.trim() },
    });
    void this.audit.log({
      ...(await this.actorId(profileId)),
      action: 'frase.created',
      resource: `frase:${created.id}`,
      ip,
      metadata: { proposalId },
    });
    return { id: created.id };
  }

  async list(profileId: string, proposalId: string): Promise<FrasesResponse> {
    const tema = await this.tema(profileId, proposalId);
    if (tema.hidden) return { items: [], pendientes: 0 };
    const frases = await this.prisma.frase.findMany({
      where: { proposalId, hidden: false },
      orderBy: { createdAt: 'asc' },
    });
    const mios = await this.prisma.fraseVoto.findMany({
      where: { profileId, frase: { proposalId } },
      select: { fraseId: true, value: true },
    });
    const miVoto = new Map(mios.map((v) => [v.fraseId, v.value as FraseVotoValue]));
    // Recuentos solo de las frases que la persona ya votó (independencia).
    const votadas = frases.filter((f) => miVoto.has(f.id)).map((f) => f.id);
    const grupos = votadas.length
      ? await this.prisma.fraseVoto.groupBy({ by: ['fraseId', 'value'], where: { fraseId: { in: votadas } }, _count: { _all: true } })
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
      const mine = miVoto.get(f.id) ?? null;
      return {
        id: f.id,
        text: f.text,
        hidden: false,
        isAuthor: f.authorProfileId === profileId,
        myVote: mine,
        resultado: mine ? this.resultado(conteo.get(f.id) ?? { deAcuerdo: 0, enDesacuerdo: 0, paso: 0 }) : null,
        hiddenReason: null,
        moderationId: null,
      };
    });
    return { items, pendientes: items.filter((i) => i.myVote === null).length };
  }

  async next(profileId: string, proposalId: string): Promise<FraseParaVotar | null> {
    const tema = await this.tema(profileId, proposalId);
    if (tema.hidden) return null;
    const frases = await this.prisma.frase.findMany({ where: { proposalId, hidden: false }, orderBy: { createdAt: 'asc' } });
    const mios = await this.prisma.fraseVoto.findMany({ where: { profileId, frase: { proposalId } }, select: { fraseId: true } });
    const votadas = new Set(mios.map((v) => v.fraseId));
    const candidatas = frases.filter((f) => !votadas.has(f.id));
    if (candidatas.length === 0) return null;
    const cuentas = await this.prisma.fraseVoto.groupBy({
      by: ['fraseId'],
      where: { fraseId: { in: candidatas.map((f) => f.id) } },
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
    await this.requireMembership(frase.proposal.groupId, profileId);
    this.assertWritable(frase.proposal);
    if (frase.hidden) throw new BadRequestException('Esta frase está oculta por moderación.');
    await this.prisma.fraseVoto.upsert({
      where: { fraseId_profileId: { fraseId, profileId } },
      update: { value },
      create: { fraseId, profileId, value },
    });
    const grupos = await this.prisma.fraseVoto.groupBy({ by: ['fraseId', 'value'], where: { fraseId }, _count: { _all: true } });
    const c = { deAcuerdo: 0, enDesacuerdo: 0, paso: 0 };
    for (const g of grupos) {
      if (g.value === 'de_acuerdo') c.deAcuerdo = g._count._all;
      else if (g.value === 'en_desacuerdo') c.enDesacuerdo = g._count._all;
      else c.paso = g._count._all;
    }
    return this.resultado(c);
  }

  async analysis(profileId: string, proposalId: string): Promise<OpinionAnalysisResponse> {
    const tema = await this.tema(profileId, proposalId);
    const needed = await this.rules.getInt('debate.minimo_para_grupos', tema.groupId);
    if (tema.hidden) return { available: false, participants: 0, needed };

    const [frases, votos] = await Promise.all([
      this.prisma.frase.findMany({ where: { proposalId, hidden: false }, orderBy: { createdAt: 'asc' } }),
      this.prisma.fraseVoto.findMany({
        where: { frase: { proposalId, hidden: false } },
        select: { profileId: true, fraseId: true, value: true },
      }),
    ]);
    const rows: VoteRow[] = votos.map((v) => ({
      profileId: v.profileId,
      fraseId: v.fraseId,
      value: VALOR[v.value as FraseVotoValue],
    }));
    const result = analyzeOpinions(rows, seedFromId(proposalId));
    if (result.participants < needed) return { available: false, participants: result.participants, needed };

    // Un grupo de menos de 3 personas ni se muestra ni cuenta para puentes o divisivas.
    const visibles = new Set(result.grupos.filter((g) => g.size >= MIN_GRUPO).map((g) => g.id));
    const analizadas = result.frases.map((f) => ({ ...f, porGrupo: f.porGrupo.filter((g) => visibles.has(g.grupo)) }));
    const votadasPorMi = new Set(votos.filter((v) => v.profileId === profileId).map((v) => v.fraseId));
    const texto = new Map(frases.map((f) => [f.id, f.text]));

    const aAnalisis = (f: (typeof analizadas)[number]): FraseAnalisis => ({
      fraseId: f.fraseId,
      text: texto.get(f.fraseId) ?? '',
      acuerdoPorGrupo: f.porGrupo.map((g) => ({ grupo: g.grupo, acuerdoPct: pct(g.deAcuerdo, g.total) })),
    });

    const puentesTodos = analizadas.filter((f) => isPuente(f));
    const puentes = puentesTodos.filter((f) => votadasPorMi.has(f.fraseId)).map(aAnalisis);
    const puentesSinVer = puentesTodos.filter((f) => !votadasPorMi.has(f.fraseId)).length;
    const divisivas = analizadas.filter((f) => isDivisiva(f) && votadasPorMi.has(f.fraseId)).map(aAnalisis);

    return {
      available: true,
      participants: result.participants,
      grupos: result.grupos
        .filter((g) => visibles.has(g.id))
        .map((g) => ({ id: g.id, size: Math.max(5, round5(g.size)) })),
      puentes,
      divisivas,
      puentesSinVer,
    };
  }
}
