import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FrasesService } from './frases.service';
import { GroupAccessService } from '../groups/group-access.service';
import { CreateFraseDto } from './dto/create-frase.dto';
import { VoteFraseDto } from './dto/vote-frase.dto';
import type { OpinionResult } from './opinion-groups';

/** Permite sustituir analyzeOpinions en una prueba concreta; por defecto usa el real. */
const ctl = vi.hoisted(() => ({ override: null as null | (() => OpinionResult) }));
vi.mock('./opinion-groups', async (importOriginal) => {
  const m = await importOriginal<typeof import('./opinion-groups')>();
  return {
    ...m,
    analyzeOpinions: (...args: Parameters<typeof m.analyzeOpinions>) =>
      ctl.override ? ctl.override() : m.analyzeOpinions(...args),
  };
});

const CLAVES_RESULTADO = ['deAcuerdoPct', 'enDesacuerdoPct', 'pasoPct', 'suficiente', 'totalAprox'];
/** Claves de recuentos exactos (con «:» para no confundirlas con el valor "paso" de myVote). */
const CLAVES_EXACTAS = ['"deAcuerdo":', '"enDesacuerdo":', '"paso":', '"total":'];

const YO = 'p-yo';
const G = 'g1';
const T = 't1';

function buildPrisma() {
  return {
    proposal: { findUnique: vi.fn() },
    groupMembership: { findUnique: vi.fn() },
    group: { findUnique: vi.fn().mockResolvedValue(null) },
    frase: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    fraseVoto: { upsert: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    profile: { findUnique: vi.fn() },
    moderationAction: { findMany: vi.fn() },
  };
}

function frase(id: string, text = `Texto de la frase ${id} largo`, over: Record<string, unknown> = {}) {
  return { id, proposalId: T, authorProfileId: 'p-autor', text, hidden: false, createdAt: new Date('2026-11-01T00:00:00Z'), ...over };
}

describe('FrasesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let service: FrasesService;

  beforeEach(() => {
    ctl.override = null;
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    rules = { getInt: vi.fn().mockResolvedValue(7) };
    prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: false });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u1' });
    service = new FrasesService(prisma as never, audit as never, rules as never, new GroupAccessService(prisma as never));
  });

  describe('DTOs', () => {
    it('rechaza un texto de 9 caracteres con mensaje en español', async () => {
      const dto = Object.assign(new CreateFraseDto(), { text: '123456789' });
      const errs = await validate(dto);
      expect(errs).toHaveLength(1);
      expect(Object.values(errs[0]!.constraints!).join(' ')).toContain('entre 10 y 140');
    });
    it('acepta 10 y rechaza 141', async () => {
      expect(await validate(Object.assign(new CreateFraseDto(), { text: 'a'.repeat(10) }))).toHaveLength(0);
      expect(await validate(Object.assign(new CreateFraseDto(), { text: 'a'.repeat(141) }))).toHaveLength(1);
    });
    it('recorta los espacios antes de validar: 10 caracteres con relleno que recortan a 9 se rechazan', async () => {
      const dto = plainToInstance(CreateFraseDto, { text: '  123456789  ' });
      expect(dto.text).toBe('123456789');
      expect(await validate(dto)).toHaveLength(1);
      const ok = plainToInstance(CreateFraseDto, { text: '  1234567890  ' });
      expect(await validate(ok)).toHaveLength(0);
    });
    it('rechaza un voto inválido', async () => {
      expect(await validate(Object.assign(new VoteFraseDto(), { value: 'quizas' }))).toHaveLength(1);
      expect(await validate(Object.assign(new VoteFraseDto(), { value: 'paso' }))).toHaveLength(0);
    });
  });

  describe('acceso', () => {
    beforeEach(() => prisma.groupMembership.findUnique.mockResolvedValue(null));
    it('un no miembro no escribe, no lista y no vota', async () => {
      await expect(service.create(YO, T, 'Una frase de prueba', 'ip')).rejects.toThrow(ForbiddenException);
      await expect(service.list(YO, T)).rejects.toThrow(ForbiddenException);
      await expect(service.next(YO, T)).rejects.toThrow(ForbiddenException);
      await expect(service.analysis(YO, T)).rejects.toThrow(ForbiddenException);
      prisma.frase.findUnique.mockResolvedValue({ ...frase('f1'), proposal: { groupId: G, status: 'open', hidden: false } });
      await expect(service.vote(YO, 'f1', 'paso')).rejects.toThrow('Solo los miembros de esta comunidad pueden participar.');
      expect(prisma.frase.create).not.toHaveBeenCalled();
      expect(prisma.fraseVoto.upsert).not.toHaveBeenCalled();
    });
  });

  describe('grupo de trabajo (G es subgrupo de g-ambito)', () => {
    /** YO es miembro solo de los grupos de `de`. */
    function miembroDe(de: string[]): void {
      prisma.groupMembership.findUnique.mockImplementation(({ where }: { where: { groupId_profileId: { groupId: string } } }) =>
        Promise.resolve(de.includes(where.groupId_profileId.groupId) ? { id: 'm' } : null),
      );
      prisma.group.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === G ? { type: 'trabajo', parentGroupId: 'g-ambito' } : { type: 'territorial_residence', parentGroupId: null }),
      );
    }
    beforeEach(() => {
      prisma.frase.findMany.mockResolvedValue([frase('f1'), frase('f2')]);
      prisma.fraseVoto.findMany.mockResolvedValue([]);
      prisma.fraseVoto.groupBy.mockResolvedValue([]);
      prisma.moderationAction.findMany.mockResolvedValue([]);
    });

    it('un miembro del ámbito lee las frases sin resultados, sin frase para votar y con el análisis', async () => {
      miembroDe(['g-ambito']);
      const r = await service.list(YO, T);
      expect(r.items.map((i) => i.id)).toEqual(['f1', 'f2']);
      expect(r.items.every((i) => i.resultado === null && i.myVote === null)).toBe(true);
      expect(r.pendientes).toBe(0);
      expect(await service.next(YO, T)).toBeNull();
      await expect(service.analysis(YO, T)).resolves.toMatchObject({ available: false });
    });

    it('un miembro del ámbito no escribe ni vota frases (403)', async () => {
      miembroDe(['g-ambito']);
      await expect(service.create(YO, T, 'Una frase de prueba', 'ip')).rejects.toThrow('Solo los miembros de este grupo pueden participar.');
      prisma.frase.findUnique.mockResolvedValue({ ...frase('f1'), proposal: { groupId: G, status: 'open', hidden: false } });
      await expect(service.vote(YO, 'f1', 'paso')).rejects.toThrow('Solo los miembros de este grupo pueden participar.');
      expect(prisma.frase.create).not.toHaveBeenCalled();
      expect(prisma.fraseVoto.upsert).not.toHaveBeenCalled();
    });

    it('el análisis de quien lee no cuenta puentes sin ver ni muestra puentes', async () => {
      miembroDe(['g-ambito']);
      prisma.frase.findMany.mockResolvedValue([frase('f1'), frase('f2'), frase('f3'), frase('f4')]);
      // Votos guardados de cuando era miembro: no deben contar como suyos.
      prisma.fraseVoto.findMany.mockResolvedValue([{ profileId: YO, fraseId: 'f1', value: 'de_acuerdo' }]);
      const acuerdo = { votantes: 5, deAcuerdo: 5, total: 5 };
      const desacuerdo = { votantes: 5, deAcuerdo: 0, total: 5 };
      ctl.override = () => ({
        participants: 10,
        grupos: [{ id: 0, size: 5, members: [] }, { id: 1, size: 5, members: [] }],
        frases: [
          { fraseId: 'f1', porGrupo: [{ grupo: 0, ...acuerdo }, { grupo: 1, ...acuerdo }] },
          { fraseId: 'f2', porGrupo: [{ grupo: 0, ...acuerdo }, { grupo: 1, ...acuerdo }] },
          { fraseId: 'f3', porGrupo: [{ grupo: 0, ...acuerdo }, { grupo: 1, ...acuerdo }] },
          { fraseId: 'f4', porGrupo: [{ grupo: 0, ...acuerdo }, { grupo: 1, ...desacuerdo }] },
        ],
      });
      const r = await service.analysis(YO, T);
      expect(r).toMatchObject({ available: true, puentesSinVer: 0, puentes: [], divisivas: [] });
    });

    it('quien lee (antes miembro) no ve sus votos, ni resultados, ni datos de apelación', async () => {
      miembroDe(['g-ambito']);
      prisma.frase.findMany.mockResolvedValue([frase('f1', undefined, { authorProfileId: YO })]);
      prisma.fraseVoto.findMany.mockResolvedValue([{ fraseId: 'f1', value: 'de_acuerdo' }]);
      prisma.fraseVoto.groupBy.mockResolvedValue([{ fraseId: 'f1', value: 'de_acuerdo', _count: { _all: 9 } }]);
      const r = await service.list(YO, T);
      expect(r.items[0]).toMatchObject({ id: 'f1', isAuthor: false, myVote: null, resultado: null, moderationId: null });
      // Solo pide frases visibles: las ocultas propias (con su apelación) son de quien participa.
      expect(prisma.frase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { proposalId: T, hidden: false } }));
    });

    it('quien no es del ámbito no lee nada', async () => {
      miembroDe(['g-otra']);
      await expect(service.list(YO, T)).rejects.toThrow('Solo los miembros de esta comunidad pueden ver esto.');
      await expect(service.next(YO, T)).rejects.toThrow(ForbiddenException);
      await expect(service.analysis(YO, T)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('escritura', () => {
    it('crea la frase y la audita con { proposalId }', async () => {
      prisma.frase.create.mockResolvedValue({ id: 'f1' });
      expect(await service.create(YO, T, 'Una frase de prueba', '1.1.1.1')).toEqual({ id: 'f1' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'frase.created', actorId: 'u1', ip: '1.1.1.1', metadata: { proposalId: T } }),
      );
    });
    it('dentro de una bifurcación la frase se audita sin actor, ip ni el grupo', async () => {
      prisma.group.findUnique.mockResolvedValue({ type: 'trabajo', parentGroupId: 'g-ambito', trabajoEstado: 'activo', trabajoTipo: 'bifurcacion' });
      prisma.frase.create.mockResolvedValue({ id: 'f1' });
      await service.create(YO, T, 'Una frase de prueba', '1.1.1.1');
      const e = audit.log.mock.calls[0]![0] as Record<string, unknown>;
      expect(e).toMatchObject({ action: 'frase.created' });
      expect(e).not.toHaveProperty('actorId');
      expect(e).not.toHaveProperty('ip');
      expect(JSON.stringify(e)).not.toContain(G);
    });
    it('en un tema cerrado no se escribe ni se vota', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'closed', hidden: false });
      await expect(service.create(YO, T, 'Una frase de prueba', 'ip')).rejects.toThrow('Este tema ya no acepta frases.');
      prisma.frase.findUnique.mockResolvedValue({ ...frase('f1'), proposal: { groupId: G, status: 'closed', hidden: false } });
      await expect(service.vote(YO, 'f1', 'paso')).rejects.toThrow(BadRequestException);
    });
    it('en un tema oculto las escrituras dan error', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: true });
      await expect(service.create(YO, T, 'Una frase de prueba', 'ip')).rejects.toThrow('Este tema está oculto por moderación.');
    });
    it('votar una frase oculta da BadRequestException', async () => {
      prisma.frase.findUnique.mockResolvedValue({ ...frase('f1', undefined, { hidden: true }), proposal: { groupId: G, status: 'open', hidden: false } });
      await expect(service.vote(YO, 'f1', 'paso')).rejects.toThrow('Esta frase está oculta por moderación.');
    });
  });

  describe('lectura', () => {
    it('en un tema oculto list y next vienen vacíos y analysis no está disponible', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: true });
      expect(await service.list(YO, T)).toEqual({ items: [], pendientes: 0 });
      expect(await service.next(YO, T)).toBeNull();
      expect(await service.analysis(YO, T)).toEqual({ available: false, participants: 0, needed: 7 });
    });

    it('list: resultado null para las no votadas y con valores para las votadas', async () => {
      prisma.frase.findMany.mockResolvedValue([frase('f1', undefined, { authorProfileId: YO }), frase('f22')]);
      prisma.fraseVoto.findMany.mockResolvedValue([{ fraseId: 'f1', value: 'de_acuerdo' }]);
      prisma.fraseVoto.groupBy.mockResolvedValue([
        { fraseId: 'f1', value: 'de_acuerdo', _count: { _all: 7 } },
        { fraseId: 'f1', value: 'en_desacuerdo', _count: { _all: 2 } },
        { fraseId: 'f1', value: 'paso', _count: { _all: 1 } },
      ]);
      const r = await service.list(YO, T);
      expect(r.pendientes).toBe(1);
      expect(r.items[0]).toMatchObject({ id: 'f1', isAuthor: true, myVote: 'de_acuerdo', hiddenReason: null, moderationId: null });
      expect(r.items[0]!.resultado).toEqual({ deAcuerdoPct: 70, enDesacuerdoPct: 20, pasoPct: 10, totalAprox: 10, suficiente: true });
      expect(r.items[1]).toMatchObject({ id: 'f22', isAuthor: false, myVote: null, resultado: null });
      expect(prisma.frase.findMany.mock.calls[0]![0].where.OR).toContainEqual({ hidden: false });
    });

    it('list: ningún resultado trae recuentos exactos; con menos de 5 votos no hay porcentajes', async () => {
      prisma.frase.findMany.mockResolvedValue([frase('f1'), frase('f2'), frase('f3')]);
      prisma.fraseVoto.findMany.mockResolvedValue([
        { fraseId: 'f1', value: 'de_acuerdo' },
        { fraseId: 'f2', value: 'paso' },
      ]);
      prisma.fraseVoto.groupBy.mockResolvedValue([
        { fraseId: 'f1', value: 'de_acuerdo', _count: { _all: 2 } },
        { fraseId: 'f1', value: 'en_desacuerdo', _count: { _all: 1 } },
        { fraseId: 'f2', value: 'paso', _count: { _all: 9 } },
      ]);
      const r = await service.list(YO, T);
      for (const i of r.items) if (i.resultado) expect(Object.keys(i.resultado).sort()).toEqual(CLAVES_RESULTADO);
      expect(r.items[0]!.resultado).toEqual({ deAcuerdoPct: null, enDesacuerdoPct: null, pasoPct: null, totalAprox: 5, suficiente: false });
      expect(r.items[1]!.resultado).toEqual({ deAcuerdoPct: 0, enDesacuerdoPct: 0, pasoPct: 100, totalAprox: 10, suficiente: true });
      // la no votada llega igual (con texto, sin resultado): la usa la lista de moderación
      expect(r.items[2]).toMatchObject({ id: 'f3', text: 'Texto de la frase f3 largo', myVote: null, resultado: null });
      const json = JSON.stringify(r);
      for (const k of CLAVES_EXACTAS) expect(json).not.toContain(k);
    });

    it('list: solo cuentan los votos de miembros actuales del grupo del tema', async () => {
      prisma.frase.findMany.mockResolvedValue([frase('f1')]);
      prisma.fraseVoto.findMany.mockResolvedValue([{ fraseId: 'f1', value: 'paso' }]);
      prisma.fraseVoto.groupBy.mockResolvedValue([]);
      await service.list(YO, T);
      expect(prisma.fraseVoto.groupBy.mock.calls[0]![0].where).toMatchObject({
        profile: { memberships: { some: { groupId: G } } },
      });
    });

    it('list: el autor ve su frase oculta con motivo y moderationId, sin el texto; los demás no la ven', async () => {
      const oculta = frase('f9', 'Texto que no debe salir', { hidden: true, authorProfileId: YO });
      prisma.frase.findMany.mockResolvedValue([frase('f1'), oculta]);
      prisma.fraseVoto.findMany.mockResolvedValue([]);
      prisma.moderationAction.findMany.mockResolvedValue([
        { id: 'ma1', targetId: 'f9', reason: 'Lenguaje ofensivo', status: 'oculto', createdAt: new Date('2026-11-02') },
      ]);
      const r = await service.list(YO, T);
      expect(prisma.frase.findMany.mock.calls[0]![0].where).toEqual({
        proposalId: T,
        OR: [{ hidden: false }, { hidden: true, authorProfileId: YO }],
      });
      const mia = r.items.find((i) => i.id === 'f9')!;
      expect(mia).toMatchObject({ hidden: true, isAuthor: true, hiddenReason: 'Lenguaje ofensivo', moderationId: 'ma1', text: '', myVote: null, resultado: null });
      expect(r.pendientes).toBe(1);
      expect(JSON.stringify(r)).not.toContain('Texto que no debe salir');
    });

    it('list: hiddenReason usa la etiqueta de la causa', async () => {
      prisma.frase.findMany.mockResolvedValue([frase('f9', undefined, { hidden: true, authorProfileId: YO })]);
      prisma.fraseVoto.findMany.mockResolvedValue([]);
      prisma.moderationAction.findMany.mockResolvedValue([
        { id: 'ma1', targetId: 'f9', causa: 'insultos_amenazas', reason: '', status: 'oculto', createdAt: new Date('2026-11-03') },
      ]);
      const r = await service.list(YO, T);
      expect(r.items[0]).toMatchObject({ hiddenReason: 'Insultos, amenazas o acoso' });
    });

    it('list: tras apelar, el autor ve el motivo pero ya no el moderationId', async () => {
      prisma.frase.findMany.mockResolvedValue([frase('f9', undefined, { hidden: true, authorProfileId: YO })]);
      prisma.fraseVoto.findMany.mockResolvedValue([]);
      prisma.moderationAction.findMany.mockResolvedValue([
        { id: 'ma2', targetId: 'f9', reason: 'Otro motivo', status: 'apelado', createdAt: new Date('2026-11-03') },
        { id: 'ma1', targetId: 'f9', reason: 'Viejo', status: 'restaurado', createdAt: new Date('2026-11-01') },
      ]);
      const r = await service.list(YO, T);
      expect(r.items[0]).toMatchObject({ hiddenReason: 'Otro motivo', moderationId: null });
    });

    it('next: los recuentos solo consideran a miembros actuales', async () => {
      prisma.frase.findMany.mockResolvedValue([frase('a')]);
      prisma.fraseVoto.findMany.mockResolvedValue([]);
      prisma.fraseVoto.groupBy.mockResolvedValue([]);
      await service.next(YO, T);
      expect(prisma.fraseVoto.groupBy.mock.calls[0]![0].where).toMatchObject({
        profile: { memberships: { some: { groupId: G } } },
      });
    });

    it('next no devuelve votadas y prefiere la de menos votos', async () => {
      prisma.frase.findMany.mockResolvedValue([frase('a'), frase('bb'), frase('ccc')]);
      prisma.fraseVoto.findMany.mockResolvedValue([{ fraseId: 'a' }]);
      prisma.fraseVoto.groupBy.mockResolvedValue([
        { fraseId: 'a', _count: { _all: 0 } },
        { fraseId: 'bb', _count: { _all: 5 } },
        { fraseId: 'ccc', _count: { _all: 2 } },
      ]);
      for (let i = 0; i < 10; i++) expect(await service.next(YO, T)).toEqual({ id: 'ccc', text: 'Texto de la frase ccc largo' });
      prisma.fraseVoto.findMany.mockResolvedValue([{ fraseId: 'a' }, { fraseId: 'bb' }, { fraseId: 'ccc' }]);
      expect(await service.next(YO, T)).toBeNull();
    });
  });

  describe('vote', () => {
    it('hace upsert (no duplica), devuelve el resultado y no audita', async () => {
      prisma.frase.findUnique.mockResolvedValue({ ...frase('f1'), proposal: { groupId: G, status: 'open', hidden: false } });
      prisma.fraseVoto.upsert.mockResolvedValue({});
      prisma.fraseVoto.groupBy.mockResolvedValue([
        { fraseId: 'f1', value: 'de_acuerdo', _count: { _all: 3 } },
        { fraseId: 'f1', value: 'en_desacuerdo', _count: { _all: 1 } },
      ]);
      const r1 = await service.vote(YO, 'f1', 'de_acuerdo');
      await service.vote(YO, 'f1', 'en_desacuerdo');
      expect(prisma.fraseVoto.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.fraseVoto.upsert.mock.calls[0]![0]).toMatchObject({
        where: { fraseId_profileId: { fraseId: 'f1', profileId: YO } },
        update: { value: 'de_acuerdo' },
        create: { fraseId: 'f1', profileId: YO, value: 'de_acuerdo' },
      });
      // 4 votos (< 5): sin porcentajes
      expect(r1).toEqual({ deAcuerdoPct: null, enDesacuerdoPct: null, pasoPct: null, totalAprox: 5, suficiente: false });
      expect(audit.log).not.toHaveBeenCalled();
    });
    function votarCon(conteos: [string, number][]) {
      prisma.frase.findUnique.mockResolvedValue({ ...frase('f1'), proposal: { groupId: G, status: 'open', hidden: false } });
      prisma.fraseVoto.upsert.mockResolvedValue({});
      prisma.fraseVoto.groupBy.mockResolvedValue(conteos.map(([value, n]) => ({ fraseId: 'f1', value, _count: { _all: n } })));
      return service.vote(YO, 'f1', 'paso');
    }

    it('resultado: nunca trae recuentos exactos, solo las claves aproximadas', async () => {
      const r = await votarCon([['de_acuerdo', 7], ['en_desacuerdo', 4], ['paso', 2]]);
      expect(Object.keys(r).sort()).toEqual(CLAVES_RESULTADO);
      const json = JSON.stringify(r);
      for (const k of CLAVES_EXACTAS) expect(json).not.toContain(k);
    });

    it('resultado: con menos de 5 votos suficiente es false y los porcentajes null', async () => {
      expect(await votarCon([['de_acuerdo', 1]])).toEqual({ deAcuerdoPct: null, enDesacuerdoPct: null, pasoPct: null, totalAprox: 5, suficiente: false });
      expect(await votarCon([])).toEqual({ deAcuerdoPct: null, enDesacuerdoPct: null, pasoPct: null, totalAprox: 0, suficiente: false });
    });

    it('resultado: porcentajes y total redondeados a múltiplos de 5', async () => {
      // 13 votos: 53,8 % -> 55; 30,8 % -> 30; 15,4 % -> 15; total 13 -> 15
      expect(await votarCon([['de_acuerdo', 7], ['en_desacuerdo', 4], ['paso', 2]])).toEqual({
        deAcuerdoPct: 55, enDesacuerdoPct: 30, pasoPct: 15, totalAprox: 15, suficiente: true,
      });
      // 6 votos: 16,7 -> 15; 33,3 -> 35; 50 -> 50; total 6 -> 5
      expect(await votarCon([['de_acuerdo', 1], ['en_desacuerdo', 2], ['paso', 3]])).toEqual({
        deAcuerdoPct: 15, enDesacuerdoPct: 35, pasoPct: 50, totalAprox: 5, suficiente: true,
      });
      // 5 votos justos: ya es suficiente
      expect(await votarCon([['de_acuerdo', 5]])).toMatchObject({ deAcuerdoPct: 100, totalAprox: 5, suficiente: true });
    });

    it('vote: el resultado solo cuenta a miembros actuales', async () => {
      prisma.frase.findUnique.mockResolvedValue({ ...frase('f1'), proposal: { groupId: G, status: 'open', hidden: false } });
      prisma.fraseVoto.upsert.mockResolvedValue({});
      prisma.fraseVoto.groupBy.mockResolvedValue([]);
      await service.vote(YO, 'f1', 'paso');
      expect(prisma.fraseVoto.groupBy.mock.calls[0]![0].where).toMatchObject({
        fraseId: 'f1',
        profile: { memberships: { some: { groupId: G } } },
      });
    });
  });

  describe('analysis', () => {
    /** Dos bandos de 6: f1 puente; f2, f3 y f4 dividen. */
    function votosDosBandos() {
      const rows: { profileId: string; fraseId: string; value: string }[] = [];
      for (let i = 0; i < 12; i++) {
        const pid = `pid-secreto-${String(i).padStart(2, '0')}`;
        const a = i < 6;
        rows.push({ profileId: pid, fraseId: 'f1', value: 'de_acuerdo' });
        rows.push({ profileId: pid, fraseId: 'f2', value: a ? 'de_acuerdo' : 'en_desacuerdo' });
        rows.push({ profileId: pid, fraseId: 'f3', value: a ? 'en_desacuerdo' : 'de_acuerdo' });
        rows.push({ profileId: pid, fraseId: 'f4', value: a ? 'de_acuerdo' : 'en_desacuerdo' });
      }
      return rows;
    }

    beforeEach(() => {
      prisma.frase.findMany.mockResolvedValue(['f1', 'f2', 'f3', 'f4'].map((id) => frase(id)));
    });

    it('con 6 participantes y mínimo 7: available false, needed 7', async () => {
      prisma.fraseVoto.findMany.mockResolvedValue(votosDosBandos().filter((r) => Number(r.profileId.slice(-2)) < 6));
      expect(await service.analysis(YO, T)).toEqual({ available: false, participants: 6, needed: 7 });
    });

    it('analysis: solo entran los votos de miembros actuales', async () => {
      prisma.fraseVoto.findMany.mockResolvedValue([]);
      await service.analysis(YO, T);
      expect(prisma.fraseVoto.findMany.mock.calls[0]![0].where).toMatchObject({
        profile: { memberships: { some: { groupId: G } } },
      });
    });

    it('con 12 participantes: participants sale redondeado a múltiplo de 5', async () => {
      const rows = votosDosBandos();
      for (const f of ['f2', 'f3', 'f4']) rows.push({ profileId: YO, fraseId: f, value: 'de_acuerdo' });
      prisma.fraseVoto.findMany.mockResolvedValue(rows);
      const r = await service.analysis(YO, T);
      expect(r.available).toBe(true);
      // 13 participantes reales: 13 -> 15
      expect(r.participants).toBe(15);
    });

    it('puentesSinVer es 0 si quien consulta tiene menos de 3 frases visibles sin votar', async () => {
      const rows = votosDosBandos();
      // YO votó f2 y f3: sin votar solo quedan f1 y f4 (2 < 3)
      for (const f of ['f2', 'f3']) rows.push({ profileId: YO, fraseId: f, value: 'de_acuerdo' });
      prisma.fraseVoto.findMany.mockResolvedValue(rows);
      const r = await service.analysis(YO, T);
      if (!r.available) throw new Error('debía estar disponible');
      expect(r.puentesSinVer).toBe(0);
    });

    it('puentesSinVer es 0 cuando todas las frases sin votar son puentes (la igualdad delataría)', async () => {
      prisma.frase.findMany.mockResolvedValue(['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((id) => frase(id)));
      const rows = votosDosBandos();
      // f5 y f6 también son puentes: todos de acuerdo
      for (let i = 0; i < 12; i++) {
        const pid = `pid-secreto-${String(i).padStart(2, '0')}`;
        rows.push({ profileId: pid, fraseId: 'f5', value: 'de_acuerdo' }, { profileId: pid, fraseId: 'f6', value: 'de_acuerdo' });
      }
      // YO votó f2, f3 y f4: sin votar quedan f1, f5 y f6 (3), y las 3 son puentes
      for (const f of ['f2', 'f3', 'f4']) rows.push({ profileId: YO, fraseId: f, value: 'de_acuerdo' });
      prisma.fraseVoto.findMany.mockResolvedValue(rows);
      const r = await service.analysis(YO, T);
      if (!r.available) throw new Error('debía estar disponible');
      expect(r.puentesSinVer).toBe(0);
    });

    it('analysis: excluye los votos de frases ocultas (filtro en la consulta y en el cálculo)', async () => {
      // f9 está oculta: no viene entre las frases visibles, aunque la consulta devolviera votos suyos
      const rows = votosDosBandos();
      for (let i = 0; i < 12; i++) rows.push({ profileId: `pid-secreto-${String(i).padStart(2, '0')}`, fraseId: 'f9', value: 'de_acuerdo' });
      for (const f of ['f2', 'f9']) rows.push({ profileId: YO, fraseId: f, value: 'de_acuerdo' });
      prisma.fraseVoto.findMany.mockResolvedValue(rows);
      const r = await service.analysis(YO, T);
      expect(prisma.fraseVoto.findMany.mock.calls[0]![0].where.frase).toEqual({ proposalId: T, hidden: false });
      if (!r.available) throw new Error('debía estar disponible');
      expect(JSON.stringify(r)).not.toContain('f9');
    });

    it('analysis: puentes y divisivas solo incluyen frases que quien consulta ya votó', async () => {
      const rows = votosDosBandos();
      rows.push({ profileId: YO, fraseId: 'f2', value: 'de_acuerdo' });
      prisma.fraseVoto.findMany.mockResolvedValue(rows);
      const r = await service.analysis(YO, T);
      if (!r.available) throw new Error('debía estar disponible');
      expect(r.puentes).toEqual([]);
      expect(r.divisivas.map((d) => d.fraseId)).toEqual(['f2']);
    });

    it('analysis: un grupo de menos de 3 personas no aparece ni en grupos ni en los porcentajes', async () => {
      prisma.fraseVoto.findMany.mockResolvedValue([{ profileId: YO, fraseId: 'f1', value: 'de_acuerdo' }]);
      ctl.override = () => ({
        participants: 13,
        grupos: [
          { id: 0, size: 6, members: [] },
          { id: 1, size: 5, members: [] },
          { id: 2, size: 2, members: [] },
        ],
        frases: [
          {
            fraseId: 'f1',
            porGrupo: [
              { grupo: 0, votantes: 6, deAcuerdo: 6, total: 6 },
              { grupo: 1, votantes: 5, deAcuerdo: 5, total: 5 },
              { grupo: 2, votantes: 2, deAcuerdo: 0, total: 2 },
            ],
          },
        ],
      });
      const r = await service.analysis(YO, T);
      if (!r.available) throw new Error('debía estar disponible');
      expect(r.grupos.map((g) => g.id)).toEqual([0, 1]);
      // sin el grupo 2 (0 % de acuerdo), f1 cuenta como puente
      expect(r.puentes).toHaveLength(1);
      expect(r.puentes[0]!.acuerdoPorGrupo.map((a) => a.grupo)).toEqual([0, 1]);
    });

    it('con dos bandos de 6 y 6: 2 grupos y ningún profileId en la respuesta', async () => {
      const rows = votosDosBandos();
      rows.push({ profileId: YO, fraseId: 'f2', value: 'de_acuerdo' });
      prisma.fraseVoto.findMany.mockResolvedValue(rows);
      const r = await service.analysis(YO, T);
      expect(r.available).toBe(true);
      if (!r.available) return;
      expect(r.grupos).toHaveLength(2);
      for (const g of r.grupos) {
        expect(g.size % 5).toBe(0);
        expect(g.size).toBeGreaterThanOrEqual(5);
      }
      // el puente f1 no lo votó YO: no aparece y suma
      expect(r.puentes.find((p) => p.fraseId === 'f1')).toBeUndefined();
      expect(r.puentesSinVer).toBeGreaterThanOrEqual(1);
      for (const f of [...r.puentes, ...r.divisivas]) {
        for (const a of f.acuerdoPorGrupo) expect(a.acuerdoPct % 5).toBe(0);
      }
      expect(r.divisivas.map((d) => d.fraseId)).toContain('f2');
      const json = JSON.stringify(r);
      expect(json).not.toContain('pid-secreto');
      expect(json).not.toContain(YO);
      expect(json).not.toContain('profileId');
      expect(json).not.toContain('members');
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
