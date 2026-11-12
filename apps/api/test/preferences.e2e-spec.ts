import {
  createTender,
  createTestApp,
  inviteAndAccept,
  registerCompany,
  seedSource,
  Session,
  TestContext,
  truncateAll,
} from './utils';

describe('Préférences de veille & référentiel', () => {
  let ctx: TestContext;
  let admin: Session & { companyId: string };
  let member: Session;
  let sourceId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    sourceId = (await seedSource(ctx.prisma)).id;
    admin = await registerCompany(ctx, 'admin@beta.bf', 'Beta SA');
    member = await inviteAndAccept(ctx, admin, 'membre@beta.bf');
  });
  afterAll(() => ctx.app.close());

  it('GET /reference/taxonomy est public et en français', async () => {
    const res = await ctx.http().get('/reference/taxonomy').expect(200);
    const body = res.body as { sectors: { code: string; label: string }[] };
    expect(body.sectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'informatique' }),
      ]),
    );
  });

  it('validation : au moins un secteur ou un mot-clé, budgets ordonnés, valeurs connues', async () => {
    const post = (body: object) =>
      ctx
        .http()
        .post('/watch-preferences')
        .set('Cookie', admin.cookie)
        .send(body);
    await post({}).expect(400);
    await post({
      sectors: ['informatique'],
      budgetMin: 10,
      budgetMax: 5,
    }).expect(400);
    await post({ sectors: ['inexistant'] }).expect(400);
    await post({
      sectors: ['informatique'],
      procedureTypes: ['Inventée'],
    }).expect(400);
    await post({ sectors: ['informatique'], minScore: 101 }).expect(400);
    await post({
      sectors: ['informatique'],
      companyId: admin.companyId,
    }).expect(400);
    await post({
      sectors: ['informatique'],
      recipients: ['pas-un-email'],
    }).expect(400);
    expect(await ctx.prisma.watchPreference.count()).toBe(0);
  });

  it('CRUD complet par l’administrateur ; la création déclenche le matching', async () => {
    const tender = await createTender(ctx.prisma, sourceId, {
      title: 'Acquisition de serveurs et ordinateurs',
      sectors: ['informatique'],
    });
    const created = await ctx
      .http()
      .post('/watch-preferences')
      .set('Cookie', admin.cookie)
      .send({
        sectors: ['informatique', 'informatique'],
        keywordsInclude: ['Ordinateur', 'ordinateur'],
        keywordsExclude: ['location'],
        budgetMin: 1_000_000,
        budgetMax: 50_000_000,
        minScore: 30,
        recipients: ['Veille@Beta.bf'],
      })
      .expect(201);
    const pref = created.body as Record<string, unknown> & { id: string };
    expect(pref).toMatchObject({
      name: 'Veille principale',
      sectors: ['informatique'],
      keywordsInclude: ['Ordinateur'],
      budgetMin: 1_000_000,
      budgetMax: 50_000_000,
      recipients: ['veille@beta.bf'],
      isActive: true,
    });
    const match = await ctx.prisma.tenderMatch.findUnique({
      where: {
        companyId_tenderId: { companyId: admin.companyId, tenderId: tender.id },
      },
    });
    expect(match).not.toBeNull();

    const list = await ctx
      .http()
      .get('/watch-preferences')
      .set('Cookie', member.cookie)
      .expect(200);
    expect((list.body as unknown[]).length).toBe(1);

    const upd = await ctx
      .http()
      .patch(`/watch-preferences/${pref.id}`)
      .set('Cookie', admin.cookie)
      .send({ minScore: 55, isActive: false })
      .expect(200);
    expect(upd.body).toMatchObject({ minScore: 55, isActive: false });

    // Vider secteurs et mots-clés via PATCH reste interdit ; budget min > max existant aussi
    await ctx
      .http()
      .patch(`/watch-preferences/${pref.id}`)
      .set('Cookie', admin.cookie)
      .send({ sectors: [], keywordsInclude: [] })
      .expect(400);
    await ctx
      .http()
      .patch(`/watch-preferences/${pref.id}`)
      .set('Cookie', admin.cookie)
      .send({ budgetMin: 60_000_000 })
      .expect(400);

    await ctx
      .http()
      .delete(`/watch-preferences/${pref.id}`)
      .set('Cookie', admin.cookie)
      .expect(204);
    await ctx
      .http()
      .delete(`/watch-preferences/${pref.id}`)
      .set('Cookie', admin.cookie)
      .expect(404);
  });

  it('un COMPANY_MEMBER peut lire mais pas modifier (403)', async () => {
    const created = await ctx
      .http()
      .post('/watch-preferences')
      .set('Cookie', admin.cookie)
      .send({ keywordsInclude: ['forage'] })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await ctx
      .http()
      .post('/watch-preferences')
      .set('Cookie', member.cookie)
      .send({ keywordsInclude: ['forage'] })
      .expect(403);
    await ctx
      .http()
      .patch(`/watch-preferences/${id}`)
      .set('Cookie', member.cookie)
      .send({ minScore: 10 })
      .expect(403);
    await ctx
      .http()
      .delete(`/watch-preferences/${id}`)
      .set('Cookie', member.cookie)
      .expect(403);
  });
});
