/* Seed idempotent : source DGCMEF + super administrateur (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD). */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';
import { loadRootEnv } from '../src/config/env';

export const DGCMEF_SOURCE = {
  code: 'dgcmef',
  name: 'DGCMEF — Quotidien des marchés publics',
  baseUrl: 'https://www.dgcmef.gov.bf/index.php/fr/appels-d-offre',
  type: 'HTML_PDF',
  accessMethod:
    'Pages publiques + PDF ; robots.txt respecté ; 1 passage/jour ; délai ≥ 5 s',
};

export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.source.upsert({
    where: { code: DGCMEF_SOURCE.code },
    create: DGCMEF_SOURCE,
    update: {
      name: DGCMEF_SOURCE.name,
      baseUrl: DGCMEF_SOURCE.baseUrl,
      type: DGCMEF_SOURCE.type,
      accessMethod: DGCMEF_SOURCE.accessMethod,
    },
  });

  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD absents : super admin non créé.');
    return;
  }
  if (password.length < 12) {
    throw new Error('SUPER_ADMIN_PASSWORD doit contenir au moins 12 caractères');
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        globalRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        passwordHash: existing.passwordHash ?? (await hashPassword(password)),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email,
        fullName: 'Administrateur SRC Digital',
        passwordHash: await hashPassword(password),
        globalRole: 'SUPER_ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    console.log('Seed terminé : source dgcmef et super administrateur à jour.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
