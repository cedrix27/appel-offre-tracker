import {
  createTestApp,
  inviteAndAccept,
  registerCompany,
  Session,
  TestContext,
  truncateAll,
} from './utils';

describe('Entreprise & membres', () => {
  let ctx: TestContext;
  let admin: Session & { companyId: string };
  let member: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    admin = await registerCompany(ctx, 'admin@alpha.bf', 'Alpha SARL');
    member = await inviteAndAccept(ctx, admin, 'membre@alpha.bf');
  });
  afterAll(() => ctx.app.close());

  it('GET /company exige une session', async () => {
    await ctx.http().get('/company').expect(401);
  });

  it('GET /company renvoie le profil de l’entreprise de la session', async () => {
    const res = await ctx
      .http()
      .get('/company')
      .set('Cookie', member.cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      id: admin.companyId,
      legalName: 'Alpha SARL',
      status: 'ACTIVE',
    });
  });

  it('PATCH /company : l’administrateur met à jour le profil', async () => {
    const res = await ctx
      .http()
      .patch('/company')
      .set('Cookie', admin.cookie)
      .send({
        tradeName: 'Alpha',
        mainSector: 'informatique',
        city: 'Ouagadougou',
        website: '',
        skills: ['Réseaux', 'Maintenance'],
      })
      .expect(200);
    expect(res.body).toMatchObject({
      tradeName: 'Alpha',
      mainSector: 'informatique',
      city: 'Ouagadougou',
      website: null,
      skills: ['Réseaux', 'Maintenance'],
    });
  });

  it('PATCH /company : un COMPANY_MEMBER reçoit 403', async () => {
    await ctx
      .http()
      .patch('/company')
      .set('Cookie', member.cookie)
      .send({ city: 'Bobo-Dioulasso' })
      .expect(403);
    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: admin.companyId },
    });
    expect(company.city).toBe('Ouagadougou');
  });

  it('PATCH /company : validation Zod (secteur inconnu, champ inconnu, companyId injecté)', async () => {
    await ctx
      .http()
      .patch('/company')
      .set('Cookie', admin.cookie)
      .send({ mainSector: 'secteur-imaginaire' })
      .expect(400);
    await ctx
      .http()
      .patch('/company')
      .set('Cookie', admin.cookie)
      .send({ id: '00000000-0000-0000-0000-000000000000' })
      .expect(400);
    await ctx
      .http()
      .patch('/company')
      .set('Cookie', admin.cookie)
      .send({ website: 'pas une url' })
      .expect(400);
  });

  it('GET /company/members liste les membres sans données sensibles', async () => {
    const res = await ctx
      .http()
      .get('/company/members')
      .set('Cookie', member.cookie)
      .expect(200);
    const list = res.body as Record<string, unknown>[];
    expect(list.map((m) => m.email)).toEqual([
      'admin@alpha.bf',
      'membre@alpha.bf',
    ]);
    expect(list[0]).toMatchObject({
      role: 'COMPANY_ADMIN',
      invitedPending: false,
    });
    expect(list[1]).toMatchObject({ role: 'COMPANY_MEMBER' });
    for (const m of list) expect(m).not.toHaveProperty('passwordHash');
  });

  it('POST /company/members : invitation (e-mail en français), doublon 409, membre 403', async () => {
    const res = await ctx
      .http()
      .post('/company/members')
      .set('Cookie', admin.cookie)
      .send({ email: 'Nouveau@Alpha.bf', fullName: 'Nouveau Membre' })
      .expect(201);
    expect(res.body).toMatchObject({
      email: 'nouveau@alpha.bf',
      role: 'COMPANY_MEMBER',
      invitedPending: true,
    });
    const mail = await ctx.prisma.emailOutbox.findFirstOrThrow({
      where: { category: 'INVITE', to: { has: 'nouveau@alpha.bf' } },
    });
    expect(mail.subject).toMatch(/invit/i);

    const dup = await ctx
      .http()
      .post('/company/members')
      .set('Cookie', admin.cookie)
      .send({ email: 'membre@alpha.bf', fullName: 'Doublon' })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'EMAIL_TAKEN' });

    await ctx
      .http()
      .post('/company/members')
      .set('Cookie', member.cookie)
      .send({ email: 'autre@alpha.bf', fullName: 'Autre' })
      .expect(403);
  });

  it('DELETE /company/members/:id : le dernier administrateur est protégé', async () => {
    const adminRow = await ctx.prisma.companyMember.findFirstOrThrow({
      where: { companyId: admin.companyId, role: 'COMPANY_ADMIN' },
    });
    const res = await ctx
      .http()
      .delete(`/company/members/${adminRow.id}`)
      .set('Cookie', admin.cookie)
      .expect(409);
    expect(res.body).toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('DELETE /company/members/:id : invitation en attente retirée, compte vide supprimé', async () => {
    const pending = await ctx.prisma.companyMember.findFirstOrThrow({
      where: { user: { email: 'nouveau@alpha.bf' } },
    });
    await ctx
      .http()
      .delete(`/company/members/${pending.id}`)
      .set('Cookie', member.cookie)
      .expect(403);
    await ctx
      .http()
      .delete(`/company/members/${pending.id}`)
      .set('Cookie', admin.cookie)
      .expect(204);
    expect(
      await ctx.prisma.user.findUnique({
        where: { email: 'nouveau@alpha.bf' },
      }),
    ).toBeNull();
    // Déjà supprimé, identifiant inconnu ou invalide → 404
    await ctx
      .http()
      .delete(`/company/members/${pending.id}`)
      .set('Cookie', admin.cookie)
      .expect(404);
    await ctx
      .http()
      .delete('/company/members/pas-un-uuid')
      .set('Cookie', admin.cookie)
      .expect(404);
  });
});
