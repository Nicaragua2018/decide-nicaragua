import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { BoardGuard } from './board.guard';

function contexto(user: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const MIEMBRO = { sub: 'u-1', email: 'm@x', status: 'verified_citizen', profileId: 'p-1' };

describe('BoardGuard', () => {
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let board: { roleOf: ReturnType<typeof vi.fn> };
  let guard: BoardGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    board = { roleOf: vi.fn() };
    guard = new BoardGuard(reflector as never, board as never);
  });

  it('sin cargo: prohibido', async () => {
    board.roleOf.mockResolvedValue(null);
    await expect(guard.canActivate(contexto(MIEMBRO))).rejects.toThrow(ForbiddenException);
  });

  it('sin perfil: prohibido sin consultar cargos', async () => {
    await expect(guard.canActivate(contexto({ ...MIEMBRO, profileId: null }))).rejects.toThrow(ForbiddenException);
    expect(board.roleOf).not.toHaveBeenCalled();
  });

  it('con un cargo distinto del exigido: prohibido', async () => {
    reflector.getAllAndOverride.mockReturnValue(['administrador']);
    board.roleOf.mockResolvedValue('secretario');
    await expect(guard.canActivate(contexto(MIEMBRO))).rejects.toThrow(ForbiddenException);
  });

  it('con el cargo exigido: permitido', async () => {
    reflector.getAllAndOverride.mockReturnValue(['administrador']);
    board.roleOf.mockResolvedValue('administrador');
    await expect(guard.canActivate(contexto(MIEMBRO))).resolves.toBe(true);
  });

  it('sin cargos exigidos, cualquier cargo basta', async () => {
    board.roleOf.mockResolvedValue('coordinador_general');
    await expect(guard.canActivate(contexto(MIEMBRO))).resolves.toBe(true);
  });
});
