import { Global, Injectable, Module } from '@nestjs/common';
import { isAbsolute, join } from 'node:path';
import { Env, findRepoRoot, loadRootEnv, parseEnv } from './env';

@Injectable()
export class AppConfig {
  readonly env: Env;
  readonly repoRoot: string;

  constructor() {
    loadRootEnv();
    this.env = parseEnv(process.env);
    this.repoRoot = findRepoRoot();
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get cookieSecure(): boolean {
    if (this.env.COOKIE_SECURE !== undefined) {
      return this.env.COOKIE_SECURE === 'true';
    }
    return this.isProduction;
  }

  /** Résout un chemin relatif à la racine du dépôt. */
  fromRoot(p: string): string {
    return isAbsolute(p) ? p : join(this.repoRoot, p);
  }
}

@Global()
@Module({ providers: [AppConfig], exports: [AppConfig] })
export class AppConfigModule {}
