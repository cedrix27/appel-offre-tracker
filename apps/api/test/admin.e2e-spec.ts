import {
  createSuperAdmin,
  createTestApp,
  registerCompany,
  seedSource,
  Session,
  TestContext,
  truncateAll,
} from './utils';

const ZERO_ID = '00000000-0000-4000-8000-000000000000';

describe('Administration', () => {
  let ctx: TestContext;
  let superAdmin: Session;
  let co: Session & { companyId: string };
  let sourceId: string;

  const as = (s: Session) => ({
    get: (p: string) => ctx.http().get(p).set('Cookie', s.cookie),
    post: (p: string) => ctx.http().post(p).set('Cookie', s.cookie),
    patch: (p: string) => ctx.http().patch(p).set('Cookie', s.cookie),
  });

  /** Attend la fin d'un pipeline lancé en arrière-plan. */
  const waitPipeline = async (id: string) => {
    for (let i = 0; i < 100; i += 1) {
      const run = await ctx.prisma.pipelineRun.findUniqueOrThrow({
        where: { id },
      });
      if (run.status !== 'RUNNING') return run;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Pipeline toujours en cours après 20 s');
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    sourceId = (await seedSource(ctx.prisma)).id;
    superAdmin = await createSuperAdmin(ctx);
    co = await registerCompany(ctx, 'admin@epsilon.bf', 'Epsilon SARL');
  });
  afterAll(() => ctx.app.close());

  it('toutes les routes /admin : 401 sans session, 403 pour un administrateur d’entreprise', async () => {
    const routes: ['get' | 'post' | 'patch', string][] = [
      ['get', '/admin/stats'],
      ['get', '/admin/companies'],
      ['patch', `/admin/companies/${co.companyId}`],
      ['get', '/admin/users'],
      ['patch', `/admin/users/${co.userId}`],
      ['get', '/admin/sources'],
      ['post', '/admin/sources'],
      ['patch', `/admin/sources/${sourceId}`],
      ['post', `/admin/sources/${sourceId}/run`],
      ['get', '/admin/source-runs'],
      ['get', '/admin/tenders'],
      ['get', '/admin/notifications'],
      ['post', '/admin/pipeline/run'],
      ['get', '/admin/pipeline-runs'],
    ];
    for (const [method, path] of routes) {
      const anon = await ctx.http()[method](path).send({ status: 'SUSPENDED' });
      expect([path, anon.status]).toEqual([path, 401]);
      const res = await as(co)[method](path).send({ status: 'SUSPENDED' });
      expect([path, res.status]).toEqual([path, 403]);
    }
    // Rien n'a été modifié par les tentatives refusées.
    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: co.companyId },
    });
    expect(company.status).toBe('ACTIVE');
    expect(await ctx.prisma.collectorJob.count()).toBe(0);
  });

  it('statistiques, entreprises et utilisateurs (sans mot de passe)', async () => {
    const stats = await as(superAdmin).get('/admin/stats').expect(200);
    expect(stats.body).toMatchObject({ companies: 1, users: 2, tenders: 0 });
    const companies = await as(superAdmin).get('/admin/companies').expect(200);
    expect(companies.body).toEqual([
      expect.objectContaining({
        id: co.companyId,
        membersCount: 1,
        status: 'ACTIVE',
      }),
    ]);
    const users = await as(superAdmin).get('/admin/users').expect(200);
    expect(JSON.stringify(users.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('suspension d’une entreprise : accès coupé (403), journal d’audit, réactivation', async () => {
    await as(superAdmin)
      .patch(`/admin/companies/${co.companyId}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    const denied = await as(co).get('/tenders').expect(403);
    expect(denied.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    const refresh = await ctx.prisma.authToken.count({
      where: { userId: co.userId, type: 'REFRESH', usedAt: null },
    });
    expect(refresh).toBe(0);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'company.suspend', targetId: co.companyId },
    });
    expect(audit.actorUserId).toBe(superAdmin.userId);

    await as(superAdmin)
      .patch(`/admin/companies/${co.companyId}`)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await as(co).get('/tenders').expect(200);

    await as(superAdmin)
      .patch(`/admin/companies/${ZERO_ID}`)
      .send({ status: 'ACTIVE' })
      .expect(404);
    await as(superAdmin)
      .patch(`/admin/companies/${co.companyId}`)
      .send({ status: 'SUPPRIME' })
      .expect(400);
  });

  it('un super admin ne peut pas suspendre son propre compte', async () => {
    const res = await as(superAdmin)
      .patch(`/admin/users/${superAdmin.userId}`)
      .send({ status: 'SUSPENDED' })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'CANNOT_SUSPEND_SELF' });
  });

  it('sources : création validée, code unique', async () => {
    const body = {
      code: 'test-source',
      name: 'Source de test',
      baseUrl: 'https://exemple.bf/marches',
      type: 'html',
      accessMethod: 'Page liste HTML',
      status: 'PAUSED',
    };
    await as(superAdmin)
      .post('/admin/sources')
      .send({ ...body, baseUrl: 'pas une url' })
      .expect(400);
    await as(superAdmin)
      .post('/admin/sources')
      .send({ ...body, frequencyCron: 'tous les jours' })
      .expect(400);
    await as(superAdmin).post('/admin/sources').send(body).expect(201);
    const dup = await as(superAdmin)
      .post('/admin/sources')
      .send(body)
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'SOURCE_CODE_TAKEN' });
  });

  it('relance d’une source : 202, collecte exécutée et visible dans l’historique', async () => {
    const res = await as(superAdmin)
      .post(`/admin/sources/${sourceId}/run`)
      .expect(202);
    const body = res.body as {
      jobId: string;
      runId: string;
      skipped: string | null;
    };
    expect(body.jobId).toBeTruthy();
    expect(body.skipped).toBeNull();
    const run = await waitPipeline(body.runId);
    expect(run.status).toBe('DONE');

    const runs = await as(superAdmin)
      .get(`/admin/source-runs?sourceId=${sourceId}`)
      .expect(200);
    expect(
      (runs.body as { items: { outcome: string }[] }).items[0].outcome,
    ).toBe('SUCCESS_NEW');
    const tenders = await as(superAdmin).get('/admin/tenders').expect(200);
    expect((tenders.body as { total: number }).total).toBe(3);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'source.run', targetId: sourceId },
      }),
    ).toBe(1);
    await as(superAdmin).post(`/admin/sources/${ZERO_ID}/run`).expect(404);
  });

  it('historique des collectes : filtre sur les échecs', async () => {
    process.env.COLLECTOR_FAKE_MODE = 'fail';
    try {
      const res = await as(superAdmin)
        .post('/admin/pipeline/run')
        .send({ date: '2026-12-01' })
        .expect(202);
      await waitPipeline((res.body as { pipelineRunId: string }).pipelineRunId);
    } finally {
      process.env.COLLECTOR_FAKE_MODE = 'success';
    }
    const failed = await as(superAdmin)
      .get('/admin/source-runs?outcome=FAILED')
      .expect(200);
    const items = (
      failed.body as { items: { outcome: string; errorMessage: string }[] }
    ).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.outcome === 'FAILED' && i.errorMessage)).toBe(
      true,
    );
    const pipelines = await as(superAdmin)
      .get('/admin/pipeline-runs')
      .expect(200);
    expect(
      (pipelines.body as { items: { status: string }[] }).items[0].status,
    ).toBe('FAILED');
  });
});
