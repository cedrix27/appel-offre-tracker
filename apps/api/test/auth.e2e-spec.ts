import {
  cookieHeader,
  cookiesFrom,
  createTestApp,
  lastEmailToken,
  login,
  PASSWORD,
  registerCompany,
  TestContext,
  truncateAll,
} from './utils';

describe('Auth', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
  });
  afterAll(() => ctx.app.close());

  const register = (email: string, companyName = 'Société Test') =>
    ctx.http().post('/auth/register').send({
      companyName,
      fullName: 'Awa Ouédraogo',
      email,
      password: PASSWORD,
    });

  it('parcours complet : inscription → vérification → connexion → /me → déconnexion', async () => {
    const res = await register('Awa@Example.com').expect(201);
    const body = res.body as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({
      email: 'awa@example.com',
      fullName: 'Awa Ouédraogo',
      globalRole: 'USER',
    });
    expect(body.user).not.toHaveProperty('passwordHash');

    // Mot de passe haché Argon2id, jeton stocké haché.
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'awa@example.com' },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const token = await lastEmailToken(
      ctx.prisma,
      'awa@example.com',
      'VERIFY_EMAIL',
    );
    const stored = await ctx.prisma.authToken.findFirstOrThrow({
      where: { userId: user.id, type: 'EMAIL_VERIFY' },
    });
    expect(stored.tokenHash).not.toBe(token);
    const outbox = await ctx.prisma.emailOutbox.findFirstOrThrow({
      where: { category: 'VERIFY_EMAIL' },
    });
    expect(outbox.status).toBe('SENT');
    expect(outbox.provider).toBe('log');
    expect(outbox.html).toContain(
      'http://localhost:3000/verifier-email?token=',
    );
    expect(outbox.html).toContain('#d4232b');

    // Non vérifié → 403 EMAIL_NOT_VERIFIED
    const denied = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'awa@example.com', password: PASSWORD })
      .expect(403);
    expect(denied.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

    await ctx
      .http()
      .post('/auth/verify-email')
      .send({ token })
      .expect(200, { ok: true });
    // Usage unique
    const again = await ctx
      .http()
      .post('/auth/verify-email')
      .send({ token })
      .expect(400);
    expect(again.body).toMatchObject({ code: 'INVALID_TOKEN' });

    const loginRes = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'awa@example.com', password: PASSWORD })
      .expect(200);
    const setCookie = (
      loginRes.headers['set-cookie'] as unknown as string[]
    ).join('\n');
    expect(setCookie).toMatch(/access_token=[^;]+;.*HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/refresh_token=[^;]+;.*Path=\/api\/auth/);
    const cookie = cookieHeader(cookiesFrom(loginRes));

    const me = await ctx.http().get('/me').set('Cookie', cookie).expect(200);
    expect(me.body).toMatchObject({
      user: { email: 'awa@example.com', globalRole: 'USER' },
      company: { legalName: 'Société Test', status: 'ACTIVE' },
      membership: { role: 'COMPANY_ADMIN' },
    });

    await ctx.http().post('/auth/logout').set('Cookie', cookie).expect(204);
    const refreshAfterLogout = await ctx
      .http()
      .post('/auth/refresh')
      .set('Cookie', cookie);
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('e-mail déjà utilisé → 409 ; mot de passe trop court → 400', async () => {
    await register('doublon@example.com').expect(201);
    const res = await register('doublon@example.com').expect(409);
    expect(res.body).toMatchObject({ code: 'EMAIL_TAKEN' });
    await ctx
      .http()
      .post('/auth/register')
      .send({
        companyName: 'X',
        fullName: 'Y Z',
        email: 'court@example.com',
        password: 'court',
      })
      .expect(400);
  });

  it('identifiants invalides → 401 générique', async () => {
    await registerCompany(ctx, 'bob@example.com', 'Bob SARL');
    const wrong = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'bob@example.com', password: 'mauvais-mot-de-passe' })
      .expect(401);
    const unknown = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'inconnu@example.com', password: 'mauvais-mot-de-passe' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('resend-verification et forgot-password : réponses identiques (anti-énumération)', async () => {
    await register('nonverifie@example.com').expect(201);
    const before = await ctx.prisma.emailOutbox.count();
    const a = await ctx
      .http()
      .post('/auth/resend-verification')
      .send({ email: 'nonverifie@example.com' })
      .expect(202);
    const b = await ctx
      .http()
      .post('/auth/resend-verification')
      .send({ email: 'personne@example.com' })
      .expect(202);
    expect(a.body).toEqual(b.body);
    expect(await ctx.prisma.emailOutbox.count()).toBe(before + 1);

    const c = await ctx
      .http()
      .post('/auth/forgot-password')
      .send({ email: 'bob@example.com' })
      .expect(202);
    const d = await ctx
      .http()
      .post('/auth/forgot-password')
      .send({ email: 'personne@example.com' })
      .expect(202);
    expect(c.body).toEqual(d.body);
  });

  it('un nouveau jeton de vérification invalide le précédent', async () => {
    await register('deuxjetons@example.com').expect(201);
    const first = await lastEmailToken(
      ctx.prisma,
      'deuxjetons@example.com',
      'VERIFY_EMAIL',
    );
    await ctx
      .http()
      .post('/auth/resend-verification')
      .send({ email: 'deuxjetons@example.com' })
      .expect(202);
    const second = await lastEmailToken(
      ctx.prisma,
      'deuxjetons@example.com',
      'VERIFY_EMAIL',
    );
    expect(second).not.toBe(first);
    await ctx
      .http()
      .post('/auth/verify-email')
      .send({ token: first })
      .expect(400);
    await ctx
      .http()
      .post('/auth/verify-email')
      .send({ token: second })
      .expect(200);
  });

  it('jeton expiré → 400', async () => {
    await register('expire@example.com').expect(201);
    const token = await lastEmailToken(
      ctx.prisma,
      'expire@example.com',
      'VERIFY_EMAIL',
    );
    await ctx.prisma.authToken.updateMany({
      where: { user: { email: 'expire@example.com' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await ctx.http().post('/auth/verify-email').send({ token }).expect(400);
  });

  it('refresh : rotation et détection de réutilisation', async () => {
    const s = await login(ctx, 'bob@example.com');
    const r1 = await ctx
      .http()
      .post('/auth/refresh')
      .set('Cookie', s.cookie)
      .expect(200);
    expect((r1.body as { user: { email: string } }).user.email).toBe(
      'bob@example.com',
    );
    const c1 = cookieHeader(cookiesFrom(r1));
    expect(c1).not.toBe(s.cookie);
    // L'ancien refresh est consommé : sa réutilisation révoque toute la famille.
    await ctx.http().post('/auth/refresh').set('Cookie', s.cookie).expect(401);
    await ctx.http().post('/auth/refresh').set('Cookie', c1).expect(401);
    // L'accès en cours reste valide (JWT 15 min).
    await ctx.http().get('/me').set('Cookie', c1).expect(200);
  });

  it('mot de passe oublié → réinitialisation (usage unique, révoque les sessions)', async () => {
    const s = await login(ctx, 'bob@example.com');
    await ctx
      .http()
      .post('/auth/forgot-password')
      .send({ email: 'bob@example.com' })
      .expect(202);
    const token = await lastEmailToken(
      ctx.prisma,
      'bob@example.com',
      'PASSWORD_RESET',
    );
    const mail = await ctx.prisma.emailOutbox.findFirstOrThrow({
      where: { category: 'PASSWORD_RESET' },
      orderBy: { createdAt: 'desc' },
    });
    expect(mail.text).toContain(
      'http://localhost:3000/reinitialiser-mot-de-passe?token=',
    );
    const newPassword = 'Nouveau-Mot-De-Passe-2026';
    await ctx
      .http()
      .post('/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(200);
    await ctx
      .http()
      .post('/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(400);
    await ctx.http().post('/auth/refresh').set('Cookie', s.cookie).expect(401);
    await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'bob@example.com', password: PASSWORD })
      .expect(401);
    await login(ctx, 'bob@example.com', newPassword);
  });

  it('invitation : accept-invite définit le mot de passe et vérifie l’e-mail', async () => {
    const admin = await registerCompany(ctx, 'chef@example.com', 'Chef SA');
    const res = await ctx
      .http()
      .post('/company/members')
      .set('Cookie', admin.cookie)
      .send({
        email: 'invite@example.com',
        fullName: 'Issa Invité',
        role: 'COMPANY_MEMBER',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      email: 'invite@example.com',
      invitedPending: true,
    });
    // Avant acceptation : pas de connexion possible.
    await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'invite@example.com', password: PASSWORD })
      .expect(401);
    const token = await lastEmailToken(
      ctx.prisma,
      'invite@example.com',
      'INVITE',
    );
    const mail = await ctx.prisma.emailOutbox.findFirstOrThrow({
      where: { category: 'INVITE' },
    });
    expect(mail.text).toContain('http://localhost:3000/invitation?token=');
    expect(mail.subject).toContain('Chef SA');
    await ctx
      .http()
      .post('/auth/accept-invite')
      .send({ token, password: PASSWORD })
      .expect(200);
    await ctx
      .http()
      .post('/auth/accept-invite')
      .send({ token, password: PASSWORD })
      .expect(400);
    const s = await login(ctx, 'invite@example.com');
    const me = await ctx.http().get('/me').set('Cookie', s.cookie).expect(200);
    expect(me.body).toMatchObject({
      company: { legalName: 'Chef SA' },
      membership: { role: 'COMPANY_MEMBER' },
    });
  });

  it('compte ou entreprise suspendu → 403 ACCOUNT_SUSPENDED', async () => {
    const s = await registerCompany(
      ctx,
      'suspendu@example.com',
      'Suspendue SARL',
    );
    await ctx.prisma.company.update({
      where: { id: s.companyId },
      data: { status: 'SUSPENDED' },
    });
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'suspendu@example.com', password: PASSWORD })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    // La session déjà ouverte ne donne plus accès aux données de l'entreprise.
    const company = await ctx
      .http()
      .get('/company')
      .set('Cookie', s.cookie)
      .expect(403);
    expect(company.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });

    await ctx.prisma.company.update({
      where: { id: s.companyId },
      data: { status: 'ACTIVE' },
    });
    await ctx.prisma.user.update({
      where: { id: s.userId },
      data: { status: 'SUSPENDED' },
    });
    const res2 = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'suspendu@example.com', password: PASSWORD })
      .expect(403);
    expect(res2.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    await ctx.http().get('/me').set('Cookie', s.cookie).expect(403);
  });

  it('jeton d’accès falsifié → 401', async () => {
    await ctx
      .http()
      .get('/me')
      .set('Cookie', 'access_token=abc.def.ghi')
      .expect(401);
  });
});

