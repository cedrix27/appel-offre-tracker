import { PipelineService } from '../src/pipeline/pipeline.service';
import {
  createTestApp,
  registerCompany,
  seedSource,
  Session,
  TestContext,
  truncateAll,
} from './utils';

/** Pipeline quotidien : collecte (faux collecteur) → matching → digest. */
describe('Pipeline quotidien', () => {
  let ctx: TestContext;
  let pipeline: PipelineService;
  let co: Session & { companyId: string };
  let sourceId: string;

  const digests = () =>
    ctx.prisma.emailOutbox.findMany({ where: { category: 'DAILY_DIGEST' } });

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    pipeline = ctx.app.get(PipelineService);
    sourceId = (await seedSource(ctx.prisma)).id;
    co = await registerCompany(ctx, 'admin@delta.bf', 'Delta Services');
    await ctx
      .http()
      .post('/watch-preferences')
      .set('Cookie', co.cookie)
      .send({
        sectors: ['informatique'],
        keywordsInclude: ['forages'], // mots entiers, pluriel non géré (voir rapport)
        minScore: 15,
        recipients: ['veille@delta.bf'],
      })
      .expect(201);
  });
  afterEach(() => {
    process.env.COLLECTOR_FAKE_MODE = 'success';
  });
  afterAll(() => ctx.app.close());

  it('succès : collecte, matching et un digest envoyé', async () => {
    const res = await pipeline.run({ trigger: 'CRON', date: '2026-11-20' });
    expect(res.status).toBe('DONE');
    expect(res.steps.map((s) => [s.step, s.status])).toEqual([
      ['collect', 'DONE'],
      ['matching', 'DONE'],
      ['digest', 'DONE'],
    ]);
    expect(await ctx.prisma.tender.count()).toBe(3);
    const run = await ctx.prisma.sourceRun.findFirstOrThrow({
      where: { sourceId },
    });
    expect(run).toMatchObject({ outcome: 'SUCCESS_NEW', itemsNew: 3 });

    const matches = await ctx.prisma.tenderMatch.findMany({
      where: { companyId: co.companyId },
    });
    expect(matches).toHaveLength(2); // informatique + forage ; le nettoyage ne matche pas
    expect(matches.every((m) => m.notifiedAt !== null)).toBe(true);

    const mails = await digests();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(['veille@delta.bf']);
    expect(mails[0].status).toBe('SENT');
    // Avis incomplet : champs absents affichés « Non précisé », lien vers la source officielle.
    expect(mails[0].html).toContain('Non précisé');
    expect(mails[0].html).toContain('https://www.dgcmef.gov.bf/');
    expect(mails[0].html).not.toMatch(/undefined|null|NaN/);

    const notif = await ctx
      .http()
      .get('/notifications')
      .set('Cookie', co.cookie)
      .expect(200);
    expect(notif.body).toEqual([
      expect.objectContaining({
        digestDate: '2026-11-20',
        status: 'SENT',
        tenderCount: 2,
      }),
    ]);
  });

  it('idempotence : relancer le même jour ne crée ni doublon ni second e-mail', async () => {
    const res = await pipeline.run({ trigger: 'CRON', date: '2026-11-20' });
    expect(res.steps[0]).toMatchObject({ step: 'collect', status: 'SKIPPED' });
    expect(res.steps[2]).toMatchObject({
      step: 'digest',
      alreadyProcessed: 1,
      sent: 0,
    });
    expect(await ctx.prisma.tender.count()).toBe(3);
    expect(await ctx.prisma.collectorJob.count()).toBe(1);
    expect(await ctx.prisma.notification.count()).toBe(1);
    expect(await digests()).toHaveLength(1);
  });

  it('jour suivant sans nouvelle annonce : SUCCESS_NONE, pas d’e-mail vide', async () => {
    const res = await pipeline.run({ trigger: 'CRON', date: '2026-11-21' });
    expect(res.status).toBe('DONE');
    const last = await ctx.prisma.sourceRun.findFirstOrThrow({
      where: { sourceId },
      orderBy: { startedAt: 'desc' },
    });
    expect(last.outcome).toBe('SUCCESS_NONE');
    const n = await ctx.prisma.notification.findFirstOrThrow({
      where: { digestDate: new Date('2026-11-21T00:00:00Z') },
    });
    expect(n).toMatchObject({ status: 'SKIPPED', error: null });
    expect(await digests()).toHaveLength(1);
  });

  it('échec de collecte : visible partout, jamais présenté comme « aucune annonce »', async () => {
    process.env.COLLECTOR_FAKE_MODE = 'fail';
    const res = await pipeline.run({ trigger: 'CRON', date: '2026-11-22' });
    expect(res.status).toBe('FAILED');
    expect(res.steps[0]).toMatchObject({ step: 'collect', status: 'FAILED' });
    const run = await ctx.prisma.pipelineRun.findUniqueOrThrow({
      where: { id: res.pipelineRunId },
    });
    expect(run.error).toContain('Collecte en échec');

    const n = await ctx.prisma.notification.findFirstOrThrow({
      where: { digestDate: new Date('2026-11-22T00:00:00Z') },
    });
    expect(n.status).toBe('SKIPPED');
    expect(n.error).toMatch(
      /Collecte en échec.*pas une journée sans appel d’offres/,
    );

    const dash = await ctx
      .http()
      .get('/dashboard/summary')
      .set('Cookie', co.cookie)
      .expect(200);
    expect(dash.body).toMatchObject({ collection: { lastOutcome: 'FAILED' } });

    // Le cron ne relance pas seul une collecte en échec : il faut une relance admin.
    process.env.COLLECTOR_FAKE_MODE = 'success';
    const again = await pipeline.run({ trigger: 'CRON', date: '2026-11-22' });
    expect(again.steps[0]).toMatchObject({
      status: 'SKIPPED',
      detail: expect.stringContaining('relance admin') as unknown,
    });
  });

  it('plantage du collecteur sans écriture : l’API consigne elle-même l’échec', async () => {
    process.env.COLLECTOR_FAKE_MODE = 'crash';
    const res = await pipeline.run({ trigger: 'CRON', date: '2026-11-23' });
    expect(res.status).toBe('FAILED');
    const job = await ctx.prisma.collectorJob.findUniqueOrThrow({
      where: { idempotencyKey: 'collect:dgcmef:2026-11-23' },
    });
    expect(job.status).toBe('FAILED');
    expect(job.lastError).toContain('code 3');
    const run = await ctx.prisma.sourceRun.findFirstOrThrow({
      where: { jobId: job.id },
    });
    expect(run).toMatchObject({ outcome: 'FAILED' });
    expect(run.finishedAt).not.toBeNull();
  });

  it('relance admin d’un jour en échec : nouvelle tentative :retry-1', async () => {
    const res = await pipeline.run({ trigger: 'ADMIN', date: '2026-11-23' });
    expect(res.steps[0]).toMatchObject({ step: 'collect', status: 'DONE' });
    const keys = (
      await ctx.prisma.collectorJob.findMany({
        where: { idempotencyKey: { startsWith: 'collect:dgcmef:2026-11-23' } },
        orderBy: { createdAt: 'asc' },
      })
    ).map((j) => j.idempotencyKey);
    expect(keys).toEqual([
      'collect:dgcmef:2026-11-23',
      'collect:dgcmef:2026-11-23:retry-1',
    ]);
  });
});
