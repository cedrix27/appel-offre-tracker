import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { AppConfig } from '../config/app-config';

export interface CollectorProcessResult {
  exitCode: number | null;
  timedOut: boolean;
  spawnError: string | null;
  stderrTail: string;
}

const BASE_ENV_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'TZ',
  'SYSTEMROOT',
];
const FORWARDED_EXACT = ['AI_PROVIDER'];
const FORWARDED_PREFIXES = ['OPENAI_', 'COLLECTOR_'];

/** Retire le paramètre `schema` propre à Prisma (refusé par libpq / psycopg). */
export function libpqDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const schema = parsed.searchParams.get('schema');
    if (schema === null) return url;
    parsed.searchParams.delete('schema');
    if (schema !== 'public') {
      parsed.searchParams.set('options', `-csearch_path=${schema}`);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Environnement transmis au collecteur : uniquement les variables utiles, pas les secrets de l'API. */
export function collectorEnv(
  source: NodeJS.ProcessEnv,
  databaseUrl: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (
      BASE_ENV_KEYS.includes(key) ||
      FORWARDED_EXACT.includes(key) ||
      FORWARDED_PREFIXES.some((p) => key.startsWith(p))
    ) {
      env[key] = value;
    }
  }
  env.DATABASE_URL = libpqDatabaseUrl(databaseUrl);
  return env;
}

@Injectable()
export class CollectorRunnerService {
  private readonly logger = new Logger('CollectorRunner');

  constructor(private readonly config: AppConfig) {}

  /** Lance `python -m collector run-job <id>` (ou COLLECTOR_COMMAND) et attend sa fin. */
  run(jobId: string): Promise<CollectorProcessResult> {
    const env = collectorEnv(process.env, this.config.env.DATABASE_URL);
    const custom = this.config.env.COLLECTOR_COMMAND;
    const child = custom
      ? spawn(`${custom} ${jobId}`, {
          shell: true,
          cwd: this.config.repoRoot,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(
          this.config.fromRoot(this.config.env.COLLECTOR_PYTHON),
          ['-m', 'collector', 'run-job', jobId],
          {
            cwd: this.config.fromRoot('services/collector'),
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );

    return new Promise((resolve) => {
      let stderr = '';
      let timedOut = false;
      let spawnError: string | null = null;
      let settled = false;
      const timeoutMs = this.config.env.COLLECTOR_TIMEOUT_MS;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        this.logger.debug(chunk.toString('utf8').trimEnd());
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-4000);
      });
      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode,
          timedOut,
          spawnError,
          stderrTail: stderr.trim().slice(-500),
        });
      };
      child.on('error', (err) => {
        spawnError = err.message;
        finish(null);
      });
      child.on('close', (code) => finish(code));
    });
  }
}
