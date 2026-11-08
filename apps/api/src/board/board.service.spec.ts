import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BoardService } from './board.service';

function buildPrisma() {
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    boardSeat: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    profile: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    groupMembership: { deleteMany: vi.fn() },
    boardAction: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    boardApproval: { create: vi.fn(), findMany: vi.fn() },
    cambioRegla: { findFirst: vi.fn(), updateMany: vi.fn() },
    ruleValue: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    candidatura: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
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
      expect(prisma.boardAction.update).not.toHaveBeenCalled();
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
});
