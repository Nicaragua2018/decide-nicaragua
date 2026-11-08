import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERAL_GROUP_SLUG, MIN_ACTIVE_MEMBERS } from '@decide/shared';
import {
  aMaterial,
  ContextoPersonaService,
  GUIA_DE_LA_PLATAFORMA,
  RUTAS_DE_LA_GUIA,
  type EstadoPersona,
  type ResultadoBusqueda,
} from './contexto-persona.service';

const YO = 'p-123abc';
const UUID_A = '3f2b8c1e-9a4d-4e5f-8b7c-1a2b3c4d5e6f';
const UUID_B = '7a1d9e20-5b3c-4f6a-9d8e-0f1e2d3c4b5a';
const REGEX_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

const ORIGEN = { id: 'g-origen', name: 'Chinandega', slug: 'chinandega', type: 'territorial_origin', parentGroupId: null, trabajoTipo: null };
const ACOGIDA = { id: 'g-acogida', name: 'Costa Rica', slug: 'country-cr', type: 'territorial_residence', parentGroupId: null, trabajoTipo: null };
const GENERAL = { id: 'g-general', name: 'Exilio y diáspora', slug: GENERAL_GROUP_SLUG, type: 'custom', parentGroupId: null, trabajoTipo: null };
const SUBGRUPO = { id: 'g-sub', name: 'Agua potable', slug: 'agua', type: 'trabajo', parentGroupId: 'g-origen', trabajoTipo: 'subgrupo' };
const BIFURCACION = { id: 'g-bif', name: 'Iniciativa', slug: 'bif', type: 'trabajo', parentGroupId: 'g-origen', trabajoTipo: 'bifurcacion' };

function buildPrisma(opts: { miembroDe?: unknown[]; hijos?: unknown[] } = {}) {
  const miembroDe = opts.miembroDe ?? [ORIGEN, ACOGIDA, GENERAL];
  return {
    groupMembership: {
      findMany: vi.fn().mockResolvedValue(miembroDe.map((g) => ({ group: { ...(g as object), _count: { memberships: 3 } } }))),
    },
    group: { findMany: vi.fn().mockResolvedValue(opts.hijos ?? [SUBGRUPO]) },
    proposal: { findMany: vi.fn().mockResolvedValue([]) },
    inquietud: { findMany: vi.fn().mockResolvedValue([]) },
    decision: { findMany: vi.fn().mockResolvedValue([]) },
    user: { count: vi.fn().mockResolvedValue(2) },
  };
}

