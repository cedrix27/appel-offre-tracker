import { createTestApp, TestContext, truncateAll } from './utils';

describe('Socle (health, référentiels, erreurs)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
  });
  afterAll(() => ctx.app.close());

  it('GET /health → ok', async () => {
    const res = await ctx.http().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
    expect(res.headers['x-content-type-options']).toBe('nosniff'); // helmet
  });

  it('GET /reference/taxonomy est public', async () => {
    const res = await ctx.http().get('/reference/taxonomy').expect(200);
    const body = res.body as {
      sectors: { code: string; label: string }[];
      procedureTypes: string[];
      zones: string[];
    };
    expect(body.sectors).toHaveLength(14);
    expect(body.sectors[0]).toEqual({
      code: 'informatique',
      label: 'Informatique & télécoms',
    });
    expect(Object.keys(body.sectors[0])).toEqual(['code', 'label']);
    expect(body.procedureTypes).toContain('Demande de prix');
    expect(body.zones).toContain('Ouagadougou');
  });

  it('route inconnue → 404 au format { statusCode, message }', async () => {
    const res = await ctx.http().get('/nexiste-pas').expect(404);
    expect(res.body).toEqual({
      statusCode: 404,
      message: 'Ressource introuvable',
    });
  });

  it('route protégée sans session → 401', async () => {
    const res = await ctx.http().get('/me').expect(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      message: 'Authentification requise',
    });
  });

  it('validation Zod → 400 VALIDATION_ERROR', async () => {
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'pas-un-email' })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});
