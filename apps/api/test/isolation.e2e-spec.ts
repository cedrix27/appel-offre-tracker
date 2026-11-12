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

/**
 * Isolation multi-tenant (règle n°3) : companyId vient uniquement de la session ;
 * une ressource d'une autre entreprise répond 404 (jamais 403, aucune fuite d'existence).
 */
describe('Isolation multi-tenant A / B', () => {
  let ctx: TestContext;
  let a: Session & { companyId: string };
  let b: Session & { companyId: string };
  let aMember: Session;
  let tenderId: string;
  let prefA: string;
  let memberA: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    const sourceId = (await seedSource(ctx.prisma)).id;
    a = await registerCompany(ctx, 'admin@a.bf', 'Entreprise A');
    b = await registerCompany(ctx, 'admin@b.bf', 'Entreprise B');
    aMember = await inviteAndAccept(ctx, a, 'membre@a.bf');
    tenderId = (
      await createTender(ctx.prisma, sourceId, { sectors: ['informatique'] })
    ).id;

    const pa = await ctx
      .http()
      .post('/watch-preferences')
      .set('Cookie', a.cookie)
      .send({
        sectors: ['informatique'],
        minScore: 30,
        recipients: ['veille@a.bf'],
      })
      .expect(201);
    prefA = (pa.body as { id: string }).id;
    await ctx
      .http()
      .post('/watch-preferences')
      .set('Cookie', b.cookie)
      .send({ sectors: ['informatique'], minScore: 30 })
      .expect(201);

    await ctx
      .http()
      .post(`/tenders/${tenderId}/favorite`)
      .set('Cookie', a.cookie)
      .send({ isFavorite: true })
      .expect(200);
    await ctx
      .http()
      .patch(`/tenders/${tenderId}/status`)
      .set('Cookie', a.cookie)
      .send({ status: 'APPLYING', note: 'Note confidentielle A' })
      .expect(200);

    await ctx.prisma.notification.create({
      data: {
        companyId: a.companyId,
        kind: 'DAILY_DIGEST',
        digestDate: new Date('2026-11-10T00:00:00Z'),
        idempotencyKey: `digest:${a.companyId}:2026-11-10`,
        status: 'SENT',
        recipients: ['veille@a.bf'],
        subject: 'Digest A',
      },
    });
    memberA = (
      await ctx.prisma.companyMember.findFirstOrThrow({
        where: { user: { email: 'membre@a.bf' } },
      })
    ).id;
  });
  afterAll(() => ctx.app.close());

  it('profil entreprise : chacun voit le sien, companyId du client ignoré', async () => {
    const res = await ctx
      .http()
      .get(`/company?companyId=${a.companyId}`)
      .set('Cookie', b.cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      id: b.companyId,
      legalName: 'Entreprise B',
    });
  });

  it('membres : B ne voit ni ne supprime les membres de A (404)', async () => {
    const res = await ctx
      .http()
      .get('/company/members')
      .set('Cookie', b.cookie)
      .expect(200);
    expect((res.body as { email: string }[]).map((m) => m.email)).toEqual([
      'admin@b.bf',
    ]);
    await ctx
      .http()
      .delete(`/company/members/${memberA}`)
      .set('Cookie', b.cookie)
      .expect(404);
    expect(
      await ctx.prisma.companyMember.findUnique({ where: { id: memberA } }),
    ).not.toBeNull();
  });

  it('préférences : liste cloisonnée, PATCH/DELETE inter-entreprise = 404', async () => {
    const res = await ctx
      .http()
      .get('/watch-preferences')
      .set('Cookie', b.cookie)
      .expect(200);
    const list = res.body as { id: string; recipients: string[] }[];
    expect(list).toHaveLength(1);
    expect(list[0].id).not.toBe(prefA);
    expect(list[0].recipients).not.toContain('veille@a.bf');

    await ctx
      .http()
      .patch(`/watch-preferences/${prefA}`)
      .set('Cookie', b.cookie)
      .send({ minScore: 0 })
      .expect(404);
    await ctx
      .http()
      .delete(`/watch-preferences/${prefA}`)
      .set('Cookie', b.cookie)
      .expect(404);
    const pref = await ctx.prisma.watchPreference.findUniqueOrThrow({
      where: { id: prefA },
    });
    expect(pref.minScore).toBe(30);
  });

  it('annonces : favori, statut et note de A invisibles pour B', async () => {
    const detail = await ctx
      .http()
      .get(`/tenders/${tenderId}`)
      .set('Cookie', b.cookie)
      .expect(200);
    expect(detail.body).toMatchObject({ saved: null, note: null });
    expect(JSON.stringify(detail.body)).not.toContain('Note confidentielle A');

    const list = await ctx
      .http()
      .get('/tenders?favorite=true')
      .set('Cookie', b.cookie)
      .expect(200);
    expect((list.body as { total: number }).total).toBe(0);

    // Le membre de A partage l'état de son entreprise.
    const forMember = await ctx
      .http()
      .get(`/tenders/${tenderId}`)
      .set('Cookie', aMember.cookie)
      .expect(200);
    expect(forMember.body).toMatchObject({
      saved: { isFavorite: true, status: 'APPLYING' },
      note: 'Note confidentielle A',
    });
  });

  it('annonces : une action de B ne modifie pas l’état de A', async () => {
    await ctx
      .http()
      .patch(`/tenders/${tenderId}/status`)
      .set('Cookie', b.cookie)
      .send({ status: 'IGNORED' })
      .expect(200);
    const rows = await ctx.prisma.savedTender.findMany({ where: { tenderId } });
    expect(rows).toHaveLength(2);
    const ofA = rows.find((r) => r.companyId === a.companyId);
    expect(ofA).toMatchObject({ status: 'APPLYING', isFavorite: true });
  });

  it('matches : chaque entreprise ne voit que les siens', async () => {
    const matches = await ctx.prisma.tenderMatch.findMany({
      where: { tenderId },
    });
    expect(matches.map((m) => m.companyId).sort()).toEqual(
      [a.companyId, b.companyId].sort(),
    );
    // On supprime le match de B : l'annonce disparaît de sa liste « matchée » mais pas de celle de A.
    await ctx.prisma.tenderMatch.delete({
      where: { companyId_tenderId: { companyId: b.companyId, tenderId } },
    });
    const listB = await ctx
      .http()
      .get('/tenders')
      .set('Cookie', b.cookie)
      .expect(200);
    expect((listB.body as { total: number }).total).toBe(0);
    const listA = await ctx
      .http()
      .get('/tenders')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((listA.body as { total: number }).total).toBe(1);
  });

  it('notifications et tableau de bord cloisonnés', async () => {
    const nb = await ctx
      .http()
      .get('/notifications')
      .set('Cookie', b.cookie)
      .expect(200);
    expect(nb.body).toEqual([]);
    const na = await ctx
      .http()
      .get('/notifications')
      .set('Cookie', aMember.cookie)
      .expect(200);
    expect((na.body as { subject: string }[]).map((n) => n.subject)).toEqual([
      'Digest A',
    ]);

    const db = await ctx
      .http()
      .get('/dashboard/summary')
      .set('Cookie', b.cookie)
      .expect(200);
    expect(db.body).toMatchObject({ favorites: 0, openMatches: 0 });
    const da = await ctx
      .http()
      .get('/dashboard/summary')
      .set('Cookie', a.cookie)
      .expect(200);
    expect(da.body).toMatchObject({ favorites: 1, openMatches: 1 });
  });

  it('routes cloisonnées sans session = 401', async () => {
    for (const path of [
      '/company',
      '/company/members',
      '/watch-preferences',
      '/tenders',
      `/tenders/${tenderId}`,
      '/notifications',
      '/dashboard/summary',
    ]) {
      await ctx.http().get(path).expect(401);
    }
  });
});
