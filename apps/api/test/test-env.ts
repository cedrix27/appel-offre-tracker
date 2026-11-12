import { join } from 'node:path';
import { loadRootEnv } from '../src/config/env';

/** Variables d'environnement des tests e2e : base tender_watch_test, e-mails « log », faux collecteur. */
export function applyTestEnv(): void {
  loadRootEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl)
    throw new Error('TEST_DATABASE_URL est requis pour les tests e2e');
  if (!/test/.test(testUrl)) {
    throw new Error('TEST_DATABASE_URL doit désigner une base de test');
  }
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_PROVIDER = 'log';
  process.env.WEB_APP_URL = 'http://localhost:3000';
  process.env.PIPELINE_CRON_ENABLED = 'false';
  process.env.GLOBAL_RATE_LIMIT = '100000';
  process.env.AUTH_RATE_LIMIT = '100000';
  process.env.COOKIE_SECURE = 'false';
  process.env.COLLECTOR_COMMAND = `node "${join(__dirname, 'fixtures', 'fake-collector.js')}"`;
  process.env.COLLECTOR_FAKE_MODE = 'success';
}
