/**
 * Seed script — crea el primer ciudadano verificado (admin inicial).
 *
 * Uso:
 *   ADMIN_SEED_EMAIL=admin@example.com ADMIN_SEED_PASSWORD=... pnpm db:seed
 *
 * Este usuario podrá invitar a otros a través del endpoint POST /api/auth/invite.
 * Cambiar la contraseña después del primer login.
 *
 * Idempotente: si el usuario ya existe, no hace nada.
 */

import { PrismaClient, GroupType } from '@prisma/client';
import bcrypt from 'bcrypt';

const NICARAGUA_DEPARTMENTS = [
  'Boaco',
  'Carazo',
  'Chinandega',
  'Chontales',
  'Estelí',
  'Granada',
  'Jinotega',
  'León',
  'Madriz',
  'Managua',
  'Masaya',
  'Matagalpa',
  'Nueva Segovia',
  'RACCN',
  'RACCS',
  'Río San Juan',
  'Rivas',
] as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env['ADMIN_SEED_EMAIL'];
  const adminPassword = process.env['ADMIN_SEED_PASSWORD'];

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD environment variables before running the seed.',
    );
  }

  if (adminPassword.length < 12) {
    throw new Error('ADMIN_SEED_PASSWORD must be at least 12 characters.');
  }

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    console.log(`Admin user ${adminEmail} already exists. Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const user = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      // Valor directo del string para evitar dependencia de tipos de @prisma/client en seed
      status: 'verified_citizen',
      profile: {
        create: {
          displayName: 'Administrador',
          isPublic: false,
        },
      },
    },
  });

  console.log('');
  console.log('Admin user created successfully:');
  console.log(`  Email: ${user.email}`);
  console.log(`  ID:    ${user.id}`);
  console.log(`  Status: ${user.status}`);
  console.log('');
  console.log('IMPORTANT: Change the password after your first login.');
  console.log('');

  // Seed Nicaragua department groups (territorial_origin)
  let seeded = 0;
  let skipped = 0;
  for (const dept of NICARAGUA_DEPARTMENTS) {
    const slug = slugify(dept);
    const existing = await prisma.group.findUnique({ where: { slug } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.group.create({
      data: {
        name: dept,
        slug,
        type: GroupType.territorial_origin,
        description: `Ciudadanos originarios del departamento de ${dept}`,
        isActive: true,
      },
    });
    seeded++;
  }

  console.log(`Department groups: ${seeded} created, ${skipped} already existed.`);
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
