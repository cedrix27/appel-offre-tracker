import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { applyTestEnv } from './test-env';

/** Applique les migrations sur la base de test (chaque suite vide ensuite les tables). */
export default function globalSetup(): void {
  applyTestEnv();
  const apiDir = join(__dirname, '..');
  execFileSync(
    join(apiDir, 'node_modules', '.bin', 'prisma'),
    ['migrate', 'deploy'],
    {
      cwd: apiDir,
      env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: 'pipe',
    },
  );
}
