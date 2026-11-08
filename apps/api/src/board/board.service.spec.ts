import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { BoardService } from './board.service';

function buildPrisma() {
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    boardSeat: {
      findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn(), upsert: vi.fn(), create: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    cargo: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    group: { findUnique: vi.fn().mockResolvedValue({ id: 'g-general' }) },
    eleccion: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    revocacion: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    profile: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    solicitudReactivacion: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    groupMembership: { deleteMany: vi.fn() },
    boardAction: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    boardApproval: { create: vi.fn(), findMany: vi.fn() },
    cambioRegla: { findFirst: vi.fn(), updateMany: vi.fn() },
    ruleValue: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    candidatura: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
  };
  // tx === prisma: la transacción de prueba ejecuta el callback con el mismo mock
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

/** Un cargo ocupado por alguien con el estado indicado (verificado por defecto). */
const asiento = (role: string, status = 'verified_citizen') => ({ role, profile: { user: { status } } });

const ADMIN = { sub: 'u-admin', email: 'a@x', status: 'verified_citizen', profileId: 'p-admin' } as never;
const SECRE = { sub: 'u-sec', email: 's@x', status: 'verified_citizen', profileId: 'p-sec' } as never;

describe('BoardService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let groups: { syncMemberships: ReturnType<typeof vi.fn> };
  let service: BoardService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    groups = { syncMemberships: vi.fn().mockResolvedValue(undefined) };
    service = new BoardService(prisma as never, audit as never, groups as never);
  });

  describe('roleOf()', () => {
    it('devuelve el cargo de quien está verificado', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      await expect(service.roleOf('p-sec')).resolves.toBe('secretario');
    });

    it('un cargo cuyo titular está suspendido no actúa (el asiento sigue registrado)', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador', 'suspended'));
      await expect(service.roleOf('p-admin')).resolves.toBeNull();
      await expect(service.isAdministrator('p-admin')).resolves.toBe(false);
    });

    it('sin cargo devuelve null', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(null);
      await expect(service.roleOf('p-x')).resolves.toBeNull();
    });
  });

  describe('assignFounderSeat()', () => {
    it('solo el administrador asigna cargos fundadores', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      await expect(service.assignFounderSeat(SECRE, 'coordinador_general' as never, 'p-x', 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('no se asignan cargos fundadores después de una elección', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardSeat.count.mockResolvedValue(1);
      await expect(service.assignFounderSeat(ADMIN, 'secretario' as never, 'p-x', 'ip')).rejects.toThrow(ForbiddenException);
    });

    it('sigue bloqueado tras la primera posesión de una elección', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardSeat.count.mockResolvedValue(1); // un asiento con source 'eleccion'
      await expect(
        service.assignFounderSeat(ADMIN, 'coordinador_general' as never, 'p-x', 'ip'),
      ).rejects.toThrow('ya se eligen por votación');
      expect(prisma.boardSeat.count).toHaveBeenCalledWith({ where: { source: 'eleccion' } });
      expect(prisma.boardSeat.create).not.toHaveBeenCalled();
    });

    it('solo un miembro verificado sin otro cargo puede ocupar un cargo', async () => {
      prisma.boardSeat.findFirst
        .mockResolvedValueOnce(asiento('administrador')) // rol del actor
        .mockResolvedValueOnce(null); // otro cargo del destinatario
      prisma.boardSeat.count.mockResolvedValue(0);
      prisma.profile.findUnique.mockResolvedValue({ id: 'p-x', user: { status: 'pending_verification' } });
      await expect(service.assignFounderSeat(ADMIN, 'secretario' as never, 'p-x', 'ip')).rejects.toThrow(BadRequestException);
    });

    it('el cargo de administrador no se asigna desde aquí', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardSeat.count.mockResolvedValue(0);
      await expect(service.assignFounderSeat(ADMIN, 'administrador' as never, 'p-x', 'ip')).rejects.toThrow('no se asigna desde aquí');
      expect(prisma.boardSeat.create).not.toHaveBeenCalled();
    });

    it('no reemplaza un cargo ya ocupado', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardSeat.count.mockResolvedValue(0);
      prisma.boardSeat.findUnique.mockResolvedValue({ role: 'secretario', profileId: 'p-sec' });
      await expect(service.assignFounderSeat(ADMIN, 'secretario' as never, 'p-x', 'ip')).rejects.toThrow('ya está ocupado');
      expect(prisma.boardSeat.create).not.toHaveBeenCalled();
    });

    it('asigna el cargo y lo audita', async () => {
      prisma.boardSeat.findFirst
        .mockResolvedValueOnce(asiento('administrador'))
        .mockResolvedValueOnce(null);
      prisma.boardSeat.count.mockResolvedValue(0);
      prisma.profile.findUnique.mockResolvedValue({ id: 'p-x', user: { status: 'verified_citizen' } });
      prisma.boardSeat.findUnique.mockResolvedValue(null);
      prisma.boardSeat.create.mockResolvedValue({});

      await service.assignFounderSeat(ADMIN, 'secretario' as never, 'p-x', 'ip');

      expect(prisma.boardSeat.create).toHaveBeenCalledWith({
        data: { role: 'secretario', profileId: 'p-x', source: 'fundador' },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'board.seat_assigned' }));
    });
  });

  describe('proposeAction()', () => {
    it('solo un cargo de la mesa propone', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(null);
      await expect(
        service.proposeAction(SECRE, { type: 'suspend_user' as never, targetUserId: 'u-t', reason: 'spam', params: {} }, 'ip'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cambio de origen exige un departamento válido', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      prisma.user.findUnique.mockResolvedValue({ id: 'u-t' });
      await expect(
        service.proposeAction(SECRE, { type: 'change_origin' as never, targetUserId: 'u-t', reason: 'error', params: { birthDepartment: 'Atlántida' } }, 'ip'),
      ).rejects.toThrow(BadRequestException);
    });

    it('la propuesta cuenta como la primera aprobación', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      prisma.user.findUnique.mockResolvedValue({ id: 'u-t' });
      prisma.boardAction.create.mockResolvedValue({ id: 'a1' });

      await service.proposeAction(SECRE, { type: 'suspend_user' as never, targetUserId: 'u-t', reason: 'spam', params: {} }, 'ip');

      expect(prisma.boardAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvals: { create: { profileId: 'p-sec', role: 'secretario', approve: true } },
          }),
        }),
      );
    });
  });

  /** Los votos de la acción tal como quedan en la base tras registrar el nuevo. */
  const votos = (...v: boolean[]) => prisma.boardApproval.findMany.mockResolvedValue(v.map((approve) => ({ approve })));
  const resuelta = () => prisma.boardAction.updateMany.mock.calls.at(-1)?.[0] as
    | { where: Record<string, unknown>; data: Record<string, unknown> }
    | undefined;

  describe('voteAction()', () => {
    const accion = { id: 'a1', type: 'suspend_user', targetUserId: 'u-t', params: {}, status: 'pending' };
    beforeEach(() => {
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
    });

    it('una persona no vota dos veces la misma acción', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      await expect(service.voteAction(SECRE, 'a1', true, 'ip')).rejects.toThrow(ConflictException);
    });

    it('con 2 aprobaciones de personas distintas se ejecuta la suspensión', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      votos(true, true);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-t' }, data: { status: 'suspended' } });
      expect(resuelta()).toMatchObject({ where: { id: 'a1', status: 'pending' }, data: { status: 'executed' } });
    });

    it('la suspensión borra sus membresías en la misma transacción', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.groupMembership.deleteMany.mockResolvedValue({ count: 3 });
      votos(true, true);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.groupMembership.deleteMany).toHaveBeenCalledWith({ where: { profile: { userId: 'u-t' } } });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-t' }, data: { status: 'suspended' } });
    });

    it('un cargo suspendido no puede votar', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario', 'suspended'));
      await expect(service.voteAction(SECRE, 'a1', true, 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.boardApproval.create).not.toHaveBeenCalled();
    });

    it('con 2 rechazos la acción queda rechazada y no se ejecuta', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue({
        ...accion,
        approvals: [{ profileId: 'p-sec', approve: true }, { profileId: 'p-coord', approve: false }],
      });
      prisma.boardApproval.create.mockResolvedValue({});
      votos(true, false, false);

      await service.voteAction(ADMIN, 'a1', false, 'ip');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(resuelta()).toMatchObject({ where: { id: 'a1', status: 'pending' }, data: { status: 'rejected' } });
    });

    it('el cambio de origen aprobado actualiza el perfil y las comunidades', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue({
        ...accion,
        type: 'change_origin',
        params: { birthDepartment: 'Managua' },
        approvals: [{ profileId: 'p-sec', approve: true }],
      });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.profile.update.mockResolvedValue({ currentCountry: 'CR', currentRegion: null });
      prisma.user.findUnique.mockResolvedValue({ status: 'verified_citizen' });
      votos(true, true);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-t' }, data: { birthDepartment: 'Managua' } }),
      );
      expect(groups.syncMemberships).toHaveBeenCalledWith('u-t', 'Managua', 'CR', null);
    });

    it('el cambio de origen de alguien no verificado no le da comunidades', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue({
        ...accion,
        type: 'change_origin',
        params: { birthDepartment: 'Managua' },
        approvals: [{ profileId: 'p-sec', approve: true }],
      });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.profile.update.mockResolvedValue({ currentCountry: 'CR', currentRegion: null });
      prisma.user.findUnique.mockResolvedValue({ status: 'pending_verification' });
      votos(true, true);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.profile.update).toHaveBeenCalled();
      expect(groups.syncMemberships).not.toHaveBeenCalled();
    });
  });

  describe('voteAction(): bloqueo de la acción', () => {
    const accion = { id: 'a1', type: 'suspend_user', targetUserId: 'u-t', params: {}, status: 'pending', approvals: [{ profileId: 'p-sec', approve: true }] };
    beforeEach(() => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
    });

    it('registra la firma, cuenta desde la base y ejecuta en una transacción con la acción bloqueada', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion);
      votos(true, true);
      await service.voteAction(ADMIN, 'a1', true, 'ip');
      const sql = (prisma.$queryRaw.mock.calls[0]![0] as { strings: string[] }).strings.join('?');
      expect(sql).toContain('FROM board_actions');
      expect(sql).toContain('FOR UPDATE');
      const orden = [
        prisma.$queryRaw.mock.invocationCallOrder[0]!,
        prisma.boardApproval.create.mock.invocationCallOrder[0]!,
        prisma.boardApproval.findMany.mock.invocationCallOrder[0]!,
        prisma.user.update.mock.invocationCallOrder[0]!,
        prisma.boardAction.updateMany.mock.invocationCallOrder[0]!,
      ];
      expect([...orden].sort((a, b) => a - b)).toEqual(orden);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // El estado se resuelve con el updateMany condicionado; `update` solo guarda el estado previo.
      expect(prisma.boardAction.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: expect.anything() }) }),
      );
    });

    it('dos firmas finales a la vez: la segunda espera, ve la acción ya resuelta (400) y no la pisa', async () => {
      // Antes del bloqueo la ve pendiente; ya bloqueada, la primera firma la había ejecutado.
      prisma.boardAction.findUnique.mockResolvedValueOnce(accion).mockResolvedValueOnce({ ...accion, status: 'executed' });
      await expect(service.voteAction(ADMIN, 'a1', true, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.boardApproval.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.boardAction.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('si otra resolución gana la carrera dentro de la transacción, no se audita nada (400)', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion);
      votos(true, true);
      prisma.boardAction.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.voteAction(ADMIN, 'a1', true, 'ip')).rejects.toThrow(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('un voto repetido que llega a la vez (índice único) da 409', async () => {
      const { Prisma } = await import('@prisma/client');
      prisma.boardAction.findUnique.mockResolvedValue(accion);
      prisma.boardApproval.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.voteAction(ADMIN, 'a1', true, 'ip')).rejects.toThrow(ConflictException);
    });
  });

  describe('change_rule', () => {
    const params = { key: 'reglas.participacion_minima', valor: '40', cambioId: 'c-9' };
    /** Acción creada por el sistema (sin proponente): llega con un voto previo de otro cargo. */
    const accion = (approve: boolean) => ({
      id: 'a9',
      type: 'change_rule',
      targetUserId: null,
      params,
      status: 'pending',
      approvals: [{ profileId: 'p-sec', approve }],
    });
    const cambio = { id: 'c-9', key: 'reglas.participacion_minima', valorPropuesto: '40' };
    /** Votos que hay en la base tras registrar el nuevo (se cuentan dentro de la transacción). */
    const enLaBase = (...votos: boolean[]) =>
      prisma.boardApproval.findMany.mockResolvedValue(votos.map((approve) => ({ approve })));

    beforeEach(() => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
      prisma.cambioRegla.findFirst.mockResolvedValue(cambio);
      prisma.cambioRegla.updateMany.mockResolvedValue({ count: 1 });
      prisma.ruleValue.findFirst.mockResolvedValue(null);
      prisma.ruleValue.create.mockResolvedValue({});
    });

    it('con 2 aprobaciones guarda el valor de la colmena y el cambio queda aplicado, en una transacción', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion(true));
      enLaBase(true, true);

      await service.voteAction(ADMIN, 'a9', true, 'ip');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.cambioRegla.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-9', boardActionId: 'a9', nivel: 'colmena', estado: 'pendiente_mesa' },
        }),
      );
      expect(prisma.boardAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'a9', status: 'pending' },
        data: { status: 'executed', resolvedAt: expect.any(Date) },
      });
      expect(prisma.ruleValue.findFirst).toHaveBeenCalledWith({ where: { key: 'reglas.participacion_minima', groupId: null } });
      expect(prisma.ruleValue.create).toHaveBeenCalledWith({
        data: { key: 'reglas.participacion_minima', groupId: null, value: '40' },
      });
      expect(prisma.cambioRegla.updateMany).toHaveBeenCalledWith({
        where: { id: 'c-9', estado: 'pendiente_mesa' },
        data: { estado: 'aplicado', resueltoAt: expect.any(Date) },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'board.action_executed' }));
      expect(audit.log).toHaveBeenCalledWith({
        action: 'regla.cambio_aplicado',
        resource: 'cambio_regla:c-9',
        metadata: { cambioId: 'c-9', key: 'reglas.participacion_minima' },
      });
    });

    it('si ya hay un valor de la colmena, lo actualiza', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion(true));
      enLaBase(true, true);
      prisma.ruleValue.findFirst.mockResolvedValue({ id: 'rv-1' });
      await service.voteAction(ADMIN, 'a9', true, 'ip');
      expect(prisma.ruleValue.update).toHaveBeenCalledWith({ where: { id: 'rv-1' }, data: { value: '40' } });
      expect(prisma.ruleValue.create).not.toHaveBeenCalled();
    });

    it('con un solo voto no se resuelve', async () => {
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion(true), approvals: [] });
      enLaBase(true);
      await service.voteAction(ADMIN, 'a9', true, 'ip');
      expect(prisma.boardAction.updateMany).not.toHaveBeenCalled();
      expect(prisma.ruleValue.create).not.toHaveBeenCalled();
    });

    it('con 2 rechazos el cambio queda rechazado_mesa y no se guarda nada', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion(false));
      enLaBase(false, false);

      await service.voteAction(ADMIN, 'a9', false, 'ip');

      expect(prisma.boardAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'a9', status: 'pending' },
        data: { status: 'rejected', resolvedAt: expect.any(Date) },
      });
      expect(prisma.cambioRegla.updateMany).toHaveBeenCalledWith({
        where: { id: 'c-9', estado: 'pendiente_mesa' },
        data: { estado: 'rechazado_mesa', resueltoAt: expect.any(Date) },
      });
      expect(prisma.ruleValue.create).not.toHaveBeenCalled();
      expect(prisma.ruleValue.update).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'board.action_rejected' }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'regla.cambio_rechazado' }));
    });

    it('si el valor ya no cabe en los límites, la mesa no lo guarda: acción rechazada y cambio rechazado_mesa', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion(true));
      prisma.cambioRegla.findFirst.mockResolvedValue({ ...cambio, valorPropuesto: '5' });
      enLaBase(true, true);

      await service.voteAction(ADMIN, 'a9', true, 'ip');

      expect(prisma.boardAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected', resolvedAt: expect.any(Date) } }),
      );
      expect(prisma.cambioRegla.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: 'rechazado_mesa', resueltoAt: expect.any(Date) } }),
      );
      expect(prisma.ruleValue.create).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'board.action_rejected' }));
    });

    it('nunca aplica un cambio local ni uno que no esté ligado a la acción: la acción se rechaza', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion(true));
      prisma.cambioRegla.findFirst.mockResolvedValue(null); // el filtro exige nivel colmena y boardActionId
      enLaBase(true, true);

      await service.voteAction(ADMIN, 'a9', true, 'ip');

      expect(prisma.boardAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'rejected', resolvedAt: expect.any(Date) } }),
      );
      expect(prisma.cambioRegla.updateMany).not.toHaveBeenCalled();
      expect(prisma.ruleValue.create).not.toHaveBeenCalled();
    });

    it('si otra persona resolvió la acción a la vez, no se aplica dos veces (400)', async () => {
      prisma.boardAction.findUnique.mockResolvedValue(accion(true));
      prisma.boardAction.updateMany.mockResolvedValue({ count: 0 });
      enLaBase(true, true);

      await expect(service.voteAction(ADMIN, 'a9', true, 'ip')).rejects.toThrow(
        new BadRequestException('Esta acción ya se resolvió.'),
      );
      expect(prisma.ruleValue.create).not.toHaveBeenCalled();
      expect(prisma.cambioRegla.updateMany).not.toHaveBeenCalled();
    });

    it('dos primeros votos a la vez: con la acción bloqueada, el voto se registra y se cuenta desde la base en la misma transacción', async () => {
      // La lectura previa no ve el otro voto (llegó a la vez); la base, ya bloqueada, sí.
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion(true), approvals: [] });
      enLaBase(true, true);

      await service.voteAction(ADMIN, 'a9', true, 'ip');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const bloqueo = prisma.$queryRaw.mock.calls[0]![0] as { strings: string[]; values: unknown[] };
      expect(bloqueo.strings.join('?')).toContain('FROM board_actions WHERE id = ?::uuid FOR UPDATE');
      expect(bloqueo.values).toEqual(['a9']);
      const orden = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0]!;
      expect(orden(prisma.$transaction)).toBeLessThan(orden(prisma.$queryRaw));
      expect(orden(prisma.$queryRaw)).toBeLessThan(orden(prisma.boardApproval.create));
      expect(orden(prisma.boardApproval.create)).toBeLessThan(orden(prisma.boardApproval.findMany));
      expect(prisma.boardApproval.findMany).toHaveBeenCalledWith({ where: { actionId: 'a9' }, select: { approve: true } });
      expect(prisma.boardAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'a9', status: 'pending' },
        data: { status: 'executed', resolvedAt: expect.any(Date) },
      });
    });

    it('si al bloquearla la acción ya se resolvió, no se registra el voto (400)', async () => {
      prisma.boardAction.findUnique
        .mockResolvedValueOnce({ ...accion(true), approvals: [] })
        .mockResolvedValueOnce({ ...accion(true), status: 'executed', approvals: [] });

      await expect(service.voteAction(ADMIN, 'a9', true, 'ip')).rejects.toThrow(
        new BadRequestException('Esta acción ya se resolvió.'),
      );
      expect(prisma.boardApproval.create).not.toHaveBeenCalled();
    });

    it('un voto repetido que llega a la vez (índice único) da 409', async () => {
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion(true), approvals: [] });
      const { Prisma } = await import('@prisma/client');
      prisma.boardApproval.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.voteAction(ADMIN, 'a9', true, 'ip')).rejects.toThrow(new ConflictException('Ya votaste esta acción.'));
    });

    it('la mesa no puede proponer un change_rule a mano', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      prisma.user.findUnique.mockResolvedValue({ id: 'u-t' });
      await expect(
        service.proposeAction(SECRE, { type: 'change_rule' as never, targetUserId: 'u-t', reason: 'quiero', params }, 'ip'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.boardAction.create).not.toHaveBeenCalled();
    });
  });

  describe('listActions()', () => {
    it('muestra change_rule sin proponente ni persona objetivo', async () => {
      prisma.boardAction.findMany.mockResolvedValue([
        {
          id: 'a9',
          type: 'change_rule',
          targetUserId: null,
          params: { key: 'reglas.participacion_minima', valor: '40', cambioId: 'c-9' },
          reason: 'Cambio de regla aprobado por la comunidad',
          status: 'pending',
          proposedBy: null,
          approvals: [],
          createdAt: new Date('2026-11-06T00:00:00Z'),
        },
      ]);
      const [a] = await service.listActions();
      expect(a).toMatchObject({ type: 'change_rule', targetDisplayName: null, proposedBy: null });
      expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    });
  });
  describe('ocultar_candidatura', () => {
    const params = { candidaturaId: 'c1', causa: 'datos_personales' };
    const ficha = (fase = 'votacion', over: Record<string, unknown> = {}) => ({
      id: 'c1', eleccionId: 'e1', oculta: false, retiradaAt: null, eleccion: { fase }, profile: { userId: 'u-cand' }, ...over,
    });
    const proponer = (p: Record<string, unknown> = params) =>
      service.proposeAction(SECRE, { type: 'ocultar_candidatura' as never, reason: 'expone una dirección', params: p }, 'ip');

    it('proponer exige un cargo de la mesa', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(null);
      await expect(proponer()).rejects.toThrow(ForbiddenException);
      expect(prisma.boardAction.create).not.toHaveBeenCalled();
    });

    it('se propone con una causa de la lista cerrada, sobre la persona candidata', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      prisma.candidatura.findUnique.mockResolvedValue(ficha());
      await expect(proponer({ candidaturaId: 'c1', causa: 'me_cae_mal' })).rejects.toThrow(BadRequestException);
      prisma.boardAction.create.mockResolvedValue({ id: 'a9' });
      await expect(proponer({ ...params, extra: 'x' })).resolves.toEqual({ id: 'a9' });
      const data = prisma.boardAction.create.mock.calls[0]![0].data;
      expect(data).toMatchObject({ type: 'ocultar_candidatura', targetUserId: 'u-cand', params });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('no se propone después del conteo', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      prisma.candidatura.findUnique.mockResolvedValue(ficha('contada'));
      await expect(proponer()).rejects.toThrow(BadRequestException);
      expect(prisma.boardAction.create).not.toHaveBeenCalled();
    });

    const accion = { id: 'a1', type: 'ocultar_candidatura', targetUserId: 'u-cand', params, status: 'pending' };

    it('una aprobación no oculta; la segunda sí', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
      // Primera firma (la de quien propone ya está como aprobación al crearla): aquí, un voto en contra.
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      votos(true, false);
      await service.voteAction(ADMIN, 'a1', false, 'ip');
      expect(prisma.candidatura.updateMany).not.toHaveBeenCalled();
      expect(prisma.boardAction.updateMany).not.toHaveBeenCalled();

      prisma.candidatura.updateMany.mockResolvedValue({ count: 1 });
      prisma.candidatura.findUnique.mockResolvedValue({ eleccionId: 'e1' });
      votos(true, false, true);
      await service.voteAction(ADMIN, 'a1', true, 'ip');
      expect(prisma.candidatura.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', oculta: false, retiradaAt: null, eleccion: { fase: { in: ['candidaturas', 'votacion'] } } },
        data: { oculta: true, ocultaCausa: 'datos_personales' },
      });
      expect(resuelta()).toMatchObject({ where: { id: 'a1', status: 'pending' }, data: { status: 'executed' } });
      // La elección queda en FOR SHARE antes de ocultar: un conteo a la vez espera o ya la cerró.
      const sqls = prisma.$queryRaw.mock.calls.map((c) => (c[0] as { strings: string[] }).strings.join('?'));
      const share = sqls.findIndex((q) => q.includes('FROM elecciones') && q.includes('FOR SHARE'));
      expect(share).toBeGreaterThanOrEqual(0);
      expect(prisma.$queryRaw.mock.invocationCallOrder[share]!).toBeLessThan(
        prisma.candidatura.updateMany.mock.invocationCallOrder[0]!,
      );
      expect(audit.log).toHaveBeenCalledWith({
        action: 'candidatura.ocultada', resource: 'candidatura:c1', metadata: { eleccionId: 'e1', causa: 'datos_personales' },
      });
    });

    it('propuesta → la persona edita su ficha (la cancela) → la segunda firma ya no oculta', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      // Editar dejó la acción en «rejected» (EleccionesService.editar).
      prisma.boardAction.findUnique.mockResolvedValue({
        ...accion, status: 'rejected', approvals: [{ profileId: 'p-sec', approve: true }],
      });
      await expect(service.voteAction(ADMIN, 'a1', true, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.candidatura.updateMany).not.toHaveBeenCalled();
      expect(prisma.boardApproval.create).not.toHaveBeenCalled();
    });

    it('si la elección ya se contó al llegar la segunda firma, la acción queda rechazada', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      prisma.candidatura.findUnique.mockResolvedValue({ eleccionId: 'e1' });
      prisma.candidatura.updateMany.mockResolvedValue({ count: 0 });
      votos(true, true);
      await service.voteAction(ADMIN, 'a1', true, 'ip');
      expect(resuelta()).toMatchObject({ data: { status: 'rejected' } });
      expect(audit.log.mock.calls.map((c) => c[0].action)).not.toContain('candidatura.ocultada');
    });

    it('la persona editó su ficha justo antes del bloqueo: la segunda firma ya no oculta (400)', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique
        .mockResolvedValueOnce({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] })
        .mockResolvedValueOnce({ ...accion, status: 'rejected' });
      await expect(service.voteAction(ADMIN, 'a1', true, 'ip')).rejects.toThrow(BadRequestException);
      expect(prisma.candidatura.updateMany).not.toHaveBeenCalled();
      expect(prisma.boardApproval.create).not.toHaveBeenCalled();
    });

    it('I3: quien tiene una candidatura viva en una elección abierta no propone ocultar una ficha', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
      prisma.candidatura.findUnique.mockResolvedValue(ficha());
      prisma.candidatura.count.mockResolvedValue(1);
      await expect(proponer()).rejects.toThrow(ForbiddenException);
      expect(prisma.candidatura.count).toHaveBeenCalledWith({
        where: { profileId: 'p-sec', retiradaAt: null, eleccion: { fase: { in: ['candidaturas', 'votacion'] } } },
      });
      expect(prisma.boardAction.create).not.toHaveBeenCalled();
    });

    it('I3: quien tiene una candidatura viva no firma ocultar una ficha', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue({ ...accion, approvals: [{ profileId: 'p-sec', approve: true }] });
      prisma.candidatura.count.mockResolvedValue(1);
      await expect(service.voteAction(ADMIN, 'a1', true, 'ip')).rejects.toThrow(ForbiddenException);
      expect(prisma.candidatura.count).toHaveBeenCalledWith({
        where: { profileId: 'p-admin', retiradaAt: null, eleccion: { fase: { in: ['candidaturas', 'votacion'] } } },
      });
      expect(prisma.boardApproval.create).not.toHaveBeenCalled();
      expect(prisma.candidatura.updateMany).not.toHaveBeenCalled();
    });

    it('I3: la candidatura propia no impide firmar otras acciones de la mesa', async () => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue({
        id: 'a2', type: 'suspend_user', targetUserId: 'u-t', params: {}, status: 'pending',
        approvals: [{ profileId: 'p-sec', approve: true }],
      });
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
      prisma.candidatura.count.mockResolvedValue(1);
      votos(true, true);
      await service.voteAction(ADMIN, 'a2', true, 'ip');
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('suspend_user: cargos y asientos (3C-2)', () => {
    const HASTA = new Date('2027-06-01T00:00:00Z');
    const accion = { id: 'a1', type: 'suspend_user', targetUserId: 'u-t', params: { x: 1 }, status: 'pending', approvals: [{ profileId: 'p-sec', approve: true }] };
    beforeEach(() => {
      prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
      prisma.boardAction.findUnique.mockResolvedValue(accion);
      prisma.boardApproval.create.mockResolvedValue({});
      prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
      prisma.boardAction.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({ status: 'verified_citizen' });
      prisma.user.update.mockResolvedValue({});
      votos(true, true);
    });

    it('suspender termina los cargos, borra los asientos y guarda el estado previo', async () => {
      prisma.cargo.findMany.mockResolvedValue([{ id: 'c1', tipo: 'secretario', groupId: 'g-general', hasta: HASTA }]);
      prisma.boardSeat.findMany.mockResolvedValue([{ role: 'secretario' }]);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.cargo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { profile: { userId: 'u-t' }, terminadoAt: null } }),
      );
      expect(prisma.cargo.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] }, terminadoAt: null },
        data: { terminadoAt: expect.any(Date), finCausa: 'suspension', enFunciones: false },
      });
      expect(prisma.boardSeat.deleteMany).toHaveBeenCalledWith({ where: { profile: { userId: 'u-t' } } });
      expect(prisma.boardAction.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { params: { x: 1, estadoPrevio: 'verified_citizen' } },
      });
      // El estado previo se lee antes de suspender.
      expect(prisma.user.findUnique.mock.invocationCallOrder[0]!).toBeLessThan(prisma.user.update.mock.invocationCallOrder[0]!);
      expect(resuelta()).toMatchObject({ data: { status: 'executed' } });
    });

    it('suspender a alguien de la mesa abre la anticipada con el mandato del cargo, tras confirmar', async () => {
      const alSuspender = vi.fn().mockResolvedValue('e-1');
      service.registrarAlSuspender(alSuspender);
      prisma.cargo.findMany.mockResolvedValue([{ id: 'c1', tipo: 'secretario', groupId: 'g-general', hasta: HASTA }]);
      prisma.boardSeat.findMany.mockResolvedValue([{ role: 'secretario' }]);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(alSuspender).toHaveBeenCalledTimes(1);
      expect(alSuspender).toHaveBeenCalledWith({ groupId: 'g-general', cargo: 'secretario', mandatoHasta: HASTA });
      expect(alSuspender.mock.invocationCallOrder[0]!).toBeGreaterThan(prisma.boardAction.updateMany.mock.invocationCallOrder[0]!);
    });

    it('suspender cierra los pedidos de revocación abiertos de sus cargos, dentro de la transacción', async () => {
      const alSuspender = vi.fn().mockResolvedValue('e-1');
      service.registrarAlSuspender(alSuspender);
      prisma.cargo.findMany.mockResolvedValue([{ id: 'c1', tipo: 'secretario', groupId: 'g-general', hasta: HASTA }]);
      prisma.boardSeat.findMany.mockResolvedValue([{ role: 'secretario' }]);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.revocacion.updateMany).toHaveBeenCalledWith({
        where: { cargoId: { in: ['c1'] }, estado: 'abierta' },
        data: { estado: 'vencida' },
      });
      expect(prisma.revocacion.updateMany.mock.invocationCallOrder[0]!).toBeLessThan(alSuspender.mock.invocationCallOrder[0]!);
    });

    it('suspender a un fundador antes de la primera jornada no abre anticipada: la primera jornada cubre el puesto', async () => {
      const alSuspender = vi.fn().mockResolvedValue('e-1');
      service.registrarAlSuspender(alSuspender);
      prisma.cargo.findMany.mockResolvedValue([]);
      prisma.boardSeat.findMany.mockResolvedValue([{ role: 'coordinador_general' }]);
      prisma.eleccion.count.mockResolvedValue(0);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.eleccion.count).toHaveBeenCalledWith({
        where: { cargo: { in: ['administrador', 'coordinador_general', 'secretario'] } },
      });
      expect(alSuspender).not.toHaveBeenCalled();
      expect(prisma.boardSeat.deleteMany).toHaveBeenCalledWith({ where: { profile: { userId: 'u-t' } } });
      expect(resuelta()).toMatchObject({ data: { status: 'executed' } });
    });

    it('un asiento fundador sin cargo, tras alguna elección de mesa, abre la anticipada sin mandato (null) en el grupo general', async () => {
      const alSuspender = vi.fn().mockResolvedValue('e-1');
      service.registrarAlSuspender(alSuspender);
      prisma.eleccion.count.mockResolvedValue(1);
      prisma.cargo.findMany.mockResolvedValue([]);
      prisma.boardSeat.findMany.mockResolvedValue([{ role: 'coordinador_general' }]);
      prisma.group.findUnique.mockResolvedValue({ id: 'g-general' });

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(prisma.group.findUnique).toHaveBeenCalledWith({ where: { slug: 'general' }, select: { id: true } });
      expect(alSuspender).toHaveBeenCalledWith({ groupId: 'g-general', cargo: 'coordinador_general', mandatoHasta: null });
    });

    it('un cargo fuera de la mesa (coordinador) también queda vacante y abre su anticipada', async () => {
      const alSuspender = vi.fn().mockResolvedValue(null);
      service.registrarAlSuspender(alSuspender);
      prisma.cargo.findMany.mockResolvedValue([{ id: 'c2', tipo: 'coordinador', groupId: 'g-leon', hasta: HASTA }]);

      await service.voteAction(ADMIN, 'a1', true, 'ip');

      expect(alSuspender).toHaveBeenCalledWith({ groupId: 'g-leon', cargo: 'coordinador', mandatoHasta: HASTA });
    });

    it('si la anticipada falla, la suspensión ya ejecutada no se deshace', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      service.registrarAlSuspender(vi.fn().mockRejectedValue(new Error('boom')));
      prisma.cargo.findMany.mockResolvedValue([{ id: 'c1', tipo: 'secretario', groupId: 'g-general', hasta: HASTA }]);

      await expect(service.voteAction(ADMIN, 'a1', true, 'ip')).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'board.action_executed' }));
      warn.mockRestore();
    });

    it('sin cargos ni asientos no se llama a la anticipada', async () => {
      const alSuspender = vi.fn();
      service.registrarAlSuspender(alSuspender);
      await service.voteAction(ADMIN, 'a1', true, 'ip');
      expect(prisma.cargo.updateMany).not.toHaveBeenCalled();
      expect(alSuspender).not.toHaveBeenCalled();
    });
  });

  describe('mesa incompleta: suplentes provisionales (3C-2)', () => {
    const NOW = new Date('2026-11-08T12:00:00Z');
    const miembro = (profileId: string, status = 'verified_citizen') => ({ profileId, profile: { user: { status } } });
    const obs = (id: string, profileId: string, eleccionId: string, desde: string, status = 'verified_citizen') => ({
      id, profileId, eleccionId, desde: new Date(desde), profile: { user: { status } },
    });

    it('con 2 en la mesa no hay suplentes', async () => {
      prisma.boardSeat.findMany.mockResolvedValue([miembro('p-a'), miembro('p-b')]);
      await expect(service.suplentesProvisionales(NOW)).resolves.toEqual([]);
      expect(prisma.cargo.findMany).not.toHaveBeenCalled();
      await expect(service.firmantesDisponibles(NOW)).resolves.toBe(2);
    });

    it('con 1 en la mesa firman los 2 observadores mejor colocados', async () => {
      prisma.boardSeat.findMany.mockResolvedValue([miembro('p-a'), miembro('p-b', 'suspended')]);
      prisma.cargo.findMany.mockResolvedValue([
        obs('c1', 'o1', 'e1', '2026-01-01T00:00:00Z'),
        obs('c2', 'o2', 'e1', '2026-01-01T00:00:00Z'),
        obs('c3', 'o3', 'e2', '2025-06-01T00:00:00Z'),
      ]);
      prisma.candidatura.findMany.mockResolvedValue([
        { id: 'k1', eleccionId: 'e1', profileId: 'o1' },
        { id: 'k2', eleccionId: 'e1', profileId: 'o2' },
        { id: 'k3', eleccionId: 'e2', profileId: 'o3' },
      ]);
      prisma.eleccion.findMany.mockResolvedValue([
        { id: 'e1', ordenFinal: ['k2', 'kx', 'k1'] },
        { id: 'e2', ordenFinal: ['k3'] },
      ]);

      // o2 y o3 empatan en la posición 0: va antes quien tiene el cargo desde antes.
      await expect(service.suplentesProvisionales(NOW)).resolves.toEqual(['o3', 'o2']);
      expect(prisma.cargo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tipo: 'observador', terminadoAt: null, profile: { user: { status: 'verified_citizen' } } }),
        }),
      );
      await expect(service.firmantesDisponibles(NOW)).resolves.toBe(3);
      prisma.boardSeat.findFirst.mockResolvedValue(null);
      await expect(service.puedeFirmarRevision('o2', NOW)).resolves.toBe(true);
      await expect(service.puedeFirmarRevision('o1', NOW)).resolves.toBe(false);
    });

    it('un observador sin candidatura en el orden final va al final; desempate por id', async () => {
      prisma.boardSeat.findMany.mockResolvedValue([]);
      prisma.cargo.findMany.mockResolvedValue([
        obs('c9', 'o9', 'e1', '2026-01-01T00:00:00Z'),
        obs('c8', 'o8', 'e1', '2026-01-01T00:00:00Z'),
        obs('c1', 'o1', 'e1', '2026-01-01T00:00:00Z'),
      ]);
      prisma.candidatura.findMany.mockResolvedValue([{ id: 'k1', eleccionId: 'e1', profileId: 'o1' }]);
      prisma.eleccion.findMany.mockResolvedValue([{ id: 'e1', ordenFinal: ['k1'] }]);
      await expect(service.suplentesProvisionales(NOW)).resolves.toEqual(['o1', 'o8']);
    });

    it('un observador suspendido nunca es suplente', async () => {
      prisma.boardSeat.findMany.mockResolvedValue([miembro('p-a')]);
      prisma.cargo.findMany.mockResolvedValue([
        obs('c1', 'o1', 'e1', '2026-01-01T00:00:00Z', 'suspended'),
        obs('c2', 'o2', 'e1', '2026-01-01T00:00:00Z'),
      ]);
      prisma.candidatura.findMany.mockResolvedValue([
        { id: 'k1', eleccionId: 'e1', profileId: 'o1' },
        { id: 'k2', eleccionId: 'e1', profileId: 'o2' },
      ]);
      prisma.eleccion.findMany.mockResolvedValue([{ id: 'e1', ordenFinal: ['k1', 'k2'] }]);
      await expect(service.suplentesProvisionales(NOW)).resolves.toEqual(['o2']);
      prisma.boardSeat.findFirst.mockResolvedValue(null);
      await expect(service.puedeFirmarRevision('o1', NOW)).resolves.toBe(false);
    });

    it('un observador que ocupa un asiento de la mesa no cuenta como suplente', async () => {
      prisma.boardSeat.findMany.mockResolvedValue([miembro('o1')]);
      prisma.cargo.findMany.mockResolvedValue([obs('c1', 'o1', 'e1', '2026-01-01T00:00:00Z')]);
      prisma.candidatura.findMany.mockResolvedValue([{ id: 'k1', eleccionId: 'e1', profileId: 'o1' }]);
      prisma.eleccion.findMany.mockResolvedValue([{ id: 'e1', ordenFinal: ['k1'] }]);
      await expect(service.suplentesProvisionales(NOW)).resolves.toEqual([]);
    });

    it('un suplente firma una revisión de texto pero no una acción de la mesa', async () => {
      prisma.boardSeat.findMany.mockResolvedValue([miembro('p-a')]);
      prisma.cargo.findMany.mockResolvedValue([obs('c1', 'o1', 'e1', '2026-01-01T00:00:00Z')]);
      prisma.candidatura.findMany.mockResolvedValue([{ id: 'k1', eleccionId: 'e1', profileId: 'o1' }]);
      prisma.eleccion.findMany.mockResolvedValue([{ id: 'e1', ordenFinal: ['k1'] }]);
      prisma.boardSeat.findFirst.mockResolvedValue(null); // sin asiento propio
      await expect(service.puedeFirmarRevision('o1', NOW)).resolves.toBe(true);
      const SUPLENTE = { sub: 'u-o1', email: 'o@x', status: 'verified_citizen', profileId: 'o1' } as never;
      await expect(
        service.proposeAction(SUPLENTE, { type: 'suspend_user' as never, targetUserId: 'u-t', reason: 'spam', params: {} }, 'ip'),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.voteAction(SUPLENTE, 'a1', true, 'ip')).rejects.toThrow(ForbiddenException);
    });
  });
  describe('reactivación (3C-2)', () => {
    const pendiente = { id: 's1', userId: 'u-t', estado: 'pendiente' };

    describe('proposeAction()', () => {
      beforeEach(() => {
        prisma.boardSeat.findFirst.mockResolvedValue(asiento('secretario'));
        prisma.user.findUnique.mockResolvedValue({ id: 'u-t', status: 'suspended' });
        prisma.solicitudReactivacion.findUnique.mockResolvedValue(pendiente);
        prisma.boardAction.create.mockResolvedValue({ id: 'a9' });
      });
      const proponer = (type: string, params: Record<string, unknown>, targetUserId = 'u-t') =>
        service.proposeAction(SECRE, { type: type as never, targetUserId, reason: 'Revisamos el caso', params }, 'ip');

      it('reactivar exige una solicitud pendiente de esa persona', async () => {
        await expect(proponer('reactivate_user', {})).rejects.toThrow(BadRequestException);
        prisma.solicitudReactivacion.findUnique.mockResolvedValue(null);
        await expect(proponer('reactivate_user', { solicitudId: 's1' })).rejects.toThrow(NotFoundException);
        prisma.solicitudReactivacion.findUnique.mockResolvedValue({ ...pendiente, estado: 'rechazada' });
        await expect(proponer('rechazar_reactivacion', { solicitudId: 's1' })).rejects.toThrow(BadRequestException);
        prisma.solicitudReactivacion.findUnique.mockResolvedValue({ ...pendiente, userId: 'u-otra' });
        await expect(proponer('reactivate_user', { solicitudId: 's1' })).rejects.toThrow(BadRequestException);
        expect(prisma.boardAction.create).not.toHaveBeenCalled();
      });

      it('reactivar exige que la cuenta siga suspendida', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'u-t', status: 'verified_citizen' });
        await expect(proponer('reactivate_user', { solicitudId: 's1' })).rejects.toThrow(BadRequestException);
      });

      it('con una solicitud válida crea la acción solo con el solicitudId', async () => {
        await proponer('rechazar_reactivacion', { solicitudId: 's1', otro: 'x' });
        expect(prisma.boardAction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ type: 'rechazar_reactivacion', targetUserId: 'u-t', params: { solicitudId: 's1' }, reason: 'Revisamos el caso' }),
          }),
        );
      });
    });

    describe('execute (con 2 firmas)', () => {
      const accion = (type: string) => ({
        id: 'a9', type, targetUserId: 'u-t', params: { solicitudId: 's1' }, reason: 'Todavía no vemos un cambio.',
        status: 'pending', approvals: [{ profileId: 'p-sec', approve: true }],
      });
      beforeEach(() => {
        prisma.boardSeat.findFirst.mockResolvedValue(asiento('administrador'));
        prisma.boardApproval.create.mockResolvedValue({});
        prisma.boardAction.updateMany.mockResolvedValue({ count: 1 });
        prisma.user.findUnique.mockResolvedValue({ status: 'suspended' });
        prisma.solicitudReactivacion.findFirst.mockResolvedValue(pendiente);
        prisma.profile.findUnique.mockResolvedValue({ birthDepartment: 'Leon', currentCountry: 'CR', currentRegion: null });
        votos(true, true);
      });

      it('reactivar devuelve el estado previo y resincroniza las comunidades, sin cargos', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('reactivate_user'));
        prisma.boardAction.findFirst.mockResolvedValue({ params: { estadoPrevio: 'verified_citizen' } });

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.boardAction.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { type: 'suspend_user', targetUserId: 'u-t', status: 'executed' } }),
        );
        expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u-t', status: 'suspended' }, data: { status: 'verified_citizen' } });
        expect(prisma.solicitudReactivacion.updateMany).toHaveBeenCalledWith({
          where: { id: 's1', userId: 'u-t', estado: 'pendiente' },
          data: { estado: 'aprobada', resueltaAt: expect.any(Date) },
        });
        expect(groups.syncMemberships).toHaveBeenCalledWith('u-t', 'Leon', 'CR', null);
        // Tras confirmar la acción, no dentro de la transacción.
        expect(groups.syncMemberships.mock.invocationCallOrder[0]!).toBeGreaterThan(prisma.boardAction.updateMany.mock.invocationCallOrder[0]!);
        // No recupera cargos ni asientos.
        expect(prisma.boardSeat.create).not.toHaveBeenCalled();
        expect(prisma.cargo.updateMany).not.toHaveBeenCalled();
        expect(resuelta()).toMatchObject({ data: { status: 'executed' } });
        expect(audit.log).toHaveBeenCalledWith({ action: 'reactivacion.aprobada', resource: 'user:u-t', metadata: { solicitudId: 's1' } });
      });

      it('sin estado previo, reactiva a pending_verification', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('reactivate_user'));
        prisma.boardAction.findFirst.mockResolvedValue({ params: {} });

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u-t', status: 'suspended' }, data: { status: 'pending_verification' } });
        expect(groups.syncMemberships).not.toHaveBeenCalled();
      });

      it('un estado previo raro (p. ej. suspended) también vuelve a pending_verification', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('reactivate_user'));
        prisma.boardAction.findFirst.mockResolvedValue({ params: { estadoPrevio: 'suspended' } });

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u-t', status: 'suspended' }, data: { status: 'pending_verification' } });
      });

      it('un estado previo rejected se devuelve tal cual (no pasa a pending_verification) y no resincroniza', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('reactivate_user'));
        prisma.boardAction.findFirst.mockResolvedValue({ params: { estadoPrevio: 'rejected' } });

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u-t', status: 'suspended' }, data: { status: 'rejected' } });
        expect(groups.syncMemberships).not.toHaveBeenCalled();
      });

      it('un estado previo que no es un AccountStatus vuelve a pending_verification', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('reactivate_user'));
        prisma.boardAction.findFirst.mockResolvedValue({ params: { estadoPrevio: 'inventado' } });

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u-t', status: 'suspended' }, data: { status: 'pending_verification' } });
      });

      it('si la cuenta ya no está suspendida, la acción queda rechazada sin tocar la solicitud', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('reactivate_user'));
        prisma.user.updateMany.mockResolvedValue({ count: 0 });

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.solicitudReactivacion.updateMany).not.toHaveBeenCalled();
        expect(groups.syncMemberships).not.toHaveBeenCalled();
        expect(resuelta()).toMatchObject({ data: { status: 'rejected' } });
      });

      it('si la solicitud ya no está pendiente, no reactiva', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('reactivate_user'));
        prisma.solicitudReactivacion.findFirst.mockResolvedValue(null);

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.user.updateMany).not.toHaveBeenCalled();
        expect(resuelta()).toMatchObject({ data: { status: 'rejected' } });
      });

      it('rechazar guarda el motivo que ve la persona', async () => {
        prisma.boardAction.findUnique.mockResolvedValue(accion('rechazar_reactivacion'));

        await service.voteAction(ADMIN, 'a9', true, 'ip');

        expect(prisma.solicitudReactivacion.updateMany).toHaveBeenCalledWith({
          where: { id: 's1', userId: 'u-t', estado: 'pendiente' },
          data: { estado: 'rechazada', motivoRechazo: 'Todavía no vemos un cambio.', resueltaAt: expect.any(Date) },
        });
        expect(prisma.user.updateMany).not.toHaveBeenCalled();
        expect(resuelta()).toMatchObject({ data: { status: 'executed' } });
        expect(audit.log).toHaveBeenCalledWith({ action: 'reactivacion.rechazada', resource: 'user:u-t', metadata: { solicitudId: 's1' } });
      });
    });

    describe('listarReactivaciones()', () => {
      it('devuelve las pendientes con el nombre visible y el motivo, nunca el correo', async () => {
        const createdAt = new Date('2026-11-12T00:00:00Z');
        prisma.solicitudReactivacion.findMany.mockResolvedValue([{ id: 's1', userId: 'u-t', texto: 'Pido revisión', createdAt }]);
        prisma.profile.findMany.mockResolvedValue([{ userId: 'u-t', displayName: 'Ana' }]);
        prisma.boardAction.findMany.mockResolvedValue([{ targetUserId: 'u-t', reason: 'Spam repetido' }]);

        const r = await service.listarReactivaciones();

        expect(prisma.solicitudReactivacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { estado: 'pendiente' } }));
        expect(r).toEqual([
          { id: 's1', userId: 'u-t', nombre: 'Ana', motivoSuspension: 'Spam repetido', texto: 'Pido revisión', createdAt: createdAt.toISOString() },
        ]);
        expect(JSON.stringify(r)).not.toContain('@');
      });
    });
  });
});
