import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ModeracionPreviaService, ESQUEMA_REVISION, esRevision, TAREA_REVISION } from './moderacion-previa.service';
import { AsistenteController } from './asistente.controller';
import { RevisarTextoDto } from './dto/revisar-texto.dto';

const TEXTO = 'Los del barrio de arriba son unos parásitos, hay que sacarlos';

function buildRedis() {
  const mem = new Map<string, string>();
  return {
    mem,
    get: vi.fn(async (k: string) => mem.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, _ttl: number) => {
      mem.set(k, v);
      return 'OK' as const;
    }),
  };
}

describe('ModeracionPreviaService', () => {
  let asistente: { pedir: ReturnType<typeof vi.fn> };
  let redis: ReturnType<typeof buildRedis>;
  let service: ModeracionPreviaService;

  beforeEach(() => {
    asistente = {
      pedir: vi.fn().mockResolvedValue({ nivel: 2, causa: 'odio', explicacion: 'Ataca a un grupo.', sugerencia: 'Otra forma.' }),
    };
    redis = buildRedis();
    service = new ModeracionPreviaService(asistente as never, redis as never);
  });

  it('revisar: llama a pedir con el modelo rápido, prioridad interactiva y 5 s', async () => {
    const r = await service.revisar(TEXTO, 'frase');
    expect(r).toEqual({ nivel: 2, causa: 'odio', explicacion: 'Ataca a un grupo.', sugerencia: 'Otra forma.', revisado: true });
    const op = asistente.pedir.mock.calls[0]![0];
    expect(op).toMatchObject({ modelo: 'rapido', prioridad: 'interactiva', timeoutMs: 5000, material: TEXTO });
    expect(op.herramienta.esquema).toBe(ESQUEMA_REVISION);
    expect(op.validar).toBe(esRevision);
    // Las instrucciones son fijas: nunca llevan el texto del miembro.
    expect(op.tarea).not.toContain('parásitos');
  });

  it('revisar: usa la caché y no guarda el texto', async () => {
    await service.revisar(TEXTO, 'frase');
    const segunda = await service.revisar(TEXTO, 'frase');
    expect(asistente.pedir).toHaveBeenCalledTimes(1);
    expect(segunda).toMatchObject({ nivel: 2, causa: 'odio', revisado: true });

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [clave, valor, ttl] = redis.set.mock.calls[0]!;
    const hash = createHash('sha256').update(`frase\n${TEXTO}`).digest('hex');
    expect(clave).toBe(`asistente:rev:${hash}`);
    expect(ttl).toBe(600);
    expect(clave).not.toContain('parásitos');
    expect(valor).not.toContain('parásitos');
    expect(valor).not.toContain(TEXTO);
  });

  it('revisar: el mismo texto con otro tipo no usa la misma caché', async () => {
    await service.revisar(TEXTO, 'frase');
    await service.revisar(TEXTO, 'comentario');
    expect(asistente.pedir).toHaveBeenCalledTimes(2);
  });

  it('revisar: nivel 2 con causa fuera de la lista baja a nivel 1', async () => {
    asistente.pedir.mockResolvedValue({ nivel: 2, causa: 'spam', explicacion: 'Parece publicidad.', sugerencia: 'Quita el enlace.' });
    const r = await service.revisar('Compra en mi tienda', 'comentario');
    expect(r.nivel).toBe(1);
    expect(r.revisado).toBe(true);
    asistente.pedir.mockResolvedValue({ nivel: 2 });
    expect((await service.revisar('Otro texto', 'comentario')).nivel).toBe(1);
  });

  it('revisar: nivel 0 no lleva causa, explicación ni sugerencia', async () => {
    asistente.pedir.mockResolvedValue({ nivel: 0, causa: 'spam', explicacion: 'x', sugerencia: 'y' });
    expect(await service.revisar('El gobierno de turno falló con el agua, y lo digo con datos.', 'tema')).toEqual({
      nivel: 0,
      revisado: true,
    });
  });

  it('revisar: si el asistente no responde devuelve nivel 0 sin revisar', async () => {
    asistente.pedir.mockResolvedValue(null);
    expect(await service.revisar(TEXTO, 'frase')).toEqual({ nivel: 0, revisado: false });
    expect(redis.set).not.toHaveBeenCalled();
    // Y no queda en caché: la siguiente vez vuelve a preguntar.
    await service.revisar(TEXTO, 'frase');
    expect(asistente.pedir).toHaveBeenCalledTimes(2);
  });

  it('revisar: si Redis falla, igual revisa', async () => {
    redis.get.mockRejectedValue(new Error('redis'));
    redis.set.mockRejectedValue(new Error('redis'));
    expect(await service.revisar(TEXTO, 'frase')).toMatchObject({ nivel: 2, revisado: true });
  });

  it('revisar: una caché corrupta se ignora', async () => {
    redis.get.mockResolvedValue('{"nivel":7}');
    expect(await service.revisar(TEXTO, 'frase')).toMatchObject({ nivel: 2, revisado: true });
    expect(asistente.pedir).toHaveBeenCalledTimes(1);
  });

  it('esRevision: valida la forma de la salida', () => {
    expect(esRevision({ nivel: 0 })).toBe(true);
    expect(esRevision({ nivel: 1, causa: 'insultos_amenazas', explicacion: 'a', sugerencia: 'b' })).toBe(true);
    expect(esRevision({ nivel: 3 })).toBe(false);
    expect(esRevision({ nivel: '2' })).toBe(false);
    expect(esRevision({ nivel: 2, causa: 'inventada' })).toBe(false);
    expect(esRevision({ nivel: 1, explicacion: 5 })).toBe(false);
    expect(esRevision(null)).toBe(false);
  });

  it('la tarea explica los tres niveles y las causas del nivel 2', () => {
    for (const s of ['odio', 'insultos_amenazas', 'datos_personales', 'ilegal_violencia', 'crítica política', 'insulto suelto']) {
      expect(TAREA_REVISION).toContain(s);
    }
  });
});

describe('POST /asistente/revisar', () => {
  it('exige perfil y devuelve la revisión', async () => {
    const moderacion = { revisar: vi.fn().mockResolvedValue({ nivel: 1, revisado: true }) };
    const ctrl = new AsistenteController({} as never, moderacion as never);
    await expect(ctrl.revisar({ tipo: 'frase', texto: 'hola mundo' }, { sub: 'u1' } as never)).rejects.toThrow('Perfil requerido');
    expect(await ctrl.revisar({ tipo: 'frase', texto: 'hola mundo' }, { sub: 'u1', profileId: 'p1' } as never)).toEqual({
      nivel: 1,
      revisado: true,
    });
    expect(moderacion.revisar).toHaveBeenCalledWith('hola mundo', 'frase');
  });

  it('tiene el límite de 20 por minuto', () => {
    const limite = Reflect.getMetadata('THROTTLER:LIMITdefault', AsistenteController.prototype.revisar);
    expect(limite).toBe(20);
  });

  it('el DTO valida el tipo y el largo del texto', async () => {
    expect(await validate(plainToInstance(RevisarTextoDto, { tipo: 'frase', texto: 'Un texto' }))).toHaveLength(0);
    expect(await validate(plainToInstance(RevisarTextoDto, { tipo: 'otro', texto: 'Un texto' }))).toHaveLength(1);
    expect(await validate(plainToInstance(RevisarTextoDto, { tipo: 'frase', texto: '' }))).toHaveLength(1);
    expect(await validate(plainToInstance(RevisarTextoDto, { tipo: 'frase', texto: 'x'.repeat(10_001) }))).toHaveLength(1);
  });
});