describe('Auth — limitation de débit', () => {
  let ctx: TestContext;
  const previous = process.env.AUTH_RATE_LIMIT;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '3';
    ctx = await createTestApp();
  });
  afterAll(async () => {
    process.env.AUTH_RATE_LIMIT = previous;
    await ctx.app.close();
  });

  it('login : 429 RATE_LIMITED au-delà de la limite', async () => {
    const attempt = () =>
      ctx.http().post('/auth/login').send({
        email: 'bruteforce@example.com',
        password: 'mauvais-mot-de-passe',
      });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
    });
    // Les routes non sensibles ne sont pas concernées par ce limiteur.
    await ctx.http().get('/reference/taxonomy').expect(200);
  });

  it('forgot-password et register sont aussi limités', async () => {
    for (let i = 0; i < 3; i += 1) {
      await ctx
        .http()
        .post('/auth/forgot-password')
        .send({ email: 'x@example.com' })
        .expect(202);
    }
    await ctx
      .http()
      .post('/auth/forgot-password')
      .send({ email: 'x@example.com' })
      .expect(429);
    for (let i = 0; i < 3; i += 1) {
      await ctx.http().post('/auth/register').send({}).expect(400);
    }
    await ctx.http().post('/auth/register').send({}).expect(429);
  });
});
