import { collectorEnv, libpqDatabaseUrl } from './collector-runner.service';

describe('collectorEnv', () => {
  it('ne transmet que les variables autorisées', () => {
    const env = collectorEnv(
      {
        PATH: '/usr/bin',
        JWT_SECRET: 'secret',
        EMAIL_API_KEY: 'cle',
        AI_PROVIDER: 'mock',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_MODEL: 'gpt',
        COLLECTOR_USER_AGENT: 'UA',
        SUPER_ADMIN_PASSWORD: 'x',
      },
      'postgresql://u@localhost:5432/db?schema=public',
    );
    expect(env).toEqual({
      PATH: '/usr/bin',
      AI_PROVIDER: 'mock',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt',
      COLLECTOR_USER_AGENT: 'UA',
      DATABASE_URL: 'postgresql://u@localhost:5432/db',
    });
  });
});

describe('libpqDatabaseUrl', () => {
  it('convertit un schéma non public en search_path', () => {
    expect(libpqDatabaseUrl('postgresql://u@h/db?schema=autre')).toBe(
      'postgresql://u@h/db?options=-csearch_path%3Dautre',
    );
    expect(libpqDatabaseUrl('postgresql://u@h/db')).toBe('postgresql://u@h/db');
  });
});
