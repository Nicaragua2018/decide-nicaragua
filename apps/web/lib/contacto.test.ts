import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORREO_CONTACTO } from '../app/portada/contacto';

// La web usa un solo correo de contacto: el buzón del dominio.
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

describe('correo de contacto', () => {
  it('es el buzón del dominio', () => {
    expect(CORREO_CONTACTO).toBe('admin@nicaraguadecide.org');
  });

  it('el Gmail antiguo ya no aparece en la web', () => {
    const conGmail = ['app', 'components']
      .flatMap((d) => archivos(join(__dirname, '..', d)))
      .filter((p) => readFileSync(p, 'utf8').includes('decidenicaragua@gmail.com'));
    expect(conGmail).toEqual([]);
  });
});