describe('ContextoPersonaService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let verificacion: { statusFor: ReturnType<typeof vi.fn> };
  let rules: { getInt: ReturnType<typeof vi.fn> };
  let servicio: ContextoPersonaService;

  function crear(p = buildPrisma()) {
    prisma = p;
    verificacion = { statusFor: vi.fn().mockResolvedValue({ status: 'pending_verification', references: [{ kind: 'invitador', displayName: 'X' }], missing: ['segunda'] }) };
    rules = { getInt: vi.fn().mockResolvedValue(5) };
    servicio = new ContextoPersonaService(prisma as never, verificacion as never, rules as never);
  }

  beforeEach(() => crear());

  describe('gruposLegibles', () => {
    it('incluye las comunidades de la persona y un subgrupo de ellas', async () => {
      const r = await servicio.gruposLegibles(YO);
      expect(r.map((g) => g.id).sort()).toEqual(['g-acogida', 'g-general', 'g-origen', 'g-sub']);
      expect(r.find((g) => g.id === 'g-sub')).toEqual({ id: 'g-sub', nombre: 'Agua potable', tipo: 'trabajo', padreId: 'g-origen' });
      const whereHijos = prisma.group.findMany.mock.calls[0]![0].where;
      expect(whereHijos.parentGroupId).toEqual({ in: ['g-origen', 'g-acogida', 'g-general'] });
    });

    it('excluye una bifurcación de su comunidad de la que no es miembro', async () => {
      crear(buildPrisma({ hijos: [SUBGRUPO, BIFURCACION] }));
      const r = await servicio.gruposLegibles(YO);
      expect(r.map((g) => g.id)).not.toContain('g-bif');
    });

    it('incluye una bifurcación de la que sí es miembro', async () => {
      crear(buildPrisma({ miembroDe: [ORIGEN, BIFURCACION], hijos: [] }));
      const r = await servicio.gruposLegibles(YO);
      expect(r.map((g) => g.id)).toContain('g-bif');
    });
  });

  describe('buscar', () => {
    it('consulta solo los grupos legibles y no ocultos, y devuelve rutas', async () => {
      prisma.proposal.findMany.mockResolvedValue([
        { id: UUID_A, title: 'Agua en Chinandega', body: 'Falta agua', status: 'open', kind: 'tema', groupId: 'g-origen' },
      ]);
      prisma.inquietud.findMany.mockResolvedValue([
        { id: UUID_B, title: 'Pozos', body: 'Sin agua en el pueblo', status: 'abierta', groupId: 'g-origen' },
      ]);
      prisma.group.findMany.mockResolvedValueOnce([SUBGRUPO]).mockResolvedValueOnce([]);
      const r = await servicio.buscar(YO, 'chinandega agua');

      for (const modelo of [prisma.proposal, prisma.inquietud]) {
        const where = modelo.findMany.mock.calls[0]![0].where;
        expect(where.groupId).toEqual({ in: ['g-origen', 'g-acogida', 'g-general', 'g-sub'] });
        expect(where.hidden).toBe(false);
        expect(where.OR).toContainEqual({ title: { contains: 'chinandega', mode: 'insensitive' } });
        expect(where.OR).toContainEqual({ body: { contains: 'agua', mode: 'insensitive' } });
      }
      expect(r.map((x) => x.ruta)).toEqual([`/proposals/${UUID_A}`, `/inquietudes/${UUID_B}`]);
      expect(r[0]).toMatchObject({ clase: 'debate', comunidad: 'Chinandega' });
      expect(r[1]).toMatchObject({ clase: 'inquietud', comunidad: 'Chinandega' });
    });

    it('ignora palabras de menos de 3 letras y no consulta si no queda ninguna', async () => {
      expect(await servicio.buscar(YO, 'de la')).toEqual([]);
      expect(prisma.proposal.findMany).not.toHaveBeenCalled();
    });

    it('busca también sin acentos y recorta el extracto a 300 caracteres', async () => {
      prisma.proposal.findMany.mockResolvedValue([
        { id: UUID_A, title: 'Educación', body: 'x'.repeat(900), status: 'open', kind: 'tema', groupId: 'g-sub' },
      ]);
      const r = await servicio.buscar(YO, 'Educación');
      const or = prisma.proposal.findMany.mock.calls[0]![0].where.OR;
      expect(or).toContainEqual({ title: { contains: 'educación', mode: 'insensitive' } });
      expect(or).toContainEqual({ title: { contains: 'educacion', mode: 'insensitive' } });
      expect(r[0]!.extracto.length).toBeLessThanOrEqual(300);
    });

    it('devuelve decisiones por la ruta de su propuesta y grupos de trabajo', async () => {
      prisma.decision.findMany.mockResolvedValue([
        { fase: 'votacion', proposalId: UUID_A, proposal: { title: 'Agua', body: 'b', groupId: 'g-origen' } },
      ]);
      prisma.group.findMany
        .mockResolvedValueOnce([SUBGRUPO])
        .mockResolvedValueOnce([{ id: 'g-sub', name: 'Agua potable', proposito: 'Llevar agua', trabajoEstado: 'activo', parentGroupId: 'g-origen' }]);
      const r = await servicio.buscar(YO, 'agua');
      expect(r.find((x) => x.clase === 'decision')!.ruta).toBe(`/proposals/${UUID_A}`);
      expect(r.find((x) => x.clase === 'grupo')!.ruta).toBe('/grupos/g-sub');
    });
  });

  describe('estado', () => {
    it('cuenta pendiente: verificación, comunidades e invitaciones', async () => {
      const e = await servicio.estado('u1', YO, 'pending_verification' as never);
      expect(verificacion.statusFor).toHaveBeenCalledWith('u1');
      expect(e.cuenta).toBe('pending_verification');
      expect(e.verificacion).toEqual({ tiene: 1, faltan: ['segunda'] });
      expect(e.invitaciones).toEqual({ pendientes: 2, maximo: 5 });
      expect(rules.getInt).toHaveBeenCalledWith('invitaciones.pendientes_max', null);
      expect(e.comunidades.map((c) => c.tipo)).toEqual(['origen', 'acogida', 'general']);
      expect(e.comunidades[0]).toMatchObject({ nombre: 'Chinandega', miembros: 3, activa: 3 >= MIN_ACTIVE_MEMBERS, faltan: MIN_ACTIVE_MEMBERS - 3 });
    });

    it('cuenta verificada: no consulta la verificación y la comunidad activa no tiene faltantes', async () => {
      crear(
        (() => {
          const p = buildPrisma();
          p.groupMembership.findMany.mockResolvedValue([{ group: { ...ORIGEN, _count: { memberships: MIN_ACTIVE_MEMBERS + 2 } } }]);
          return p;
        })(),
      );
      const e = await servicio.estado('u1', YO, 'verified_citizen' as never);
      expect(verificacion.statusFor).not.toHaveBeenCalled();
      expect(e.verificacion).toBeNull();
      expect(e.comunidades[0]).toMatchObject({ activa: true, faltan: 0 });
    });

    it('reúne votaciones abiertas e inquietudes con plazo, la más próxima primero', async () => {
      prisma.decision.findMany.mockResolvedValue([
        { proposalId: UUID_A, votacionEndsAt: new Date('2026-12-10T00:00:00Z'), proposal: { title: 'Agua', groupId: 'g-origen' } },
      ]);
      prisma.inquietud.findMany.mockResolvedValue([
        { id: UUID_B, title: 'Pozos', deadlineAt: new Date('2026-12-05T00:00:00Z'), groupId: 'g-acogida' },
      ]);
      const e = await servicio.estado('u1', YO, 'verified_citizen' as never);
      expect(e.plazos.map((p) => p.ruta)).toEqual([`/inquietudes/${UUID_B}`, `/proposals/${UUID_A}`]);
      expect(e.plazos[0]).toMatchObject({ comunidad: 'Costa Rica', vence: '2026-12-05T00:00:00.000Z' });
      // Solo grupos de los que es miembro (no el subgrupo que apenas lee) y sin pausa.
      const where = prisma.decision.findMany.mock.calls[0]![0].where;
      expect(where.proposal.groupId).toEqual({ in: ['g-origen', 'g-acogida', 'g-general'] });
      expect(where.proposal.group).toEqual({ pausadaAt: null });
    });
  });

  describe('aMaterial (privacidad)', () => {
    it('con el camino real (estado + búsqueda) no deja pasar nombres, correos, ids de perfil ni uuids', async () => {
      const PERFIL = '9c1e4b7a-2d3f-4a6b-8c9d-0e1f2a3b4c5d';
      crear();
      verificacion.statusFor.mockResolvedValue({
        status: 'pending_verification',
        references: [{ kind: 'invitador', displayName: 'María López', email: 'maria@ejemplo.org' }],
        missing: ['segunda'],
      });
      prisma.decision.findMany.mockResolvedValueOnce([
        { proposalId: UUID_A, votacionEndsAt: new Date('2026-12-10T00:00:00Z'), proposal: { title: 'Agua', groupId: 'g-origen' } },
      ]);
      prisma.proposal.findMany.mockResolvedValue([
        { id: UUID_B, title: `Agua ${UUID_B}`, body: `Falta agua, ver ${UUID_A}`, status: 'open', kind: 'tema', groupId: 'g-origen' },
      ]);
      prisma.group.findMany.mockResolvedValueOnce([SUBGRUPO]).mockResolvedValueOnce([]);

      const estado = await servicio.estado('u1', PERFIL, 'pending_verification' as never);
      const resultados = await servicio.buscar(PERFIL, 'agua');
      const { material, refs } = aMaterial(estado, resultados);

      expect(material).not.toContain('María');
      expect(material).not.toContain('maria@');
      expect(material).not.toContain(PERFIL);
      expect(material).not.toMatch(REGEX_UUID);
      expect(material).not.toContain('/proposals/');
      expect(refs.get('r1')!.ruta).toBe(`/proposals/${UUID_A}`);
      expect(refs.get('r2')!.ruta).toBe(`/proposals/${UUID_B}`);
      // Los correos y teléfonos que escriban las personas dentro del contenido los quita después
      // limpiarTexto() en AsistenteService.pedir(); aquí no se duplica esa limpieza.
    });
  });
});

