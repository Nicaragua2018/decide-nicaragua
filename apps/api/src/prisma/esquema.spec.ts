import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRISMA = join(__dirname, '..', '..', 'prisma');

/** El último SQL de las migraciones que define la clave foránea indicada. */
function ultimaDefinicion(constraint: string): string | undefined {
  const carpetas = readdirSync(join(PRISMA, 'migrations'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  let ultima: string | undefined;
  for (const c of carpetas) {
    const sql = readFileSync(join(PRISMA, 'migrations', c, 'migration.sql'), 'utf8');
    for (const linea of sql.split('\n')) {
      if (linea.includes(`ADD CONSTRAINT "${constraint}"`)) ultima = linea;
    }
  }
  return ultima;
}

describe('esquema', () => {
  it('borrar un perfil con moderaciones sigue bloqueado (Restrict, como en 3A)', () => {
    const esquema = readFileSync(join(PRISMA, 'schema.prisma'), 'utf8');
    const linea = esquema.split('\n').find((l) => l.includes('@relation("Moderator", fields: [moderatorProfileId]'));
    expect(linea).toContain('onDelete: Restrict');
    expect(ultimaDefinicion('moderation_actions_moderatorProfileId_fkey')).toContain('ON DELETE RESTRICT');
  });
});
