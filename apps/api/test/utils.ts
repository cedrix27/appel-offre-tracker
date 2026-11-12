import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';
import { DGCMEF_SOURCE } from '../prisma/seed';

export const PASSWORD = 'MotDePasse-Solide-2026';

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Vide toutes les tables (hors historique des migrations). */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export async function seedSource(prisma: PrismaClient) {
  return prisma.source.upsert({
    where: { code: DGCMEF_SOURCE.code },
    create: DGCMEF_SOURCE,
    update: {},
  });
}

/** Dernier jeton envoyé à `email` pour une catégorie d'e-mail (lu dans email_outbox). */
export async function lastEmailToken(
  prisma: PrismaClient,
  email: string,
  category: string,
): Promise<string> {
  const row = await prisma.emailOutbox.findFirst({
    where: { to: { has: email }, category },
    orderBy: { createdAt: 'desc' },
  });
  const match = row?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`Aucun jeton ${category} pour ${email}`);
  return match[1];
}

export function cookiesFrom(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: Record<string, string> = {};
  for (const c of list) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export interface Session {
  cookie: string;
  userId: string;
  email: string;
}

export async function login(
  ctx: TestContext,
  email: string,
  password = PASSWORD,
): Promise<Session> {
  const res = await ctx
    .http()
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  const body = res.body as { user: { id: string } };
  return {
    cookie: cookieHeader(cookiesFrom(res)),
    userId: body.user.id,
    email,
  };
}

/** Inscription + vérification e-mail + connexion. */
export async function registerCompany(
  ctx: TestContext,
  email: string,
  companyName: string,
): Promise<Session & { companyId: string }> {
  await ctx
    .http()
    .post('/auth/register')
    .send({
      companyName,
      fullName: `Admin ${companyName}`,
      email,
      password: PASSWORD,
    })
    .expect(201);
  const token = await lastEmailToken(ctx.prisma, email, 'VERIFY_EMAIL');
  await ctx.http().post('/auth/verify-email').send({ token }).expect(200);
  const session = await login(ctx, email);
  const member = await ctx.prisma.companyMember.findFirstOrThrow({
    where: { userId: session.userId },
  });
  return { ...session, companyId: member.companyId };
}

/** Ajoute un membre déjà actif (invitation acceptée). */
export async function inviteAndAccept(
  ctx: TestContext,
  admin: Session,
  email: string,
  role: 'COMPANY_ADMIN' | 'COMPANY_MEMBER' = 'COMPANY_MEMBER',
): Promise<Session> {
  await ctx
    .http()
    .post('/company/members')
    .set('Cookie', admin.cookie)
    .send({ email, fullName: 'Membre Invité', role })
    .expect(201);
  const token = await lastEmailToken(ctx.prisma, email, 'INVITE');
  await ctx
    .http()
    .post('/auth/accept-invite')
    .send({ token, password: PASSWORD })
    .expect(200);
  return login(ctx, email);
}

export async function createSuperAdmin(
  ctx: TestContext,
  email = 'superadmin@example.com',
): Promise<Session> {
  await ctx.prisma.user.create({
    data: {
      email,
      fullName: 'Super Admin',
      passwordHash: await hashPassword(PASSWORD),
      globalRole: 'SUPER_ADMIN',
      emailVerifiedAt: new Date(),
    },
  });
  return login(ctx, email);
}

let counter = 0;
/** Crée une annonce réaliste (champs absents = null). */
export async function createTender(
  prisma: PrismaClient,
  sourceId: string,
  data: Partial<{
    title: string;
    organization: string | null;
    description: string | null;
    reference: string | null;
    sectors: string[];
    procedureType: string | null;
    location: string | null;
    publicationDate: Date | null;
    submissionDeadline: Date | null;
    deadlineHasTime: boolean;
    estimatedBudget: bigint | null;
    status: 'NEW' | 'UPDATED' | 'CLOSED' | 'CANCELLED' | 'AWARDED';
  }> = {},
) {
  counter += 1;
  return prisma.tender.create({
    data: {
      sourceId,
      contentHash: `test-hash-${Date.now()}-${counter}-${Math.random()}`,
      title: data.title ?? `Acquisition de matériel informatique n°${counter}`,
      organization:
        data.organization === undefined
          ? 'Ministère de la Santé'
          : data.organization,
      description:
        data.description === undefined
          ? 'Acquisition d’ordinateurs portables et d’imprimantes pour les services centraux.'
          : data.description,
      reference:
        data.reference === undefined ? `DPX-${counter}/2026` : data.reference,
      sectors: data.sectors ?? ['informatique'],
      procedureType:
        data.procedureType === undefined
          ? 'Demande de prix'
          : data.procedureType,
      location: data.location === undefined ? 'Ouagadougou' : data.location,
      publicationDate:
        data.publicationDate === undefined
          ? new Date('2026-11-02T00:00:00Z')
          : data.publicationDate,
      submissionDeadline:
        data.submissionDeadline === undefined
          ? new Date(Date.now() + 10 * 24 * 3600 * 1000)
          : data.submissionDeadline,
      deadlineHasTime: data.deadlineHasTime ?? true,
      estimatedBudget:
        data.estimatedBudget === undefined ? null : data.estimatedBudget,
      status: data.status ?? 'NEW',
      sourceUrl: 'https://www.dgcmef.gov.bf/files/quotidien-4514.pdf',
      sourcePages: [32],
      rawText: 'Texte brut de l’avis.',
      extractionModel: 'rules:v1',
    },
  });
}
