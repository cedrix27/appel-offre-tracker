import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

/** Remonte l'arborescence jusqu'à la racine du monorepo (pnpm-workspace.yaml). */
export function findRepoRoot(start: string = __dirname): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start, '..', '..', '..');
    dir = parent;
  }
}

let rootEnvLoaded = false;

/** Charge le `.env` racine sans écraser les variables déjà définies. */
export function loadRootEnv(): void {
  if (rootEnvLoaded) return;
  rootEnvLoaded = true;
  const file = join(findRepoRoot(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const bool = (def: boolean) =>
  z.preprocess(
    emptyToUndefined,
    z
      .enum(['true', 'false', '1', '0'])
      .optional()
      .transform((v) => (v === undefined ? def : v === 'true' || v === '1')),
  );
const int = (def: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(def),
  );

export const envSchema = z.object({
  NODE_ENV: z
    .preprocess(
      emptyToUndefined,
      z.enum(['development', 'test', 'production']).default('development'),
    )
    .default('development'),
  API_PORT: int(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET doit faire au moins 16 caractères'),
  WEB_APP_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default('http://localhost:3000'),
  ),
  COOKIE_SECURE: z.preprocess(
    emptyToUndefined,
    z.enum(['true', 'false']).optional(),
  ),
  REFRESH_COOKIE_PATH: z.preprocess(
    emptyToUndefined,
    z.string().startsWith('/').default('/api/auth'),
  ),
  EMAIL_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['log', 'smtp', 'brevo']).default('log'),
  ),
  EMAIL_API_KEY: optionalString,
  EMAIL_FROM_NAME: z.preprocess(
    emptyToUndefined,
    z.string().default('SRC Digital'),
  ),
  EMAIL_FROM_ADDRESS: z.preprocess(
    emptyToUndefined,
    z.string().email().default('no-reply@example.com'),
  ),
  SMTP_HOST: optionalString,
  SMTP_PORT: int(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  TENDER_SCAN_CRON: z.preprocess(
    emptyToUndefined,
    z.string().default('0 7 * * *'),
  ),
  TENDER_TIMEZONE: z.preprocess(
    emptyToUndefined,
    z.string().default('Africa/Ouagadougou'),
  ),
  PIPELINE_CRON_ENABLED: bool(false),
  COLLECTOR_COMMAND: optionalString,
  COLLECTOR_PYTHON: z.preprocess(
    emptyToUndefined,
    z.string().default('services/collector/.venv/bin/python'),
  ),
  COLLECTOR_TIMEOUT_MS: int(15 * 60 * 1000),
  GLOBAL_RATE_LIMIT: int(300),
  AUTH_RATE_LIMIT: int(10),
  AUTH_RATE_TTL_MS: int(60_000),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Configuration invalide — ${details}`);
  }
  return result.data;
}
