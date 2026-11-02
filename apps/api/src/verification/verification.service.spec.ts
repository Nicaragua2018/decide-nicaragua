import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VerificationService } from './verification.service';

function buildPrisma() {
  const prisma = {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    profile: { findUnique: vi.fn() },
    boardSeat: { findFirst: vi.fn() },
    verificationReference: { create: vi.fn(), findMany: vi.fn() },
  };
  // tx === prisma: la transacción de prueba ejecuta el callback con el mismo mock
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

const yo = (over = {}) => ({ sub: 'u-ref', email: 'r@x', status: 'verified_citizen', profileId: 'p-ref', ...over }) as never;

const pendiente = (over = {}) => ({
  id: 'u-new',
  status: 'pending_verification',
  invitedById: 'u-inv',
  profile: { id: 'p-new', displayName: 'Nueva', birthDepartment: 'León', currentCountry: 'CR', currentRegion: null },
  referencesReceived: [],
  ...over,
});

describe('VerificationService.confirm()', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let groups: { syncMemberships: ReturnType<typeof vi.fn> };
  let service: VerificationService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    groups = { syncMemberships: vi.fn().mockResolvedValue(undefined) };
    service = new VerificationService(prisma as never, audit as never, groups as never);
    prisma.user.count.mockResolvedValue(20); // fuera de la fundación
    prisma.boardSeat.findFirst.mockResolvedValue(null);
    prisma.verificationReference.create.mockResolvedValue({});
    prisma.verificationReference.findMany.mockResolvedValue([]);
  });

  it('un pendiente no puede dar referencias', async () => {
    await expect(service.confirm(yo({ status: 'pending_verification' }), 'u-new', 'ip')).rejects.toThrow(ForbiddenException);
  });

  it('nadie se confirma a sí mismo', async () => {
    await expect(service.confirm(yo({ sub: 'u-new' }), 'u-new', 'ip')).rejects.toThrow(BadRequestException);
  });

  it('solo se confirma a quien espera verificación', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente({ status: 'verified_citizen' }));
    await expect(service.confirm(yo(), 'u-new', 'ip')).rejects.toThrow(BadRequestException);
  });

  it('quien invitó da la referencia «invitador»', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Masaya', currentCountry: 'ES', currentRegion: null });
    prisma.verificationReference.findMany.mockResolvedValue([{ kind: 'invitador' }]);

    await service.confirm(yo({ sub: 'u-inv', profileId: 'p-inv' }), 'u-new', 'ip');

    expect(prisma.verificationReference.create).toHaveBeenCalledWith({
      data: { subjectUserId: 'u-new', refereeProfileId: 'p-inv', kind: 'invitador' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled(); // falta la segunda
  });

  it('rechaza una segunda referencia de alguien sin relación', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Masaya', currentCountry: 'ES', currentRegion: null });
    await expect(service.confirm(yo(), 'u-new', 'ip')).rejects.toThrow(ForbiddenException);
  });

  it('acepta segunda referencia del mismo territorio de origen y, con las dos, verifica', async () => {
    prisma.user.findUnique.mockResolvedValue(
      pendiente({ referencesReceived: [{ kind: 'invitador', refereeProfileId: 'p-inv' }] }),
    );
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'León', currentCountry: 'US', currentRegion: 'TX' });
    prisma.verificationReference.findMany.mockResolvedValue([{ kind: 'invitador' }, { kind: 'segunda' }]);
    prisma.user.update.mockResolvedValue({});

    await service.confirm(yo(), 'u-new', 'ip');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-new' }, data: { status: 'verified_citizen' } });
    expect(groups.syncMemberships).toHaveBeenCalledWith('u-new', 'León', 'CR', null);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.verified', metadata: { via: 'dos_referencias' } }));
  });

  it('acepta segunda referencia de la misma comunidad de acogida', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Masaya', currentCountry: 'CR', currentRegion: null });

    await service.confirm(yo(), 'u-new', 'ip');

    expect(prisma.verificationReference.create).toHaveBeenCalledWith({
      data: { subjectUserId: 'u-new', refereeProfileId: 'p-ref', kind: 'segunda' },
    });
  });

  it('el administrador puede ser la segunda referencia aunque no comparta comunidad', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Masaya', currentCountry: 'ES', currentRegion: null });
    prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });

    await service.confirm(yo(), 'u-new', 'ip');

    expect(prisma.verificationReference.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'segunda' }) }),
    );
  });

  it('una misma persona no da dos referencias', async () => {
    prisma.user.findUnique.mockResolvedValue(
      pendiente({ referencesReceived: [{ kind: 'invitador', refereeProfileId: 'p-inv' }] }),
    );
    await expect(service.confirm(yo({ sub: 'u-inv', profileId: 'p-inv' }), 'u-new', 'ip')).rejects.toThrow(ConflictException);
  });

  it('no hay dos segundas referencias', async () => {
    prisma.user.findUnique.mockResolvedValue(
      pendiente({ referencesReceived: [{ kind: 'segunda', refereeProfileId: 'p-otro' }] }),
    );
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'León', currentCountry: 'CR', currentRegion: null });
    await expect(service.confirm(yo(), 'u-new', 'ip')).rejects.toThrow(ConflictException);
  });

  it('fundación: con menos de 4 verificados, la referencia del administrador basta', async () => {
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(pendiente({ invitedById: 'u-ref' }));
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Masaya', currentCountry: 'ES', currentRegion: null });
    prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });
    prisma.verificationReference.findMany.mockResolvedValue([{ kind: 'invitador' }]);
    prisma.user.update.mockResolvedValue({});

    await service.confirm(yo(), 'u-new', 'ip');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-new' }, data: { status: 'verified_citizen' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.verified', metadata: { via: 'fundacion' } }));
  });

  it('fundación: si la referencia del administrador completa las dos, el motivo es dos_referencias', async () => {
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(
      pendiente({ referencesReceived: [{ kind: 'invitador', refereeProfileId: 'p-inv' }] }),
    );
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Masaya', currentCountry: 'ES', currentRegion: null });
    prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });
    prisma.verificationReference.findMany.mockResolvedValue([{ kind: 'invitador' }, { kind: 'segunda' }]);
    prisma.user.update.mockResolvedValue({});

    await service.confirm(yo(), 'u-new', 'ip');

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.verified', metadata: { via: 'dos_referencias' } }));
  });

  it('fuera de la fundación (4 o más verificados), el administrador solo no verifica', async () => {
    prisma.user.count.mockResolvedValue(4);
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Masaya', currentCountry: 'ES', currentRegion: null });
    prisma.boardSeat.findFirst.mockResolvedValue({ role: 'administrador' });
    prisma.verificationReference.findMany.mockResolvedValue([{ kind: 'segunda' }]);

    await service.confirm(yo(), 'u-new', 'ip');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(groups.syncMemberships).not.toHaveBeenCalled();
  });

  it('la fundación no se reabre: cuenta verificados y suspendidos', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'León', currentCountry: 'CR', currentRegion: null });

    await service.confirm(yo(), 'u-new', 'ip');

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { status: { in: ['verified_citizen', 'suspended'] } },
    });
  });

  it('decide por la relectura dentro de la transacción (confirmaciones simultáneas)', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente()); // al leer no había ninguna
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'León', currentCountry: 'CR', currentRegion: null });
    // tras insertar, la otra referencia ya está confirmada
    prisma.verificationReference.findMany.mockResolvedValue([{ kind: 'invitador' }, { kind: 'segunda' }]);
    prisma.user.update.mockResolvedValue({});

    await service.confirm(yo(), 'u-new', 'ip');

    expect(prisma.verificationReference.findMany).toHaveBeenCalledWith({
      where: { subjectUserId: 'u-new' },
      select: { kind: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-new' }, data: { status: 'verified_citizen' } });
  });

  it('una referencia duplicada simultánea (P2002) se informa como conflicto', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'León', currentCountry: 'CR', currentRegion: null });
    prisma.verificationReference.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.confirm(yo(), 'u-new', 'ip')).rejects.toThrow(ConflictException);
  });

  it('si syncMemberships falla, la persona ya está verificada y no se falla la petición', async () => {
    prisma.user.findUnique.mockResolvedValue(pendiente());
    prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'León', currentCountry: 'CR', currentRegion: null });
    prisma.verificationReference.findMany.mockResolvedValue([{ kind: 'invitador' }, { kind: 'segunda' }]);
    prisma.user.update.mockResolvedValue({});
    groups.syncMemberships.mockRejectedValue(new Error('boom'));

    await expect(service.confirm(yo(), 'u-new', 'ip')).resolves.toBeUndefined();
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
