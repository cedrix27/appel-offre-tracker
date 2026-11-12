import { parseEnv } from './env';

describe('parseEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost/x',
    JWT_SECRET: '0123456789abcdef0123',
  };

  it('applique les valeurs par défaut', () => {
    const env = parseEnv({ ...base, EMAIL_API_KEY: '' });
    expect(env.API_PORT).toBe(4000);
    expect(env.EMAIL_PROVIDER).toBe('log');
    expect(env.EMAIL_API_KEY).toBeUndefined();
    expect(env.PIPELINE_CRON_ENABLED).toBe(false);
    expect(env.TENDER_TIMEZONE).toBe('Africa/Ouagadougou');
  });

  it('convertit les types', () => {
    const env = parseEnv({
      ...base,
      API_PORT: '4100',
      PIPELINE_CRON_ENABLED: 'true',
    });
    expect(env.API_PORT).toBe(4100);
    expect(env.PIPELINE_CRON_ENABLED).toBe(true);
  });

  it('refuse une configuration invalide', () => {
    expect(() => parseEnv({ DATABASE_URL: '', JWT_SECRET: 'court' })).toThrow(
      /Configuration invalide/,
    );
    expect(() => parseEnv({ ...base, EMAIL_PROVIDER: 'pigeon' })).toThrow();
  });
});
