import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { GroupAccessService } from './group-access.service';

const YO = 'p-yo';
const AMBITO = 'g-ambito';
const SUB = 'g-sub';
const COMUNIDAD = 'g-comunidad';

/** Membresías por grupo: la persona es miembro de los grupos de `de`. */
function prismaCon(de: string[], trabajoEstado = 'activo', trabajoTipo = 'subgrupo') {
  return {
    groupMembership: {
      findUnique: vi.fn(({ where }: { where: { groupId_profileId: { groupId: string; profileId: string } } }) =>
        Promise.resolve(
          de.includes(where.groupId_profileId.groupId) && where.groupId_profileId.profileId === YO ? { id: 'm' } : null,
        ),
      ),
    },
    group: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === SUB
            ? { type: 'trabajo', parentGroupId: AMBITO, trabajoEstado, trabajoTipo }
            : where.id === COMUNIDAD || where.id === AMBITO
              ? { type: 'territorial_residence', parentGroupId: null, trabajoEstado: null }
              : null,
        ),
      ),
    },
  };
}

describe('GroupAccessService', () => {
  let service: GroupAccessService;

  describe('miembro del grupo de trabajo', () => {
    beforeEach(() => {
      service = new GroupAccessService(prismaCon([SUB, AMBITO]) as never);
    });
    it('participa y lee', async () => {
      expect(await service.isParticipant(SUB, YO)).toBe(true);
      expect(await service.canRead(SUB, YO)).toBe(true);
      await expect(service.requireParticipant(SUB, YO)).resolves.toBeUndefined();
      await expect(service.requireReader(SUB, YO)).resolves.toEqual({ participa: true });
    });
  });

  describe('miembro del ámbito que no es del grupo de trabajo', () => {
    beforeEach(() => {
      service = new GroupAccessService(prismaCon([AMBITO]) as never);
    });
    it('lee pero no participa', async () => {
      expect(await service.isParticipant(SUB, YO)).toBe(false);
      expect(await service.canRead(SUB, YO)).toBe(true);
      await expect(service.requireReader(SUB, YO)).resolves.toEqual({ participa: false });
      await expect(service.requireParticipant(SUB, YO)).rejects.toThrow(ForbiddenException);
      await expect(service.requireParticipant(SUB, YO)).rejects.toThrow('Solo los miembros de este grupo pueden participar.');
    });
  });

  describe('persona ajena al ámbito', () => {
    beforeEach(() => {
      service = new GroupAccessService(prismaCon([COMUNIDAD]) as never);
    });
    it('ni lee ni participa', async () => {
      expect(await service.canRead(SUB, YO)).toBe(false);
      await expect(service.requireReader(SUB, YO)).rejects.toThrow('Solo los miembros de esta comunidad pueden ver esto.');
      await expect(service.requireParticipant(SUB, YO)).rejects.toThrow('Solo los miembros de este grupo pueden participar.');
    });
  });

  describe('grupo que no es de trabajo', () => {
    it('solo lo leen y participan sus miembros, con el mensaje de comunidad', async () => {
      service = new GroupAccessService(prismaCon([AMBITO]) as never);
      expect(await service.canRead(COMUNIDAD, YO)).toBe(false);
      await expect(service.requireReader(COMUNIDAD, YO)).rejects.toThrow('Solo los miembros de esta comunidad pueden ver esto.');
      await expect(service.requireParticipant(COMUNIDAD, YO)).rejects.toThrow(
        'Solo los miembros de esta comunidad pueden participar.',
      );
      service = new GroupAccessService(prismaCon([COMUNIDAD]) as never);
      await expect(service.requireReader(COMUNIDAD, YO)).resolves.toEqual({ participa: true });
      await expect(service.requireParticipant(COMUNIDAD, YO)).resolves.toBeUndefined();
    });
    it('un grupo inexistente no se lee', async () => {
      service = new GroupAccessService(prismaCon([AMBITO]) as never);
      expect(await service.canRead('g-otro', YO)).toBe(false);
    });
  });

  describe('grupo de trabajo que no está activo', () => {
    it('un miembro no participa en convocando, pausado, cerrado ni archivado (409)', async () => {
      for (const estado of ['convocando', 'pausado', 'cerrado', 'archivado']) {
        service = new GroupAccessService(prismaCon([SUB, AMBITO], estado) as never);
        await expect(service.requireParticipant(SUB, YO)).rejects.toThrow(ConflictException);
        await expect(service.requireParticipant(SUB, YO)).rejects.toThrow('Este grupo de trabajo no está activo.');
        // Leer sigue permitido.
        await expect(service.requireReader(SUB, YO)).resolves.toEqual({ participa: true });
      }
    });
    it('quien no es miembro recibe 403 antes que el 409', async () => {
      service = new GroupAccessService(prismaCon([AMBITO], 'archivado') as never);
      await expect(service.requireParticipant(SUB, YO)).rejects.toThrow(ForbiddenException);
    });
    it('requireMember solo mira la membresía', async () => {
      service = new GroupAccessService(prismaCon([SUB, AMBITO], 'archivado') as never);
      await expect(service.requireMember(SUB, YO)).resolves.toBeUndefined();
      service = new GroupAccessService(prismaCon([AMBITO], 'activo') as never);
      await expect(service.requireMember(SUB, YO)).rejects.toThrow('Solo los miembros de este grupo pueden participar.');
    });
  });

  describe('bifurcación (R4: el ámbito no la lee)', () => {
    it('un miembro del ámbito que no es de la bifurcación no la lee ni su foro: 403', async () => {
      service = new GroupAccessService(prismaCon([AMBITO], 'activo', 'bifurcacion') as never);
      expect(await service.nivel(SUB, YO)).toBeNull();
      expect(await service.canRead(SUB, YO)).toBe(false);
      await expect(service.requireReader(SUB, YO)).rejects.toThrow(ForbiddenException);
    });
    it('sus miembros la leen y participan', async () => {
      service = new GroupAccessService(prismaCon([SUB, AMBITO], 'activo', 'bifurcacion') as never);
      await expect(service.requireReader(SUB, YO)).resolves.toEqual({ participa: true });
      await expect(service.requireParticipant(SUB, YO)).resolves.toBeUndefined();
    });
    it('pausada, sus miembros la leen pero no participan (409)', async () => {
      service = new GroupAccessService(prismaCon([SUB, AMBITO], 'pausado', 'bifurcacion') as never);
      await expect(service.requireReader(SUB, YO)).resolves.toEqual({ participa: true });
      await expect(service.requireParticipant(SUB, YO)).rejects.toThrow(ConflictException);
    });
  });

  describe('grupos reservados y rastro para la auditoría', () => {
    /** g-bif es una bifurcación de AMBITO; g-com es su comisión; SUB un subgrupo. */
    function prismaReservado() {
      const grupos: Record<string, { type: string; parentGroupId: string | null; trabajoEstado: string | null; trabajoTipo: string | null }> = {
        [AMBITO]: { type: 'territorial_residence', parentGroupId: null, trabajoEstado: null, trabajoTipo: null },
        [SUB]: { type: 'trabajo', parentGroupId: AMBITO, trabajoEstado: 'activo', trabajoTipo: 'subgrupo' },
        'g-bif': { type: 'trabajo', parentGroupId: AMBITO, trabajoEstado: 'activo', trabajoTipo: 'bifurcacion' },
        'g-com': { type: 'trabajo', parentGroupId: 'g-bif', trabajoEstado: 'activo', trabajoTipo: 'comision' },
      };
      return {
        groupMembership: { findUnique: vi.fn().mockResolvedValue(null) },
        group: { findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(grupos[where.id] ?? null)) },
        profile: { findUnique: vi.fn().mockResolvedValue({ userId: 'u-yo' }) },
      };
    }

    it('esReservado: la bifurcación y su comisión sí; el ámbito, un subgrupo o un grupo inexistente no', async () => {
      service = new GroupAccessService(prismaReservado() as never);
      expect(await service.esReservado('g-bif')).toBe(true);
      expect(await service.esReservado('g-com')).toBe(true);
      expect(await service.esReservado(AMBITO)).toBe(false);
      expect(await service.esReservado(SUB)).toBe(false);
      expect(await service.esReservado('g-nada')).toBe(false);
    });

    it('rastro: fuera de lo reservado lleva actor e ip; dentro, nada', async () => {
      service = new GroupAccessService(prismaReservado() as never);
      expect(await service.rastro(AMBITO, YO, '1.1.1.1')).toEqual({ reservado: false, quien: { actorId: 'u-yo', ip: '1.1.1.1' } });
      expect(await service.rastro('g-bif', YO, '1.1.1.1')).toEqual({ reservado: true, quien: {} });
      expect(await service.rastro('g-com', YO)).toEqual({ reservado: true, quien: {} });
      // Reservado por otra causa (p. ej., un tema llevado desde una bifurcación).
      expect(await service.rastro(AMBITO, YO, '1.1.1.1', true)).toEqual({ reservado: true, quien: {} });
    });
  });
});
