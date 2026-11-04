import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { FrasesService } from './frases.service';
import { CreateFraseDto } from './dto/create-frase.dto';
import { VoteFraseDto } from './dto/vote-frase.dto';

const YO = 'p-yo';
const G = 'g1';
const T = 't1';

function buildPrisma() {
  return {
    proposal: { findUnique: vi.fn() },
    groupMembership: { findUnique: vi.fn() },
    frase: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    fraseVoto: { upsert: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    profile: { findUnique: vi.fn() },
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
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    rules = { getInt: vi.fn().mockResolvedValue(7) };
    prisma.proposal.findUnique.mockResolvedValue({ id: T, groupId: G, status: 'open', hidden: false });
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.profile.findUnique.mockResolvedValue({ userId: 'u1' });
    service = new FrasesService(prisma as never, audit as never, rules as never);
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

  describe('escritura', () => {
    it('crea la frase y la audita con { proposalId }', async () => {
      prisma.frase.create.mockResolvedValue({ id: 'f1' });
      expect(await service.create(YO, T, 'Una frase de prueba', '1.1.1.1')).toEqual({ id: 'f1' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'frase.created', actorId: 'u1', ip: '1.1.1.1', metadata: { proposalId: T } }),
      );
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
      expect(r.items[0]!.resultado).toEqual({ deAcuerdo: 7, enDesacuerdo: 2, paso: 1, total: 10, acuerdoPct: 70 });
      expect(r.items[1]).toMatchObject({ id: 'f22', isAuthor: false, myVote: null, resultado: null });
      expect(prisma.frase.findMany.mock.calls[0]![0].where).toMatchObject({ hidden: false });
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
      expect(r1).toEqual({ deAcuerdo: 3, enDesacuerdo: 1, paso: 0, total: 4, acuerdoPct: 75 });
      expect(audit.log).not.toHaveBeenCalled();
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

    it('con dos bandos de 6 y 6: 2 grupos y ningún profileId en la respuesta', async () => {
      const rows = votosDosBandos();
      for (const f of ['f2', 'f3', 'f4']) rows.push({ profileId: YO, fraseId: f, value: 'de_acuerdo' });
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
      expect(r.divisivas.map((d) => d.fraseId)).toContain('f3');
      const json = JSON.stringify(r);
      expect(json).not.toContain('pid-secreto');
      expect(json).not.toContain(YO);
      expect(json).not.toContain('profileId');
      expect(json).not.toContain('members');
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