describe('guía de la plataforma', () => {
  it('RUTAS_DE_LA_GUIA solo tiene rutas que empiezan con / y sin uuid', () => {
    const rutas = Object.values(RUTAS_DE_LA_GUIA);
    expect(rutas.length).toBeGreaterThan(0);
    for (const { ruta, texto } of rutas) {
      expect(ruta.startsWith('/')).toBe(true);
      expect(ruta).not.toMatch(REGEX_UUID);
      expect(texto.length).toBeGreaterThan(0);
    }
  });

  it('el texto de la guía cita solo referencias que existen', () => {
    expect(GUIA_DE_LA_PLATAFORMA.length).toBeGreaterThan(1000);
    for (const m of GUIA_DE_LA_PLATAFORMA.matchAll(/\[(g\d+)\]/g)) {
      expect(RUTAS_DE_LA_GUIA[m[1]!]).toBeDefined();
    }
  });

  it('la guía describe todas las tarjetas del asistente y la presentación solo para temas abiertos por la comunidad', () => {
    expect(GUIA_DE_LA_PLATAFORMA).toContain('**Aviso de umbral.**');
    expect(GUIA_DE_LA_PLATAFORMA).toContain('**Comentario para comisiones.**');
    expect(GUIA_DE_LA_PLATAFORMA).not.toContain('Al abrir un tema puede ofrecer una presentación');
    expect(GUIA_DE_LA_PLATAFORMA).toContain('la comunidad misma abrió el debate');
  });
});
