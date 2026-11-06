import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { JwtPayload } from '@decide/shared';
import { DecisionesController } from './decisiones.controller';

describe('DecisionesController — resumen', () => {
  const user = (profileId: string | null) => ({ sub: 'u1', profileId }) as unknown as JwtPayload;

  it('GET resumen devuelve las comunidades de quien consulta', async () => {
    const service = { getResumen: vi.fn().mockResolvedValue({ comunidades: [] }) };
    const ctrl = new DecisionesController(service as never);
    await expect(ctrl.getResumen(user('p1'))).resolves.toEqual({ comunidades: [] });
    expect(service.getResumen).toHaveBeenCalledWith('p1');
    const handler = DecisionesController.prototype.getResumen;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('resumen');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('exige perfil', async () => {
    const service = { getResumen: vi.fn() };
    const ctrl = new DecisionesController(service as never);
    await expect(ctrl.getResumen(user(null))).rejects.toThrow(ForbiddenException);
    expect(service.getResumen).not.toHaveBeenCalled();
  });
});
