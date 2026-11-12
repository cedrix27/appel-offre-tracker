import {
  createTender,
  createTestApp,
  registerCompany,
  seedSource,
  Session,
  TestContext,
  truncateAll,
} from './utils';

type Item = {
  id: string;
  title: string;
  match: { score: number; reasons: unknown[] } | null;
  saved: { isFavorite: boolean; status: string } | null;
};
type Page = { items: Item[]; total: number; page: number; pageSize: number };

const DAY = 24 * 3600 * 1000;
const todayUtcMidnight = () => {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
};

describe('Annonces', () => {
  let ctx: TestContext;
  let co: Session & { companyId: string };
  const ids: Record<string, string> = {};

  const list = async (query = '') =>
    (
      await ctx
        .http()
        .get(`/tenders${query}`)
        .set('Cookie', co.cookie)
        .expect(200)
    ).body as Page;

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    const sourceId = (await seedSource(ctx.prisma)).id;
    co = await registerCompany(ctx, 'admin@gamma.bf', 'Gamma Informatique');

    const mk = async (
      key: string,
      data: Parameters<typeof createTender>[2],
    ) => {
      ids[key] = (await createTender(ctx.prisma, sourceId, data)).id;
    };
    await mk('ordis', {
      title: 'Acquisition de tablettes tactiles',
      organization: 'Ministère de la Santé',
      location: 'Ouagadougou',
      sectors: ['informatique'],
      publicationDate: new Date('2026-11-02T00:00:00Z'),
      submissionDeadline: new Date(Date.now() + 5 * DAY),
    });
    await mk('reseau', {
      title: 'Câblage réseau du campus_100%',
      organization: 'Université Joseph Ki-Zerbo',
      location: 'Ouagadougou',
      sectors: ['informatique'],
      procedureType: "Appel d'offres ouvert",
      publicationDate: new Date('2026-11-05T00:00:00Z'),
      submissionDeadline: new Date(Date.now() + 20 * DAY),
    });
    // D27 : date limite = aujourd'hui sans heure → encore ouverte.
    await mk('aujourdhui', {
      title: 'Maintenance informatique — clôture aujourd’hui',
      sectors: ['informatique'],
      submissionDeadline: todayUtcMidnight(),
      deadlineHasTime: false,
    });
    await mk('hier', {
      title: 'Logiciel de gestion — clôturé hier',
      sectors: ['informatique'],
      submissionDeadline: new Date(todayUtcMidnight().getTime() - DAY),
      deadlineHasTime: false,
    });
    await mk('heurePassee', {
      title: 'Imprimantes — heure limite dépassée',
      sectors: ['informatique'],
      submissionDeadline: new Date(Date.now() - 3600 * 1000),
      deadlineHasTime: true,
    });
    await mk('annule', {
      title: 'Serveurs — annulé',
      sectors: ['informatique'],
      status: 'CANCELLED',
    });
    await mk('incomplet', {
      title: 'Fourniture de matériel informatique (avis incomplet)',
      sectors: ['informatique'],
      organization: null,
      reference: null,
      location: null,
      submissionDeadline: null,
      estimatedBudget: null,
    });
    await mk('horsSujet', {
      title: 'Construction d’un dispensaire',
      description: 'Travaux de génie civil.',
      sectors: ['btp'],
    });

    await ctx
      .http()
      .post('/watch-preferences')
      .set('Cookie', co.cookie)
      .send({ sectors: ['informatique'], minScore: 30 })
      .expect(201);
  });
  afterAll(() => ctx.app.close());

  it('liste par défaut : annonces matchées et ouvertes uniquement (D27 incluse)', async () => {
    const page = await list();
    const got = new Set(page.items.map((i) => i.id));
    expect(got).toEqual(
      new Set([ids.ordis, ids.reseau, ids.aujourdhui, ids.incomplet]),
    );
    expect(page.total).toBe(4);
    for (const i of page.items)
      expect(i.match?.score).toBeGreaterThanOrEqual(30);
  });

  it('includeClosed et onlyMatched=false élargissent la liste', async () => {
    // Une annonce close n'est jamais matchée : sans onlyMatched=false elle reste invisible.
    const closedMatched = await list('?includeClosed=true');
    expect(closedMatched.total).toBe(4);
    const closed = await list('?includeClosed=true&onlyMatched=false');
    expect(closed.items.map((i) => i.id)).toEqual(
      expect.arrayContaining([ids.hier, ids.heurePassee, ids.annule]),
    );
    const all = await list('?onlyMatched=false');
    const horsSujet = all.items.find((i) => i.id === ids.horsSujet);
    expect(horsSujet?.match).toBeNull();
  });

  it('recherche, filtres, tri et pagination', async () => {
    expect((await list('?q=TABLETTES')).items.map((i) => i.id)).toEqual([
      ids.ordis,
    ]);
    // Les caractères LIKE sont échappés : « _100% » ne matche que le littéral.
    expect((await list('?q=_100%25')).items.map((i) => i.id)).toEqual([
      ids.reseau,
    ]);
    expect((await list('?q=%25')).items.map((i) => i.id)).toEqual([ids.reseau]);
    // Sans échappement, « _ » serait un joker et trouverait « Câblage ».
    expect((await list('?q=C_bl')).total).toBe(0);
    expect((await list('?q=C%25ge')).total).toBe(0);
    expect(
      (
        await list(
          `?organization=${encodeURIComponent('Université Joseph Ki-Zerbo')}`,
        )
      ).total,
    ).toBe(1);
    expect(
      (
        await list(
          `?procedureType=${encodeURIComponent("Appel d'offres ouvert")}`,
        )
      ).items[0].id,
    ).toBe(ids.reseau);
    expect(
      (await list('?from=2026-11-04&to=2026-11-30')).items.map((i) => i.id),
    ).toEqual([ids.reseau]);
    const byDeadline = await list('?sort=deadline');
    expect(byDeadline.items[0].id).toBe(ids.aujourdhui);
    expect(byDeadline.items.at(-1)?.id).toBe(ids.incomplet); // NULLS LAST

    const p1 = await list('?pageSize=2&page=1&sort=deadline');
    const p2 = await list('?pageSize=2&page=2&sort=deadline');
    expect(p1.items).toHaveLength(2);
    expect(p2.items).toHaveLength(2);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(4);

    await ctx
      .http()
      .get('/tenders?from=02/11/2026')
      .set('Cookie', co.cookie)
      .expect(400);
    await ctx
      .http()
      .get('/tenders?sort=prix')
      .set('Cookie', co.cookie)
      .expect(400);
  });

  it('fiche détaillée : champs absents à null (jamais inventés), source officielle', async () => {
    const res = await ctx
      .http()
      .get(`/tenders/${ids.incomplet}`)
      .set('Cookie', co.cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      id: ids.incomplet,
      organization: null,
      reference: null,
      location: null,
      submissionDeadline: null,
      estimatedBudget: null,
      sourceUrl: expect.stringMatching(
        /^https:\/\/www\.dgcmef\.gov\.bf\//,
      ) as unknown,
      sourcePages: [32],
      source: { code: 'dgcmef' },
    });
    await ctx
      .http()
      .get('/tenders/00000000-0000-4000-8000-000000000000')
      .set('Cookie', co.cookie)
      .expect(404);
    await ctx.http().get(`/tenders/${ids.ordis}`).expect(401);
  });

  it('favori et statut de suivi (avec note), filtres associés', async () => {
    const fav = await ctx
      .http()
      .post(`/tenders/${ids.ordis}/favorite`)
      .set('Cookie', co.cookie)
      .send({ isFavorite: true })
      .expect(200);
    expect(fav.body).toMatchObject({ isFavorite: true, status: 'TO_REVIEW' });

    const st = await ctx
      .http()
      .patch(`/tenders/${ids.ordis}/status`)
      .set('Cookie', co.cookie)
      .send({ status: 'APPLYING', note: 'Dossier en préparation' })
      .expect(200);
    expect(st.body).toMatchObject({
      isFavorite: true,
      status: 'APPLYING',
      note: 'Dossier en préparation',
    });

    expect((await list('?favorite=true')).items.map((i) => i.id)).toEqual([
      ids.ordis,
    ]);
    expect(
      (await list('?savedStatus=APPLYING')).items.map((i) => i.id),
    ).toEqual([ids.ordis]);
    expect((await list('?favorite=false')).total).toBe(3);

    await ctx
      .http()
      .patch(`/tenders/${ids.ordis}/status`)
      .set('Cookie', co.cookie)
      .send({ status: 'GAGNE' })
      .expect(400);
    await ctx
      .http()
      .post('/tenders/00000000-0000-4000-8000-000000000000/favorite')
      .set('Cookie', co.cookie)
      .send({ isFavorite: true })
      .expect(404);
  });

  it('GET /tenders/filters renvoie les valeurs distinctes', async () => {
    const res = await ctx
      .http()
      .get('/tenders/filters')
      .set('Cookie', co.cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      organizations: expect.arrayContaining([
        'Université Joseph Ki-Zerbo',
      ]) as unknown,
      sectors: expect.arrayContaining(['informatique', 'btp']) as unknown,
    });
  });

  it('tableau de bord : compteurs et échéance du jour (D27)', async () => {
    const res = await ctx
      .http()
      .get('/dashboard/summary')
      .set('Cookie', co.cookie)
      .expect(200);
    const body = res.body as {
      openMatches: number;
      favorites: number;
      deadlinesSoon: Item[];
      collection: { lastOutcome: string | null };
    };
    expect(body.openMatches).toBe(4);
    expect(body.favorites).toBe(1);
    expect(body.deadlinesSoon[0].id).toBe(ids.aujourdhui);
    expect(body.collection.lastOutcome).toBeNull();
  });
});
